import { Router } from "express";
import { WatchItem, HistoryEntry, ActivityEvent } from "../models/index.js";
import { env } from "../config/env.js";
import { isOwnedBy, ownedByUser } from "../middleware/auth.js";
import { parseWatchInput } from "./watch-items.js";
import { resolveProduct } from "../agent/fetch-price.js";
import { isPublicHttpUrl } from "../agent/url-guard.js";

export const commandRouter = Router();

const MAX_TEXT = 500;
// one parse round trip must not hang the command box
const TIMEOUT_MS = 10_000;

const ACTIONS = [
  "watch",
  "pause",
  "resume",
  "set_target",
  "auto_buy",
  "unknown",
] as const;
export type CommandAction = (typeof ACTIONS)[number];

/** The actions that operate on one existing watch item. */
const ITEM_ACTIONS = new Set<CommandAction>([
  "pause",
  "resume",
  "set_target",
  "auto_buy",
]);

export const ITEM_HINT =
  "I couldn't find that item in your watchlist — name it as it appears there";

export const HELP =
  'I didn\'t catch that — try "watch Sony WH-1000XM5 now $328 under $300, auto-buy", "pause Keychron K2", or "set target for Keychron K2 to $79"';

/** An intent after validation: every field type-checked and clamped. */
export interface CleanIntent {
  action: CommandAction;
  reply: string;
  itemId: string | null;
  title: string | null;
  retailer: string | null;
  price: number | null;
  targetPrice: number | null;
  url: string | null;
  autoBuy: boolean | null;
  pollIntervalSec: number | null;
}

/**
 * Validate whatever the agent service called back. Never trust an outside
 * service: unknown actions degrade to `unknown`, an item id we did not offer
 * back to the parser is dropped, and every number/string is clamped to the
 * same caps the watch-item routes enforce.
 */
export function validateIntent(
  raw: unknown,
  knownIds: ReadonlySet<string>,
): { ok: true; intent: CleanIntent } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "agent service returned an unusable parse" };
  }
  const body = raw as Record<string, unknown>;

  const str = (value: unknown, max: number): string | null =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
  const num = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;

  const url = str(body.url, 2000);
  if (url && !isPublicHttpUrl(url)) {
    return { ok: false, error: "url must be a public http(s) URL" };
  }

  // same 5s..86400s window the PATCH route and the scheduler enforce
  const rawPoll = num(body.pollIntervalSec);
  const intent: CleanIntent = {
    action: ACTIONS.find((candidate) => candidate === body.action) ?? "unknown",
    reply: str(body.reply, 300) ?? "",
    itemId: null,
    title: str(body.title, 500),
    retailer: str(body.retailer, 100),
    price: num(body.price),
    targetPrice: num(body.targetPrice),
    url,
    autoBuy: typeof body.autoBuy === "boolean" ? body.autoBuy : null,
    pollIntervalSec:
      rawPoll === null ? null : Math.min(86_400, Math.max(5, Math.trunc(rawPoll))),
  };

  const itemId = typeof body.itemId === "string" ? body.itemId : null;
  if (ITEM_ACTIONS.has(intent.action)) {
    if (!itemId || !knownIds.has(itemId)) {
      return {
        ok: true,
        intent: { ...intent, action: "unknown", itemId: null, reply: ITEM_HINT },
      };
    }
    intent.itemId = itemId;
  }
  return { ok: true, intent };
}

/** POST /api/agent/command — run one plain-language command end to end. */
commandRouter.post("/agent/command", async (req, res) => {
  const body = (req.body ?? {}) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (text.length > MAX_TEXT) {
    res.status(400).json({ error: `text must be at most ${MAX_TEXT} characters` });
    return;
  }

  // the parser only ever sees the caller's own rows, for title matching
  const owned = await WatchItem.find(ownedByUser(req.userId!))
    .select("title retailer")
    .lean();
  const context = owned.map((item) => ({
    id: String(item._id),
    title: item.title,
    retailer: item.retailer ?? "",
  }));

  let parsed: unknown;
  try {
    const response = await fetch(`${env.agentServiceUrl}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, items: context }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      res.status(502).json({ error: "the agent service could not parse that command" });
      return;
    }
    parsed = await response.json();
  } catch {
    res.status(503).json({
      error: "agent service unreachable — start it with `uvicorn main:app --port 8000`",
    });
    return;
  }

  const checked = validateIntent(parsed, new Set(context.map((row) => row.id)));
  if (!checked.ok) {
    res.status(502).json({ error: checked.error });
    return;
  }
  const intent = checked.intent;
  const userId = req.userId!;

  // every executed command lands in history + the activity feed, so the
  // agent never acts invisibly — detail is the user's own sentence
  const record = async (itemTitle: string, label: string, itemId?: string) => {
    await HistoryEntry.create({
      item: itemId,
      itemTitle,
      action: label,
      detail: text,
      kind: "info",
      owner: userId,
    });
    await ActivityEvent.create({
      level: "ok",
      message: `command: ${label} — ${itemTitle}`,
      source: "command",
      owner: userId,
    });
  };

  if (intent.action === "unknown") {
    res.status(422).json({
      action: "unknown",
      reply: intent.reply || HELP,
    });
    return;
  }

  if (intent.action === "watch") {
    let title = intent.title;
    let retailer = intent.retailer;
    let price = intent.price;
    // a pasted product page fills whatever the sentence left out
    if (intent.url && (!title || price === null)) {
      const resolved = await resolveProduct(intent.url);
      if (resolved.ok) {
        title = title ?? resolved.meta.title;
        price = price ?? resolved.meta.price;
        retailer = retailer ?? (resolved.meta.retailer || null);
      }
    }
    if (!title) {
      res.status(422).json({
        action: "watch",
        reply: 'tell me the product name (e.g. "watch Sony WH-1000XM5 under $300")',
      });
      return;
    }
    if (intent.targetPrice === null) {
      res.status(422).json({
        action: "watch",
        reply: 'tell me a target price (e.g. "under $300")',
      });
      return;
    }
    if (price === null) {
      res.status(422).json({
        action: "watch",
        reply: `include the current price of ${title}, or a product URL I can read it from`,
      });
      return;
    }

    const parsedInput = parseWatchInput({
      title,
      // no retailer named → an honest placeholder instead of a guess
      retailer: retailer ?? "any store",
      price,
      targetPrice: intent.targetPrice,
      url: intent.url ?? undefined,
      pollIntervalSec: intent.pollIntervalSec ?? undefined,
    });
    if (!parsedInput.ok) {
      res.status(400).json({ error: parsedInput.error });
      return;
    }
    const created = await WatchItem.create({
      ...parsedInput.value,
      owner: userId,
    });
    const reply =
      intent.reply ||
      `Watching ${created.title} — I'll flag it at $${created.targetPrice} or below`;
    await record(created.title, "Watch started", created.id);
    res.status(201).json({ action: intent.action, reply, item: created });
    return;
  }

  // the remaining actions all target one existing item (id already vetted)
  const item = await WatchItem.findById(intent.itemId!);
  if (!item) {
    res.status(404).json({ error: "watch item not found" });
    return;
  }
  if (!isOwnedBy(item, userId)) {
    res.status(403).json({ error: "not your item" });
    return;
  }

  let label: string;
  let reply: string;
  if (intent.action === "pause") {
    label = "Paused";
    if (item.status === "paused") {
      reply = `${item.title} is already paused`;
    } else {
      item.status = "paused";
      reply = `${item.title} is paused — the agent skips it until you resume`;
    }
  } else if (intent.action === "resume") {
    label = "Resumed";
    if (item.status === "paused") {
      item.status = "watching";
      reply = `${item.title} is back under watch`;
    } else {
      reply = `${item.title} was not paused — still watching`;
    }
  } else if (intent.action === "set_target") {
    if (intent.targetPrice === null) {
      res.status(422).json({
        action: intent.action,
        reply: 'tell me a target price (e.g. "under $300")',
      });
      return;
    }
    item.targetPrice = intent.targetPrice;
    label = "Target changed";
    reply = `Target for ${item.title} is now $${item.targetPrice.toFixed(2)}`;
  } else {
    // auto_buy with no explicit off/on in the sentence means on
    const next = intent.autoBuy ?? true;
    item.autoBuy = next;
    label = next ? "auto-buy on" : "auto-buy off";
    reply = `auto-buy is ${next ? "on" : "off"} for ${item.title}`;
  }
  await item.save();
  await record(item.title, label, item.id);
  res.json({ action: intent.action, reply, item });
});

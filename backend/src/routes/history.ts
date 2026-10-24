import { Router } from "express";
import mongoose from "mongoose";
import { HistoryEntry } from "../models/index.js";
import { ownedByUser } from "../middleware/auth.js";

export const historyRouter = Router();

const KINDS = ["buy", "alert", "scan", "info"] as const;
// shortcut: cap for ?limit= — dashboards only need a recent window; upgrade to cursor paging when the feed grows past it
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;

/**
 * GET /api/history — recent agent decisions, newest first.
 * Query: ?limit=1..100  &kind=buy|alert|scan|info  &item=<watchItemId>
 */
historyRouter.get("/history", async (req, res) => {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const kind = req.query.kind;
  // reject operator payloads like ?kind[$ne]=x instead of silently ignoring them
  if (kind !== undefined && typeof kind !== "string") {
    res.status(400).json({ error: "kind must be a single string value" });
    return;
  }
  if (kind && !KINDS.includes(kind as (typeof KINDS)[number])) {
    res.status(400).json({ error: `kind must be one of ${KINDS.join(", ")}` });
    return;
  }

  const item = req.query.item;
  if (item !== undefined && typeof item !== "string") {
    res.status(400).json({ error: "item must be a single string value" });
    return;
  }
  if (item && !mongoose.isValidObjectId(item)) {
    res.status(400).json({ error: "item must be a valid watch item id" });
    return;
  }

  // filter built separately: a `cond ? {kind} : {}` union confuses Mongoose 9's FilterQuery
  const filter: {
    kind?: (typeof KINDS)[number];
    item?: mongoose.Types.ObjectId;
  } = {};
  if (kind) filter.kind = kind as (typeof KINDS)[number];
  if (item) filter.item = new mongoose.Types.ObjectId(item);
  // ownerless rows are shared demo data; everything else stays per-account
  const entries = await HistoryEntry.find({
    ...filter,
    ...ownedByUser(req.userId!),
  })
    .sort({ occurredAt: -1 })
    .limit(limit)
    .lean();
  res.json({ entries });
});

/** POST /api/history — record a decision (used by the agent service). */
historyRouter.post("/history", async (req, res) => {
  const body = (req.body ?? {}) as {
    itemTitle?: string;
    action?: string;
    detail?: string;
    kind?: string;
    price?: number;
  };

  const kind = KINDS.find((candidate) => candidate === body.kind);
  if (
    !kind ||
    typeof body.itemTitle !== "string" ||
    !body.itemTitle.trim() ||
    typeof body.action !== "string" ||
    !body.action.trim() ||
    typeof body.detail !== "string" ||
    !body.detail.trim()
  ) {
    res.status(400).json({
      error: `kind (${KINDS.join("|")}) and non-empty itemTitle, action, detail are required`,
    });
    return;
  }

  const entry = await HistoryEntry.create({
    itemTitle: body.itemTitle.trim(),
    action: body.action.trim(),
    detail: body.detail.trim(),
    kind,
    price: typeof body.price === "number" ? body.price : undefined,
    owner: req.userId,
  });
  res.status(201).json({ entry });
});

import { Router } from "express";
import { EventEmitter } from "node:events";
import { ActivityEvent } from "../models/index.js";

const REPLAY_LINES = 15;
const POLL_MS = 2_000;
const LEVELS = ["info", "ok", "warn", "buy"] as const;

type EventLine = {
  createdAt: Date;
  level: (typeof LEVELS)[number];
  message: string;
  source?: string | null;
  alert?: boolean;
  /** null/undefined = system line; otherwise only that user may see it. */
  owner?: unknown;
};

export const activityRouter = Router();
const bus = new EventEmitter();

// shortcut: one global cap on open SSE tails — an authenticated client could
// otherwise hold unbounded connections open; raise it if a real deployment
// ever needs more than 100 concurrent dashboards
const MAX_STREAMS = 100;
let openStreams = 0;

let lastSeen = new Date();

// shortcut: 2s DB poll instead of a change stream — works on standalone Mongo too; upgrade when sub-second latency matters
async function poll() {
  try {
    const fresh = await ActivityEvent.find({ createdAt: { $gt: lastSeen } })
      .sort({ createdAt: 1 })
      .lean();
    if (fresh.length === 0) return;
    lastSeen = fresh[fresh.length - 1]!.createdAt;
    for (const event of fresh) bus.emit("event", event);
  } catch (err) {
    console.error("[activity] poll failed:", err instanceof Error ? err.message : err);
  }
}

setInterval(poll, POLL_MS).unref();

/**
 * GET /api/activity/stream — SSE tail of activity events (replays the last
 * few lines, then follows inserts).
 */
activityRouter.get("/activity/stream", async (req, res) => {
  if (openStreams >= MAX_STREAMS) {
    res.status(503).json({ error: "too many open activity streams" });
    return;
  }
  openStreams += 1;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // only forward system lines (no owner) and this viewer's own lines —
  // one account's cart activity must never stream into another's dashboard
  const viewer = req.userId!;
  const send = (line: EventLine) => {
    const owner = line.owner == null ? null : String(line.owner);
    if (owner && owner !== viewer) return;
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  };

  const recent = await ActivityEvent.find()
    .sort({ createdAt: -1 })
    .limit(REPLAY_LINES)
    .lean();
  recent.reverse().forEach(send);
  const newest = recent[0]?.createdAt;
  if (newest && newest > lastSeen) lastSeen = newest;

  bus.on("event", send);
  req.on("close", () => {
    bus.off("event", send);
    openStreams -= 1;
  });
});

/**
 * POST /api/activity — append a log line (used by the agent service and for
 * smoke-testing the feed). The poller streams it to every open SSE client.
 */
activityRouter.post("/activity", async (req, res) => {
  const body = (req.body ?? {}) as {
    level?: string;
    message?: string;
    source?: string;
  };
  const level = LEVELS.find((candidate) => candidate === body.level);
  const message = body.message;
  if (!level || typeof message !== "string" || !message.trim()) {
    res.status(400).json({
      error: `level (${LEVELS.join("|")}) and a non-empty message are required`,
    });
    return;
  }
  const doc = await ActivityEvent.create({
    level,
    message: message.trim(),
    source: body.source,
    owner: req.userId,
  });
  bus.emit("event", doc.toObject());
  res.status(201).json({ id: doc.id });
});
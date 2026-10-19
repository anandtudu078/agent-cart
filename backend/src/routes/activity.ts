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
};

export const activityRouter = Router();
const bus = new EventEmitter();

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
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (line: EventLine) => res.write(`data: ${JSON.stringify(line)}\n\n`);

  const recent = await ActivityEvent.find()
    .sort({ createdAt: -1 })
    .limit(REPLAY_LINES)
    .lean();
  recent.reverse().forEach(send);
  const newest = recent[0]?.createdAt;
  if (newest && newest > lastSeen) lastSeen = newest;

  bus.on("event", send);
  req.on("close", () => bus.off("event", send));
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
  });
  bus.emit("event", doc.toObject());
  res.status(201).json({ id: doc.id });
});
import { Router } from "express";
import {
  agentState,
  runScanCycle,
  setAgentIntervalSec,
} from "../agent/cycle.js";

export const agentRouter = Router();

// bounds for the user-facing interval picker (matches the env floor of 5s)
const MIN_INTERVAL_SEC = 5;
const MAX_INTERVAL_SEC = 24 * 60 * 60;

/** GET /api/agent/status — loop state for the dashboard countdown. */
agentRouter.get("/agent/status", (_req, res) => {
  res.json(agentState());
});

/** PATCH /api/agent/settings — change the scan interval at runtime. */
agentRouter.patch("/agent/settings", (req, res) => {
  const body = (req.body ?? {}) as { intervalSec?: unknown };
  const raw = body.intervalSec;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    res.status(400).json({ error: "intervalSec must be a number" });
    return;
  }
  const sec = Math.min(
    MAX_INTERVAL_SEC,
    Math.max(MIN_INTERVAL_SEC, Math.trunc(raw)),
  );
  setAgentIntervalSec(sec);
  res.json({ intervalSec: sec });
});

/** POST /api/agent/scan — run one cycle now instead of waiting for the timer. */
agentRouter.post("/agent/scan", async (_req, res) => {
  if (agentState().running) {
    res.status(409).json({ error: "a scan cycle is already running" });
    return;
  }
  const summary = await runScanCycle();
  if (!summary) {
    res.status(500).json({ error: "scan cycle failed — see the activity log" });
    return;
  }
  res.json({ summary });
});

import { Router } from "express";
import { env } from "../config/env.js";
import { agentState, runScanCycle } from "../agent/cycle.js";

export const agentRouter = Router();

/** GET /api/agent/status — loop state for the dashboard countdown. */
agentRouter.get("/agent/status", (_req, res) => {
  res.json({
    ...agentState(),
    intervalSec: env.agent.intervalSec,
  });
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

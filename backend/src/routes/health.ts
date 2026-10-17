import { Router } from "express";
import { dbState } from "../config/db.js";

export const healthRouter = Router();

const startedAt = Date.now();

/**
 * GET /api/health — liveness/readiness probe for the AgentCart backend.
 */
healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "agentcart-backend",
    version: process.env.npm_package_version ?? "0.1.0",
    database: dbState(),
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});
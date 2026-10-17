import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { healthRouter } from "./routes/health.js";
import { activityRouter } from "./routes/activity.js";

const app = express();

// --- Middleware -------------------------------------------------------------
app.use(
  cors({
    origin: env.corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// --- Routes -----------------------------------------------------------------
app.use("/api", healthRouter);
app.use("/api", activityRouter);

// 404 fallback for unknown API routes
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Central error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[error]", err);
    res.status(500).json({
      error: env.nodeEnv === "production" ? "Internal server error" : err.message,
    });
  },
);

// --- Bootstrap -------------------------------------------------------------
await connectDB();

app.listen(env.port, () => {
  console.log(
    `✓ AgentCart API listening on http://localhost:${env.port} (${env.nodeEnv})`,
  );
});

export default app;
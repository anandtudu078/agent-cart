import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { requireAuth, writeLimiter } from "./middleware/auth.js";
import { healthRouter } from "./routes/health.js";
import { activityRouter } from "./routes/activity.js";
import { authRouter } from "./routes/auth.js";
import { watchItemsRouter } from "./routes/watch-items.js";
import { historyRouter } from "./routes/history.js";
import { agentRouter } from "./routes/agent.js";
import { cartRouter } from "./routes/cart.js";
import { startAgentLoop } from "./agent/cycle.js";

const app = express();

// hide the framework fingerprint
app.disable("x-powered-by");

// --- Middleware -------------------------------------------------------------
app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Routes -----------------------------------------------------------------
// health stays public for liveness probes; auth routes carry their own limiter
app.use("/api", healthRouter);
// mounted at /api/auth so the auth limiter only covers the login/signup paths
app.use("/api/auth", authRouter);

// cap bulk writes so nobody can spam the DB through the API
app.use("/api", (req, res, next) =>
  ["POST", "PATCH", "PUT", "DELETE"].includes(req.method)
    ? writeLimiter(req, res, next)
    : next(),
);

// everything else requires a session cookie
app.use("/api", requireAuth, activityRouter);
app.use("/api", requireAuth, watchItemsRouter);
app.use("/api", requireAuth, historyRouter);
app.use("/api", requireAuth, agentRouter);
app.use("/api", requireAuth, cartRouter);

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
    // Mongoose cast errors (bad ObjectId etc.) are client mistakes, not 500s
    if (err.name === "CastError") {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    // schema validation failures (enum/min/maxlength) are also client input
    // errors — a 500 here would hide a bad request behind an internal error
    if (err.name === "ValidationError") {
      res.status(400).json({
        error:
          env.nodeEnv === "production" ? "invalid request body" : err.message,
      });
      return;
    }
    const status = (err as { status?: number }).status;
    if (status === 413) {
      res.status(413).json({ error: "request body too large" });
      return;
    }
    if (status === 400) {
      res.status(400).json({
        error:
          env.nodeEnv === "production" ? "invalid request body" : err.message,
      });
      return;
    }
    res.status(500).json({
      error: env.nodeEnv === "production" ? "Internal server error" : err.message,
    });
  },
);

// --- Bootstrap -------------------------------------------------------------
await connectDB();
startAgentLoop();

app.listen(env.port, () => {
  console.log(
    `✓ AgentCart API listening on http://localhost:${env.port} (${env.nodeEnv})`,
  );
});

export default app;
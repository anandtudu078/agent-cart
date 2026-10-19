import "dotenv/config";

const nodeEnv = process.env.NODE_ENV ?? "development";

/**
 * Accepts both `mongodb://host:27017/db` and Atlas `mongodb+srv://…` URIs.
 * In development it falls back to the local Docker MongoDB; in production a
 * missing/empty MONGODB_URI is a hard startup error so we never silently
 * point a deployed app at localhost.
 */
function mongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (uri) return uri;
  if (nodeEnv === "production") {
    throw new Error(
      "MONGODB_URI must be set in production (mongodb+srv://… from MongoDB Atlas)",
    );
  }
  return "mongodb://127.0.0.1:27017/agentcart";
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (nodeEnv === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  // dev-only fallback; sessions are invalidated anyway on secret rotation
  return "agentcart-dev-secret";
}

// agent scan timer; floor of 5s so a typo can't hammer the DB
const agentIntervalSec = Number(process.env.AGENT_INTERVAL_SEC ?? 30);

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 4000),
  agent: {
    intervalSec: Number.isFinite(agentIntervalSec)
      ? Math.max(5, Math.trunc(agentIntervalSec))
      : 30,
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  mongoUri: mongoUri(),
  paypal: {
    mode: (process.env.PAYPAL_MODE ?? "sandbox") as "sandbox" | "live",
    clientId: process.env.PAYPAL_CLIENT_ID ?? "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
  },
  agentServiceUrl: process.env.AGENT_SERVICE_URL ?? "http://localhost:8000",
  jwt: { secret: jwtSecret() },
} as const;
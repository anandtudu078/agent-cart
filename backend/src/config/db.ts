import mongoose from "mongoose";
import { env } from "./env.js";
import { redactMongoUri } from "./log.js";

const RETRY_DELAY_MS = 5_000;
const MAX_RETRIES = 3;

let retries = 0;

function dbState() {
  if (mongoose.connection.readyState === 1) return "connected";
  if (mongoose.connection.readyState === 2) return "connecting";
  if (mongoose.connection.readyState === 3) return "disconnecting";
  return "disconnected";
}

function scheduleRetry(reason: string) {
  if (retries >= MAX_RETRIES) {
    console.error(
      `[db] connection failed after ${MAX_RETRIES} retries: ${reason}`,
    );
    if (env.nodeEnv === "production") {
      process.exit(1);
    }
    console.error("[db] starting without a database — /api/health reports state");
    return;
  }
  retries += 1;
  console.warn(
    `[db] connection failed (attempt ${retries}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS / 1000}s: ${reason}`,
  );
  setTimeout(() => {
    void connectDB();
  }, RETRY_DELAY_MS);
}

/**
 * Connect to MongoDB. Retries a few times; in development the server keeps
 * serving requests without a DB (health reports `database: "disconnected"`),
 * in production a failed connection is fatal.
 */
export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 4_000,
      autoIndex: env.nodeEnv !== "production",
    });
    retries = 0;
    // never log credentials — the URI carries the Atlas password
    console.log(`✓ MongoDB connected — ${redactMongoUri(env.mongoUri)}`);
  } catch (err) {
    scheduleRetry(err instanceof Error ? err.message : String(err));
  }
}

export { dbState };
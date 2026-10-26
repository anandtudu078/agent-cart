import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import {
  ActivityEvent,
  CartEntry,
  HistoryEntry,
  PricePoint,
  User,
  WatchItem,
} from "../models/index.js";
import { authLimiter, currentUserId } from "../middleware/auth.js";
import { isPublicHttpUrl } from "../agent/url-guard.js";

export const authRouter = Router();

// brute-force protection on the credential-checking routes only — throttling
// GET /me, /settings or logout here would lock a signed-in user out of their
// own account after 10 requests/15 min

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE = "agentcart_session";
const SESSION_MS = 24 * 60 * 60 * 1000;

function startSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, env.jwt.secret, { expiresIn: "1d" });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: SESSION_MS,
    path: "/",
  });
}

/** POST /api/auth/signup — create an account and log in. */
authRouter.post("/signup", authLimiter, async (req, res) => {
  const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
  // typeof checks first: operator payloads like {"$ne": ""} must 400, not 500
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  const password = typeof body.password === "string" ? body.password : null;

  if (!email || !EMAIL_RE.test(email) || password === null || password.length < 8) {
    res.status(400).json({
      error: "valid email and a password of at least 8 characters are required",
    });
    return;
  }

  try {
    const user = await User.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
    });
    startSession(res, user.id);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ error: "an account with that email already exists" });
      return;
    }
    throw err;
  }
});

/** POST /api/auth/login */
authRouter.post("/login", authLimiter, async (req, res) => {
  const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
  // typeof checks first: operator payloads like {"$ne": ""} must 400, not 500
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  const password = typeof body.password === "string" ? body.password : null;
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const user = await User.findOne({ email }).select("+passwordHash");
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    // one message for "no such user" and "wrong password" — don't leak which
    res.status(401).json({ error: "invalid email or password" });
    return;
  }

  startSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email } });
});

/** POST /api/auth/logout */
authRouter.post("/logout", (req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY"] as const;

/** GET /api/auth/settings — the signed-in user's preferences. */
authRouter.get("/settings", async (req, res) => {
  const userId = currentUserId(req);
  const user = userId ? await User.findById(userId).lean() : null;
  if (!user) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  res.json({ settings: user.settings ?? {} });
});

/** PATCH /api/auth/settings — update currency / notification prefs. */
authRouter.patch("/settings", async (req, res) => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  const body = (req.body ?? {}) as {
    currency?: unknown;
    priceAlerts?: unknown;
    webhookUrl?: unknown;
  };

  const patch: { currency?: string; priceAlerts?: boolean; webhookUrl?: string } = {};
  if (body.currency !== undefined) {
    if (
      typeof body.currency !== "string" ||
      !CURRENCIES.includes(body.currency.toUpperCase() as (typeof CURRENCIES)[number])
    ) {
      res.status(400).json({ error: `currency must be one of ${CURRENCIES.join(", ")}` });
      return;
    }
    patch.currency = body.currency.toUpperCase();
  }
  if (body.priceAlerts !== undefined) {
    if (typeof body.priceAlerts !== "boolean") {
      res.status(400).json({ error: "priceAlerts must be a boolean" });
      return;
    }
    patch.priceAlerts = body.priceAlerts;
  }
  if (body.webhookUrl !== undefined) {
    const url = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : null;
    // empty string clears the alert target; anything else must be a public
    // http(s) URL — the cycle re-checks this before every POST
    if (url === null || (url !== "" && !isPublicHttpUrl(url))) {
      res.status(400).json({
        error: "webhookUrl must be an empty string or a public http(s) URL",
      });
      return;
    }
    patch.webhookUrl = url;
  }

  // dotted paths: the fields live under the `settings` subdocument, and a
  // flat $set would silently match nothing
  const setOps: Record<string, string | boolean> = {};
  if (patch.currency !== undefined) setOps["settings.currency"] = patch.currency;
  if (patch.priceAlerts !== undefined)
    setOps["settings.priceAlerts"] = patch.priceAlerts;
  if (patch.webhookUrl !== undefined)
    setOps["settings.webhookUrl"] = patch.webhookUrl;

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: setOps },
    { new: true },
  ).lean();
  if (!user) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  res.json({ settings: user.settings ?? {} });
});

/** DELETE /api/auth/account — delete the user and everything they own. */
authRouter.delete("/account", async (req, res) => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  const ownedItems = await WatchItem.find({ owner: userId }).select("_id");
  const itemIds = ownedItems.map((item) => item._id);
  await Promise.all([
    WatchItem.deleteMany({ owner: userId }),
    CartEntry.deleteMany({ owner: userId }),
    // decisions about their items + rows they posted themselves — otherwise
    // the deleted account's activity stays readable in the shared feeds
    HistoryEntry.deleteMany({
      $or: [{ owner: userId }, { item: { $in: itemIds } }],
    }),
    ActivityEvent.deleteMany({ owner: userId }),
    // price history outlives its watch item otherwise (TTL alone is 90 days)
    PricePoint.deleteMany({ owner: userId }),
    User.deleteOne({ _id: userId }),
  ]);
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true, deletedItems: itemIds.length });
});

/** GET /api/auth/me — session probe for the UI (401 when logged out). */
authRouter.get("/me", async (req, res) => {
  const userId = currentUserId(req);
  const user = userId ? await User.findById(userId).lean() : null;
  if (!user) {
    res.clearCookie(COOKIE, { path: "/" });
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  res.json({ user: { id: user._id.toString(), email: user.email } });
});
import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User } from "../models/index.js";
import { authLimiter, currentUserId } from "../middleware/auth.js";

export const authRouter = Router();

// brute-force protection on every auth route (mounted at /api/auth)
authRouter.use(authLimiter);

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
authRouter.post("/signup", async (req, res) => {
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
authRouter.post("/login", async (req, res) => {
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
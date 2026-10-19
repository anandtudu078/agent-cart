import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

const COOKIE = "agentcart_session";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth on every protected route. */
      userId?: string;
    }
  }
}

/** Read the session cookie and return the user id, or null when logged out. */
export function currentUserId(req: Request): string | null {
  const token = req.cookies?.[COOKIE];
  if (typeof token !== "string") return null;
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    if (typeof payload === "string") return null;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Reject unauthenticated requests before any data route runs. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "authentication required" });
    return;
  }
  req.userId = userId;
  next();
}

/**
 * shortcut: IP-based limiting only; add per-account lockouts when login
 * volume makes them worth the complexity
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many attempts — try again in 15 minutes" },
});

/** Caps bulk writes so no client can spam the DB via the API. */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many requests — slow down" },
});

/**
 * shortcut: rows with no owner (seeded demo data) stay visible to any
 * signed-in user — upgrade to mandatory per-user ownership when this
 * goes multi-tenant
 */
export function ownedByUser(userId: string) {
  // plain mutable object: an `as const` literal breaks Mongoose 9's
  // FilterQuery overload resolution (same trap as history.ts's filter)
  return { $or: [{ owner: userId }, { owner: null }] };
}

/** True when a doc has no owner (demo data) or belongs to this user. */
export function isOwnedBy(
  doc: { owner?: unknown } | null,
  userId: string,
): boolean {
  if (!doc || !doc.owner) return Boolean(doc);
  return String(doc.owner) === userId;
}

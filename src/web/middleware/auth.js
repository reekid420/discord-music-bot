import crypto from 'crypto';
import {
  createSession,
  getSession,
  deleteSession,
  cleanExpiredSessions,
} from '../../db/database.js';

export const SESSION_DURATION = 24 * 60 * 60; // seconds
export const COOKIE_NAME = 'miyabi_session';

// ─── Login rate limiting ───
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

/** @type {Map<string, { count: number, resetAt: number }>} */
const failedLogins = new Map();

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const entry = failedLogins.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failedLogins.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    failedLogins.set(ip, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

/**
 * Constant-time string comparison (hash both sides to equalize length).
 */
function timingSafeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Check whether a session token is currently valid. Shared with Socket.io auth.
 * @param {string} token
 */
export function isValidSession(token) {
  return Boolean(token && getSession(token));
}

/**
 * Login route handler. Checks password, creates session.
 */
export function loginRoute(req, res) {
  const ip = clientIp(req);

  if (isRateLimited(ip)) {
    res.set('Retry-After', String(Math.ceil(LOGIN_WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  // Fail closed: refuse to run with a default/missing password
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    console.error('[Auth] DASHBOARD_PASSWORD is not set — refusing login');
    return res.status(503).json({ error: 'Dashboard is not configured' });
  }

  const { password } = req.body ?? {};
  if (!password || !timingSafeEqual(password, expected)) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Invalid password' });
  }

  failedLogins.delete(ip);
  cleanExpiredSessions();

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;
  createSession(token, expiresAt);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.DASHBOARD_SECURE_COOKIES === '1',
    maxAge: SESSION_DURATION * 1000,
  });

  return res.json({ success: true });
}

/**
 * Logout route handler.
 */
export function logoutRoute(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    deleteSession(token);
  }
  res.clearCookie(COOKIE_NAME);
  return res.json({ success: true });
}

/**
 * Auth middleware. Checks for valid session cookie.
 */
export function authMiddleware(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!isValidSession(token)) {
    if (token) res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

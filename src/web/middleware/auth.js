import crypto from 'crypto';
import { createSession, getSession, deleteSession, cleanExpiredSessions } from '../../db/database.js';

const SESSION_DURATION = 24 * 60 * 60; // 24 hours in seconds
const COOKIE_NAME = 'groove_session';

/**
 * Login route handler. Checks password, creates session.
 */
export function loginRoute(req, res) {
  const { password } = req.body;
  const expected = process.env.DASHBOARD_PASSWORD || 'changeme';

  if (!password || password !== expected) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Clean expired sessions periodically
  cleanExpiredSessions();

  // Create a new session
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;
  createSession(token, expiresAt);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
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
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = getSession(token);
  if (!session) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Session expired' });
  }

  next();
}

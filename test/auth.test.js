import { describe, it, expect, beforeAll, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDatabase, createSession, getSession } from '../src/db/database.js';
import { loginRoute, logoutRoute, authMiddleware, COOKIE_NAME } from '../src/web/middleware/auth.js';

beforeAll(() => {
  process.env.DASHBOARD_PASSWORD = 'test-secret';
  initDatabase(join(tmpdir(), `miyabi-auth-test-${process.pid}-${Date.now()}.db`));
});

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    cookies: {},
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie(name, value, opts) {
      this.cookies[name] = { value, opts };
      return this;
    },
    clearCookie(name) {
      this.clearedCookies.push(name);
      return this;
    },
  };
  return res;
}

function loginReq(password) {
  return { body: { password }, cookies: {} };
}

describe('loginRoute', () => {
  it('rejects the wrong password without setting a cookie', () => {
    const res = mockRes();
    loginRoute(loginReq('wrong'), res);
    expect(res.statusCode).toBe(401);
    expect(res.cookies[COOKIE_NAME]).toBeUndefined();
  });

  it('rejects a missing password', () => {
    const res = mockRes();
    loginRoute({ body: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('creates an httpOnly session cookie on success', () => {
    const res = mockRes();
    loginRoute(loginReq('test-secret'), res);
    expect(res.body).toEqual({ success: true });
    const cookie = res.cookies[COOKIE_NAME];
    expect(cookie).toBeTruthy();
    expect(cookie.opts.httpOnly).toBe(true);
    // token stored as a live session
    expect(getSession(cookie.value)).toBeTruthy();
  });
});

describe('authMiddleware', () => {
  it('rejects requests without a cookie', () => {
    const res = mockRes();
    const next = vi.fn();
    authMiddleware({ cookies: {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('accepts a valid session and calls next()', () => {
    const token = 'valid-token';
    createSession(token, Math.floor(Date.now() / 1000) + 60);
    const next = vi.fn();
    authMiddleware({ cookies: { [COOKIE_NAME]: token } }, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('clears stale cookies for expired sessions', () => {
    const res = mockRes();
    authMiddleware({ cookies: { [COOKIE_NAME]: 'nope' } }, res, vi.fn());
    expect(res.clearedCookies).toContain(COOKIE_NAME);
  });
});

describe('logoutRoute', () => {
  it('deletes the session and clears the cookie', () => {
    const token = 'logout-token';
    createSession(token, Math.floor(Date.now() / 1000) + 60);
    const res = mockRes();
    logoutRoute({ cookies: { [COOKIE_NAME]: token } }, res);
    expect(getSession(token)).toBeUndefined();
    expect(res.clearedCookies).toContain(COOKIE_NAME);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { logger } from '../src/utils/logger.js';
import { User } from '../src/models/User.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { hashToken } from '../src/utils/tokens.js';

const password = 'Passw0rdOK';
const owner = (n = 1) => ({ name: 'Olive Owner', email: `owner${n}@example.com`, password, role: 'owner' });

const cookieValue = (res, name) => {
  const raw = res.headers['set-cookie']?.find((c) => c.startsWith(`${name}=`));
  return raw?.split(';')[0].slice(name.length + 1);
};

const capturedToken = (spy, kind) => {
  const line = spy.mock.calls.map((c) => c[0]).findLast((m) => m.includes(`${kind} token`));
  return line.split(': ').pop();
};

beforeAll(() => mongoose.connect(env.MONGO_URI));
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), RefreshToken.deleteMany({})]);
  vi.restoreAllMocks();
});

describe('auth happy path', () => {
  it('register → login → me → refresh → logout', async () => {
    const agent = request.agent(app);

    const reg = await agent.post('/api/auth/register').send(owner());
    expect(reg.status).toBe(201);
    expect(reg.body.success).toBe(true);
    expect(reg.body.data.user).toMatchObject({ email: 'owner1@example.com', role: 'owner', emailVerified: false });
    expect(JSON.stringify(reg.body)).not.toMatch(/passwordHash|Passw0rd|Token/);
    expect(reg.headers['cache-control']).toBe('no-store');

    const accessCookie = reg.headers['set-cookie'].find((c) => c.startsWith('accessToken='));
    const refreshCookie = reg.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));
    for (const c of [accessCookie, refreshCookie]) {
      expect(c).toMatch(/HttpOnly/);
      expect(c).toMatch(/SameSite=Lax/);
    }
    expect(refreshCookie).toMatch(/Path=\/api\/auth/);

    const login = await agent.post('/api/auth/login').send({ email: 'OWNER1@example.com', password });
    expect(login.status).toBe(200);
    expect(login.body.data.user.lastLoginAt).toBeTruthy();

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user).toMatchObject({ role: 'owner', propertyAccess: [] });

    const before = cookieValue(login, 'refreshToken');
    const refreshed = await agent.post('/api/auth/refresh');
    expect(refreshed.status).toBe(200);
    expect(cookieValue(refreshed, 'refreshToken')).not.toBe(before);

    const current = cookieValue(refreshed, 'refreshToken');
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    const record = await RefreshToken.findOne({ tokenHash: hashToken(current) });
    expect(record.revokedAt).toBeTruthy();
  });

  it('accepts a Bearer token when no cookie is sent', async () => {
    const reg = await request(app).post('/api/auth/register').send(owner());
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${cookieValue(reg, 'accessToken')}`);
    expect(me.status).toBe(200);
  });
});

describe('register validation', () => {
  it('rejects non-owner roles with 403', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...owner(), role: 'warden' });
    expect(res.status).toBe(403);
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects weak passwords and bad emails with 400', async () => {
    const weak = await request(app).post('/api/auth/register').send({ ...owner(), password: 'abcdefgh' });
    expect(weak.status).toBe(400);
    const bad = await request(app).post('/api/auth/register').send({ ...owner(), email: 'nope' });
    expect(bad.status).toBe(400);
  });

  it('rejects duplicate emails with 409', async () => {
    await request(app).post('/api/auth/register').send(owner());
    const dup = await request(app).post('/api/auth/register').send(owner());
    expect(dup.status).toBe(409);
  });
});

describe('login failures', () => {
  it('returns the same generic 401 for wrong password and unknown email', async () => {
    await request(app).post('/api/auth/register').send(owner());
    const wrong = await request(app).post('/api/auth/login').send({ email: 'owner1@example.com', password: 'Wrong1234' });
    const missing = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
  });

  it('returns 403 for suspended accounts', async () => {
    await request(app).post('/api/auth/register').send(owner());
    await User.updateOne({ email: 'owner1@example.com' }, { status: 'suspended' });
    const res = await request(app).post('/api/auth/login').send({ email: 'owner1@example.com', password });
    expect(res.status).toBe(403);
  });

  it('blocks the 6th failed attempt with 429', async () => {
    const attempt = () => request(app).post('/api/auth/login').send({ email: 'brute@example.com', password: 'Wrong1234' });
    for (let i = 0; i < 5; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
  });
});

describe('protected routes', () => {
  it('rejects /me without a cookie', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('rejects /me with a garbage token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'accessToken=garbage');
    expect(res.status).toBe(401);
  });
});

describe('refresh token rotation', () => {
  it('revokes every session when a rotated token is reused', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send(owner());
    const stale = cookieValue(reg, 'refreshToken');

    expect((await agent.post('/api/auth/refresh')).status).toBe(200);

    const replay = await request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${stale}`);
    expect(replay.status).toBe(401);

    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
    expect((await agent.post('/api/auth/refresh')).status).toBe(401);
  });

  it('rejects a missing refresh cookie', async () => {
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
  });
});

describe('password reset and email verification', () => {
  it('responds generically to forgot-password for unknown emails', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('resets the password with a valid token and revokes sessions', async () => {
    const spy = vi.spyOn(logger, 'info');
    await request(app).post('/api/auth/register').send(owner());
    await request(app).post('/api/auth/forgot-password').send({ email: 'owner1@example.com' });
    const token = capturedToken(spy, 'password reset');

    const stored = await User.findOne({ email: 'owner1@example.com' }).select('+passwordResetToken');
    expect(stored.passwordResetToken).toBe(hashToken(token));

    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'NewPassw0rd' });
    expect(res.status).toBe(200);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);

    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'Another1234' })).status).toBe(400);
    const login = await request(app).post('/api/auth/login').send({ email: 'owner1@example.com', password: 'NewPassw0rd' });
    expect(login.status).toBe(200);
  });

  it('verifies email with a valid token only', async () => {
    const spy = vi.spyOn(logger, 'info');
    await request(app).post('/api/auth/register').send(owner());
    const token = capturedToken(spy, 'email verification');

    expect((await request(app).post('/api/auth/verify-email').send({ token: 'a'.repeat(64) })).status).toBe(400);
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(200);
    expect((await User.findOne({ email: 'owner1@example.com' })).emailVerified).toBe(true);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { authenticate } from '../src/middleware/authenticate.js';
import { sanitizeValue } from '../src/middleware/sanitize.js';
import { Resident } from '../src/models/Resident.js';
import { RentCharge } from '../src/models/RentCharge.js';
import { addResident, checkIn, createStaff, day, generateCharges, makeProperty, makeStudent, pay, registerOwner, wipeAll, world } from './helpers.js';

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(wipeAll);

/* ---------------- every route is authenticated (except the public ones) ---------------- */

const mountPath = (layer) => {
  if (layer.regexp.fast_slash) return '';
  let i = 0;
  return layer.regexp.source
    .replace('^', '')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\(\?:\\\/\(\[\^\/\]\+\?\)\)/g, () => `/:${layer.keys[i++].name}`)
    .replace(/\\\//g, '/');
};

const collectRoutes = (stack, prefix = '', authed = false) => {
  const found = [];
  let guarded = authed;
  for (const layer of stack) {
    if (layer.route) {
      const handlers = layer.route.stack.map((l) => l.handle);
      for (const method of Object.keys(layer.route.methods)) {
        found.push({ method: method.toUpperCase(), path: (prefix + layer.route.path).replace(/(.)\/$/, '$1'), authed: guarded || handlers.includes(authenticate) });
      }
    } else if (layer.name === 'router') {
      found.push(...collectRoutes(layer.handle.stack, prefix + mountPath(layer), guarded));
    } else if (layer.handle === authenticate) {
      guarded = true; // router.use(authenticate) protects everything registered after it
    }
  }
  return found;
};

const PUBLIC = new Set([
  'GET /api/health', 'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/logout', 'POST /api/auth/refresh',
  'POST /api/auth/forgot-password', 'POST /api/auth/reset-password', 'POST /api/auth/verify-email',
]);

describe('route inventory', () => {
  const routes = collectRoutes(app._router.stack);

  it('finds the whole API surface', () => {
    expect(routes.length).toBeGreaterThan(90);
    for (const expected of ['POST /api/payments', 'GET /api/reports/overview', 'POST /api/stays/:id/checkout', 'GET /api/me/summary', 'POST /api/properties/:propertyId/staff/invite', 'POST /api/admin/jobs/:name']) {
      expect(routes.map((r) => `${r.method} ${r.path}`), expected).toContain(expected);
    }
  });

  it('requires authentication on every route except the public allow-list', () => {
    const open = routes.filter((r) => !r.authed).map((r) => `${r.method} ${r.path}`);
    expect(open.filter((r) => !PUBLIC.has(r))).toEqual([]);
    expect(open.sort()).toEqual([...PUBLIC].sort());
  });
});

/* ---------------- permission matrix ---------------- */

describe('permission matrix', () => {
  let W;
  const setup = async () => {
    const ctx = await world();
    const resB = await addResident(ctx.owner, ctx.property.id, { email: 'student.b@example.com' });
    await checkIn(ctx.owner, resB.id, ctx.beds[1].id);
    const studentOther = await makeStudent(ctx.owner, resB);
    const wardenFull = await createStaff('warden', ctx.property.id, ['residents.view', 'residents.edit', 'payments.record', 'payments.view', 'complaints.manage', 'finances.view', 'finances.edit', 'reports.view']);
    const wardenNone = await createStaff('warden', ctx.property.id, []);
    const maintenance = await createStaff('maintenance', ctx.property.id);
    const stranger = await registerOwner();
    await makeProperty(stranger);

    await generateCharges(ctx.owner, ctx.property.id);
    const payment = (await pay(ctx.owner, ctx, 100000)).body.data.payment;
    const charge = await RentCharge.findOne({ resident: ctx.resident.id }).lean();
    const complaint = (await ctx.student.post('/api/complaints').send({ category: 'other', title: 'Matrix issue', description: 'For the matrix test', urgency: 'low' })).body.data.complaint;
    return { ...ctx, studentSelf: ctx.student, studentOther, wardenFull, wardenNone, maintenance, stranger, payment, charge, complaint };
  };

  const ROLES = ['owner', 'wardenFull', 'wardenNone', 'maintenance', 'studentSelf', 'studentOther', 'stranger', 'anon'];
  const call = (agent, method, url, body) => (agent ? agent[method](url) : request(app)[method](url)).send(body);

  // Expected status per role. `staffRead` is the common shape for staff-only endpoints.
  const deny = { owner: 403, wardenFull: 403, wardenNone: 403, maintenance: 403, studentSelf: 403, studentOther: 403, stranger: 404, anon: 401 };
  const staffOnly = { ...deny, owner: 200, wardenFull: 200 };
  const ownRecord = { ...staffOnly, studentSelf: 200, studentOther: 404 };
  const ownerOnly = { ...deny, owner: 200 };

  const rows = (w) => {
    const p = w.property.id;
    return [
      // [name, method, url, body, expected]
      ['list properties', 'get', '/api/properties', undefined, { ...staffOnly, wardenNone: 200, maintenance: 200, stranger: 200 }],
      ['property detail', 'get', `/api/properties/${p}`, undefined, { ...staffOnly, wardenNone: 200, maintenance: 200 }],
      ['resident detail', 'get', `/api/residents/${w.resident.id}`, undefined, { ...staffOnly, maintenance: 200 }],
      ['resident list', 'get', `/api/residents?propertyId=${p}`, undefined, { ...staffOnly, maintenance: 200 }],
      ['create resident', 'post', '/api/residents', { propertyId: p, fullName: 'Matrix Person', phone: '9812345678' }, { ...deny, owner: 201, wardenFull: 201 }],
      ['create room', 'post', `/api/properties/${p}/rooms`, { number: '777', capacity: 2 }, { ...deny, owner: 201 }],
      ['stay detail', 'get', `/api/stays/${w.stay.id}`, undefined, staffOnly],
      ['checkout preview', 'post', `/api/stays/${w.stay.id}/checkout/preview`, { actualCheckOutDate: day(0) }, staffOnly],
      ['payments list', 'get', `/api/payments?propertyId=${p}`, undefined, { ...staffOnly, studentSelf: 200, studentOther: 200 }],
      ['payment detail', 'get', `/api/payments/${w.payment.id}`, undefined, ownRecord],
      ['receipt', 'get', `/api/payments/${w.payment.id}/receipt`, undefined, ownRecord],
      ['record payment', 'post', '/api/payments', { propertyId: p, residentId: w.resident.id, amountPaise: 100, method: 'cash', allowAdvance: true }, { ...deny, owner: 201, wardenFull: 201 }],
      ['reverse payment', 'post', `/api/payments/${w.payment.id}/reverse`, { reason: 'matrix' }, { ...deny, owner: 200 }],
      ['verify payment', 'post', `/api/payments/${w.payment.id}/verify`, undefined, { ...deny, owner: 200 }],
      ['charge detail', 'get', `/api/rent-charges/${w.charge._id}`, undefined, ownRecord],
      ['generate charges', 'post', '/api/rent-charges/generate', { propertyId: p, periodKey: day(0).slice(0, 7), dryRun: true }, ownerOnly],
      ['adjust charge', 'post', `/api/rent-charges/${w.charge._id}/adjust`, { amountPaise: 100, reason: 'matrix' }, { ...deny, owner: 200 }],
      ['balance', 'get', `/api/residents/${w.resident.id}/balance`, undefined, ownRecord],
      ['refunds list', 'get', `/api/refunds?propertyId=${p}`, undefined, { ...staffOnly, studentSelf: 200, studentOther: 200 }],
      ['reports overview', 'get', `/api/reports/overview?propertyId=${p}`, undefined, staffOnly],
      ['reports trend', 'get', `/api/reports/trend?propertyId=${p}`, undefined, staffOnly],
      ['reports export', 'get', `/api/reports/export?type=payments&propertyId=${p}`, undefined, staffOnly],
      ['expenses list', 'get', `/api/expenses?propertyId=${p}`, undefined, staffOnly],
      ['create expense', 'post', '/api/expenses', { propertyId: p, category: 'water', amountPaise: 500, paidAt: day(0), description: 'Matrix water' }, { ...deny, owner: 201, wardenFull: 201 }],
      ['complaint detail', 'get', `/api/complaints/${w.complaint.id}`, undefined, { ...staffOnly, wardenNone: 200, maintenance: 404, studentSelf: 200, studentOther: 404 }],
      ['complaint summary', 'get', `/api/complaints/summary?propertyId=${p}`, undefined, staffOnly],
      ['acknowledge complaint', 'patch', `/api/complaints/${w.complaint.id}/acknowledge`, {}, { ...deny, owner: null, wardenFull: null }], // allowed paths are exercised below
      ['staff list', 'get', `/api/properties/${p}/staff`, undefined, ownerOnly],
      ['staff invite', 'post', `/api/properties/${p}/staff/invite`, { email: 'x@example.com', name: 'Mx Person', role: 'warden' }, { ...deny, owner: 201 }],
      ['announcement', 'post', `/api/properties/${p}/announcements`, { title: 'Matrix notice', body: 'Hello everyone' }, { ...deny, owner: 201 }],
      ['run job', 'post', '/api/admin/jobs/rentReminders', {}, { ...deny, stranger: 200, owner: 200 }],
      ['me summary', 'get', '/api/me/summary', undefined, { ...deny, studentSelf: 200, studentOther: 200, stranger: 403 }],
      ['me receipt', 'get', `/api/me/receipts/${w.payment.id}`, undefined, { ...deny, studentSelf: 200, studentOther: 404, stranger: 403 }],
      ['my notifications', 'get', '/api/me/notifications', undefined, { ...Object.fromEntries(ROLES.map((r) => [r, 200])), anon: 401 }],
    ];
  };

  it('allows and denies each role exactly as designed', async () => {
    W = await setup();
    const agents = { owner: W.owner, wardenFull: W.wardenFull, wardenNone: W.wardenNone, maintenance: W.maintenance, studentSelf: W.studentSelf, studentOther: W.studentOther, stranger: W.stranger, anon: null };
    const failures = [];
    // Run denials before allowances so mutating allowed calls (e.g. reverse) cannot mask a denial.
    for (const allowed of [false, true]) {
      for (const [name, method, url, body, expected] of rows(W)) {
        for (const role of ROLES) {
          if (expected[role] === null) continue;
          const ok = expected[role] < 300;
          if (ok !== allowed) continue;
          if (name === 'reverse payment' && allowed) continue; // would invalidate later rows
          if (['verify payment', 'adjust charge'].includes(name) && allowed) continue;
          const res = await call(agents[role], method, url, body);
          if (res.status !== expected[role]) failures.push(`${role} ${method.toUpperCase()} ${name}: expected ${expected[role]}, got ${res.status}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('applies the allowed state-changing calls that the matrix skipped', async () => {
    W = await setup();
    expect((await W.wardenFull.patch(`/api/complaints/${W.complaint.id}/acknowledge`).send({})).status).toBe(200);
    expect((await W.owner.post(`/api/payments/${W.payment.id}/verify`)).status).toBe(200);
    expect((await W.owner.post(`/api/rent-charges/${W.charge._id}/adjust`).send({ amountPaise: 100, reason: 'matrix' })).status).toBe(200);
    expect((await W.owner.post(`/api/payments/${W.payment.id}/reverse`).send({ reason: 'matrix' })).status).toBe(200);
  });
});

/* ---------------- tenant isolation spot checks named in the spec ---------------- */

describe('isolation', () => {
  it('a warden cannot see another property’s finances', async () => {
    const a = await world();
    const b = await world();
    await generateCharges(b.owner, b.property.id);
    const bPayment = (await pay(b.owner, b, 100000)).body.data.payment;
    const bExpense = (await b.owner.post('/api/expenses').send({ propertyId: b.property.id, category: 'water', amountPaise: 700, paidAt: day(0), description: 'B only' })).body.data.expense;
    const warden = await createStaff('warden', a.property.id, ['payments.view', 'finances.view', 'reports.view', 'residents.view']);

    for (const path of [`/api/payments?propertyId=${b.property.id}`, `/api/rent-charges?propertyId=${b.property.id}`, `/api/expenses?propertyId=${b.property.id}`,
      `/api/reports/overview?propertyId=${b.property.id}`, `/api/reports/collections?propertyId=${b.property.id}`, `/api/reports/export?type=payments&propertyId=${b.property.id}`,
      `/api/payments/${bPayment.id}`, `/api/payments/${bPayment.id}/receipt`, `/api/expenses/${bExpense.id}`, `/api/residents/${b.resident.id}/balance`]) {
      expect((await warden.get(path)).status, path).toBe(404);
    }
    expect((await warden.get('/api/payments')).body.data.items).toEqual([]); // unscoped lists only cover their own properties
    expect((await warden.get('/api/expenses')).body.data.items).toEqual([]);
    expect((await warden.get(`/api/reports/overview?propertyId=${a.property.id}`)).status).toBe(200);
  });

  it('a student cannot see another resident’s receipt, and a maintenance user cannot view payments', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const made = (await pay(ctx.owner, ctx, 100000)).body.data.payment;
    const otherResident = await addResident(ctx.owner, ctx.property.id, { email: 'someone.else@example.com' });
    await checkIn(ctx.owner, otherResident.id, ctx.beds[1].id);
    const other = await makeStudent(ctx.owner, otherResident);
    expect((await other.get(`/api/payments/${made.id}/receipt`)).status).toBe(404);
    expect((await other.get(`/api/me/receipts/${made.id}`)).status).toBe(404);
    expect((await ctx.student.get(`/api/payments/${made.id}/receipt`)).status).toBe(200);

    const maint = await createStaff('maintenance', ctx.property.id, ['complaints.manage', 'residents.view', 'payments.view', 'finances.view']); // even with the grants
    for (const path of [`/api/payments?propertyId=${ctx.property.id}`, `/api/payments/${made.id}`, `/api/payments/${made.id}/receipt`, `/api/rent-charges?propertyId=${ctx.property.id}`,
      `/api/residents/${ctx.resident.id}/balance`, `/api/reports/overview?propertyId=${ctx.property.id}`, `/api/expenses?propertyId=${ctx.property.id}`]) {
      expect((await maint.get(path)).status, path).toBe(403);
    }
  });
});

/* ---------------- request hardening ---------------- */

describe('input sanitising', () => {
  it('drops operator and dotted keys and strips control characters', () => {
    expect(sanitizeValue({ a: { $ne: 1, 'b.c': 2, ok: 'x\u0000y\u0007z', keep: 'line1\nline2\ttab' }, list: [{ $gt: 1, v: 'a\u0001' }] })).toEqual({
      a: { ok: 'xyz', keep: 'line1\nline2\ttab' },
      list: [{ v: 'a' }],
    });
    expect(sanitizeValue({ password: 'p\u0001ss', token: 't\u0002' })).toEqual({ password: 'p\u0001ss', token: 't\u0002' }); // secrets are left untouched
  });

  it('strips control characters from stored free text and ignores operator injection', async () => {
    const owner = await registerOwner();
    const { property } = await makeProperty(owner);
    const res = await owner.post('/api/residents').send({ propertyId: property.id, fullName: 'Ann\u0007ie\u0000 Rose', phone: '9876543210', notes: 'Line one\nLine two' });
    expect(res.status).toBe(201);
    const stored = await Resident.findById(res.body.data.resident.id).lean();
    expect(stored.fullName).toBe('Annie Rose');
    expect(stored.notes).toBe('Line one\nLine two');

    const login = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: 'x' });
    expect(login.status).toBe(400);
    expect((await owner.get('/api/residents?status[$ne]=former')).status).toBe(400); // the operator is dropped, leaving an invalid filter, never a query
    expect((await owner.post('/api/residents').send({ propertyId: property.id, fullName: 'Inject Test', phone: '9876543210', $where: 'sleep(1000)' })).status).toBe(201);
  });
});

describe('browser-facing protections', () => {
  it('sends a strict content security policy and other helmet headers', async () => {
    const res = await request(app).get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain(env.CLIENT_URL);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('only accepts the configured client origin', async () => {
    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(evil.status).toBe(403);
    const preflight = await request(app).options('/api/payments').set('Origin', 'https://evil.example.com').set('Access-Control-Request-Method', 'POST');
    expect(preflight.status).toBe(403);

    const good = await request(app).get('/api/health').set('Origin', env.CLIENT_URL);
    expect(good.status).toBe(200);
    expect(good.headers['access-control-allow-origin']).toBe(env.CLIENT_URL);
    expect(good.headers['access-control-allow-credentials']).toBe('true');
    expect((await request(app).get('/api/health')).status).toBe(200); // no Origin header: not a browser request
  });

  it('rejects client-supplied computed or financial fields instead of trusting them', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const send = (extra) => pay(ctx.owner, ctx, 1000, extra);
    for (const extra of [{ receiptNumber: 'X-1' }, { status: 'verified' }, { netDuePaise: 1 }, { paidPaise: 1 }, { outstandingPaise: 0 }, { advancePaise: 5 }, { refundablePaise: 1 }]) {
      expect((await send(extra)).status).toBe(400);
    }
    expect((await pay(ctx.owner, ctx, 10.5)).status).toBe(400); // no floats
    expect((await send({})).status).toBe(201);
    expect((await ctx.owner.patch(`/api/rent-charges/${(await RentCharge.findOne())._id}`).send({ netDuePaise: 1, status: 'paid' })).status).toBe(400);
    expect((await ctx.owner.post(`/api/stays/${ctx.stay.id}/checkout`).send({ actualCheckOutDate: day(0), refundablePaise: 99999999 })).status).toBe(400);
  });

  it('keeps authentication cookies httpOnly and SameSite=Lax', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Cookie Owner', email: 'cookie@example.com', password: 'Passw0rdOK', role: 'owner' });
    const cookies = res.headers['set-cookie'].filter((c) => !c.startsWith('csrfToken'));
    expect(cookies.length).toBeGreaterThan(0);
    for (const c of cookies) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=Lax/i);
    }
  });
});

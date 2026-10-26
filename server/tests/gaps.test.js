import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { createStaff, day, generateCharges, pay, wipeAll, world } from './helpers.js';

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(wipeAll);

const exportUrl = (ctx, type) => `/api/reports/export?type=${type}&propertyId=${ctx.property.id}`;

describe('CSV export needs the matching read permission', () => {
  it('lets reports.view alone reach reports but none of the raw exports', async () => {
    const ctx = await world();
    const w = await createStaff('warden', ctx.property.id, ['reports.view']);
    expect((await w.get(`/api/reports/trend?propertyId=${ctx.property.id}`)).status).toBe(200);
    for (const type of ['charges', 'payments', 'expenses', 'residents']) expect((await w.get(exportUrl(ctx, type))).status).toBe(403);
  });

  it('maps each export to its own permission', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const cases = [
      ['charges', 'payments.view'],
      ['payments', 'payments.view'],
      ['residents', 'residents.view'],
      ['expenses', 'finances.view'],
    ];
    for (const [type, perm] of cases) {
      const base = await createStaff('warden', ctx.property.id, ['reports.view']);
      const granted = await createStaff('warden', ctx.property.id, ['reports.view', perm]);
      expect((await base.get(exportUrl(ctx, type))).status).toBe(403);
      const ok = await granted.get(exportUrl(ctx, type));
      expect(ok.status).toBe(200);
      expect(ok.headers['content-type']).toMatch(/text\/csv/);
    }
  });

  it('keeps the owner able to export everything', async () => {
    const ctx = await world();
    for (const type of ['charges', 'payments', 'expenses', 'residents']) expect((await ctx.owner.get(exportUrl(ctx, type))).status).toBe(200);
  });
});

describe('warden finance access', () => {
  const expense = (ctx, extra = {}) => ({ propertyId: ctx.property.id, category: 'water', amountPaise: 12500, paidAt: day(0), description: 'Tanker', ...extra });

  it('records and edits expenses with finances.edit but cannot void them', async () => {
    const ctx = await world();
    const w = await createStaff('warden', ctx.property.id, ['finances.view', 'finances.edit']);
    const created = await w.post('/api/expenses').send(expense(ctx));
    expect(created.status).toBe(201);
    const id = created.body.data.expense.id;
    expect((await w.patch(`/api/expenses/${id}`).send({ notes: 'ok' })).status).toBe(200);
    expect((await w.get(`/api/expenses/${id}`)).status).toBe(200);
    expect((await w.delete(`/api/expenses/${id}`).send({ reason: 'mistake entry' })).status).toBe(403);
  });

  it('finances.view alone reads but cannot write', async () => {
    const ctx = await world();
    const exp = (await ctx.owner.post('/api/expenses').send(expense(ctx))).body.data.expense;
    const w = await createStaff('warden', ctx.property.id, ['finances.view']);
    expect((await w.get(`/api/expenses?propertyId=${ctx.property.id}`)).status).toBe(200);
    expect((await w.get(`/api/expenses/${exp.id}`)).status).toBe(200);
    expect((await w.post('/api/expenses').send(expense(ctx))).status).toBe(403);
    expect((await w.patch(`/api/expenses/${exp.id}`).send({ notes: 'x' })).status).toBe(403);
  });
});

describe('access changes take effect on the next request', () => {
  it('drops a warden the moment their property access is removed', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const w = await createStaff('warden', ctx.property.id);
    expect((await w.get(`/api/residents?propertyId=${ctx.property.id}`)).status).toBe(200);
    await User.updateOne({ _id: w.userId }, { $set: { propertyAccess: [] } });
    // A property you cannot see answers 404, not 403, so its existence is not revealed.
    expect((await w.get(`/api/residents?propertyId=${ctx.property.id}`)).status).toBe(404);
    expect((await pay(w, ctx, 100)).status).toBe(404);
  });

  it('rejects a suspended account that still holds a valid cookie', async () => {
    const ctx = await world();
    const w = await createStaff('warden', ctx.property.id);
    await User.updateOne({ _id: w.userId }, { $set: { status: 'suspended' } });
    expect((await w.get(`/api/residents?propertyId=${ctx.property.id}`)).status).toBe(403);
  });

  it('picks up permission changes immediately', async () => {
    const ctx = await world();
    const w = await createStaff('warden', ctx.property.id, ['residents.view']);
    expect((await w.get(`/api/rent-charges?propertyId=${ctx.property.id}`)).status).toBe(403);
    await User.updateOne({ _id: w.userId }, { $set: { 'propertyAccess.0.permissions': ['residents.view', 'payments.view'] } });
    expect((await w.get(`/api/rent-charges?propertyId=${ctx.property.id}`)).status).toBe(200);
  });
});

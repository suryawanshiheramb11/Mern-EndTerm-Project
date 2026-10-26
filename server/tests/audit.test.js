import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { createStaff, day, generateCharges, wipeAll, world } from './helpers.js';

const UA = 'vitest-audit';
const as = (req) => req.set('User-Agent', UA);
const rows = (filter = {}) => AuditLog.find(filter).sort({ at: 1, _id: 1 }).lean();

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(wipeAll);

describe('audit log', () => {
  it('records every sensitive action with who, what, before/after, ip and user agent', async () => {
    const ctx = await world();
    const { owner, property } = ctx;
    const gen = await as(owner.post('/api/rent-charges/generate')).send({ propertyId: property.id, periodKey: day(0).slice(0, 7) });
    expect(gen.body.data.created).toBe(1);
    const charge = (await owner.get(`/api/rent-charges?propertyId=${property.id}`)).body.data.items[0];

    const made = (await as(owner.post('/api/payments')).send({ propertyId: property.id, residentId: ctx.resident.id, amountPaise: 300000, method: 'upi', idempotencyKey: 'audit-key-0001' })).body.data.payment;
    await as(owner.post('/api/payments')).send({ propertyId: property.id, residentId: ctx.resident.id, amountPaise: 300000, method: 'upi', idempotencyKey: 'audit-key-0001' }); // replay
    await as(owner.post(`/api/payments/${made.id}/verify`));
    await as(owner.patch(`/api/rent-charges/${charge.id}`)).send({ discountPaise: 10000 });
    await as(owner.post(`/api/rent-charges/${charge.id}/adjust`)).send({ amountPaise: 5000, reason: 'AC surcharge' });
    await as(owner.post(`/api/rent-charges/${charge.id}/waive`)).send({ reason: 'goodwill' });
    await as(owner.post(`/api/payments/${made.id}/reverse`)).send({ reason: 'entered twice' });

    const expense = (await as(owner.post('/api/expenses')).send({ propertyId: property.id, category: 'water', amountPaise: 90000, paidAt: day(0), description: 'Tanker' })).body.data.expense;
    await as(owner.patch(`/api/expenses/${expense.id}`)).send({ amountPaise: 95000 });
    await as(owner.delete(`/api/expenses/${expense.id}`)).send({ reason: 'duplicate' });

    await as(owner.post(`/api/properties/${property.id}/announcements`)).send({ title: 'Notice', body: 'Hello everyone' });
    await as(owner.post('/api/admin/jobs/rentReminders')).send({});

    const out = (await as(owner.post(`/api/stays/${ctx.stay.id}/checkout`)).send({ actualCheckOutDate: day(0) })).body.data;
    await as(owner.post(`/api/refunds/${out.refund.id}/approve`)).send({});
    await as(owner.post(`/api/refunds/${out.refund.id}/pay`)).send({ method: 'cash' });

    const all = await rows();
    const actions = all.map((r) => r.action);
    for (const expected of [
      'charges.generate', 'payment.record', 'payment.verify', 'charge.update', 'charge.adjust', 'charge.waive', 'payment.reverse',
      'expense.create', 'expense.update', 'expense.void', 'announcement.create', 'job.run', 'stay.checkout', 'refund.approve', 'refund.pay',
    ]) {
      expect(actions, expected).toContain(expected);
    }
    expect(actions.filter((a) => a === 'payment.record')).toHaveLength(1); // the idempotent replay is not a second event

    for (const row of all) {
      expect(String(row.user), row.action).toBe(owner.userId);
      expect(row.ip, row.action).toBeTruthy();
      expect(row.userAgent, row.action).toBe(UA);
      expect(row.entityType, row.action).toBeTruthy();
      expect(row.entityId, row.action).toBeTruthy();
      expect(row.at).toBeInstanceOf(Date);
    }
    const byAction = (a) => all.find((r) => r.action === a);
    expect(byAction('payment.record')).toMatchObject({ entityType: 'Payment', after: { amountPaise: 300000, method: 'upi', status: 'recorded' } });
    expect(byAction('payment.verify')).toMatchObject({ before: { status: 'recorded' }, after: { status: 'verified' } });
    expect(byAction('payment.reverse')).toMatchObject({ before: { status: 'verified' }, after: { status: 'reversed' }, meta: { reason: 'entered twice' } });
    expect(byAction('charge.adjust')).toMatchObject({ entityType: 'RentCharge', meta: { amountPaise: 5000, reason: 'AC surcharge' } });
    expect(byAction('charge.waive')).toMatchObject({ after: { status: 'waived' }, meta: { reason: 'goodwill' } });
    expect(byAction('expense.update')).toMatchObject({ before: { amountPaise: 90000 }, after: { amountPaise: 95000 } });
    expect(byAction('refund.pay')).toMatchObject({ before: { status: 'approved' }, after: { status: 'paid', method: 'cash' } });
    expect(String(byAction('payment.record').property)).toBe(property.id);
  });

  it('writes nothing for refused, invalid or preview-only requests', async () => {
    const ctx = await world();
    const warden = await createStaff('warden', ctx.property.id, ['residents.view']);
    await generateCharges(ctx.owner, ctx.property.id, day(0).slice(0, 7)).then(() => AuditLog.collection.deleteMany({}));

    await warden.post('/api/payments').send({ propertyId: ctx.property.id, residentId: ctx.resident.id, amountPaise: 1000, method: 'cash' }); // 403
    await ctx.owner.post('/api/payments').send({ propertyId: ctx.property.id, residentId: ctx.resident.id, amountPaise: 10.5, method: 'cash' }); // 400
    await ctx.owner.post('/api/payments').send({ propertyId: ctx.property.id, residentId: ctx.resident.id, amountPaise: 1000, method: 'cash', dryRun: true });
    await ctx.owner.post('/api/rent-charges/generate').send({ propertyId: ctx.property.id, periodKey: day(0).slice(0, 7), dryRun: true });
    await ctx.owner.post(`/api/stays/${ctx.stay.id}/checkout/preview`).send({ actualCheckOutDate: day(0) });
    await ctx.owner.post('/api/expenses').send({ propertyId: ctx.property.id, category: 'water', amountPaise: 0, paidAt: day(0), description: 'bad' });
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('is append-only', async () => {
    const ctx = await world();
    await ctx.owner.post(`/api/properties/${ctx.property.id}/announcements`).send({ title: 'Notice', body: 'Hello everyone' });
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/immutable/);
    await expect(AuditLog.updateOne({}, { action: 'x' })).rejects.toThrow(/immutable/);
    await expect(AuditLog.findOneAndDelete({})).rejects.toThrow(/immutable/);
    expect(await AuditLog.countDocuments()).toBe(1);
  });
});

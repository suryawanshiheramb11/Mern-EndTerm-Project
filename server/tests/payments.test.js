import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { User } from '../src/models/User.js';
import { Property } from '../src/models/Property.js';
import { Room } from '../src/models/Room.js';
import { Bed } from '../src/models/Bed.js';
import { Resident } from '../src/models/Resident.js';
import { Stay } from '../src/models/Stay.js';
import { RentCharge } from '../src/models/RentCharge.js';
import { Payment } from '../src/models/Payment.js';
import { Advance } from '../src/models/Advance.js';
import { Counter } from '../src/models/Counter.js';
import { Refund } from '../src/models/Refund.js';
import { addDays, businessToday } from '../src/utils/dates.js';
import { nextPeriodKey, periodKeyOf, dueDateFor } from '../src/utils/billing.js';
import { generateForProperty, generateForStay } from '../src/services/charge.service.js';
import { reconcileOverdue } from '../src/services/reconcile.service.js';
import { ledgerPaidByCharge } from '../src/services/balance.service.js';

const password = 'Passw0rdOK';
const RENT = 800000; // ₹8,000 in paise
const DEPOSIT = 500000;
const day = (offset = 0) => addDays(businessToday(), offset).toISOString().slice(0, 10);
const PERIOD = nextPeriodKey(periodKeyOf(businessToday())); // next month: never overdue yet

let userCount = 0;
const registerOwner = async () => {
  userCount += 1;
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ name: 'Olive Owner', email: `owner${userCount}@example.com`, password, role: 'owner' });
  return agent;
};

const createStaff = async (role, propertyAccess = []) => {
  userCount += 1;
  const user = new User({ name: `${role} user`, email: `${role}${userCount}@example.com`, role, propertyAccess });
  user.password = password;
  await user.save();
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password });
  return { agent, user };
};

const setup = async ({ beds = 3 } = {}) => {
  const owner = await registerOwner();
  const property = (
    await owner.post('/api/properties').send({
      name: 'Sunrise PG',
      address: { line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001' },
    })
  ).body.data.property;
  const room = (
    await owner.post(`/api/properties/${property.id}/rooms`).send({ number: '201', capacity: 30, defaultMonthlyRent: RENT / 100 })
  ).body.data.room;
  const created = (await owner.post(`/api/properties/${property.id}/rooms/${room.id}/beds/bulk`).send({ count: beds })).body.data.items;
  return { owner, property, room, beds: created };
};

let residentCount = 0;
const addResident = async (agent, propertyId) => {
  residentCount += 1;
  const res = await agent.post('/api/residents').send({ propertyId, fullName: `Resident ${residentCount}`, phone: `98765432${String(residentCount).padStart(2, '0')}` });
  return res.body.data.resident;
};

const checkIn = (agent, residentId, bedId, extra = {}) =>
  agent.post('/api/stays').send({ residentId, bedId, action: 'checkin', checkInDate: day(0), depositPaise: DEPOSIT, termsAcknowledged: true, ...extra });

// One resident with an active stay and a generated charge for PERIOD.
const withCharge = async (opts) => {
  const ctx = await setup(opts);
  const resident = await addResident(ctx.owner, ctx.property.id);
  const stay = (await checkIn(ctx.owner, resident.id, ctx.beds[0].id)).body.data.stay;
  await ctx.owner.post('/api/rent-charges/generate').send({ propertyId: ctx.property.id, periodKey: PERIOD });
  const charge = await RentCharge.findOne({ stay: stay.id }).lean();
  return { ...ctx, resident, stay, charge };
};

const pay = (agent, ctx, amountPaise, extra = {}) =>
  agent.post('/api/payments').send({ propertyId: ctx.property.id, residentId: ctx.resident.id, amountPaise, method: 'upi', ...extra });

const getCharge = async (ctx) => (await ctx.owner.get(`/api/rent-charges/${ctx.charge._id}`)).body.data.charge;
const getBalance = async (ctx, agent = ctx.owner) => (await agent.get(`/api/residents/${ctx.resident.id}/balance`)).body.data.balance;

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  // Payments and charges refuse deletion through Mongoose, so tests wipe the raw collections.
  await Promise.all([Payment, RentCharge, Advance, Counter, Refund].map((m) => m.collection.deleteMany({})));
  await Promise.all([User, Property, Room, Bed, Resident, Stay].map((m) => m.deleteMany({})));
});

describe('billing rules', () => {
  it('clamps the due date to the billing day, 28 and the month length', () => {
    expect(dueDateFor('2026-11', 5).toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(dueDateFor('2026-02', 31).toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('charge generation', () => {
  it('creates exactly one charge per active stay and none on a second run', async () => {
    const ctx = await setup();
    const residents = [await addResident(ctx.owner, ctx.property.id), await addResident(ctx.owner, ctx.property.id)];
    await checkIn(ctx.owner, residents[0].id, ctx.beds[0].id);
    await checkIn(ctx.owner, residents[1].id, ctx.beds[1].id, { agreedDiscountPaise: 100000 });

    const first = await ctx.owner.post('/api/rent-charges/generate').send({ propertyId: ctx.property.id, periodKey: PERIOD });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ created: 2, skipped: 0 });

    const second = await ctx.owner.post('/api/rent-charges/generate').send({ propertyId: ctx.property.id, periodKey: PERIOD });
    expect(second.body.data).toMatchObject({ created: 0, skipped: 2 });

    const charges = await RentCharge.find({}).sort({ amountPaise: 1 }).lean();
    expect(charges).toHaveLength(2);
    // Rent minus agreed discount; the ₹5,000 deposit is never part of a charge.
    expect(charges.map((c) => c.amountPaise)).toEqual([RENT - 100000, RENT]);
    expect(charges.every((c) => c.netDuePaise === c.amountPaise && c.status === 'pending')).toBe(true);
  });

  it('is idempotent under concurrent runs', async () => {
    const ctx = await setup();
    await checkIn(ctx.owner, (await addResident(ctx.owner, ctx.property.id)).id, ctx.beds[0].id);
    await Promise.all(Array.from({ length: 5 }, () => generateForProperty({ propertyId: ctx.property.id, periodKey: PERIOD })));
    expect(await RentCharge.countDocuments()).toBe(1);
  });

  it('dryRun previews without writing', async () => {
    const ctx = await setup();
    await checkIn(ctx.owner, (await addResident(ctx.owner, ctx.property.id)).id, ctx.beds[0].id);
    const res = await ctx.owner.post('/api/rent-charges/generate').send({ propertyId: ctx.property.id, periodKey: PERIOD, dryRun: true });
    expect(res.body.data).toMatchObject({ dryRun: true, created: 1 });
    expect(await RentCharge.countDocuments()).toBe(0);
  });

  it('rejects bad period keys, far-future periods and inactive stays; skips reservations', async () => {
    const ctx = await setup();
    const r = await addResident(ctx.owner, ctx.property.id);
    const stay = (await checkIn(ctx.owner, r.id, ctx.beds[0].id)).body.data.stay;
    for (const periodKey of ['2026-13', '26-11', '2026-1']) {
      expect((await ctx.owner.post('/api/rent-charges/generate').send({ propertyId: ctx.property.id, periodKey })).status).toBe(400);
    }
    expect((await ctx.owner.post('/api/rent-charges/generate').send({ propertyId: ctx.property.id, periodKey: '2099-01' })).status).toBe(400);
    expect((await ctx.owner.post('/api/rent-charges/generate').send({ periodKey: PERIOD })).status).toBe(400);

    await Stay.updateOne({ _id: stay.id }, { status: 'ended' });
    await expect(generateForStay({ stayId: stay.id, periodKey: PERIOD })).rejects.toMatchObject({ statusCode: 409 });

    await Stay.updateOne({ _id: stay.id }, { status: 'active', reservationTimer: new Date() });
    expect(await generateForStay({ stayId: stay.id, periodKey: PERIOD })).toMatchObject({ created: 0, reason: 'reservation' });
  });

  it('does not bill a resident twice for a month after a transfer', async () => {
    const ctx = await setup();
    const r = await addResident(ctx.owner, ctx.property.id);
    const stay = (await checkIn(ctx.owner, r.id, ctx.beds[0].id)).body.data.stay;
    expect((await generateForProperty({ propertyId: ctx.property.id, periodKey: PERIOD })).created).toBe(1);
    const moved = await ctx.owner.post(`/api/stays/${stay.id}/transfer`).send({ newBedId: ctx.beds[1].id, transferDate: day(0) });
    expect(moved.status).toBe(200);
    expect(await generateForProperty({ propertyId: ctx.property.id, periodKey: PERIOD })).toMatchObject({ created: 0, skipped: 1 });
    expect(await RentCharge.countDocuments({ resident: r.id })).toBe(1);
  });
});

describe('payments and balances', () => {
  it('partial payment: 5,000 of 8,000 -> partial, 3,000 outstanding', async () => {
    const ctx = await withCharge();
    const res = await pay(ctx.owner, ctx, 500000);
    expect(res.status).toBe(201);
    expect(res.body.data.payment).toMatchObject({ amountPaise: 500000, status: 'recorded' });
    expect(res.body.data.balance.outstandingPaise).toBe(300000);

    const charge = await getCharge(ctx);
    expect(charge).toMatchObject({ status: 'partial', paidPaise: 500000, outstandingPaise: 300000 });
  });

  it('full payment -> paid, nothing outstanding', async () => {
    const ctx = await withCharge();
    await pay(ctx.owner, ctx, RENT);
    expect(await getCharge(ctx)).toMatchObject({ status: 'paid', outstandingPaise: 0 });
    expect(await getBalance(ctx)).toMatchObject({ totalDuePaise: RENT, totalPaidPaise: RENT, outstandingPaise: 0 });
  });

  it('two payments that together equal the charge -> paid', async () => {
    const ctx = await withCharge();
    await pay(ctx.owner, ctx, 500000);
    expect((await getBalance(ctx)).outstandingPaise).toBe(300000);
    await pay(ctx.owner, ctx, 300000);
    expect(await getCharge(ctx)).toMatchObject({ status: 'paid', paidPaise: RENT });
    expect((await getBalance(ctx)).outstandingPaise).toBe(0);
  });

  it('auto-allocates oldest first, with overdue charges ahead of the rest', async () => {
    const ctx = await withCharge();
    const later = nextPeriodKey(PERIOD);
    await generateForProperty({ propertyId: ctx.property.id, periodKey: later, today: addDays(businessToday(), 40) });
    // Make the *later* charge overdue and the earlier one merely pending: overdue goes first.
    await RentCharge.updateOne({ periodKey: later }, { dueDate: addDays(businessToday(), -30) });
    await RentCharge.updateOne({ periodKey: PERIOD }, { dueDate: addDays(businessToday(), 10) });
    await reconcileOverdue(ctx.property.id);
    const res = await pay(ctx.owner, ctx, 100000);
    const [alloc] = res.body.data.payment.allocations;
    expect(String(alloc.charge)).toBe(String((await RentCharge.findOne({ periodKey: later }).lean())._id));
  });

  it('allocates explicitly and rejects bad allocations with 400', async () => {
    const ctx = await withCharge();
    const ok = await pay(ctx.owner, ctx, 200000, { allocations: [{ chargeId: String(ctx.charge._id), amountPaise: 200000 }] });
    expect(ok.status).toBe(201);

    const mismatch = await pay(ctx.owner, ctx, 300000, { allocations: [{ chargeId: String(ctx.charge._id), amountPaise: 100000 }] });
    expect(mismatch.status).toBe(400);
    const tooMuch = await pay(ctx.owner, ctx, 900000, { allocations: [{ chargeId: String(ctx.charge._id), amountPaise: 900000 }] });
    expect(tooMuch.status).toBe(400);

    // Another resident's charge is not allocatable.
    const other = await addResident(ctx.owner, ctx.property.id);
    await checkIn(ctx.owner, other.id, ctx.beds[1].id);
    await generateForProperty({ propertyId: ctx.property.id, periodKey: PERIOD });
    const theirs = await RentCharge.findOne({ resident: other.id }).lean();
    const cross = await pay(ctx.owner, ctx, 100000, { allocations: [{ chargeId: String(theirs._id), amountPaise: 100000 }] });
    expect(cross.status).toBe(400);
    expect(await Payment.countDocuments()).toBe(1);
  });

  it('rejects floats, overpayment, future dates, client receipt numbers and client status', async () => {
    const ctx = await withCharge();
    expect((await pay(ctx.owner, ctx, 1000.5)).status).toBe(400);
    expect((await pay(ctx.owner, ctx, 0)).status).toBe(400);
    expect((await pay(ctx.owner, ctx, RENT + 1)).status).toBe(400);
    expect((await pay(ctx.owner, ctx, 1000, { paidAt: new Date(Date.now() + 86_400_000).toISOString() })).status).toBe(400);
    expect((await pay(ctx.owner, ctx, 1000, { receiptNumber: 'FAKE-000000-0001' })).status).toBe(400);
    expect((await pay(ctx.owner, ctx, 1000, { status: 'verified' })).status).toBe(400);
    expect((await pay(ctx.owner, ctx, 1000, { paidAt: day(0) })).status).toBe(201);
    expect(await Payment.countDocuments()).toBe(1);
  });

  it('stores an explicit advance only when allowAdvance is set', async () => {
    const ctx = await withCharge();
    const res = await pay(ctx.owner, ctx, RENT + 250000, { allowAdvance: true });
    expect(res.status).toBe(201);
    expect(res.body.data.payment.advancePaise).toBe(250000);
    expect(await Advance.countDocuments()).toBe(1);
    const balance = await getBalance(ctx);
    expect(balance).toMatchObject({ outstandingPaise: 0, advancesPaise: 250000, totalPaidPaise: RENT });
    expect(await getCharge(ctx)).toMatchObject({ status: 'paid' });
  });

  it('dryRun shows the FIFO allocation and projected balance without writing', async () => {
    const ctx = await withCharge();
    const res = await pay(ctx.owner, ctx, 500000, { dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ dryRun: true, currentOutstandingPaise: RENT, projectedOutstandingPaise: 300000, advancePaise: 0 });
    expect(res.body.data.allocations[0]).toMatchObject({ amountPaise: 500000, outstandingAfterPaise: 300000 });
    expect(await Payment.countDocuments()).toBe(0);
    expect(await Counter.countDocuments()).toBe(0);
  });

  it('never counts the security deposit as due, paid or outstanding', async () => {
    const ctx = await withCharge();
    await pay(ctx.owner, ctx, 500000);
    const balance = await getBalance(ctx);
    expect(balance.depositHeldPaise).toBe(DEPOSIT);
    expect(balance.totalDuePaise).toBe(RENT);
    expect(balance.totalPaidPaise).toBe(500000);
    expect(balance.outstandingPaise).toBe(300000);
    expect(balance.breakdownByCharge).toHaveLength(1);
    const charge = await RentCharge.findById(ctx.charge._id).lean();
    expect(charge.amountPaise).toBe(RENT);
  });

  it('keeps the cached paid amount equal to the payment ledger', async () => {
    const ctx = await withCharge();
    await pay(ctx.owner, ctx, 300000);
    const second = await pay(ctx.owner, ctx, 200000);
    await ctx.owner.post(`/api/payments/${second.body.data.payment.id}/reverse`).send({ reason: 'bounced cheque' });
    const ledger = await ledgerPaidByCharge({ resident: new mongoose.Types.ObjectId(ctx.resident.id) });
    const cached = await RentCharge.findById(ctx.charge._id).lean();
    expect(ledger.get(String(ctx.charge._id))).toBe(cached.paidPaise);
    expect(cached.paidPaise).toBe(300000);
  });
});

describe('idempotency', () => {
  it('returns the original payment for a repeated key without changing balances', async () => {
    const ctx = await withCharge();
    const key = 'pay-attempt-0001';
    const first = await pay(ctx.owner, ctx, 500000, { idempotencyKey: key });
    expect(first.status).toBe(201);
    const again = await pay(ctx.owner, ctx, 500000, { idempotencyKey: key });
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ replayed: true });
    expect(again.body.data.payment.id).toBe(first.body.data.payment.id);
    expect(again.body.data.payment.receiptNumber).toBe(first.body.data.payment.receiptNumber);

    expect(await Payment.countDocuments()).toBe(1);
    expect((await getBalance(ctx)).totalPaidPaise).toBe(500000);
    expect(await getCharge(ctx)).toMatchObject({ paidPaise: 500000 });
  });

  it('rejects a reused key carrying a different amount', async () => {
    const ctx = await withCharge();
    await pay(ctx.owner, ctx, 500000, { idempotencyKey: 'pay-attempt-0002' });
    const clash = await pay(ctx.owner, ctx, 100000, { idempotencyKey: 'pay-attempt-0002' });
    expect(clash.status).toBe(409);
    expect(await Payment.countDocuments()).toBe(1);
  });

  it('applies a key once when requests race', async () => {
    const ctx = await withCharge();
    const results = await Promise.all(Array.from({ length: 6 }, () => pay(ctx.owner, ctx, 100000, { idempotencyKey: 'racing-key-0001' })));
    expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
    expect(new Set(results.map((r) => r.body.data.payment.id)).size).toBe(1);
    expect(await Payment.countDocuments()).toBe(1);
    expect((await RentCharge.findById(ctx.charge._id).lean()).paidPaise).toBe(100000);
  });

  it('scopes keys per property', async () => {
    const a = await withCharge();
    await pay(a.owner, a, 100000, { idempotencyKey: 'shared-key-0001' });
    const b = await withCharge();
    const res = await pay(b.owner, b, 100000, { idempotencyKey: 'shared-key-0001' });
    expect(res.status).toBe(201);
    expect(await Payment.countDocuments()).toBe(2);
  });
});

describe('receipts and concurrency', () => {
  it('issues 20 unique, sequential receipt numbers for 20 parallel payments', async () => {
    const ctx = await withCharge();
    const results = await Promise.all(Array.from({ length: 20 }, () => pay(ctx.owner, ctx, 10000)));
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));

    const numbers = results.map((r) => r.body.data.payment.receiptNumber);
    expect(new Set(numbers).size).toBe(20);
    expect(numbers.every((n) => /^[A-Z0-9]{7}-\d{6}-\d{4}$/.test(n))).toBe(true);
    const seqs = numbers.map((n) => Number(n.split('-')[2])).sort((x, y) => x - y);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect((await RentCharge.findById(ctx.charge._id).lean()).paidPaise).toBe(200000);
  });

  it('never over-allocates a charge when payments race', async () => {
    const ctx = await withCharge();
    const results = await Promise.all(Array.from({ length: 12 }, () => pay(ctx.owner, ctx, 100000)));
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(8); // ₹8,000 / ₹1,000
    expect(results.filter((r) => r.status !== 201).every((r) => [400, 409].includes(r.status))).toBe(true);
    expect(await getCharge(ctx)).toMatchObject({ paidPaise: RENT, status: 'paid' });
  });

  it('returns a JSON receipt', async () => {
    const ctx = await withCharge();
    const made = await pay(ctx.owner, ctx, 500000, { reference: 'UTR123456' });
    const res = await ctx.owner.get(`/api/payments/${made.body.data.payment.id}/receipt`);
    expect(res.status).toBe(200);
    expect(res.body.data.receipt).toMatchObject({
      receiptNumber: made.body.data.payment.receiptNumber,
      amountPaise: 500000,
      method: 'upi',
      reference: 'UTR123456',
      verified: false,
      status: 'recorded',
      property: { name: 'Sunrise PG' },
      resident: { fullName: ctx.resident.fullName },
    });
    expect(res.body.data.receipt.allocations[0]).toMatchObject({ periodKey: PERIOD, amountPaise: 500000 });
  });
});

describe('reversal', () => {
  it('reopens the charge to the right status and keeps the payment', async () => {
    const ctx = await withCharge();
    const a = await pay(ctx.owner, ctx, 500000);
    const b = await pay(ctx.owner, ctx, 300000);
    expect(await getCharge(ctx)).toMatchObject({ status: 'paid' });

    const rev = await ctx.owner.post(`/api/payments/${b.body.data.payment.id}/reverse`).send({ reason: 'cheque bounced' });
    expect(rev.status).toBe(200);
    expect(rev.body.data.reversal).toMatchObject({ amountPaise: -300000, reversalOf: b.body.data.payment.id });
    expect(rev.body.data.payment.status).toBe('reversed');
    expect(rev.body.data.balance.outstandingPaise).toBe(300000);
    expect(await getCharge(ctx)).toMatchObject({ status: 'partial', paidPaise: 500000 });

    await ctx.owner.post(`/api/payments/${a.body.data.payment.id}/reverse`).send({ reason: 'entered twice' });
    expect(await getCharge(ctx)).toMatchObject({ status: 'pending', paidPaise: 0 });
    expect(await Payment.countDocuments()).toBe(4); // two originals + two reversal entries
    expect((await getBalance(ctx)).outstandingPaise).toBe(RENT);
  });

  it('cannot reverse twice, reverse a reversal, or delete / edit payments', async () => {
    const ctx = await withCharge();
    const made = await pay(ctx.owner, ctx, 500000);
    const id = made.body.data.payment.id;
    const rev = await ctx.owner.post(`/api/payments/${id}/reverse`).send({ reason: 'mistake' });
    expect((await ctx.owner.post(`/api/payments/${id}/reverse`).send({ reason: 'again' })).status).toBe(409);
    expect((await ctx.owner.post(`/api/payments/${rev.body.data.reversal.id}/reverse`).send({ reason: 'undo' })).status).toBe(409);
    expect((await ctx.owner.post(`/api/payments/${id}/reverse`).send({})).status).toBe(400);

    await expect(Payment.deleteOne({ _id: id })).rejects.toThrow(/reversal/);
    await expect(Payment.deleteMany({})).rejects.toThrow();
    await Payment.updateOne({ _id: id }, { $set: { amountPaise: 1, receiptNumber: 'X-1' } });
    const stored = await Payment.findById(id).lean();
    expect(stored.amountPaise).toBe(500000);
    expect(stored.receiptNumber).toBe(made.body.data.payment.receiptNumber);
    await expect(RentCharge.deleteOne({ _id: ctx.charge._id })).rejects.toThrow();
  });

  it('voids the advance of a reversed payment', async () => {
    const ctx = await withCharge();
    const made = await pay(ctx.owner, ctx, RENT + 100000, { allowAdvance: true });
    expect((await getBalance(ctx)).advancesPaise).toBe(100000);
    await ctx.owner.post(`/api/payments/${made.body.data.payment.id}/reverse`).send({ reason: 'wrong resident' });
    expect(await getBalance(ctx)).toMatchObject({ advancesPaise: 0, outstandingPaise: RENT });
  });
});

describe('verification', () => {
  it('only an owner verifies, once, and never a reversal', async () => {
    const ctx = await withCharge();
    const made = await pay(ctx.owner, ctx, 500000);
    expect(made.body.data.payment.status).toBe('recorded');
    const url = `/api/payments/${made.body.data.payment.id}/verify`;

    const { agent: warden } = await createStaff('warden', [{ property: ctx.property.id, permissions: [PERMISSIONS.PAYMENTS_WRITE] }]);
    expect((await warden.post(url)).status).toBe(403);

    const res = await ctx.owner.post(url);
    expect(res.status).toBe(200);
    expect(res.body.data.payment).toMatchObject({ status: 'verified' });
    expect((await ctx.owner.post(url)).status).toBe(409);
  });
});

describe('charge corrections', () => {
  it('adjusts, discounts and waives with an audit trail', async () => {
    const ctx = await withCharge();
    const id = String(ctx.charge._id);

    const up = await ctx.owner.post(`/api/rent-charges/${id}/adjust`).send({ amountPaise: 50000, reason: 'AC surcharge' });
    expect(up.body.data.charge).toMatchObject({ netDuePaise: RENT + 50000, outstandingPaise: RENT + 50000 });
    expect(up.body.data.charge.adjustments[0]).toMatchObject({ amountPaise: 50000, reason: 'AC surcharge' });
    expect(up.body.data.charge.adjustments[0].createdBy).toBeTruthy();

    const disc = await ctx.owner.patch(`/api/rent-charges/${id}`).send({ discountPaise: 100000, notes: 'goodwill' });
    expect(disc.body.data.charge).toMatchObject({ discountPaise: 100000, netDuePaise: RENT + 50000 - 100000, notes: 'goodwill' });

    expect((await ctx.owner.patch(`/api/rent-charges/${id}`).send({ status: 'paid' })).status).toBe(400);
    expect((await ctx.owner.post(`/api/rent-charges/${id}/adjust`).send({ amountPaise: 12.5, reason: 'float' })).status).toBe(400);
    expect((await ctx.owner.post(`/api/rent-charges/${id}/adjust`).send({ amountPaise: 0, reason: 'nothing' })).status).toBe(400);

    await pay(ctx.owner, ctx, 600000);
    // Cannot drop what is owed below what was already paid.
    expect((await ctx.owner.post(`/api/rent-charges/${id}/adjust`).send({ amountPaise: -200000, reason: 'too deep' })).status).toBe(409);

    const waived = await ctx.owner.post(`/api/rent-charges/${id}/waive`).send({ reason: 'hardship' });
    expect(waived.body.data.charge).toMatchObject({ status: 'waived', outstandingPaise: 0, netDuePaise: 600000, paidPaise: 600000 });
    expect(waived.body.data.charge.adjustments.at(-1)).toMatchObject({ kind: 'waiver', reason: 'hardship' });
    expect((await pay(ctx.owner, ctx, 1000)).status).toBe(400);
    expect((await getBalance(ctx)).outstandingPaise).toBe(0);
  });

  it('fully paid -> positive adjustment reopens it', async () => {
    const ctx = await withCharge();
    await pay(ctx.owner, ctx, RENT);
    await ctx.owner.post(`/api/rent-charges/${ctx.charge._id}/adjust`).send({ amountPaise: 20000, reason: 'damages' });
    expect(await getCharge(ctx)).toMatchObject({ status: 'partial', outstandingPaise: 20000 });
  });
});

describe('overdue reconciliation', () => {
  it('flips charges only once today > dueDate + grace, and back if the due date moves', async () => {
    const ctx = await withCharge(); // property grace = 5 days
    const due = ctx.charge.dueDate;
    const status = async () => (await RentCharge.findById(ctx.charge._id).lean()).status;

    await reconcileOverdue(ctx.property.id, addDays(due, 5)); // exactly due + grace: not yet
    expect(await status()).toBe('pending');
    expect((await reconcileOverdue(ctx.property.id, addDays(due, 6))).markedOverdue).toBe(1);
    expect(await status()).toBe('overdue');
    expect((await reconcileOverdue(ctx.property.id, addDays(due, 6))).markedOverdue).toBe(0); // idempotent

    await RentCharge.updateOne({ _id: ctx.charge._id }, { dueDate: addDays(due, 30) });
    await reconcileOverdue(ctx.property.id, addDays(due, 6));
    expect(await status()).toBe('pending');
  });

  it('does not flip paid or waived charges, and the endpoint is owner-only', async () => {
    const ctx = await withCharge();
    await pay(ctx.owner, ctx, RENT);
    await reconcileOverdue(ctx.property.id, addDays(ctx.charge.dueDate, 60));
    expect((await RentCharge.findById(ctx.charge._id).lean()).status).toBe('paid');

    const { agent: warden } = await createStaff('warden', [{ property: ctx.property.id, permissions: [] }]);
    expect((await warden.post('/api/rent-charges/reconcile').send({})).status).toBe(403);
    const res = await ctx.owner.post('/api/rent-charges/reconcile').send({ propertyId: ctx.property.id });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ markedOverdue: 0 });
  });
});

describe('access control', () => {
  it('requires payments:write for wardens, blocks maintenance and other tenants', async () => {
    const ctx = await withCharge();
    const grant = (permissions) => [{ property: ctx.property.id, permissions }];

    const { agent: plain } = await createStaff('warden', grant([]));
    expect((await pay(plain, ctx, 1000)).status).toBe(403);
    expect((await plain.get(`/api/rent-charges?propertyId=${ctx.property.id}`)).status).toBe(403); // access alone is not payments.view
    expect((await plain.post('/api/rent-charges/generate').send({ propertyId: ctx.property.id, periodKey: PERIOD })).status).toBe(403);

    const { agent: allowed } = await createStaff('warden', grant([PERMISSIONS.PAYMENTS_WRITE, PERMISSIONS.PAYMENTS_VIEW]));
    expect((await pay(allowed, ctx, 1000)).status).toBe(201);
    expect((await getBalance(ctx, allowed)).totalPaidPaise).toBe(1000);
    expect((await allowed.post(`/api/payments/${(await Payment.findOne().lean())._id}/reverse`).send({ reason: 'nope' })).status).toBe(403);

    const { agent: maint } = await createStaff('maintenance', grant([]));
    expect((await maint.get(`/api/rent-charges?propertyId=${ctx.property.id}`)).status).toBe(403);
    expect((await maint.get(`/api/payments?propertyId=${ctx.property.id}`)).status).toBe(403);

    const stranger = await registerOwner();
    expect((await stranger.get(`/api/rent-charges/${ctx.charge._id}`)).status).toBe(404);
    expect((await stranger.get(`/api/residents/${ctx.resident.id}/balance`)).status).toBe(404);
    expect((await pay(stranger, ctx, 1000)).status).toBe(404);
    expect((await stranger.post('/api/rent-charges/generate').send({ propertyId: ctx.property.id, periodKey: PERIOD })).status).toBe(404);
    expect((await request(app).get('/api/payments')).status).toBe(401);
  });

  it('lists and filters charges and payments', async () => {
    const ctx = await withCharge();
    await pay(ctx.owner, ctx, 100000, { method: 'cash' });
    await pay(ctx.owner, ctx, 100000, { method: 'upi' });
    const charges = await ctx.owner.get(`/api/rent-charges?propertyId=${ctx.property.id}&status=partial&periodKey=${PERIOD}&residentId=${ctx.resident.id}`);
    expect(charges.body.data.items).toHaveLength(1);
    expect(charges.body.data.pagination.total).toBe(1);
    const cash = await ctx.owner.get(`/api/payments?propertyId=${ctx.property.id}&method=cash&from=${day(0)}&to=${day(0)}`);
    expect(cash.body.data.items).toHaveLength(1);
    expect((await ctx.owner.get(`/api/payments?propertyId=${ctx.property.id}&from=${day(1)}`)).body.data.items).toHaveLength(0);
  });
});

describe('models', () => {
  it('declares the required indexes, including refunds', async () => {
    const names = async (Model) => (await Model.collection.indexes()).map((i) => JSON.stringify(i.key));
    expect(await names(RentCharge)).toContain(JSON.stringify({ stay: 1, periodKey: 1 }));
    expect(await names(RentCharge)).toContain(JSON.stringify({ property: 1, status: 1, dueDate: 1 }));
    const idx = await Payment.collection.indexes();
    expect(idx.find((i) => i.key.receiptNumber)).toMatchObject({ unique: true });
    expect(idx.find((i) => i.key.idempotencyKey)).toMatchObject({ unique: true, sparse: true });
    expect(await names(Payment)).toContain(JSON.stringify({ property: 1, paidAt: -1 }));
    expect(await names(Refund)).toContain(JSON.stringify({ property: 1, status: 1 }));
    expect(await names(Refund)).toContain(JSON.stringify({ resident: 1 }));
  });
});

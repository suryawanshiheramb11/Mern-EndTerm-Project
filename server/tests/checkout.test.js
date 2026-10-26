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
import { AuditLog } from '../src/models/AuditLog.js';
import { addDays, businessToday } from '../src/utils/dates.js';
import { nextPeriodKey, periodKeyOf } from '../src/utils/billing.js';
import { generateForProperty } from '../src/services/charge.service.js';

const password = 'Passw0rdOK';
const RENT = 800000;
const DEPOSIT = 1000000; // ₹10,000
const day = (offset = 0) => addDays(businessToday(), offset).toISOString().slice(0, 10);
const THIS_MONTH = periodKeyOf(businessToday());
const NEXT_MONTH = nextPeriodKey(THIS_MONTH);

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
  return agent;
};

const setup = async ({ beds = 3 } = {}) => {
  const owner = await registerOwner();
  const property = (
    await owner.post('/api/properties').send({ name: 'Sunrise PG', address: { line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001' } })
  ).body.data.property;
  const room = (await owner.post(`/api/properties/${property.id}/rooms`).send({ number: '201', capacity: 30, defaultMonthlyRent: RENT / 100 })).body.data.room;
  const created = (await owner.post(`/api/properties/${property.id}/rooms/${room.id}/beds/bulk`).send({ count: beds })).body.data.items;
  return { owner, property, room, beds: created };
};

let residentCount = 0;
const addResident = async (agent, propertyId, extra = {}) => {
  residentCount += 1;
  return (await agent.post('/api/residents').send({ propertyId, fullName: `Resident ${residentCount}`, phone: `98765432${String(residentCount).padStart(2, '0')}`, ...extra })).body.data.resident;
};

// A resident checked in with a ₹10,000 deposit and this month's ₹8,000 charge.
const withStay = async (opts = {}) => {
  const ctx = await setup(opts);
  const resident = await addResident(ctx.owner, ctx.property.id, opts.residentExtra);
  const res = await ctx.owner.post('/api/stays').send({
    residentId: resident.id, bedId: ctx.beds[0].id, action: 'checkin', checkInDate: day(0), depositPaise: DEPOSIT, termsAcknowledged: true, ...opts.stayExtra,
  });
  const stay = res.body.data.stay;
  await generateForProperty({ propertyId: ctx.property.id, periodKey: THIS_MONTH });
  const charge = await RentCharge.findOne({ stay: stay.id, periodKey: THIS_MONTH }).lean();
  return { ...ctx, resident, stay, charge, invite: res.body.data.invite };
};

const pay = (ctx, amountPaise) =>
  ctx.owner.post('/api/payments').send({ propertyId: ctx.property.id, residentId: ctx.resident.id, amountPaise, method: 'upi' });
const body = (extra = {}) => ({ actualCheckOutDate: day(0), ...extra });
const preview = (ctx, extra) => ctx.owner.post(`/api/stays/${ctx.stay.id}/checkout/preview`).send(body(extra));
const checkout = (ctx, extra, agent = ctx.owner) => agent.post(`/api/stays/${ctx.stay.id}/checkout`).send(body(extra));
const bedStatus = async (id) => (await Bed.findById(id)).status;

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await Promise.all([Payment, RentCharge, Advance, Counter, Refund, AuditLog].map((m) => m.collection.deleteMany({})));
  await Promise.all([User, Property, Room, Bed, Resident, Stay].map((m) => m.deleteMany({})));
});

describe('checkout preview', () => {
  it('fully paid rent -> whole deposit refundable, and changes nothing', async () => {
    const ctx = await withStay();
    await pay(ctx, RENT);
    const res = await preview(ctx);
    expect(res.status).toBe(200);
    expect(res.body.data.rentSummary).toMatchObject({ totalChargedPaise: RENT, totalPaidPaise: RENT, outstandingRentPaise: 0 });
    expect(res.body.data.deposit).toEqual({ originalDepositPaise: DEPOSIT, deductionsTotalPaise: 0, outstandingRentDeductedPaise: 0, refundablePaise: DEPOSIT });
    expect(res.body.data.staySummary).toMatchObject({ resident: { fullName: ctx.resident.fullName }, actualCheckOutDate: `${day(0)}T00:00:00.000Z` });
    expect(res.body.data.blockingIssues).toEqual([]);

    expect((await Stay.findById(ctx.stay.id)).status).toBe('active');
    expect(await Refund.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: /^(stay|refund)\./ })).toBe(0);
    expect(await bedStatus(ctx.beds[0].id)).toBe('occupied');
  });

  it('a ₹1,000 documented deduction -> ₹9,000 refundable', async () => {
    const ctx = await withStay();
    await pay(ctx, RENT);
    const res = await preview(ctx, { deductions: [{ amountPaise: 100000, reason: 'Broken window', evidenceRef: 'photo-1' }] });
    expect(res.body.data.deposit).toMatchObject({ deductionsTotalPaise: 100000, refundablePaise: 900000 });
    const noEvidence = await preview(ctx, { deductions: [{ amountPaise: 100000, reason: 'Broken window' }] });
    expect(noEvidence.body.data.warnings.join()).toMatch(/no evidence/);
  });

  it('₹3,000 outstanding netted against the deposit -> ₹7,000 refundable', async () => {
    const ctx = await withStay();
    await pay(ctx, 500000);
    const res = await preview(ctx, { deductOutstandingRent: true });
    expect(res.body.data.rentSummary.outstandingRentPaise).toBe(300000);
    expect(res.body.data.deposit).toMatchObject({ outstandingRentDeductedPaise: 300000, refundablePaise: 700000 });
    expect(res.body.data.blockingIssues).toEqual([]);
  });

  it('blocks when rent is owed and not being deducted; warns when the deposit cannot cover it', async () => {
    const ctx = await withStay();
    const blocked = await preview(ctx, { deductOutstandingRent: false });
    expect(blocked.body.data.blockingIssues).toHaveLength(1);
    expect(blocked.body.data.deposit.refundablePaise).toBe(DEPOSIT);

    await Stay.updateOne({ _id: ctx.stay.id }, { depositPaise: 200000 });
    const short = await preview(ctx);
    expect(short.body.data.deposit).toMatchObject({ outstandingRentDeductedPaise: 200000, refundablePaise: 0 });
    expect(short.body.data.warnings.join()).toMatch(/remains unpaid/);
  });

  it('rejects bad input', async () => {
    const ctx = await withStay();
    expect((await preview(ctx, { actualCheckOutDate: day(1) })).status).toBe(400);
    expect((await preview(ctx, { actualCheckOutDate: day(-3) })).status).toBe(400); // before check-in
    expect((await preview(ctx, { deductions: [{ amountPaise: DEPOSIT + 1, reason: 'too much' }] })).status).toBe(400);
    expect((await preview(ctx, { deductions: [{ amountPaise: 10.5, reason: 'float' }] })).status).toBe(400);
    expect((await preview(ctx, { refundablePaise: 999 })).status).toBe(400); // the server computes it
  });
});

describe('checkout commit', () => {
  it('ends the stay, frees the bed, creates a pending refund and audit rows', async () => {
    const ctx = await withStay({ residentExtra: { email: 'stu@example.com' } });
    await pay(ctx, RENT);
    const res = await checkout(ctx, { deductions: [{ amountPaise: 100000, reason: 'Damaged mattress', evidenceRef: 'inv-7' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.stay).toMatchObject({ status: 'ended', endedReason: 'checkout', depositSnapshotPaise: DEPOSIT, finalDuesSnapshotPaise: 0 });
    expect(res.body.data.refund).toMatchObject({ status: 'pending_approval', originalDepositPaise: DEPOSIT, totalDeductionsPaise: 100000, refundablePaise: 900000 });
    expect(res.body.data.freedBed).toMatchObject({ status: 'available' });
    expect(await bedStatus(ctx.beds[0].id)).toBe('available');
    expect((await Resident.findById(ctx.resident.id)).status).toBe('former');
    expect(await Payment.countDocuments()).toBe(1); // no payment created or edited

    const audit = await AuditLog.findOne({ action: 'stay.checkout' }).lean();
    expect(audit).toMatchObject({ entityType: 'Stay' });
    expect(String(audit.entityId)).toBe(ctx.stay.id);
    expect(audit.meta.refundablePaise).toBe(900000);
  });

  it('records netted rent as a deduction line, not a payment', async () => {
    const ctx = await withStay();
    await pay(ctx, 500000);
    const res = await checkout(ctx, {});
    expect(res.body.data.refund).toMatchObject({ refundablePaise: 700000, outstandingRentPaise: 300000, outstandingRentDeductedPaise: 300000 });
    expect(res.body.data.refund.deductions).toEqual([{ amountPaise: 300000, reason: 'outstanding rent', system: true }]);
    expect(res.body.data.stay.finalDuesSnapshotPaise).toBe(300000);
    expect(await Payment.countDocuments()).toBe(1);
    expect((await RentCharge.findById(ctx.charge._id)).paidPaise).toBe(500000);
  });

  it('creates a refund row even when nothing is refundable', async () => {
    const ctx = await withStay({ stayExtra: { depositPaise: 0 } });
    await pay(ctx, RENT);
    const res = await checkout(ctx);
    expect(res.status).toBe(200);
    expect(res.body.data.refund).toMatchObject({ refundablePaise: 0, status: 'pending_approval' });
  });

  it('blocks on outstanding rent unless an owner forces it with a reason', async () => {
    const ctx = await withStay();
    const blocked = await checkout(ctx, { deductOutstandingRent: false });
    expect(blocked.status).toBe(409);
    expect(blocked.body.errors[0].message).toMatch(/Outstanding rent/);
    expect((await Stay.findById(ctx.stay.id)).status).toBe('active');

    expect((await checkout(ctx, { deductOutstandingRent: false, force: true })).status).toBe(400); // reason needed
    const warden = await createStaff('warden', [{ property: ctx.property.id, permissions: [PERMISSIONS.STAYS_WRITE] }]);
    expect((await checkout(ctx, { deductOutstandingRent: false, force: true, forceReason: 'owner agreed' }, warden)).status).toBe(403);

    const forced = await checkout(ctx, { deductOutstandingRent: false, force: true, forceReason: 'owner agreed to collect later' });
    expect(forced.status).toBe(200);
    expect(forced.body.data.refund).toMatchObject({ refundablePaise: DEPOSIT, outstandingRentPaise: RENT, outstandingRentDeductedPaise: 0 });
    const audit = await AuditLog.findOne({ action: 'stay.checkout' }).lean();
    expect(audit.meta).toMatchObject({ forced: true, forceReason: 'owner agreed to collect later' });
    expect(audit.meta.blockingIssues).toHaveLength(1);
  });

  it('lets a permitted warden check out but not approve at the same time', async () => {
    const ctx = await withStay();
    await pay(ctx, RENT);
    const none = await createStaff('warden', [{ property: ctx.property.id, permissions: [] }]);
    expect((await checkout(ctx, {}, none)).status).toBe(403);
    const warden = await createStaff('warden', [{ property: ctx.property.id, permissions: [PERMISSIONS.STAYS_WRITE] }]);
    expect((await checkout(ctx, { approveRefundNow: true }, warden)).status).toBe(403);
    expect((await checkout(ctx, {}, warden)).status).toBe(200);
  });

  it('approveRefundNow creates an approved refund (never paid)', async () => {
    const ctx = await withStay();
    await pay(ctx, RENT);
    const res = await checkout(ctx, { approveRefundNow: true });
    expect(res.body.data.refund).toMatchObject({ status: 'approved' });
    expect(res.body.data.refund.approvedAt).toBeTruthy();
    expect(res.body.data.refund.paidAt).toBeUndefined();
  });

  it('a second checkout is a 409 and creates nothing more', async () => {
    const ctx = await withStay();
    await pay(ctx, RENT);
    expect((await checkout(ctx)).status).toBe(200);
    expect((await checkout(ctx)).status).toBe(409);
    expect((await preview(ctx)).status).toBe(409);
    expect(await Refund.countDocuments()).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'stay.checkout' })).toBe(1);
  });

  it('concurrent checkouts: exactly one succeeds', async () => {
    const ctx = await withStay();
    await pay(ctx, RENT);
    const results = await Promise.all(Array.from({ length: 6 }, () => checkout(ctx)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await Refund.countDocuments()).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'stay.checkout' })).toBe(1);
    expect(await bedStatus(ctx.beds[0].id)).toBe('available');
  });

  it('waives untouched future pending charges (never deletes) and ignores them in outstanding', async () => {
    const ctx = await withStay();
    await pay(ctx, RENT);
    await generateForProperty({ propertyId: ctx.property.id, periodKey: NEXT_MONTH });
    const future = await RentCharge.findOne({ periodKey: NEXT_MONTH }).lean();
    expect(future.status).toBe('pending');

    const pre = await preview(ctx);
    expect(pre.body.data.rentSummary.outstandingRentPaise).toBe(0);
    expect(pre.body.data.rentSummary.charges.find((c) => c.periodKey === NEXT_MONTH).toBeWaived).toBe(true);
    expect(pre.body.data.warnings.join()).toMatch(/future unpaid charge/);

    const res = await checkout(ctx);
    expect(res.status).toBe(200);
    const after = await RentCharge.findById(future._id).lean();
    expect(after).toMatchObject({ status: 'waived', netDuePaise: 0 });
    expect(after.adjustments.at(-1)).toMatchObject({ kind: 'waiver', reason: 'checkout', amountPaise: -RENT });
    expect(await RentCharge.countDocuments({ stay: ctx.stay.id, status: 'pending' })).toBe(0);
    expect(await RentCharge.countDocuments()).toBe(2);
    // The stay no longer generates charges.
    expect((await generateForProperty({ propertyId: ctx.property.id, periodKey: NEXT_MONTH })).created).toBe(0);
  });

  it('leaves a charge alone once a payment has touched it', async () => {
    const ctx = await withStay();
    await generateForProperty({ propertyId: ctx.property.id, periodKey: NEXT_MONTH });
    await pay(ctx, RENT + 100000); // pays this month, then part of next month
    const res = await checkout(ctx, {});
    expect(res.status).toBe(200);
    expect((await RentCharge.findOne({ periodKey: NEXT_MONTH }).lean()).status).toBe('partial');
    expect(res.body.data.refund.outstandingRentPaise).toBe(RENT - 100000);
  });

  it('keeps a reserved or maintenance bed as it is and surfaces a warning', async () => {
    const ctx = await withStay();
    await pay(ctx, RENT);
    await Bed.updateOne({ _id: ctx.beds[0].id }, { status: 'reserved' });
    expect((await preview(ctx)).body.data.warnings.join()).toMatch(/Bed is reserved/);
    const res = await checkout(ctx);
    expect(res.status).toBe(200);
    expect(res.body.data.freedBed).toBeNull();
    expect(res.body.data.warnings.join()).toMatch(/reserved/);
    expect(await bedStatus(ctx.beds[0].id)).toBe('reserved');

    const other = await withStay();
    await pay(other, RENT);
    await Bed.updateOne({ _id: other.beds[0].id }, { status: 'maintenance' });
    await checkout(other);
    expect(await bedStatus(other.beds[0].id)).toBe('maintenance');
  });

  it('keeps the resident active while another stay is active, and rejects reservations', async () => {
    const ctx = await withStay();
    await pay(ctx, RENT);
    await Stay.collection.dropIndex('uniq_active_stay_per_resident'); // simulate a second property's stay
    await Stay.create({ property: new mongoose.Types.ObjectId(), resident: ctx.resident.id, room: ctx.room.id, bed: new mongoose.Types.ObjectId(), checkInDate: new Date(), monthlyRentPaise: 1, billingDay: 1 });
    await checkout(ctx);
    expect((await Resident.findById(ctx.resident.id)).status).toBe('active');

    const res = await setup();
    const r = await addResident(res.owner, res.property.id);
    const reservation = (await res.owner.post('/api/stays').send({ residentId: r.id, bedId: res.beds[0].id, action: 'reserve', checkInDate: day(10), depositPaise: 0, termsAcknowledged: true })).body.data.stay;
    expect((await res.owner.post(`/api/stays/${reservation.id}/checkout`).send(body())).status).toBe(409);
  });

  it('is scoped to the owner’s property', async () => {
    const ctx = await withStay();
    const stranger = await registerOwner();
    expect((await checkout(ctx, {}, stranger)).status).toBe(404);
    expect((await stranger.post(`/api/stays/${ctx.stay.id}/checkout/preview`).send(body())).status).toBe(404);
  });
});

describe('refund workflow', () => {
  const done = async (extra) => {
    const ctx = await withStay(extra);
    await pay(ctx, RENT);
    const refund = (await checkout(ctx)).body.data.refund;
    return { ...ctx, refund };
  };
  const act = (ctx, action, payload = {}) => ctx.owner.post(`/api/refunds/${ctx.refund.id}/${action}`).send(payload);

  it('cannot be paid before approval; approve twice -> 409', async () => {
    const ctx = await done();
    expect((await act(ctx, 'pay', { method: 'cash' })).status).toBe(409);
    expect((await Refund.findById(ctx.refund.id)).status).toBe('pending_approval');

    const approved = await act(ctx, 'approve');
    expect(approved.status).toBe(200);
    expect(approved.body.data.refund).toMatchObject({ status: 'approved' });
    expect(approved.body.data.refund.approvedAt).toBeTruthy();
    const again = await act(ctx, 'approve');
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/approved/);
  });

  it('approve -> pay completes the refund exactly once, with audit rows', async () => {
    const ctx = await done();
    await act(ctx, 'approve');
    expect((await act(ctx, 'pay', { method: 'upi' })).status).toBe(400); // reference required
    expect((await act(ctx, 'pay', { method: 'upi', reference: 'UTR998877', paidAt: day(1) })).status).toBe(400);
    const paid = await act(ctx, 'pay', { method: 'upi', reference: 'UTR998877' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.refund).toMatchObject({ status: 'paid', method: 'upi', reference: 'UTR998877' });
    expect(paid.body.data.refund.paidAt).toBeTruthy();
    expect((await act(ctx, 'pay', { method: 'cash' })).status).toBe(409);
    expect((await act(ctx, 'cancel')).status).toBe(409);

    const actions = (await AuditLog.find({ entityId: ctx.refund.id }).sort({ at: 1 }).lean()).map((a) => a.action);
    expect(actions).toEqual(['refund.approve', 'refund.pay']);
    expect(await AuditLog.countDocuments({ action: 'stay.checkout' })).toBe(1);
  });

  it('concurrent approvals: exactly one wins', async () => {
    const ctx = await done();
    const results = await Promise.all(Array.from({ length: 5 }, () => act(ctx, 'approve')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: 'refund.approve' })).toBe(1);
  });

  it('cancels only while pending approval', async () => {
    const ctx = await done();
    expect((await act(ctx, 'cancel')).body.data.refund.status).toBe('cancelled');
    expect((await act(ctx, 'approve')).status).toBe(409);
    expect((await act(ctx, 'cancel')).status).toBe(409);
    const other = await done();
    await act(other, 'approve');
    expect((await act(other, 'cancel')).status).toBe(409);
  });

  it('only owners can run the workflow; reads are scoped; records are never deleted', async () => {
    const ctx = await done();
    const none = await createStaff('warden', [{ property: ctx.property.id, permissions: [PERMISSIONS.STAYS_WRITE] }]);
    expect((await none.get(`/api/refunds/${ctx.refund.id}`)).status).toBe(403); // needs payments.view
    const warden = await createStaff('warden', [{ property: ctx.property.id, permissions: [PERMISSIONS.STAYS_WRITE, PERMISSIONS.PAYMENTS_VIEW] }]);
    for (const action of ['approve', 'cancel']) expect((await warden.post(`/api/refunds/${ctx.refund.id}/${action}`).send({})).status).toBe(403);
    expect((await warden.post(`/api/refunds/${ctx.refund.id}/pay`).send({ method: 'cash' })).status).toBe(403);
    expect((await warden.get(`/api/refunds/${ctx.refund.id}`)).status).toBe(200);

    const stranger = await registerOwner();
    expect((await stranger.get(`/api/refunds/${ctx.refund.id}`)).status).toBe(404);
    expect((await stranger.post(`/api/refunds/${ctx.refund.id}/approve`).send({})).status).toBe(404);
    expect((await stranger.get('/api/refunds')).body.data.items).toHaveLength(0);

    const list = await ctx.owner.get(`/api/refunds?propertyId=${ctx.property.id}&status=pending_approval`);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].resident).toMatchObject({ fullName: ctx.resident.fullName });

    await expect(Refund.deleteOne({ _id: ctx.refund.id })).rejects.toThrow();
    await expect(AuditLog.deleteMany({})).rejects.toThrow();
    await expect(AuditLog.updateOne({}, { action: 'x' })).rejects.toThrow();
  });

  it('declares the refund indexes', async () => {
    const idx = await Refund.collection.indexes();
    expect(idx.find((i) => JSON.stringify(i.key) === '{"stay":1}')).toMatchObject({ unique: true });
    expect(idx.some((i) => JSON.stringify(i.key) === '{"property":1,"status":1}')).toBe(true);
  });
});

describe('student access after check-out', () => {
  it('keeps the account and lets the student read their own history, refund and receipts only', async () => {
    const ctx = await withStay({ residentExtra: { email: 'stu@example.com' } });
    const invite = await ctx.owner.post(`/api/residents/${ctx.resident.id}/invite`);
    await request(app).post('/api/auth/reset-password').send({ token: invite.body.data.inviteToken, password: 'StudentPass1' });
    const student = request.agent(app);
    expect((await student.post('/api/auth/login').send({ email: 'stu@example.com', password: 'StudentPass1' })).status).toBe(200);

    const made = await pay(ctx, RENT);
    expect((await checkout(ctx)).status).toBe(200);
    expect(await User.countDocuments({ email: 'stu@example.com', status: 'active' })).toBe(1);
    expect((await student.get('/api/auth/me')).status).toBe(200);

    const payments = await student.get('/api/payments');
    expect(payments.status).toBe(200);
    expect(payments.body.data.items.map((p) => p.id)).toEqual([made.body.data.payment.id]);
    const receipt = await student.get(`/api/payments/${made.body.data.payment.id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.receipt.amountPaise).toBe(RENT);
    expect((await student.get('/api/rent-charges')).body.data.items).toHaveLength(1);
    expect((await student.get(`/api/residents/${ctx.resident.id}/balance`)).body.data.balance.totalPaidPaise).toBe(RENT);
    const refunds = await student.get('/api/refunds');
    expect(refunds.body.data.items).toHaveLength(1);
    expect(refunds.body.data.items[0]).toMatchObject({ status: 'pending_approval', refundablePaise: DEPOSIT });

    // Read-only, and nobody else's data.
    expect((await student.post('/api/refunds/' + refunds.body.data.items[0].id + '/approve').send({})).status).toBe(403);
    expect((await student.post('/api/payments').send({})).status).toBe(403);
    expect((await student.post(`/api/payments/${made.body.data.payment.id}/reverse`).send({ reason: 'nope' })).status).toBe(403);
    expect((await student.get('/api/stays')).status).toBe(403);

    const other = await withStay({ residentExtra: { email: 'other@example.com' } });
    const otherPayment = await pay(other, 100000);
    expect((await student.get(`/api/payments/${otherPayment.body.data.payment.id}`)).status).toBe(404);
    expect((await student.get(`/api/payments/${otherPayment.body.data.payment.id}/receipt`)).status).toBe(404);
    expect((await student.get(`/api/residents/${other.resident.id}/balance`)).status).toBe(404);
    expect((await student.get(`/api/payments?residentId=${other.resident.id}`)).body.data.items).toHaveLength(0);
  });
});

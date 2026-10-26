import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
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
import { Complaint } from '../src/models/Complaint.js';
import { Expense } from '../src/models/Expense.js';
import { addDays, businessToday, periodKeyOfInstant } from '../src/utils/dates.js';
import { nextPeriodKey } from '../src/utils/billing.js';
import { generateForProperty } from '../src/services/charge.service.js';

const password = 'Passw0rdOK';
const RENT = 800000;
const DEPOSIT = 1000000;
const day = (offset = 0) => addDays(businessToday(), offset).toISOString().slice(0, 10);
const THIS_MONTH = periodKeyOfInstant(new Date());
const NEXT_MONTH = nextPeriodKey(THIS_MONTH);
const oid = () => new mongoose.Types.ObjectId();

let n = 0;
const registerOwner = async () => {
  n += 1;
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ name: 'Olive Owner', email: `owner${n}@example.com`, password, role: 'owner' });
  return agent;
};
const createUser = async (role, propertyId) => {
  n += 1;
  const user = new User({ name: role, email: `${role}${n}@example.com`, role, propertyAccess: propertyId ? [{ property: propertyId, permissions: ['payments:write'] }] : [] });
  user.password = password;
  await user.save();
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password });
  return agent;
};

const setup = async ({ beds = 3 } = {}) => {
  const owner = await registerOwner();
  const property = (await owner.post('/api/properties').send({ name: 'Sunrise PG', address: { line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001' } })).body.data.property;
  const room = (await owner.post(`/api/properties/${property.id}/rooms`).send({ number: '201', capacity: 30, defaultMonthlyRent: RENT / 100 })).body.data.room;
  const created = (await owner.post(`/api/properties/${property.id}/rooms/${room.id}/beds/bulk`).send({ count: beds })).body.data.items;
  return { owner, property, room, beds: created };
};
let rc = 0;
const addResident = async (ctx, name) => {
  rc += 1;
  return (await ctx.owner.post('/api/residents').send({ propertyId: ctx.property.id, fullName: name ?? `Resident ${rc}`, phone: `97000000${String(rc).padStart(2, '0')}` })).body.data.resident;
};
const checkIn = async (ctx, resident, bed, extra = {}) =>
  (await ctx.owner.post('/api/stays').send({ residentId: resident.id, bedId: bed.id, action: 'checkin', checkInDate: day(0), depositPaise: DEPOSIT, termsAcknowledged: true, ...extra })).body.data.stay;
// One resident checked in with this month's ₹8,000 charge and a ₹10,000 deposit.
const withCharge = async (periodKey = THIS_MONTH) => {
  const ctx = await setup();
  const resident = await addResident(ctx);
  const stay = await checkIn(ctx, resident, ctx.beds[0]);
  await generateForProperty({ propertyId: ctx.property.id, periodKey });
  return { ...ctx, resident, stay, charge: await RentCharge.findOne({ stay: stay.id }).lean() };
};
const pay = (ctx, amountPaise, extra = {}) => ctx.owner.post('/api/payments').send({ propertyId: ctx.property.id, residentId: ctx.resident.id, amountPaise, method: 'upi', ...extra });
const spend = (ctx, extra = {}) => ctx.owner.post('/api/expenses').send({ propertyId: ctx.property.id, category: 'electricity', amountPaise: 200000, paidAt: day(0), description: 'October bill', ...extra });
const overview = async (ctx, periodKey = THIS_MONTH) => (await ctx.owner.get(`/api/reports/overview?propertyId=${ctx.property.id}&periodKey=${periodKey}`)).body.data.overview;
const report = async (ctx, path, qs = '') => (await ctx.owner.get(`/api/reports/${path}?propertyId=${ctx.property.id}${qs}`));

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await Promise.all([Payment, RentCharge, Advance, Counter, Refund, AuditLog, Complaint, Expense].map((m) => m.collection.deleteMany({})));
  await Promise.all([User, Property, Room, Bed, Resident, Stay].map((m) => m.deleteMany({})));
});

describe('overview', () => {
  it('is all zeros for a fresh property (beds only)', async () => {
    const ctx = await setup({ beds: 4 });
    const o = await overview(ctx);
    expect(o.period).toBe(THIS_MONTH);
    expect(o.occupancy).toEqual({ totalBeds: 4, occupiedBeds: 0, availableBeds: 4, reservedBeds: 0, maintenanceBeds: 0, occupancyPercent: 0 });
    expect(o.rent).toEqual({ chargedPaise: 0, collectedPaise: 0, outstandingPaise: 0, collectionRatePercent: 0 });
    expect(o.deposits).toMatchObject({ heldPaise: 0, receivedThisPeriodPaise: 0, refundedThisPeriodPaise: 0 });
    expect(o.expenses).toEqual({ totalPaise: 0, byCategory: [] });
    expect(o.netCashPaise).toBe(0);
    expect(o.complaints).toMatchObject({ open: 0, overdue: 0, highPriority: 0 });
    expect(o.upcomingMoveIns.count).toBe(0);
    expect(o.upcomingMoveOuts.count).toBe(0);
    expect(o.definitions.netCashPaise).toMatch(/not profit/i);
  });

  it('defaults to the current month and computes occupancy from bed statuses', async () => {
    const ctx = await setup({ beds: 5 });
    const r = await addResident(ctx);
    await checkIn(ctx, r, ctx.beds[0]);
    await Bed.updateOne({ _id: ctx.beds[1].id }, { status: 'maintenance' });
    await Bed.updateOne({ _id: ctx.beds[2].id }, { status: 'reserved' });
    const res = await ctx.owner.get(`/api/reports/overview?propertyId=${ctx.property.id}`);
    expect(res.body.data.overview.period).toBe(THIS_MONTH);
    // 1 occupied of (5 beds - 1 maintenance) = 25%
    expect(res.body.data.overview.occupancy).toMatchObject({ totalBeds: 5, occupiedBeds: 1, reservedBeds: 1, maintenanceBeds: 1, availableBeds: 2, occupancyPercent: 25 });
  });

  it('charge ₹8,000 + payment ₹8,000 -> collected ₹8,000, outstanding 0', async () => {
    const ctx = await withCharge();
    await pay(ctx, RENT);
    const o = await overview(ctx);
    expect(o.rent).toEqual({ chargedPaise: RENT, collectedPaise: RENT, outstandingPaise: 0, collectionRatePercent: 100 });
  });

  it('partial collection shows in the rate (₹5,000 of ₹8,000 = 62.5%)', async () => {
    const ctx = await withCharge();
    await pay(ctx, 500000);
    const o = await overview(ctx);
    expect(o.rent).toEqual({ chargedPaise: RENT, collectedPaise: 500000, outstandingPaise: 300000, collectionRatePercent: 62.5 });
  });

  it('rounds percentages to 2 decimals but never rounds money', async () => {
    const ctx = await withCharge();
    await RentCharge.updateOne({ _id: ctx.charge._id }, { amountPaise: 300000, netDuePaise: 300000 });
    await pay(ctx, 100001);
    const o = await overview(ctx);
    expect(o.rent).toMatchObject({ chargedPaise: 300000, collectedPaise: 100001, outstandingPaise: 199999, collectionRatePercent: 33.33 });
  });

  it('the deposit is a liability: not charged, not collected, not cash', async () => {
    const ctx = await withCharge();
    const o = await overview(ctx);
    expect(o.deposits).toMatchObject({ heldPaise: DEPOSIT, onActiveStaysPaise: DEPOSIT, receivedThisPeriodPaise: DEPOSIT, refundedThisPeriodPaise: 0 });
    expect(o.rent.chargedPaise).toBe(RENT);
    expect(o.rent.collectedPaise).toBe(0);
    expect(o.netCashPaise).toBe(0);
    await pay(ctx, RENT);
    const after = await overview(ctx);
    expect(after.rent.collectedPaise).toBe(RENT); // not RENT + DEPOSIT
    expect(after.netCashPaise).toBe(RENT);
  });

  it('expenses ₹2,000 -> cash position ₹6,000; revenue unchanged; voided/pending excluded', async () => {
    const ctx = await withCharge();
    await pay(ctx, RENT);
    await spend(ctx);
    const voided = (await spend(ctx, { category: 'water', amountPaise: 99900 })).body.data.expense;
    await ctx.owner.delete(`/api/expenses/${voided.id}`).send({ reason: 'duplicate' });
    await spend(ctx, { category: 'food', amountPaise: 55500, paymentStatus: 'pending' });
    const o = await overview(ctx);
    expect(o.expenses).toEqual({ totalPaise: 200000, byCategory: [{ category: 'electricity', totalPaise: 200000 }] });
    expect(o.netCashPaise).toBe(600000);
    expect(o.rent.chargedPaise).toBe(RENT);
  });

  it('attributes collections to the charge’s period, not the payment date', async () => {
    const ctx = await withCharge(NEXT_MONTH);
    await pay(ctx, 300000); // paid today, for next month's rent
    expect((await overview(ctx, THIS_MONTH)).rent).toMatchObject({ chargedPaise: 0, collectedPaise: 0 });
    expect((await overview(ctx, NEXT_MONTH)).rent).toMatchObject({ chargedPaise: RENT, collectedPaise: 300000, outstandingPaise: 500000 });
  });

  it('nets out reversals and ignores advances', async () => {
    const ctx = await withCharge();
    const made = await pay(ctx, 500000);
    await pay(ctx, RENT - 500000 + 70000, { allowAdvance: true });
    expect((await overview(ctx)).rent.collectedPaise).toBe(RENT); // the advance is not rent
    await ctx.owner.post(`/api/payments/${made.body.data.payment.id}/reverse`).send({ reason: 'bounced' });
    expect((await overview(ctx)).rent).toMatchObject({ collectedPaise: RENT - 500000, outstandingPaise: 500000 });
  });

  it('reports deposit refunds separately, as liabilities', async () => {
    const ctx = await withCharge();
    await pay(ctx, RENT);
    const out = await ctx.owner.post(`/api/stays/${ctx.stay.id}/checkout`).send({ actualCheckOutDate: day(0), deductions: [{ amountPaise: 100000, reason: 'Damage', evidenceRef: 'p1' }] });
    const refund = out.body.data.refund;
    let o = await overview(ctx);
    expect(o.deposits).toMatchObject({ heldPaise: 900000, onActiveStaysPaise: 0, refundsPayablePaise: 900000, refundedThisPeriodPaise: 0 });
    await ctx.owner.post(`/api/refunds/${refund.id}/approve`).send({});
    await ctx.owner.post(`/api/refunds/${refund.id}/pay`).send({ method: 'cash' });
    o = await overview(ctx);
    expect(o.deposits).toMatchObject({ heldPaise: 0, refundedThisPeriodPaise: 900000 });
    expect(o.netCashPaise).toBe(RENT); // refunds are not in the cash position either
  });

  it('counts complaints and upcoming moves', async () => {
    const ctx = await withCharge();
    const base = { property: ctx.property.id, resident: ctx.resident.id, stay: ctx.stay.id, category: 'other', title: 'abc', description: 'abc', urgency: 'high', statusHistory: [] };
    await Complaint.create([
      { ...base, complaintNumber: 'CMP-T-1', priority: 'urgent', slaDueAt: addDays(new Date(), -1) },
      { ...base, complaintNumber: 'CMP-T-2', priority: 'low', status: 'assigned', slaDueAt: addDays(new Date(), 2) },
      { ...base, complaintNumber: 'CMP-T-3', priority: 'high', status: 'closed' },
    ]);
    const r2 = await addResident(ctx);
    await ctx.owner.post('/api/stays').send({ residentId: r2.id, bedId: ctx.beds[1].id, action: 'reserve', checkInDate: day(10), depositPaise: 0, termsAcknowledged: true });
    await Stay.updateOne({ _id: ctx.stay.id }, { expectedCheckOutDate: addDays(businessToday(), 5) });
    const o = await overview(ctx);
    expect(o.complaints).toMatchObject({ open: 2, overdue: 1, highPriority: 1, byPriority: { urgent: 1, low: 1, high: 0 } });
    expect(o.upcomingMoveIns).toMatchObject({ count: 1, next: [{ residentName: r2.fullName }] });
    expect(o.upcomingMoveOuts).toMatchObject({ count: 1, next: [{ residentName: ctx.resident.fullName }] });
  });
});

describe('other reports', () => {
  it('collections per resident for the months in range', async () => {
    const ctx = await withCharge();
    const r2 = await addResident(ctx, 'Zed Second');
    await checkIn(ctx, r2, ctx.beds[1]);
    await generateForProperty({ propertyId: ctx.property.id, periodKey: THIS_MONTH });
    await pay(ctx, 500000);
    const res = await report(ctx, 'collections', `&from=${day(0)}&to=${day(0)}`);
    expect(res.body.data.collections.totals).toEqual({ chargedPaise: 2 * RENT, paidPaise: 500000, outstandingPaise: 2 * RENT - 500000 });
    expect(res.body.data.collections.items.map((i) => [i.fullName, i.outstandingPaise])).toEqual([['Zed Second', RENT], [ctx.resident.fullName, 300000]]);
    const empty = await report(ctx, 'collections', `&from=2020-01-01&to=2020-02-01`);
    expect(empty.body.data.collections.items).toEqual([]);
    expect((await report(ctx, 'collections', `&from=${day(1)}&to=${day(0)}`)).status).toBe(400);
  });

  it('outstanding list with aging buckets, largest first, excluding waived and paid', async () => {
    const ctx = await setup();
    const a = await addResident(ctx, 'Alpha');
    const b = await addResident(ctx, 'Bravo');
    const stayA = await checkIn(ctx, a, ctx.beds[0]);
    const stayB = await checkIn(ctx, b, ctx.beds[1]);
    const mk = (stay, resident, periodKey, ageDays, net, extra = {}) => ({
      property: ctx.property.id, resident: resident.id, stay: stay.id, periodKey, periodStart: new Date(), periodEnd: new Date(),
      amountPaise: net, netDuePaise: net, dueDate: addDays(businessToday(), -ageDays), status: 'pending', ...extra,
    });
    await RentCharge.insertMany([
      mk(stayA, a, '2025-01', 5, 1000), mk(stayA, a, '2025-02', 20, 2000), mk(stayA, a, '2025-03', 45, 4000), mk(stayA, a, '2025-04', 120, 8000),
      mk(stayB, b, '2025-01', 16, 500), mk(stayB, b, '2025-02', 50, 700, { status: 'waived', netDuePaise: 0 }), mk(stayB, b, '2025-03', 10, 900, { status: 'paid' }),
    ]);
    // Bravo's 900 charge is "paid" only by status; give it a real ledger payment so the ledger agrees.
    const charge = await RentCharge.findOne({ resident: b.id, periodKey: '2025-03' });
    await Payment.collection.insertOne({ _id: oid(), property: oid(), resident: new mongoose.Types.ObjectId(b.id), allocations: [{ charge: charge._id, amountPaise: 900 }], amountPaise: 900, advancePaise: 0, method: 'cash', receiptNumber: 'X-1', status: 'recorded', paidAt: new Date() });

    const out = (await report(ctx, 'outstanding')).body.data.outstanding;
    expect(out.items.map((i) => [i.fullName, i.outstandingPaise])).toEqual([['Alpha', 15000], ['Bravo', 500]]);
    expect(out.items[0].aging).toEqual({ '0-15': 1000, '16-30': 2000, '31-60': 4000, '60+': 8000 });
    expect(out.items[1].aging).toEqual({ '0-15': 0, '16-30': 500, '31-60': 0, '60+': 0 });
    expect(out.aging).toEqual({ '0-15': 1000, '16-30': 2500, '31-60': 4000, '60+': 8000 });
    expect(out.totalOutstandingPaise).toBe(15500);
  });

  it('expenses grouped by category or month, cash basis', async () => {
    const ctx = await setup();
    await spend(ctx, { category: 'electricity', amountPaise: 100000, paidAt: '2026-08-10' });
    await spend(ctx, { category: 'electricity', amountPaise: 50000, paidAt: '2026-09-02' });
    await spend(ctx, { category: 'food', amountPaise: 70000, paidAt: '2026-09-15' });
    await spend(ctx, { category: 'food', amountPaise: 1, paidAt: '2026-09-15', paymentStatus: 'scheduled' });
    const byCat = (await report(ctx, 'expenses', '&from=2026-08-01&to=2026-09-30')).body.data.expenses;
    expect(byCat.totalPaise).toBe(220000);
    expect(byCat.items).toEqual([{ key: 'electricity', totalPaise: 150000, count: 2 }, { key: 'food', totalPaise: 70000, count: 1 }]);
    const byMonth = (await report(ctx, 'expenses', '&from=2026-09-01&to=2026-09-30&groupBy=month')).body.data.expenses;
    expect(byMonth.items).toEqual([{ key: '2026-09', totalPaise: 120000, count: 2 }]);
    expect((await report(ctx, 'expenses', '&groupBy=weekly')).status).toBe(400);
  });

  it('trend returns one row per month with zeros filled in', async () => {
    const ctx = await withCharge();
    await pay(ctx, RENT);
    await spend(ctx, { amountPaise: 150000 });
    const lastMonthDate = addDays(businessToday(), -45).toISOString().slice(0, 10);
    await spend(ctx, { amountPaise: 30000, paidAt: lastMonthDate });
    const t = (await report(ctx, 'trend', '&months=6')).body.data.trend.months;
    expect(t).toHaveLength(6);
    expect(t.at(-1)).toEqual({ periodKey: THIS_MONTH, chargedPaise: RENT, collectedPaise: RENT, outstandingPaise: 0, expensesPaise: 150000, netCashPaise: 650000 });
    expect(t.slice(0, -2).every((m) => m.chargedPaise === 0 && m.collectedPaise === 0 && m.expensesPaise === 0)).toBe(true);
    expect(t.map((m) => m.periodKey)).toEqual([...t.map((m) => m.periodKey)].sort());
    expect(t.find((m) => m.periodKey === periodKeyOfInstant(addDays(new Date(), -45))).expensesPaise).toBe(30000);
    expect((await report(ctx, 'trend', '&months=0')).status).toBe(400);
    expect((await report(ctx, 'trend', '&months=25')).status).toBe(400);
  });

  it('builds a daily occupancy series from stay dates', async () => {
    const ctx = await setup({ beds: 4 });
    const stay = (over) => ({ property: ctx.property.id, room: ctx.room.id, resident: oid(), bed: oid(), monthlyRentPaise: 1, billingDay: 1, ...over });
    await Stay.create([
      stay({ checkInDate: addDays(businessToday(), -5), actualCheckOutDate: addDays(businessToday(), -2), status: 'ended' }),
      stay({ checkInDate: addDays(businessToday(), -3) }),
      stay({ checkInDate: addDays(businessToday(), -30), actualCheckOutDate: addDays(businessToday(), -20), status: 'ended' }),
    ]);
    const series = (await report(ctx, 'occupancy', `&from=${day(-6)}&to=${day(0)}`)).body.data.occupancy;
    expect(series.points.map((p) => p.occupiedBeds)).toEqual([0, 1, 1, 2, 1, 1, 1]);
    expect(series.points[3]).toMatchObject({ date: day(-3), totalBeds: 4, occupancyPercent: 50 });
    expect(series.bedsBasis).toBe('current');
    expect((await report(ctx, 'occupancy', `&from=2020-01-01&to=${day(0)}`)).status).toBe(400);
  });
});

describe('CSV export', () => {
  const rows = (text) => text.trim().split('\r\n');

  it('exports charges, payments, expenses and residents with correct headers and row counts', async () => {
    const ctx = await withCharge();
    const r2 = await addResident(ctx, 'Second Person');
    await checkIn(ctx, r2, ctx.beds[1]);
    await generateForProperty({ propertyId: ctx.property.id, periodKey: THIS_MONTH });
    await pay(ctx, 500000);
    await pay(ctx, 100000, { reference: '=HYPERLINK("http://evil")' });
    await spend(ctx);
    await spend(ctx, { vendor: '=cmd|calc', description: 'Has, comma and "quotes"' });
    const gone = (await spend(ctx, { amountPaise: 1 })).body.data.expense;
    await ctx.owner.delete(`/api/expenses/${gone.id}`).send({});

    const get = (type, qs = '') => ctx.owner.get(`/api/reports/export?type=${type}&propertyId=${ctx.property.id}${qs}`);
    const charges = await get('charges');
    expect(charges.status).toBe(200);
    expect(charges.headers['content-type']).toMatch(/text\/csv/);
    expect(charges.headers['content-disposition']).toMatch(/^attachment; filename="stayos-charges-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(rows(charges.text)[0]).toBe('periodKey,resident,dueDate,status,amountPaise,discountPaise,netDuePaise,paidPaise,outstandingPaise');
    expect(rows(charges.text)).toHaveLength(3);
    expect(rows(charges.text).some((l) => l.includes(`,${RENT},0,${RENT},600000,${RENT - 600000}`))).toBe(true);

    const payments = await get('payments');
    expect(rows(payments.text)[0]).toBe('receiptNumber,paidAt,resident,method,reference,status,isReversal,amountPaise,advancePaise');
    expect(rows(payments.text)).toHaveLength(3);
    expect(payments.text).toContain(`'=HYPERLINK(""http://evil"")`); // formula neutralised, quotes escaped

    const expenses = await get('expenses');
    expect(rows(expenses.text)[0]).toBe('paidAt,periodKey,category,paymentStatus,vendor,description,receiptUrl,amountPaise');
    expect(rows(expenses.text)).toHaveLength(3); // voided row excluded
    expect(expenses.text).toContain("'=cmd|calc");
    expect(expenses.text).toContain('"Has, comma and ""quotes"""');

    const residents = await get('residents');
    expect(rows(residents.text)[0]).toBe('fullName,phone,email,status,room,bed,checkInDate,monthlyRentPaise,depositPaise');
    expect(rows(residents.text)).toHaveLength(3);

    expect(rows((await get('payments', `&from=${day(1)}`)).text)).toHaveLength(1); // header only
    expect((await get('bogus')).status).toBe(400);
  });
});

describe('expenses API', () => {
  it('creates with a derived periodKey, validates input, and keeps paise integers', async () => {
    const ctx = await setup();
    const ok = await spend(ctx, { paidAt: '2026-03-31', vendor: 'MSEB', receiptUrl: 'https://files.example.com/r.pdf' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.expense).toMatchObject({ periodKey: '2026-03', amountPaise: 200000, paymentStatus: 'paid', isVoided: false });
    expect((await spend(ctx, { paidAt: '2026-04-01' })).body.data.expense.periodKey).toBe('2026-04');

    for (const bad of [{ amountPaise: 10.5 }, { amountPaise: 0 }, { category: 'luxury' }, { description: 'x' }, { paidAt: day(3) }, { receiptUrl: 'http://files.example.com/a' }, { receiptUrl: 'https://evil.org/a' }, { propertyId: 'nope' }, { isVoided: true }, { periodKey: '1999-01' }]) {
      expect((await spend(ctx, bad)).status).toBe(400);
    }
    expect((await spend(ctx, { paidAt: day(3), paymentStatus: 'scheduled' })).status).toBe(201); // future is fine unless paid
  });

  it('lists with filters, edits, voids instead of deleting, and audits', async () => {
    const ctx = await setup();
    const a = (await spend(ctx, { category: 'water', paidAt: '2026-05-10', amountPaise: 1000 })).body.data.expense;
    await spend(ctx, { category: 'food', paidAt: '2026-06-10', amountPaise: 2000 });
    const list = (qs) => ctx.owner.get(`/api/expenses?propertyId=${ctx.property.id}${qs}`);
    expect((await list('')).body.data.items).toHaveLength(2);
    expect((await list('&category=water')).body.data.items.map((e) => e.id)).toEqual([a.id]);
    expect((await list('&from=2026-06-01&to=2026-06-30')).body.data.items).toHaveLength(1);
    expect((await list('&limit=1&page=2')).body.data.pagination).toMatchObject({ total: 2, pages: 2 });

    const edited = await ctx.owner.patch(`/api/expenses/${a.id}`).send({ paidAt: '2026-07-01', amountPaise: 1500, notes: 'fixed' });
    expect(edited.body.data.expense).toMatchObject({ periodKey: '2026-07', amountPaise: 1500, notes: 'fixed' });
    expect((await ctx.owner.patch(`/api/expenses/${a.id}`).send({})).status).toBe(400);
    expect((await ctx.owner.patch(`/api/expenses/${a.id}`).send({ isVoided: true })).status).toBe(400);

    const voided = await ctx.owner.delete(`/api/expenses/${a.id}`).send({ reason: 'entered twice' });
    expect(voided.status).toBe(200);
    expect(voided.body.data.expense).toMatchObject({ isVoided: true, voidReason: 'entered twice' });
    expect((await list('')).body.data.items.map((e) => e.id)).not.toContain(a.id);
    expect((await list('&includeVoided=true')).body.data.items).toHaveLength(2);
    expect((await ctx.owner.get(`/api/expenses/${a.id}`)).body.data.expense.isVoided).toBe(true);
    expect((await ctx.owner.delete(`/api/expenses/${a.id}`).send({})).status).toBe(409);
    expect((await ctx.owner.patch(`/api/expenses/${a.id}`).send({ notes: 'x' })).status).toBe(409);
    await expect(Expense.deleteOne({ _id: a.id })).rejects.toThrow(/void/);
    expect(await Expense.countDocuments()).toBe(2); // nothing was removed

    const actions = (await AuditLog.find({ entityId: a.id }).sort({ at: 1 }).lean()).map((x) => x.action);
    expect(actions).toEqual(['expense.create', 'expense.update', 'expense.void']);
  });
});

describe('permissions', () => {
  it('reports and expenses are owner-only and property-scoped', async () => {
    const ctx = await withCharge();
    const warden = await createUser('warden', ctx.property.id);
    const maintenance = await createUser('maintenance', ctx.property.id);
    const student = await createUser('student');
    const paths = ['overview', 'occupancy', 'collections', 'outstanding', 'expenses', 'trend', 'export?type=payments'];
    const url = (p) => `/api/reports/${p}${p.includes('?') ? '&' : '?'}propertyId=${ctx.property.id}`;
    for (const agent of [warden, maintenance, student]) {
      for (const p of paths) expect((await agent.get(url(p))).status).toBe(403);
      expect((await agent.get(`/api/expenses?propertyId=${ctx.property.id}`)).status).toBe(403);
      expect((await agent.post('/api/expenses').send({ propertyId: ctx.property.id, category: 'water', amountPaise: 5, paidAt: day(0), description: 'nope' })).status).toBe(403);
    }
    for (const p of paths) expect((await request(app).get(url(p))).status).toBe(401);

    const stranger = await registerOwner();
    for (const p of paths) expect((await stranger.get(url(p))).status).toBe(404);
    const exp = (await spend(ctx)).body.data.expense;
    expect((await stranger.get(`/api/expenses/${exp.id}`)).status).toBe(404);
    expect((await stranger.patch(`/api/expenses/${exp.id}`).send({ notes: 'x' })).status).toBe(404);
    expect((await stranger.delete(`/api/expenses/${exp.id}`).send({})).status).toBe(404);
    expect((await stranger.post('/api/expenses').send({ propertyId: ctx.property.id, category: 'water', amountPaise: 5, paidAt: day(0), description: 'sneaky' })).status).toBe(404);
    expect((await stranger.get(`/api/expenses?propertyId=${ctx.property.id}`)).status).toBe(404);

    expect((await ctx.owner.get('/api/reports/overview')).status).toBe(400);
    expect((await ctx.owner.get(`/api/reports/overview?propertyId=${ctx.property.id}&periodKey=2026-13`)).status).toBe(400);
  });
});

describe('performance', () => {
  it('serves every report quickly over 500 charges, 300 payments and 200 expenses', async () => {
    const ctx = await setup();
    const property = new mongoose.Types.ObjectId(ctx.property.id);
    const residents = Array.from({ length: 50 }, () => oid());
    await Resident.insertMany(residents.map((_id, i) => ({ _id, property, fullName: `Perf ${i}`, phone: `9${String(i).padStart(9, '0')}` })));
    const charges = Array.from({ length: 500 }, (_, i) => ({
      _id: oid(), property, resident: residents[i % 50], stay: oid(), periodKey: THIS_MONTH, periodStart: new Date(), periodEnd: new Date(),
      amountPaise: 800000, netDuePaise: 800000, dueDate: addDays(businessToday(), -(i % 90)), status: 'pending',
    }));
    await RentCharge.insertMany(charges);
    await Payment.insertMany(
      Array.from({ length: 300 }, (_, i) => ({
        property, resident: charges[i].resident, allocations: [{ charge: charges[i]._id, amountPaise: 100000 }], amountPaise: 100000,
        method: 'upi', receiptNumber: `PERF-${i}`, paidAt: new Date(),
      })),
    );
    await Expense.insertMany(
      Array.from({ length: 200 }, (_, i) => ({ property, category: 'food', amountPaise: 1000 + i, paidAt: new Date(), periodKey: THIS_MONTH, description: `Item ${i}` })),
    );

    const calls = ['overview', 'collections', 'outstanding', 'expenses', 'trend', 'occupancy'];
    for (const c of calls) await report(ctx, c); // warm up
    for (const c of calls) {
      const t0 = performance.now();
      const res = await report(ctx, c);
      const ms = performance.now() - t0;
      expect(res.status).toBe(200);
      expect(ms, `${c} took ${Math.round(ms)}ms`).toBeLessThan(500);
    }
    const o = await overview(ctx);
    expect(o.rent).toMatchObject({ chargedPaise: 500 * 800000, collectedPaise: 300 * 100000, outstandingPaise: 500 * 800000 - 300 * 100000 });
    expect(o.expenses.totalPaise).toBe(200 * 1000 + (199 * 200) / 2);
    const exportRes = await ctx.owner.get(`/api/reports/export?type=charges&propertyId=${ctx.property.id}`);
    expect(exportRes.text.trim().split('\r\n')).toHaveLength(501);
  });
});

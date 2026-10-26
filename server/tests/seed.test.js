import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { Bed } from '../src/models/Bed.js';
import { Complaint } from '../src/models/Complaint.js';
import { Expense } from '../src/models/Expense.js';
import { Payment } from '../src/models/Payment.js';
import { Property } from '../src/models/Property.js';
import { Refund } from '../src/models/Refund.js';
import { RentCharge } from '../src/models/RentCharge.js';
import { Resident } from '../src/models/Resident.js';
import { Stay } from '../src/models/Stay.js';
import { User } from '../src/models/User.js';
import { DEMO_PASSWORD, runSeed } from '../src/scripts/seed.js';
import { ledgerPaidByCharge } from '../src/services/balance.service.js';
import { wipeAll } from './helpers.js';

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(wipeAll);

describe('seed script', () => {
  it('creates a demo-ready database that every invariant agrees with', { timeout: 120000 }, async () => {
    const out = await runSeed({ force: false });
    expect(out.skipped).toBe(false);
    expect(out.counts).toMatchObject({ rooms: 25, beds: 100, residents: 33, staff: 5, students: 3, refunds: 3, complaints: 10, expenses: 15 });
    expect(out.counts.charges).toBe(33 * 3);
    expect(out.counts.payments).toBeGreaterThan(40);

    const property = await Property.findOne({ name: 'Sunrise PG' });
    expect(property.address.city).toBe('Bengaluru');
    expect(await Bed.countDocuments({ property: property._id })).toBe(100);
    expect(await Bed.countDocuments({ property: property._id, status: 'occupied' })).toBe(30);
    expect(await Stay.countDocuments({ status: 'active' })).toBe(30);
    expect(await Resident.countDocuments({ status: 'active' })).toBe(30);
    expect(await Resident.countDocuments({ status: 'former' })).toBe(3);
    expect(await Refund.countDocuments({ status: 'pending_approval' })).toBe(3);
    expect((await Complaint.distinct('status')).sort()).toEqual(['acknowledged', 'assigned', 'closed', 'in_progress', 'new', 'reopened', 'resolved'].sort());
    expect(await Expense.countDocuments({ paymentStatus: 'pending' })).toBe(2);
    expect(await User.countDocuments({ role: 'warden' })).toBe(2);
    expect(await User.countDocuments({ role: 'maintenance' })).toBe(3);

    // Payments and charges are consistent: cached paid amounts match the ledger, nothing is over-paid.
    const ledger = await ledgerPaidByCharge({ property: property._id });
    for (const charge of await RentCharge.find({}).lean()) {
      expect(charge.paidPaise, charge.periodKey).toBe(ledger.get(String(charge._id)) ?? 0);
      expect(charge.paidPaise).toBeLessThanOrEqual(charge.netDuePaise);
    }
    expect(new Set(await RentCharge.distinct('status')).has('paid')).toBe(true);
    expect(new Set(await RentCharge.distinct('status')).has('overdue')).toBe(true);
    expect(await Payment.distinct('receiptNumber')).toHaveLength(out.counts.payments);
  });

  it('logs in with the printed credentials and shows real numbers', { timeout: 120000 }, async () => {
    const out = await runSeed({});
    expect(out.accounts.map((a) => a.role)).toEqual(['owner', 'warden', 'warden', 'maintenance', 'maintenance', 'maintenance', 'student', 'student', 'student']);

    const owner = request.agent(app);
    expect((await owner.post('/api/auth/login').send({ email: 'owner@stayos.demo', password: DEMO_PASSWORD })).status).toBe(200);
    const overview = (await owner.get(`/api/reports/overview?propertyId=${out.propertyId}`)).body.data.overview;
    expect(overview.occupancy).toMatchObject({ totalBeds: 100, occupiedBeds: 30, occupancyPercent: 30 });
    expect(overview.rent.chargedPaise).toBeGreaterThan(0);
    expect(overview.rent.collectedPaise).toBeGreaterThan(0);
    expect(overview.complaints.open).toBeGreaterThan(0);
    expect(overview.expenses.totalPaise).toBeGreaterThan(0);

    const trend = (await owner.get(`/api/reports/trend?propertyId=${out.propertyId}&months=3`)).body.data.trend.months;
    expect(trend.every((m) => m.chargedPaise > 0)).toBe(true);

    const student = request.agent(app);
    expect((await student.post('/api/auth/login').send({ email: 'student1@stayos.demo', password: DEMO_PASSWORD })).status).toBe(200);
    const mine = (await student.get('/api/me/summary')).body.data.summary;
    expect(mine.stay.room.number).toBeTruthy();
    expect((await student.get('/api/me/complaints')).body.data.items.length).toBeGreaterThan(0);
    expect((await student.get('/api/me/payments')).body.data.items.length).toBeGreaterThan(0);

    const warden = request.agent(app);
    await warden.post('/api/auth/login').send({ email: 'warden2@stayos.demo', password: DEMO_PASSWORD });
    expect((await warden.get(`/api/payments?propertyId=${out.propertyId}`)).status).toBe(403); // the limited warden has no payment access
    expect((await warden.get(`/api/residents?propertyId=${out.propertyId}`)).status).toBe(200);
  });

  it('is idempotent: a second run changes nothing, and --force rebuilds from scratch', { timeout: 180000 }, async () => {
    await runSeed({});
    const before = { users: await User.countDocuments(), payments: await Payment.countDocuments(), residents: await Resident.countDocuments() };
    const again = await runSeed({});
    expect(again.skipped).toBe(true);
    expect({ users: await User.countDocuments(), payments: await Payment.countDocuments(), residents: await Resident.countDocuments() }).toEqual(before);

    const rebuilt = await runSeed({ force: true });
    expect(rebuilt.skipped).toBe(false);
    expect(await Property.countDocuments({ name: 'Sunrise PG' })).toBe(1);
    expect({ users: await User.countDocuments(), payments: await Payment.countDocuments(), residents: await Resident.countDocuments() }).toEqual(before);
  });

  it('only removes demo data when forced', { timeout: 180000 }, async () => {
    const other = await request(app).post('/api/auth/register').send({ name: 'Real Owner', email: 'real@example.com', password: 'Passw0rdOK', role: 'owner' });
    expect(other.status).toBe(201);
    await runSeed({});
    await runSeed({ force: true });
    expect(await User.countDocuments({ email: 'real@example.com' })).toBe(1);
  });
});

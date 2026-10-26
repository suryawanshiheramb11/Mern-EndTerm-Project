import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { Bed } from '../src/models/Bed.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Notification } from '../src/models/Notification.js';
import { currentPeriod, day, password, wipeAll } from './helpers.js';

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(wipeAll);

describe('end to end', () => {
  it('owner registers → property → beds → resident → bed → rent → payment → check-out → refund', async () => {
    const owner = request.agent(app);
    const reg = await owner.post('/api/auth/register').send({ name: 'Eve Owner', email: 'eve@example.com', password, role: 'owner' });
    expect(reg.status).toBe(201);

    const property = (await owner.post('/api/properties').send({ name: 'Lakeview Hostel', type: 'hostel', address: { line1: '1 Lake Rd', city: 'Pune', state: 'MH', pincode: '411001' } })).body.data.property;
    const room = (await owner.post(`/api/properties/${property.id}/rooms`).send({ number: '101', capacity: 3, defaultMonthlyRent: 8000, defaultDeposit: 10000 })).body.data.room;
    const beds = (await owner.post(`/api/properties/${property.id}/rooms/${room.id}/beds/bulk`).send({ count: 3 })).body.data.items;
    expect(beds).toHaveLength(3);

    const resident = (await owner.post('/api/residents').send({ propertyId: property.id, fullName: 'Sam Student', phone: '9876543210', email: 'sam@example.com' })).body.data.resident;
    const checkin = await owner.post('/api/stays').send({ residentId: resident.id, bedId: beds[0].id, action: 'checkin', checkInDate: day(0), depositPaise: 1000000, termsAcknowledged: true, inviteStudent: true });
    expect(checkin.status).toBe(201);
    expect(checkin.body.data.bed.status).toBe('occupied');
    const stay = checkin.body.data.stay;
    expect(stay.monthlyRentPaise).toBe(800000);

    // Rent: generate (idempotent), partial then full payment.
    const period = currentPeriod();
    expect((await owner.post('/api/rent-charges/generate').send({ propertyId: property.id, periodKey: period })).body.data).toMatchObject({ created: 1 });
    expect((await owner.post('/api/rent-charges/generate').send({ propertyId: property.id, periodKey: period })).body.data).toMatchObject({ created: 0, skipped: 1 });
    const part = await owner.post('/api/payments').send({ propertyId: property.id, residentId: resident.id, amountPaise: 500000, method: 'upi', reference: 'UTR1', idempotencyKey: 'e2e-payment-1' });
    expect(part.status).toBe(201);
    expect(part.body.data.balance.outstandingPaise).toBe(300000);
    const rest = await owner.post('/api/payments').send({ propertyId: property.id, residentId: resident.id, amountPaise: 300000, method: 'cash' });
    expect(rest.body.data.balance).toMatchObject({ outstandingPaise: 0, totalPaidPaise: 800000 });
    expect((await owner.get(`/api/rent-charges?propertyId=${property.id}`)).body.data.items[0].status).toBe('paid');
    expect(part.body.data.payment.receiptNumber).toMatch(/-0001$/);

    // The student sees all of it in their portal.
    const student = request.agent(app);
    const invite = checkin.body.data.invite;
    await request(app).post('/api/auth/reset-password').send({ token: invite.inviteToken, password: 'StudentPass1' });
    expect((await student.post('/api/auth/login').send({ email: 'sam@example.com', password: 'StudentPass1' })).status).toBe(200);
    const summary = (await student.get('/api/me/summary')).body.data.summary;
    expect(summary).toMatchObject({ outstandingPaise: 0, nextDue: null, depositHeldPaise: 1000000, unreadNotifications: 2 });
    expect(summary.stay).toMatchObject({ room: { number: '101' } });
    expect((await student.get('/api/me/payments')).body.data.items).toHaveLength(2);
    expect((await student.get(`/api/me/receipts/${part.body.data.payment.id}`)).body.data.receipt.amountPaise).toBe(500000);

    // The owner's dashboard reflects the same numbers; the deposit is a liability, not revenue.
    const overview = (await owner.get(`/api/reports/overview?propertyId=${property.id}`)).body.data.overview;
    expect(overview.rent).toMatchObject({ chargedPaise: 800000, collectedPaise: 800000, outstandingPaise: 0, collectionRatePercent: 100 });
    expect(overview.deposits.heldPaise).toBe(1000000);
    expect(overview.occupancy).toMatchObject({ totalBeds: 3, occupiedBeds: 1 });

    // Check-out: preview changes nothing, commit is exactly-once, refund needs approval then payment.
    const out = { actualCheckOutDate: day(0), deductions: [{ amountPaise: 100000, reason: 'Broken chair', evidenceRef: 'IMG-1' }] };
    const preview = await owner.post(`/api/stays/${stay.id}/checkout/preview`).send(out);
    expect(preview.body.data.deposit).toMatchObject({ refundablePaise: 900000 });
    expect((await Bed.findById(beds[0].id)).status).toBe('occupied');
    const results = await Promise.all([owner.post(`/api/stays/${stay.id}/checkout`).send(out), owner.post(`/api/stays/${stay.id}/checkout`).send(out)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const refund = results.find((r) => r.status === 200).body.data.refund;
    expect(refund).toMatchObject({ status: 'pending_approval', refundablePaise: 900000 });
    expect((await Bed.findById(beds[0].id)).status).toBe('available');

    expect((await owner.post(`/api/refunds/${refund.id}/pay`).send({ method: 'cash' })).status).toBe(409);
    expect((await owner.post(`/api/refunds/${refund.id}/approve`).send({})).body.data.refund.status).toBe('approved');
    expect((await owner.post(`/api/refunds/${refund.id}/pay`).send({ method: 'upi', reference: 'UTRREFUND1' })).body.data.refund).toMatchObject({ status: 'paid', method: 'upi' });

    // The student keeps their history and sees the refund.
    expect((await student.get('/api/me/stay')).body.data.stay).toBeNull();
    expect((await student.get('/api/me/refunds')).body.data.items[0]).toMatchObject({ status: 'paid', refundablePaise: 900000 });
    expect((await student.get(`/api/me/receipts/${part.body.data.payment.id}`)).status).toBe(200);

    // CSV export and the audit trail.
    const csv = await owner.get(`/api/reports/export?type=payments&propertyId=${property.id}`);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.trim().split('\r\n')).toHaveLength(3);
    const actions = (await AuditLog.find({}).lean()).map((a) => a.action);
    for (const a of ['charges.generate', 'payment.record', 'stay.checkout', 'refund.approve', 'refund.pay']) expect(actions).toContain(a);
    expect(await Notification.countDocuments({ type: 'refund_pending' })).toBe(1);
  });
});

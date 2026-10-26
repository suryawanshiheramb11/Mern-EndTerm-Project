import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { addResident, checkIn, createStaff, DEPOSIT, generateCharges, makeStudent, pay, RENT, wipeAll, world, day } from './helpers.js';

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(wipeAll);

describe('student portal', () => {
  it('shows the student their room, rent due, receipts, complaints and notifications', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const made = await pay(ctx.owner, ctx, 500000);

    const stay = (await ctx.student.get('/api/me/stay')).body.data.stay;
    expect(stay).toMatchObject({ status: 'active', room: { number: '201' }, bed: { label: expect.any(String) }, monthlyRentPaise: RENT, depositPaise: DEPOSIT });
    expect(stay.property).toMatchObject({ name: 'Sunrise PG' });
    expect(stay.checkInDate).toBeTruthy();

    const summary = (await ctx.student.get('/api/me/summary')).body.data.summary;
    expect(summary).toMatchObject({ outstandingPaise: 300000, depositHeldPaise: DEPOSIT, openComplaints: 0, latestNotice: null });
    expect(summary.stay.room.number).toBe('201');
    expect(summary.nextDue).toMatchObject({ outstandingPaise: 300000, status: expect.stringMatching(/partial|overdue/) });
    expect(summary.unreadNotifications).toBe(1); // the payment receipt

    const charges = (await ctx.student.get('/api/me/charges')).body.data;
    expect(charges.items).toHaveLength(1);
    expect(charges.items[0]).toMatchObject({ netDuePaise: RENT, paidPaise: 500000, outstandingPaise: 300000 });
    expect(charges.pagination.total).toBe(1);

    const payments = (await ctx.student.get('/api/me/payments')).body.data.items;
    expect(payments.map((p) => p.id)).toEqual([made.body.data.payment.id]);
    const receipt = await ctx.student.get(`/api/me/receipts/${made.body.data.payment.id}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.receipt).toMatchObject({ receiptNumber: made.body.data.payment.receiptNumber, amountPaise: 500000, resident: { fullName: ctx.resident.fullName } });

    const posted = await ctx.student.post('/api/me/complaints').send({ category: 'plumbing', title: 'Leaking tap', description: 'It leaks all night', urgency: 'medium' });
    expect(posted.status).toBe(201);
    const mine = (await ctx.student.get('/api/me/complaints')).body.data.items;
    expect(mine.map((c) => c.id)).toEqual([posted.body.data.complaint.id]);
    expect((await ctx.student.get('/api/me/summary')).body.data.summary.openComplaints).toBe(1);
    expect((await ctx.student.get('/api/me/refunds')).body.data.items).toEqual([]);

    const profile = (await ctx.student.get('/api/me/profile')).body.data;
    expect(profile).toMatchObject({ user: { role: 'student', email: ctx.resident.email }, resident: { fullName: ctx.resident.fullName }, property: { name: 'Sunrise PG' } });
    expect(JSON.stringify(profile)).not.toMatch(/passwordHash/);
  });

  it('keeps one student out of another’s records, and staff out of the student endpoints', async () => {
    const ctx = await world();
    const otherResident = await addResident(ctx.owner, ctx.property.id, { email: 'other.student@example.com' });
    await checkIn(ctx.owner, otherResident.id, ctx.beds[1].id);
    const other = await makeStudent(ctx.owner, otherResident);
    await generateCharges(ctx.owner, ctx.property.id);
    const theirs = await ctx.owner.post('/api/payments').send({ propertyId: ctx.property.id, residentId: otherResident.id, amountPaise: 100000, method: 'cash' });
    const mine = await pay(ctx.owner, ctx, 200000);
    const theirComplaint = (await other.post('/api/me/complaints').send({ category: 'other', title: 'Their issue', description: 'Only theirs', urgency: 'low' })).body.data.complaint;

    expect((await ctx.student.get(`/api/me/receipts/${theirs.body.data.payment.id}`)).status).toBe(404);
    expect((await ctx.student.get(`/api/me/receipts/${mine.body.data.payment.id}`)).status).toBe(200);
    expect((await ctx.student.get('/api/me/payments')).body.data.items.map((p) => p.id)).toEqual([mine.body.data.payment.id]);
    expect((await ctx.student.get('/api/me/charges')).body.data.items).toHaveLength(1);
    expect((await ctx.student.get('/api/me/complaints')).body.data.items).toEqual([]);
    expect((await ctx.student.get(`/api/complaints/${theirComplaint.id}`)).status).toBe(404);
    expect((await ctx.student.get(`/api/me/receipts/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
    expect((await ctx.student.get('/api/me/receipts/not-an-id')).status).toBe(400);

    const warden = await createStaff('warden', ctx.property.id);
    for (const path of ['summary', 'profile', 'stay', 'charges', 'payments', 'refunds', 'complaints']) {
      expect((await warden.get(`/api/me/${path}`)).status).toBe(403);
      expect((await ctx.owner.get(`/api/me/${path}`)).status).toBe(403);
      expect((await request(app).get(`/api/me/${path}`)).status).toBe(401);
    }
    expect((await warden.post('/api/me/complaints').send({ category: 'other', title: 'Not a student', description: 'Nope nope', urgency: 'low' })).status).toBe(403);
    expect((await warden.get('/api/me/notifications')).status).toBe(200); // notifications are for every role
  });

  it('keeps working after check-out: history, receipts and the refund stay visible', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const made = await pay(ctx.owner, ctx, RENT);
    await ctx.owner.post(`/api/stays/${ctx.stay.id}/checkout`).send({ actualCheckOutDate: day(0) });

    expect((await ctx.student.get('/api/me/stay')).body.data.stay).toBeNull();
    expect((await ctx.student.get(`/api/me/receipts/${made.body.data.payment.id}`)).status).toBe(200);
    const refunds = (await ctx.student.get('/api/me/refunds')).body.data.items;
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ status: 'pending_approval', refundablePaise: DEPOSIT });
    const summary = (await ctx.student.get('/api/me/summary')).body.data.summary;
    expect(summary).toMatchObject({ stay: null, nextDue: null, outstandingPaise: 0 });
    expect((await ctx.student.post('/api/me/complaints').send({ category: 'other', title: 'After leaving', description: 'Cannot file', urgency: 'low' })).status).toBe(409);
  });

  it('validates paging and complaint input', async () => {
    const ctx = await world();
    expect((await ctx.student.get('/api/me/charges?limit=0')).status).toBe(400);
    expect((await ctx.student.get('/api/me/payments?propertyId=x')).status).toBe(400);
    expect((await ctx.student.post('/api/me/complaints').send({ title: 'x' })).status).toBe(400);
    expect((await ctx.student.post('/api/me/notifications/zzz/read')).status).toBe(400);
  });
});

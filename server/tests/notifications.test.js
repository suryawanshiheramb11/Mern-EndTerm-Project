import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { Notification } from '../src/models/Notification.js';
import { RentCharge } from '../src/models/RentCharge.js';
import { Stay } from '../src/models/Stay.js';
import { Payment } from '../src/models/Payment.js';
import { notify } from '../src/services/notification.service.js';
import { outbox } from '../src/services/emailTransport.js';
import { runRentReminders } from '../src/jobs/rentReminders.js';
import { addDays, businessToday } from '../src/utils/dates.js';
import { createStaff, currentPeriod, generateCharges, makeProperty, pay, registerOwner, wipeAll, world, day } from './helpers.js';

const inbox = async (agent, qs = '') => (await agent.get(`/api/me/notifications${qs}`)).body.data;
const types = (data) => data.items.map((n) => n.type);
const count = (userId, type) => Notification.countDocuments({ user: userId, type });

// A property with a student, a warden (default permissions), a warden without payment access, and a maintenance user.
const setup = async () => {
  const ctx = await world();
  const warden = await createStaff('warden', ctx.property.id);
  const wardenNoPay = await createStaff('warden', ctx.property.id, ['residents.view', 'residents.edit']);
  const maint = await createStaff('maintenance', ctx.property.id);
  await generateCharges(ctx.owner, ctx.property.id);
  const charge = await RentCharge.findOne({ stay: ctx.stay.id }).lean();
  return { ...ctx, warden, wardenNoPay, maint, charge };
};

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await wipeAll();
  outbox.length = 0;
});

describe('notify()', () => {
  it('creates one row per event per recipient and ignores repeats', async () => {
    const ctx = await setup();
    const made = await pay(ctx.owner, ctx, 100000);
    const payment = await Payment.findById(made.body.data.payment.id).lean();
    expect((await inbox(ctx.student)).items.filter((n) => n.type === 'payment_recorded')).toHaveLength(1);

    const again = await notify('payment_recorded', { payment });
    expect(again).toEqual({ created: 0, skipped: 1 });
    await notify('payment_recorded', { payment });
    expect(await Notification.countDocuments({ type: 'payment_recorded' })).toBe(1);
  });

  it('sends the email once, only for newly created rows, with the delivery state recorded', async () => {
    const ctx = await setup();
    await pay(ctx.owner, ctx, 100000);
    const mails = outbox.filter((m) => m.to === ctx.resident.email);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ subject: 'Payment received' });
    expect(mails[0].text).toContain('receipt');
    const row = await Notification.findOne({ type: 'payment_recorded' }).lean();
    expect(row.delivery).toEqual({ inApp: 'sent', email: 'sent' });
    expect(row.dedupeKey).toMatch(/^payment_recorded:[a-f0-9]{24}:[a-f0-9]{24}$/);
    expect(row.link).toBe('/student/rent');

    const key = 'dedupe-test-key';
    await pay(ctx.owner, ctx, 50000, { idempotencyKey: key });
    await pay(ctx.owner, ctx, 50000, { idempotencyKey: key }); // replay: same payment, no new notification
    expect(await Notification.countDocuments({ type: 'payment_recorded' })).toBe(2);
    expect(outbox.filter((m) => m.to === ctx.resident.email)).toHaveLength(2);
  });

  it('rejects unknown events without throwing, and never breaks the caller', async () => {
    const result = await notify('does_not_exist', {});
    expect(result).toEqual({ created: 0, skipped: 0 });
    expect(await Notification.countDocuments()).toBe(0);
  });
});

describe('events', () => {
  it('complaint_created goes to the owner and wardens holding complaints.manage, once', async () => {
    const ctx = await setup();
    const noManage = await createStaff('warden', ctx.property.id, ['residents.view']);
    const c = (await ctx.student.post('/api/complaints').send({ category: 'plumbing', title: 'Leaking tap', description: 'Leaks all night', urgency: 'high' })).body.data.complaint;
    const owners = await Notification.find({ type: 'complaint_created' }).lean();
    expect(owners.map((n) => String(n.user)).sort()).toEqual([ctx.owner.userId, ctx.warden.userId].sort());
    expect(await count(ctx.wardenNoPay.userId, 'complaint_created')).toBe(0); // no complaints.manage
    expect(await count(noManage.userId, 'complaint_created')).toBe(0);
    expect(await count(ctx.maint.userId, 'complaint_created')).toBe(0); // maintenance only hears about their assignments
    expect(await count(ctx.student.userId, 'complaint_created')).toBe(0);
    expect(owners[0].link).toMatch(/\/complaints$/);
    expect(owners.every((n) => n.body.includes(c.complaintNumber))).toBe(true);
  });

  it('task_assigned reaches the assignee; reassigning notifies each time, repeats do not', async () => {
    const ctx = await setup();
    const c = (await ctx.student.post('/api/complaints').send({ category: 'other', title: 'Broken lock', description: 'Door will not lock', urgency: 'medium' })).body.data.complaint;
    await ctx.warden.patch(`/api/complaints/${c.id}/acknowledge`).send({});
    const assign = (to) => ctx.warden.patch(`/api/complaints/${c.id}/assign`).send({ assignedTo: to.userId, priority: 'high' });
    const second = await createStaff('maintenance', ctx.property.id);
    await assign(ctx.maint);
    expect(await count(ctx.maint.userId, 'task_assigned')).toBe(1);
    await assign(second);
    await assign(ctx.maint);
    expect(await count(ctx.maint.userId, 'task_assigned')).toBe(2);
    expect(await count(second.userId, 'task_assigned')).toBe(1);
    const mine = await inbox(ctx.maint);
    expect(types(mine).filter((t) => t === 'task_assigned')).toHaveLength(2);
    expect(mine.items[0].link).toBe('/maintenance/complaints');
  });

  it('complaint_resolved goes to the resident', async () => {
    const ctx = await setup();
    const c = (await ctx.student.post('/api/complaints').send({ category: 'other', title: 'Dripping AC', description: 'Water drips on the bed', urgency: 'low' })).body.data.complaint;
    await ctx.warden.patch(`/api/complaints/${c.id}/acknowledge`).send({});
    await ctx.warden.patch(`/api/complaints/${c.id}/assign`).send({ assignedTo: ctx.maint.userId, priority: 'low' });
    await ctx.maint.patch(`/api/complaints/${c.id}/progress`).send({ progressNote: 'Checking it' });
    expect(await count(ctx.student.userId, 'complaint_resolved')).toBe(0);
    await ctx.maint.patch(`/api/complaints/${c.id}/resolve`).send({ resolutionNotes: 'Drain unblocked' });
    expect(await count(ctx.student.userId, 'complaint_resolved')).toBe(1);
    expect((await inbox(ctx.student)).items[0]).toMatchObject({ type: 'complaint_resolved', link: '/student/complaints' });
  });

  it('refund_pending goes to the owner only when approval is still needed', async () => {
    const ctx = await setup();
    await pay(ctx.owner, ctx, 800000);
    const out = await ctx.owner.post(`/api/stays/${ctx.stay.id}/checkout`).send({ actualCheckOutDate: day(0) });
    expect(out.status).toBe(200);
    expect(await Notification.countDocuments({ type: 'refund_pending' })).toBe(1);
    expect(await count(ctx.owner.userId, 'refund_pending')).toBe(1);
    expect((await inbox(ctx.owner)).items.find((n) => n.type === 'refund_pending').link).toBe('/owner/refunds');

    const other = await world();
    await pay(other.owner, other, 800000);
    await other.owner.post(`/api/stays/${other.stay.id}/checkout`).send({ actualCheckOutDate: day(0), approveRefundNow: true });
    expect(await count(other.owner.userId, 'refund_pending')).toBe(0);
  });

  it('rent_overdue (via the reconcile job) reaches the resident, wardens with payments.view and the owner, exactly once', async () => {
    const ctx = await setup();
    await RentCharge.updateOne({ _id: ctx.charge._id }, { dueDate: addDays(businessToday(), -30), status: 'pending' });
    const run = () => ctx.owner.post('/api/admin/jobs/overdueReconcile').send({});
    const first = await run();
    expect(first.status).toBe(200);
    expect(first.body.data.result.markedOverdue).toBe(1);

    const rows = await Notification.find({ type: 'rent_overdue' }).lean();
    expect(rows.map((n) => String(n.user)).sort()).toEqual([ctx.student.userId, ctx.warden.userId, ctx.owner.userId].sort());
    expect(await count(ctx.wardenNoPay.userId, 'rent_overdue')).toBe(0);
    expect(await count(ctx.maint.userId, 'rent_overdue')).toBe(0);
    expect(rows.find((n) => String(n.user) === ctx.student.userId).link).toBe('/student/rent');

    await run();
    await RentCharge.updateOne({ _id: ctx.charge._id }, { status: 'pending' }); // force a second flip
    await run();
    expect(await Notification.countDocuments({ type: 'rent_overdue' })).toBe(3); // still one per recipient
  });

  it('rent_due_soon is sent by the reminder job within 3 days of the due date, once', async () => {
    const ctx = await setup();
    await RentCharge.updateOne({ _id: ctx.charge._id }, { dueDate: addDays(businessToday(), 2), status: 'pending' });
    const run = () => ctx.owner.post('/api/admin/jobs/rentReminders').send({});
    expect((await run()).body.data.result).toMatchObject({ scanned: 1, created: 1 });
    expect((await run()).body.data.result).toMatchObject({ scanned: 1, created: 0, skipped: 1 });
    expect(await count(ctx.student.userId, 'rent_due_soon')).toBe(1);
    expect(types(await inbox(ctx.student))).toContain('rent_due_soon');

    await RentCharge.updateOne({ _id: ctx.charge._id }, { dueDate: addDays(businessToday(), 10), status: 'pending' });
    expect(await runRentReminders({ today: businessToday() })).toMatchObject({ scanned: 0 }); // too early
    await pay(ctx.owner, ctx, 800000);
    await RentCharge.updateOne({ _id: ctx.charge._id }, { dueDate: addDays(businessToday(), 1) });
    expect(await runRentReminders({})).toMatchObject({ scanned: 0 }); // already paid
  });

  it('checkout_upcoming and checkin_upcoming reach the owner and wardens with residents.edit', async () => {
    const ctx = await setup();
    await Stay.updateOne({ _id: ctx.stay.id }, { expectedCheckOutDate: addDays(businessToday(), 2) });
    const run = () => ctx.owner.post('/api/admin/jobs/upcomingEvents').send({});
    expect((await run()).body.data.result).toMatchObject({ checkouts: 1, created: 3 }); // owner + 2 wardens with residents.edit
    expect((await run()).body.data.result).toMatchObject({ created: 0 });
    expect(await Notification.countDocuments({ type: 'checkout_upcoming' })).toBe(3);
    expect(await count(ctx.student.userId, 'checkout_upcoming')).toBe(0);
    expect(await count(ctx.maint.userId, 'checkout_upcoming')).toBe(0);

    const r2 = await (await import('./helpers.js')).addResident(ctx.owner, ctx.property.id);
    await ctx.owner.post('/api/stays').send({ residentId: r2.id, bedId: ctx.beds[1].id, action: 'reserve', checkInDate: day(2), depositPaise: 0, termsAcknowledged: true });
    expect((await run()).body.data.result).toMatchObject({ checkins: 1, created: 3 });
  });

  it('announcements reach every resident with a login', async () => {
    const ctx = await setup();
    const res = await ctx.owner.post(`/api/properties/${ctx.property.id}/announcements`).send({ title: 'Water cut tomorrow', body: 'No water from 10am to 2pm.' });
    expect(res.status).toBe(201);
    expect(res.body.data.recipients).toBe(1);
    expect((await inbox(ctx.student)).items[0]).toMatchObject({ type: 'announcement', title: 'Water cut tomorrow' });
    const summary = (await ctx.student.get('/api/me/summary')).body.data.summary;
    expect(summary.latestNotice).toMatchObject({ title: 'Water cut tomorrow' });
    expect((await ctx.warden.post(`/api/properties/${ctx.property.id}/announcements`).send({ title: 'Nope nope', body: 'Nope nope' })).status).toBe(403);
    expect((await (await registerOwner()).post(`/api/properties/${ctx.property.id}/announcements`).send({ title: 'Nope nope', body: 'Nope nope' })).status).toBe(404);
  });
});

describe('reading notifications', () => {
  it('marks as read idempotently, filters unread, and keeps users apart', async () => {
    const ctx = await setup();
    await pay(ctx.owner, ctx, 100000);
    await pay(ctx.owner, ctx, 100000);
    let data = await inbox(ctx.student);
    expect(data.unreadCount).toBe(2);
    const first = data.items[0];
    const read = await ctx.student.post(`/api/me/notifications/${first.id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.data.notification.readAt).toBeTruthy();
    const again = await ctx.student.post(`/api/me/notifications/${first.id}/read`);
    expect(again.body.data.notification.readAt).toBe(read.body.data.notification.readAt);

    data = await inbox(ctx.student, '?unread=true');
    expect(data.items).toHaveLength(1);
    expect(data.unreadCount).toBe(1);
    expect((await inbox(ctx.student, '?limit=1&page=2')).pagination).toMatchObject({ total: 2, pages: 2 });

    // Another user cannot read or mark it.
    expect((await ctx.warden.post(`/api/me/notifications/${first.id}/read`)).status).toBe(404);
    expect((await ctx.student.post(`/api/me/notifications/${new mongoose.Types.ObjectId()}/read`)).status).toBe(404);
    expect((await inbox(ctx.warden)).items.map((n) => n.id)).not.toContain(first.id);
  });
});

describe('job trigger endpoint', () => {
  it('is owner-only, validates the job name and only touches the owner’s own properties', async () => {
    const ctx = await setup();
    await RentCharge.updateOne({ _id: ctx.charge._id }, { dueDate: addDays(businessToday(), 1) });

    expect((await ctx.warden.post('/api/admin/jobs/rentReminders').send({})).status).toBe(403);
    expect((await ctx.student.post('/api/admin/jobs/rentReminders').send({})).status).toBe(403);
    expect((await ctx.owner.post('/api/admin/jobs/nope').send({})).status).toBe(400);

    const stranger = await registerOwner();
    await makeProperty(stranger);
    const res = await stranger.post('/api/admin/jobs/rentReminders').send({});
    expect(res.status).toBe(200);
    expect(res.body.data.result.scanned).toBe(0); // the other tenant's charge is out of scope
    expect(await Notification.countDocuments({ type: 'rent_due_soon' })).toBe(0);
    expect(currentPeriod()).toMatch(/^\d{4}-\d{2}$/);
  });
});

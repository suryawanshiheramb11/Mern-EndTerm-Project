import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { DEFAULT_PERMISSIONS } from '../src/config/permissions.js';
import { Property } from '../src/models/Property.js';
import { Room } from '../src/models/Room.js';
import { Bed } from '../src/models/Bed.js';
import { Resident } from '../src/models/Resident.js';
import { Stay } from '../src/models/Stay.js';
import { Counter } from '../src/models/Counter.js';
import { Complaint } from '../src/models/Complaint.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { addDays, businessToday } from '../src/utils/dates.js';

const password = 'Passw0rdOK';
const PHOTO = 'https://files.example.com/leak.jpg';
const day = (offset = 0) => addDays(businessToday(), offset).toISOString().slice(0, 10);

let n = 0;
const registerOwner = async () => {
  n += 1;
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ name: 'Olive Owner', email: `owner${n}@example.com`, password, role: 'owner' });
  return agent;
};
const createStaff = async (role, propertyId, name = `${role} user`) => {
  n += 1;
  const user = new User({ name, email: `${role}${n}@example.com`, role, propertyAccess: propertyId ? [{ property: propertyId, role, permissions: [...DEFAULT_PERMISSIONS[role]] }] : [] });
  user.password = password;
  await user.save();
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password });
  return { agent, user };
};

// Property with `students` checked-in residents, each with a logged-in student account.
const setup = async ({ students = 2 } = {}) => {
  const owner = await registerOwner();
  const property = (await owner.post('/api/properties').send({ name: 'Sunrise PG', address: { line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001' } })).body.data.property;
  const room = (await owner.post(`/api/properties/${property.id}/rooms`).send({ number: '201', capacity: 10, defaultMonthlyRent: 5000 })).body.data.room;
  const beds = (await owner.post(`/api/properties/${property.id}/rooms/${room.id}/beds/bulk`).send({ count: students })).body.data.items;
  const people = [];
  for (let i = 0; i < students; i += 1) {
    n += 1;
    const email = `student${n}@example.com`;
    const resident = (await owner.post('/api/residents').send({ propertyId: property.id, fullName: `Student ${n}`, phone: `98765${String(n).padStart(5, '0')}`, email })).body.data.resident;
    await owner.post('/api/stays').send({ residentId: resident.id, bedId: beds[i].id, action: 'checkin', checkInDate: day(0), depositPaise: 0, termsAcknowledged: true });
    const invite = await owner.post(`/api/residents/${resident.id}/invite`);
    await request(app).post('/api/auth/reset-password').send({ token: invite.body.data.inviteToken, password: 'StudentPass1' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password: 'StudentPass1' });
    people.push({ agent, resident });
  }
  const warden = await createStaff('warden', property.id);
  const maintenance = await createStaff('maintenance', property.id, 'Mo Maintenance');
  return { owner, property, room, beds, students: people, warden, maintenance };
};

const body = (extra = {}) => ({ category: 'plumbing', title: 'Leaking tap', description: 'The tap in the bathroom leaks all night', urgency: 'medium', ...extra });
const file = async (ctx, i = 0, extra) => (await ctx.students[i].agent.post('/api/complaints').send(body(extra))).body.data.complaint;
const patch = (agent, c, action, payload = {}) => agent.patch(`/api/complaints/${c.id}/${action}`).send(payload);

// Drives a complaint to a given state through the real endpoints.
const advance = async (ctx, c, to) => {
  const steps = ['acknowledged', 'assigned', 'in_progress', 'resolved', 'closed'];
  const { warden, maintenance } = ctx;
  for (const step of steps.slice(0, steps.indexOf(to) + 1)) {
    if (step === 'acknowledged') await patch(warden.agent, c, 'acknowledge');
    if (step === 'assigned') await patch(warden.agent, c, 'assign', { assignedTo: String(maintenance.user._id), priority: 'high' });
    if (step === 'in_progress') await patch(maintenance.agent, c, 'progress', { progressNote: 'Fetched parts' });
    if (step === 'resolved') await patch(maintenance.agent, c, 'resolve', { resolutionNotes: 'Washer replaced', completionPhotoUrl: PHOTO });
    if (step === 'closed') await patch(warden.agent, c, 'close');
  }
};

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await Promise.all([Counter, Complaint, AuditLog].map((m) => m.collection.deleteMany({})));
  await Promise.all([User, Property, Room, Bed, Resident, Stay].map((m) => m.deleteMany({})));
});

describe('raising complaints', () => {
  it('files against the student’s own stay, visible only to them', async () => {
    const ctx = await setup();
    const res = await ctx.students[0].agent.post('/api/complaints').send(body({ attachments: [{ url: PHOTO, mime: 'image/jpeg' }] }));
    expect(res.status).toBe(201);
    const c = res.body.data.complaint;
    expect(c).toMatchObject({ status: 'new', urgency: 'medium', category: 'plumbing', resident: { id: ctx.students[0].resident.id }, room: { number: '201' } });
    expect(c.complaintNumber).toMatch(/^CMP-[A-Z0-9]{7}-0001$/);
    expect(c.property).toBe(ctx.property.id);
    expect(c.priority).toBeUndefined();
    expect(c.statusHistory).toHaveLength(1);
    expect(c.statusHistory[0]).toMatchObject({ status: 'new', fromStatus: null });
    expect(c.attachments[0].url).toBe(PHOTO);
    // medium urgency -> 3 day SLA
    expect(Math.round((new Date(c.slaDueAt) - Date.now()) / 86_400_000)).toBe(3);
    expect(c.slaState).toBe('ok');
    expect(c.actions).toEqual([]);

    expect((await ctx.students[0].agent.get('/api/complaints')).body.data.items.map((x) => x.id)).toEqual([c.id]);
    expect((await ctx.students[1].agent.get('/api/complaints')).body.data.items).toHaveLength(0);
    expect((await ctx.students[1].agent.get(`/api/complaints/${c.id}`)).status).toBe(404);
  });

  it('ignores a supplied propertyId when listing and rejects server-owned fields on create', async () => {
    const ctx = await setup();
    await file(ctx, 0);
    await file(ctx, 1);
    const other = await setup({ students: 1 });
    const res = await ctx.students[0].agent.get(`/api/complaints?propertyId=${other.property.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].resident.id).toBe(ctx.students[0].resident.id);

    for (const extra of [{ propertyId: other.property.id }, { status: 'closed' }, { priority: 'urgent' }, { stay: new mongoose.Types.ObjectId().toString() }]) {
      expect((await ctx.students[0].agent.post('/api/complaints').send(body(extra))).status).toBe(400);
    }
  });

  it('validates fields and attachment URLs', async () => {
    const ctx = await setup({ students: 1 });
    const post = (extra) => ctx.students[0].agent.post('/api/complaints').send(body(extra));
    expect((await post({ title: 'ab' })).status).toBe(400);
    expect((await post({ description: '' })).status).toBe(400);
    expect((await post({ urgency: 'urgent' })).status).toBe(400);
    expect((await post({ category: 'noise' })).status).toBe(400);
    for (const url of ['http://files.example.com/a.jpg', 'https://evil.example.org/a.jpg', 'https://files.example.com.evil.org/a.jpg', 'https://user:pw@files.example.com/a.jpg', 'javascript:alert(1)', 'ftp://files.example.com/a']) {
      expect((await post({ attachments: [{ url }] })).status).toBe(400);
    }
    expect((await post({ attachments: [{ url: 'https://img.cdn.example.com/a.jpg' }] })).status).toBe(201);
    expect((await post({ attachments: [{ url: 'https://cdn.example.com/a.jpg' }] })).status).toBe(400); // wildcard needs a subdomain
  });

  it('is student-only and needs an active stay', async () => {
    const ctx = await setup({ students: 1 });
    for (const who of [ctx.warden.agent, ctx.maintenance.agent, ctx.owner]) {
      expect((await who.post('/api/complaints').send(body())).status).toBe(403);
    }
    await Stay.updateMany({}, { status: 'ended' });
    expect((await ctx.students[0].agent.post('/api/complaints').send(body())).status).toBe(409);
    expect((await request(app).post('/api/complaints').send(body())).status).toBe(401);
  });

  it('numbers complaints sequentially and atomically under parallel creation', async () => {
    const ctx = await setup();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => ctx.students[i % 2].agent.post('/api/complaints').send(body({ title: `Issue ${i}` }))),
    );
    expect(results.map((r) => r.status)).toEqual(Array(12).fill(201));
    const seqs = results.map((r) => Number(r.body.data.complaint.complaintNumber.split('-')[2])).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(new Set(results.map((r) => r.body.data.complaint.complaintNumber)).size).toBe(12);
  });

  it('sets the SLA from urgency', async () => {
    const ctx = await setup({ students: 1 });
    const days = async (urgency) => Math.round((new Date((await file(ctx, 0, { urgency })).slaDueAt) - Date.now()) / 86_400_000);
    expect([await days('high'), await days('medium'), await days('low')]).toEqual([1, 3, 7]);
  });
});

describe('workflow', () => {
  it('acknowledge appends to history and is staff-only', async () => {
    const ctx = await setup();
    const c = await file(ctx);
    expect((await patch(ctx.students[0].agent, c, 'acknowledge')).status).toBe(403);
    expect((await patch(ctx.maintenance.agent, c, 'acknowledge')).status).toBe(403);

    const res = await patch(ctx.warden.agent, c, 'acknowledge', { note: 'On it' });
    expect(res.status).toBe(200);
    const out = res.body.data.complaint;
    expect(out.status).toBe('acknowledged');
    expect(out.statusHistory).toHaveLength(2);
    expect(out.statusHistory[1]).toMatchObject({ status: 'acknowledged', fromStatus: 'new', note: 'On it', by: { name: 'warden user' } });
    expect(out.actions).toEqual(['assign']);
    expect((await patch(ctx.warden.agent, c, 'acknowledge')).status).toBe(409);
  });

  it('assign needs an active warden/maintenance user with access to the property', async () => {
    const ctx = await setup();
    const c = await file(ctx);
    const assign = (assignedTo, priority = 'high') => patch(ctx.warden.agent, c, 'assign', { assignedTo, priority });
    expect((await assign(String(ctx.maintenance.user._id))).status).toBe(409); // not acknowledged yet
    await patch(ctx.warden.agent, c, 'acknowledge');

    const outsider = await createStaff('maintenance'); // no property access
    const stranger = new mongoose.Types.ObjectId().toString();
    const studentUser = await User.findOne({ role: 'student' });
    for (const id of [String(outsider.user._id), stranger, String(studentUser._id), String((await User.findOne({ role: 'owner' }))._id)]) {
      expect((await assign(id)).status).toBe(400);
    }
    await User.updateOne({ _id: ctx.maintenance.user._id }, { status: 'suspended' });
    expect((await assign(String(ctx.maintenance.user._id))).status).toBe(400);
    await User.updateOne({ _id: ctx.maintenance.user._id }, { status: 'active' });

    expect((await patch(ctx.students[0].agent, c, 'assign', { assignedTo: String(ctx.maintenance.user._id), priority: 'low' })).status).toBe(403);
    expect((await patch(ctx.warden.agent, c, 'assign', { assignedTo: String(ctx.maintenance.user._id), priority: 'asap' })).status).toBe(400);

    const ok = await assign(String(ctx.maintenance.user._id), 'urgent');
    expect(ok.status).toBe(200);
    expect(ok.body.data.complaint).toMatchObject({ status: 'assigned', priority: 'urgent', assignedTo: { name: 'Mo Maintenance' } });
    expect(ok.body.data.complaint.statusHistory.at(-1).assignedTo.name).toBe('Mo Maintenance');
  });

  it('runs the happy path: progress -> resolve -> close, with a full timeline and audit trail', async () => {
    const ctx = await setup();
    const c = await file(ctx);
    await advance(ctx, c, 'assigned');

    const prog = await patch(ctx.maintenance.agent, c, 'progress', { progressNote: 'Ordered a new washer', photoUrl: PHOTO });
    expect(prog.status).toBe(200);
    expect(prog.body.data.complaint.status).toBe('in_progress');
    expect(prog.body.data.complaint.actions.sort()).toEqual(['progress', 'resolve']);
    const again = await patch(ctx.maintenance.agent, c, 'progress', { progressNote: 'Washer arrived' });
    expect(again.body.data.complaint.statusHistory.at(-1)).toMatchObject({ status: 'in_progress', fromStatus: 'in_progress', progressNote: 'Washer arrived' });

    expect((await patch(ctx.maintenance.agent, c, 'resolve', {})).status).toBe(400); // notes required
    expect((await patch(ctx.maintenance.agent, c, 'resolve', { resolutionNotes: '' })).status).toBe(400);
    const done = await patch(ctx.maintenance.agent, c, 'resolve', { resolutionNotes: 'Washer replaced', completionPhotoUrl: PHOTO });
    expect(done.body.data.complaint).toMatchObject({ status: 'resolved', resolutionNotes: 'Washer replaced' });
    expect(done.body.data.complaint.resolvedAt).toBeTruthy();
    expect(done.body.data.complaint.slaState).toBeNull();
    expect((await patch(ctx.maintenance.agent, c, 'close')).status).toBe(403); // not their call

    const closed = await patch(ctx.warden.agent, c, 'close', { note: 'Verified with student' });
    expect(closed.body.data.complaint.status).toBe('closed');
    expect(closed.body.data.complaint.closedAt).toBeTruthy();

    const history = (await ctx.students[0].agent.get(`/api/complaints/${c.id}`)).body.data.complaint.statusHistory;
    expect(history.map((h) => [h.fromStatus, h.status])).toEqual([
      [null, 'new'], ['new', 'acknowledged'], ['acknowledged', 'assigned'], ['assigned', 'in_progress'],
      ['in_progress', 'in_progress'], ['in_progress', 'resolved'], ['resolved', 'closed'],
    ]);
    expect(history[3].completionPhotoUrl).toBe(PHOTO); // photo attached to a progress update
    expect(history[4].completionPhotoUrl).toBeUndefined();
    expect(history[5].completionPhotoUrl).toBe(PHOTO);
    expect(history.every((h, i) => i === 0 || new Date(h.at) >= new Date(history[i - 1].at))).toBe(true);

    const audit = (await AuditLog.find({ entityId: c.id }).sort({ at: 1 }).lean()).map((a) => a.action);
    expect(audit).toEqual(['complaint.create', 'complaint.acknowledge', 'complaint.assign', 'complaint.progress', 'complaint.progress', 'complaint.resolve', 'complaint.close']);
  });

  it('enforces the state machine with 409s', async () => {
    const ctx = await setup();
    const c = await file(ctx);
    expect((await patch(ctx.warden.agent, c, 'close')).status).toBe(409); // not resolved
    await advance(ctx, c, 'acknowledged');
    expect((await patch(ctx.warden.agent, c, 'close')).status).toBe(409);
    expect((await patch(ctx.owner, c, 'resolve', { resolutionNotes: 'done' })).status).toBe(409); // not in progress
    expect((await patch(ctx.owner, c, 'progress', { progressNote: 'start' })).status).toBe(409); // nobody assigned
    await advance(ctx, c, 'assigned');
    expect((await patch(ctx.maintenance.agent, c, 'resolve', { resolutionNotes: 'skipped ahead' })).status).toBe(409);
    await advance(ctx, c, 'in_progress');
    expect((await patch(ctx.warden.agent, c, 'close')).status).toBe(409);
    expect((await ctx.owner.post(`/api/complaints/${c.id}/reopen`).send({ reason: 'too early' })).status).toBe(409);
    expect((await patch(ctx.warden.agent, c, 'acknowledge')).status).toBe(409);
  });

  it('only the assignee or an owner can progress/resolve', async () => {
    const ctx = await setup();
    const c = await file(ctx);
    await advance(ctx, c, 'assigned');
    expect((await patch(ctx.warden.agent, c, 'progress', { progressNote: 'not mine' })).status).toBe(403);
    expect((await patch(ctx.students[0].agent, c, 'progress', { progressNote: 'nope' })).status).toBe(403);
    expect((await patch(ctx.owner, c, 'progress', { progressNote: 'Owner stepping in' })).status).toBe(200);
    expect((await patch(ctx.owner, c, 'resolve', { resolutionNotes: 'Fixed by owner' })).status).toBe(200);
  });

  it('serialises concurrent transitions', async () => {
    const ctx = await setup();
    const c = await file(ctx);
    const results = await Promise.all(Array.from({ length: 5 }, () => patch(ctx.warden.agent, c, 'acknowledge')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await Complaint.findById(c.id)).statusHistory).toHaveLength(2);
    expect(await AuditLog.countDocuments({ action: 'complaint.acknowledge' })).toBe(1);
  });
});

describe('reopening', () => {
  it('lets the student reopen a resolved complaint, resetting the SLA and appending history', async () => {
    const ctx = await setup();
    const c = await file(ctx, 0, { urgency: 'high' });
    await advance(ctx, c, 'resolved');
    const before = await Complaint.findById(c.id);
    const view = (await ctx.students[0].agent.get(`/api/complaints/${c.id}`)).body.data.complaint;
    expect(view.actions).toEqual(['reopen']);

    expect((await ctx.students[1].agent.post(`/api/complaints/${c.id}/reopen`).send({ reason: 'not mine' })).status).toBe(404);
    expect((await ctx.students[0].agent.post(`/api/complaints/${c.id}/reopen`).send({})).status).toBe(400);
    const res = await ctx.students[0].agent.post(`/api/complaints/${c.id}/reopen`).send({ reason: 'Leaking again' });
    expect(res.status).toBe(200);
    const out = res.body.data.complaint;
    expect(out).toMatchObject({ status: 'reopened', reopenedCount: 1 });
    expect(out.reopenedAt).toBeTruthy();
    expect(new Date(out.slaDueAt) > new Date(before.slaDueAt)).toBe(true);
    expect(out.statusHistory.at(-1)).toMatchObject({ status: 'reopened', fromStatus: 'resolved', note: 'Leaking again', by: { role: 'student' } });
    expect(out.statusHistory).toHaveLength(before.statusHistory.length + 1);

    // reopened -> in_progress -> resolved again, assignee unchanged
    expect((await patch(ctx.maintenance.agent, c, 'progress', { progressNote: 'Back on site' })).body.data.complaint.status).toBe('in_progress');
    expect((await patch(ctx.maintenance.agent, c, 'resolve', { resolutionNotes: 'Proper fix this time' })).body.data.complaint.status).toBe('resolved');
  });

  it('enforces the 14-day window and the 3-reopen limit for students', async () => {
    const ctx = await setup();
    const c = await file(ctx);
    await advance(ctx, c, 'closed');
    await Complaint.updateOne({ _id: c.id }, { resolvedAt: addDays(new Date(), -15) });
    const stale = await ctx.students[0].agent.post(`/api/complaints/${c.id}/reopen`).send({ reason: 'too late' });
    expect(stale.status).toBe(409);
    expect((await ctx.students[0].agent.get(`/api/complaints/${c.id}`)).body.data.complaint.actions).toEqual([]);

    // Staff are not bound by the window.
    expect((await patch(ctx.warden.agent, c, 'reopen', { reason: 'Warden follow-up' })).status).toBe(200);

    const d = await file(ctx);
    await advance(ctx, d, 'resolved');
    await Complaint.updateOne({ _id: d.id }, { reopenedCount: 3 });
    expect((await ctx.students[0].agent.post(`/api/complaints/${d.id}/reopen`).send({ reason: 'again' })).status).toBe(409);
  });

  it('allows owner/warden to reopen, and not before resolution', async () => {
    const ctx = await setup();
    const c = await file(ctx);
    expect((await ctx.students[0].agent.post(`/api/complaints/${c.id}/reopen`).send({ reason: 'not resolved' })).status).toBe(409);
    expect((await patch(ctx.warden.agent, c, 'reopen', { reason: 'nothing to reopen' })).status).toBe(409);
    await advance(ctx, c, 'closed');
    expect((await ctx.owner.post(`/api/complaints/${c.id}/reopen`).send({ reason: 'Owner check' })).status).toBe(200);
    expect((await ctx.warden.agent.post(`/api/complaints/${c.id}/reopen`).send({ reason: 'x y z' })).status).toBe(409); // wardens may use POST too; it is already reopened
    expect((await patch(ctx.students[0].agent, c, 'reopen', { reason: 'wrong verb' })).status).toBe(403);
  });
});

describe('visibility and filters', () => {
  it('shows maintenance only what is assigned to them', async () => {
    const ctx = await setup();
    const mine = await file(ctx, 0);
    const other = await file(ctx, 1);
    await advance(ctx, mine, 'assigned');
    await advance(ctx, other, 'acknowledged');

    const list = await ctx.maintenance.agent.get('/api/complaints');
    expect(list.body.data.items.map((x) => x.id)).toEqual([mine.id]);
    expect((await ctx.maintenance.agent.get(`/api/complaints/${other.id}`)).status).toBe(404);
    expect((await patch(ctx.maintenance.agent, other, 'progress', { progressNote: 'sneaky' })).status).toBe(404);
    expect((await ctx.maintenance.agent.get(`/api/complaints?propertyId=${ctx.property.id}&assignedTo=${new mongoose.Types.ObjectId()}`)).body.data.items).toHaveLength(1);

    const second = await createStaff('maintenance', ctx.property.id);
    expect((await second.agent.get('/api/complaints')).body.data.items).toHaveLength(0);
    expect((await second.agent.get(`/api/complaints/${mine.id}`)).status).toBe(404);
    expect((await second.agent.get('/api/complaints/summary')).status).toBe(403);
  });

  it('scopes staff to their properties', async () => {
    const ctx = await setup();
    const c = await file(ctx);
    const stranger = await registerOwner();
    expect((await stranger.get(`/api/complaints/${c.id}`)).status).toBe(404);
    expect((await stranger.get('/api/complaints')).body.data.items).toHaveLength(0);
    expect((await stranger.get(`/api/complaints?propertyId=${ctx.property.id}`)).status).toBe(404);
    expect((await patch(stranger, c, 'acknowledge')).status).toBe(404);
    const outsider = await createStaff('warden'); // a warden with no grant on this property
    expect((await outsider.agent.get(`/api/complaints/${c.id}`)).status).toBe(404);
    expect((await patch(outsider.agent, c, 'acknowledge')).status).toBe(404);
    expect((await ctx.warden.agent.get(`/api/complaints?propertyId=${ctx.property.id}`)).body.data.items).toHaveLength(1);
  });

  it('filters by status, priority, assignee and overdue (unresolved only)', async () => {
    const ctx = await setup();
    const overdueNew = await file(ctx, 0, { urgency: 'high' });
    const overdueResolved = await file(ctx, 0, { urgency: 'high' });
    const fresh = await file(ctx, 1, { urgency: 'low' });
    await advance(ctx, overdueResolved, 'resolved');
    await advance(ctx, fresh, 'assigned');
    const past = addDays(new Date(), -2);
    await Complaint.updateMany({ _id: { $in: [overdueNew.id, overdueResolved.id] } }, { slaDueAt: past });

    const overdue = await ctx.warden.agent.get('/api/complaints?overdueOnly=true');
    expect(overdue.body.data.items.map((x) => x.id)).toEqual([overdueNew.id]);
    expect(overdue.body.data.items[0].slaState).toBe('overdue');
    expect((await ctx.warden.agent.get('/api/complaints?overdueOnly=false')).body.data.items).toHaveLength(3);
    expect((await ctx.warden.agent.get('/api/complaints?status=assigned')).body.data.items.map((x) => x.id)).toEqual([fresh.id]);
    expect((await ctx.warden.agent.get('/api/complaints?priority=high')).body.data.items.map((x) => x.id).sort()).toEqual([overdueResolved.id, fresh.id].sort());
    expect((await ctx.warden.agent.get(`/api/complaints?assignedTo=${ctx.maintenance.user._id}`)).body.data.items).toHaveLength(2);
    expect((await ctx.warden.agent.get('/api/complaints?limit=1&page=2')).body.data).toMatchObject({ items: [expect.anything()], pagination: { total: 3, pages: 3 } });
    expect((await ctx.warden.agent.get('/api/complaints?status=bogus')).status).toBe(400);
  });

  it('summarises for the dashboard', async () => {
    const ctx = await setup();
    const a = await file(ctx, 0, { urgency: 'high' }); // stays new
    const b = await file(ctx, 0);
    const c = await file(ctx, 1);
    const d = await file(ctx, 1);
    const e = await file(ctx, 1);
    await advance(ctx, b, 'assigned');
    await advance(ctx, c, 'in_progress');
    await advance(ctx, d, 'resolved');
    await advance(ctx, e, 'closed');
    await Complaint.updateOne({ _id: a.id }, { slaDueAt: addDays(new Date(), -1) });

    const res = await ctx.warden.agent.get(`/api/complaints/summary?propertyId=${ctx.property.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({ open: 1, assigned: 1, inProgress: 1, resolvedToday: 2, closed: 1, overdue: 1 });
    expect(res.body.data.summary.byPriority).toMatchObject({ high: 2, unset: 1 });
    expect((await ctx.students[0].agent.get('/api/complaints/summary')).status).toBe(403);
    expect((await (await registerOwner()).get(`/api/complaints/summary?propertyId=${ctx.property.id}`)).status).toBe(404);
  });

  it('lists assignable staff', async () => {
    const ctx = await setup();
    await createStaff('maintenance'); // other property: excluded
    const res = await ctx.warden.agent.get(`/api/complaints/assignees?propertyId=${ctx.property.id}`);
    expect(res.body.data.items.map((u) => u.name).sort()).toEqual(['Mo Maintenance', 'warden user']);
    expect((await ctx.students[0].agent.get(`/api/complaints/assignees?propertyId=${ctx.property.id}`)).status).toBe(403);
  });

  it('never deletes complaints and declares its indexes', async () => {
    const ctx = await setup();
    const c = await file(ctx);
    await expect(Complaint.deleteOne({ _id: c.id })).rejects.toThrow();
    const idx = (await Complaint.collection.indexes()).map((i) => JSON.stringify(i.key));
    for (const key of [{ property: 1, status: 1 }, { assignedTo: 1, status: 1 }, { resident: 1 }, { slaDueAt: 1, status: 1 }, { complaintNumber: 1 }]) {
      expect(idx).toContain(JSON.stringify(key));
    }
    expect((await Complaint.collection.indexes()).find((i) => i.key.complaintNumber)).toMatchObject({ unique: true });
  });
});

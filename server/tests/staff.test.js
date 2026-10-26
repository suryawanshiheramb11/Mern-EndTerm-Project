import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { DEFAULT_PERMISSIONS } from '../src/config/permissions.js';
import { User } from '../src/models/User.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { checkIn, createStaff, day, generateCharges, makeProperty, pay, password, registerOwner, wipeAll, world } from './helpers.js';

const invite = (owner, propertyId, body) => owner.post(`/api/properties/${propertyId}/staff/invite`).send(body);

// Invites, accepts and logs in a staff member.
const onboard = async (owner, propertyId, body) => {
  const res = await invite(owner, propertyId, body);
  await request(app).post('/api/auth/reset-password').send({ token: res.body.data.inviteToken, password });
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email: body.email, password });
  return { agent, res, login };
};

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(wipeAll);

describe('staff invitations', () => {
  it('creates an invited warden with default permissions and a one-time token', async () => {
    const owner = await registerOwner();
    const { property } = await makeProperty(owner);
    const res = await invite(owner, property.id, { email: 'Wanda@Example.com', name: 'Wanda Warden', role: 'warden' });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'wanda@example.com', role: 'warden', status: 'invited', permissions: DEFAULT_PERMISSIONS.warden });
    expect(res.body.data.inviteToken).toHaveLength(64);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|passwordResetToken/);

    const stored = await User.findOne({ email: 'wanda@example.com' });
    expect(stored.propertyAccess[0]).toMatchObject({ role: 'warden', permissions: DEFAULT_PERMISSIONS.warden });
    expect(String(stored.propertyAccess[0].property)).toBe(property.id);

    const early = await request(app).post('/api/auth/login').send({ email: 'wanda@example.com', password: 'Whatever123' });
    expect(early.status).toBe(401); // nothing works until the invite is accepted
    const maint = await invite(owner, property.id, { email: 'm@example.com', name: 'Mo Maint', role: 'maintenance' });
    expect(maint.body.data.user.permissions).toEqual(DEFAULT_PERMISSIONS.maintenance);
  });

  it('validates input and guards who can invite', async () => {
    const owner = await registerOwner();
    const { property } = await makeProperty(owner);
    const ok = { email: 'a@example.com', name: 'Aaa Bbb', role: 'warden' };
    expect((await invite(owner, property.id, { ...ok, role: 'student' })).status).toBe(400);
    expect((await invite(owner, property.id, { ...ok, role: 'owner' })).status).toBe(400);
    expect((await invite(owner, property.id, { ...ok, permissions: ['payments.record', 'god.mode'] })).status).toBe(400);
    expect((await invite(owner, property.id, { ...ok, email: 'nope' })).status).toBe(400);
    expect((await invite(owner, property.id, { ...ok, extra: 1 })).status).toBe(400);
    expect((await invite(owner, property.id, ok)).status).toBe(201);
    expect((await invite(owner, property.id, ok)).status).toBe(409); // email already taken
    expect((await invite(owner, property.id, { ...ok, email: owner.email })).status).toBe(409);

    const stranger = await registerOwner();
    expect((await invite(stranger, property.id, { ...ok, email: 'b@example.com' })).status).toBe(404);
    const warden = await createStaff('warden', property.id);
    expect((await invite(warden, property.id, { ...ok, email: 'c@example.com' })).status).toBe(403);
    expect((await warden.get(`/api/properties/${property.id}/staff`)).status).toBe(403);
    expect((await request(app).post(`/api/properties/${property.id}/staff/invite`).send(ok)).status).toBe(401);
    expect(await User.countDocuments({ role: 'student' })).toBe(0);
  });

  it('lists staff for the property only', async () => {
    const owner = await registerOwner();
    const { property } = await makeProperty(owner);
    const other = await registerOwner();
    const { property: otherProperty } = await makeProperty(other);
    await invite(owner, property.id, { email: 'one@example.com', name: 'One Warden', role: 'warden' });
    await invite(other, otherProperty.id, { email: 'two@example.com', name: 'Two Warden', role: 'warden' });
    const list = await owner.get(`/api/properties/${property.id}/staff`);
    expect(list.body.data.items.map((u) => u.email)).toEqual(['one@example.com']);
    expect((await other.get(`/api/properties/${property.id}/staff`)).status).toBe(404);
  });
});

describe('permissions are enforced server-side', () => {
  it('limits a warden to exactly what the owner grants, and changes apply immediately', async () => {
    const ctx = await world();
    const { owner, property } = ctx;
    const { agent: warden, login } = await onboard(owner, property.id, { email: 'w@example.com', name: 'Wanda Warden', role: 'warden' });
    expect(login.status).toBe(200);

    // Defaults: residents.view/edit, payments.record/view, complaints.manage
    expect((await warden.get(`/api/residents/${ctx.resident.id}`)).status).toBe(200);
    expect((await warden.post('/api/residents').send({ propertyId: property.id, fullName: 'Added By Warden', phone: '9876501234' })).status).toBe(201);
    await generateCharges(owner, property.id);
    expect((await pay(warden, ctx, 100000)).status).toBe(201);
    expect((await warden.get(`/api/payments?propertyId=${property.id}`)).status).toBe(200);
    expect((await warden.get(`/api/rent-charges?propertyId=${property.id}`)).status).toBe(200);

    // ...but no finances, no settings, no owner powers.
    expect((await warden.get(`/api/reports/overview?propertyId=${property.id}`)).status).toBe(403);
    expect((await warden.get(`/api/expenses?propertyId=${property.id}`)).status).toBe(403);
    expect((await warden.post('/api/expenses').send({ propertyId: property.id, category: 'water', amountPaise: 100, paidAt: day(0), description: 'water' })).status).toBe(403);
    expect((await warden.post(`/api/properties/${property.id}/rooms`).send({ number: '999', capacity: 2 })).status).toBe(403);
    expect((await warden.post('/api/rent-charges/generate').send({ propertyId: property.id, periodKey: '2026-12' })).status).toBe(403);

    // Grant finances.view: reports and expense reads open up, expense writes stay closed.
    const user = (await owner.get(`/api/properties/${property.id}/staff`)).body.data.items[0];
    const grant = await owner.patch(`/api/properties/${property.id}/staff/${user.id}`).send({ permissions: [...DEFAULT_PERMISSIONS.warden, 'finances.view'] });
    expect(grant.status).toBe(200);
    expect(grant.body.data.user.permissions).toContain('finances.view');
    expect((await warden.get(`/api/reports/overview?propertyId=${property.id}`)).status).toBe(200);
    expect((await warden.get(`/api/expenses?propertyId=${property.id}`)).status).toBe(200);
    expect((await warden.post('/api/expenses').send({ propertyId: property.id, category: 'water', amountPaise: 100, paidAt: day(0), description: 'water' })).status).toBe(403);
    await owner.patch(`/api/properties/${property.id}/staff/${user.id}`).send({ permissions: [...DEFAULT_PERMISSIONS.warden, 'finances.view', 'finances.edit'] });
    expect((await warden.post('/api/expenses').send({ propertyId: property.id, category: 'water', amountPaise: 100, paidAt: day(0), description: 'water' })).status).toBe(201);
    expect((await warden.delete(`/api/expenses/${(await warden.get(`/api/expenses?propertyId=${property.id}`)).body.data.items[0].id}`).send({})).status).toBe(403); // voiding is owner-only

    // reports.view alone also unlocks reports (but not expenses)
    await owner.patch(`/api/properties/${property.id}/staff/${user.id}`).send({ permissions: ['reports.view'] });
    expect((await warden.get(`/api/reports/trend?propertyId=${property.id}`)).status).toBe(200);
    expect((await warden.get(`/api/expenses?propertyId=${property.id}`)).status).toBe(403);
    expect((await pay(warden, ctx, 100000)).status).toBe(403); // payments.record removed
    expect((await warden.get(`/api/residents/${ctx.resident.id}`)).status).toBe(403);
  });

  it('lets an owner narrow a warden to read-only and complaints', async () => {
    const ctx = await world();
    const { agent: warden, res } = await onboard(ctx.owner, ctx.property.id, { email: 'ro@example.com', name: 'Read Only', role: 'warden', permissions: ['residents.view'] });
    expect((await warden.get(`/api/residents/${ctx.resident.id}`)).status).toBe(200);
    expect((await warden.post('/api/residents').send({ propertyId: ctx.property.id, fullName: 'Nope Nope', phone: '9876501234' })).status).toBe(403);
    expect((await warden.get(`/api/payments?propertyId=${ctx.property.id}`)).status).toBe(403);
    expect((await checkIn(warden, ctx.resident.id, ctx.beds[1].id)).status).toBe(403);
    expect(res.body.data.user.permissions).toEqual(['residents.view']);

    const c = (await ctx.student.post('/api/complaints').send({ category: 'other', title: 'Noisy room', description: 'Very noisy at night', urgency: 'low' })).body.data.complaint;
    expect((await warden.patch(`/api/complaints/${c.id}/acknowledge`).send({})).status).toBe(403); // no complaints.manage
  });

  it('revoking removes access but never deletes the account', async () => {
    const ctx = await world();
    const { agent: warden } = await onboard(ctx.owner, ctx.property.id, { email: 'rv@example.com', name: 'Revoked Person', role: 'warden' });
    const user = (await ctx.owner.get(`/api/properties/${ctx.property.id}/staff`)).body.data.items[0];
    expect((await warden.get(`/api/residents/${ctx.resident.id}`)).status).toBe(200);

    const res = await ctx.owner.delete(`/api/properties/${ctx.property.id}/staff/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ revoked: true });
    expect((await warden.get(`/api/residents/${ctx.resident.id}`)).status).toBe(404);
    expect((await warden.get('/api/auth/me')).status).toBe(200); // still a valid account
    const stored = await User.findById(user.id);
    expect(stored).toBeTruthy();
    expect(stored.propertyAccess).toHaveLength(0);
    expect((await ctx.owner.get(`/api/properties/${ctx.property.id}/staff`)).body.data.items).toHaveLength(0);
    expect((await ctx.owner.delete(`/api/properties/${ctx.property.id}/staff/${user.id}`)).status).toBe(404);
  });

  it('validates permission updates, role changes and ownership of the target', async () => {
    const ctx = await world();
    await onboard(ctx.owner, ctx.property.id, { email: 'u@example.com', name: 'Update Me', role: 'maintenance' });
    const user = (await ctx.owner.get(`/api/properties/${ctx.property.id}/staff`)).body.data.items[0];
    const url = `/api/properties/${ctx.property.id}/staff/${user.id}`;
    expect((await ctx.owner.patch(url).send({})).status).toBe(400);
    expect((await ctx.owner.patch(url).send({ permissions: ['nonsense'] })).status).toBe(400);
    expect((await ctx.owner.patch(url).send({ role: 'owner' })).status).toBe(400);
    const changed = await ctx.owner.patch(url).send({ role: 'warden' });
    expect(changed.body.data.user.role).toBe('warden');
    expect((await User.findById(user.id)).role).toBe('warden');

    const stranger = await registerOwner();
    expect((await stranger.patch(url).send({ permissions: [] })).status).toBe(404);
    expect((await stranger.delete(url)).status).toBe(404);
    const other = await makeProperty(stranger);
    expect((await stranger.patch(`/api/properties/${other.property.id}/staff/${user.id}`).send({ permissions: [] })).status).toBe(404); // not their staff
    expect((await ctx.owner.patch(`/api/properties/${ctx.property.id}/staff/${ctx.student.userId}`).send({ permissions: [] })).status).toBe(404); // students are not staff
  });

  it('records staff changes in the audit log', async () => {
    const ctx = await world();
    await onboard(ctx.owner, ctx.property.id, { email: 'a@example.com', name: 'Audit Me', role: 'warden' });
    const user = (await ctx.owner.get(`/api/properties/${ctx.property.id}/staff`)).body.data.items[0];
    await ctx.owner.patch(`/api/properties/${ctx.property.id}/staff/${user.id}`).set('User-Agent', 'vitest-suite').send({ permissions: ['residents.view'] });
    await ctx.owner.delete(`/api/properties/${ctx.property.id}/staff/${user.id}`);
    const rows = await AuditLog.find({ entityId: user.id }).sort({ at: 1 }).lean();
    expect(rows.map((r) => r.action)).toEqual(['staff.invite', 'staff.update', 'staff.revoke']);
    expect(rows[1]).toMatchObject({ entityType: 'User', before: { permissions: DEFAULT_PERMISSIONS.warden }, after: { permissions: ['residents.view'] } });
    expect(String(rows[0].user)).toBe(ctx.owner.userId);
    expect(String(rows[0].property)).toBe(ctx.property.id);
    expect(rows[0].ip).toBeTruthy();
    expect(rows[1].userAgent).toBe('vitest-suite');
  });
});


import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { LoginOtp } from '../src/models/LoginOtp.js';
import { User } from '../src/models/User.js';
import { login } from '../src/services/auth.service.js';
import { outbox } from '../src/services/emailTransport.js';
import { addResident, checkIn, createStaff, makeProperty, registerOwner, unique, wipeAll, world } from './helpers.js';

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(wipeAll);
afterEach(() => vi.unstubAllGlobals());

const loginAs = async (email, password) => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  return { agent, res };
};

describe('owner hands out staff credentials', () => {
  it('creates a warden login with a generated password that must be changed before anything else works', async () => {
    const owner = await registerOwner();
    const { property } = await makeProperty(owner);
    const created = await owner.post(`/api/properties/${property.id}/staff/create`).send({ name: 'Wanda Warden', email: 'wanda@example.com', role: 'warden' });
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toMatch(/no-store/);
    const temp = created.body.data.temporaryPassword;
    expect(temp).toMatch(/^[A-Za-z0-9]{14}$/);
    expect(created.body.data.user.permissions).toContain('payments.record');

    const { agent, res } = await loginAs('wanda@example.com', temp);
    expect(res.status).toBe(200);
    expect(res.body.data.user.mustChangePassword).toBe(true);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const blocked = await agent.get('/api/residents');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // wrong current password, same password, then success
    expect((await agent.post('/api/auth/change-password').send({ currentPassword: 'Nope12345', newPassword: 'BrandNew2026x' })).status).toBe(400);
    expect((await agent.post('/api/auth/change-password').send({ currentPassword: temp, newPassword: temp })).status).toBe(400);
    const changed = await agent.post('/api/auth/change-password').send({ currentPassword: temp, newPassword: 'BrandNew2026x' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.user.mustChangePassword).toBe(false);
    expect((await agent.get('/api/residents')).status).toBe(200);

    expect((await loginAs('wanda@example.com', temp)).res.status).toBe(401); // temporary password is dead
    expect((await loginAs('wanda@example.com', 'BrandNew2026x')).res.status).toBe(200);

    // audited, and the password is nowhere in the audit trail
    const audit = await AuditLog.find({ action: 'staff.credentials.create' }).lean();
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(temp);
  });

  it('accepts an owner-chosen password, resets it later, and signs the person out', async () => {
    const owner = await registerOwner();
    const { property } = await makeProperty(owner);
    const made = await owner.post(`/api/properties/${property.id}/staff/create`).send({ name: 'Mo Maint', email: 'mo@example.com', role: 'maintenance', password: 'Chosen12345' });
    expect(made.body.data.temporaryPassword).toBe('Chosen12345');
    const { agent } = await loginAs('mo@example.com', 'Chosen12345');
    await agent.post('/api/auth/change-password').send({ currentPassword: 'Chosen12345', newPassword: 'Another2026pw' });
    expect((await agent.get('/api/complaints')).status).toBe(200);

    const reset = await owner.post(`/api/properties/${property.id}/staff/${made.body.data.user.id}/reset-password`).send({});
    expect(reset.status).toBe(200);
    expect((await agent.get('/api/complaints')).status).toBe(401); // old session is gone
    expect((await loginAs('mo@example.com', 'Another2026pw')).res.status).toBe(401);
    expect((await loginAs('mo@example.com', reset.body.data.temporaryPassword)).res.body.data.user.mustChangePassword).toBe(true);
  });

  it('is owner-only, property-scoped, and refuses duplicates and weak passwords', async () => {
    const ownerA = await registerOwner();
    const ownerB = await registerOwner();
    const { property } = await makeProperty(ownerA);
    const warden = await createStaff('warden', property.id);
    const body = { name: 'Nina New', email: 'nina@example.com', role: 'warden' };
    expect((await warden.post(`/api/properties/${property.id}/staff/create`).send(body)).status).toBe(403);
    expect((await ownerB.post(`/api/properties/${property.id}/staff/create`).send(body)).status).toBeGreaterThanOrEqual(403);
    expect((await request(app).post(`/api/properties/${property.id}/staff/create`).send(body)).status).toBe(401);
    expect((await ownerA.post(`/api/properties/${property.id}/staff/create`).send({ ...body, password: 'short' })).status).toBe(400);
    expect((await ownerA.post(`/api/properties/${property.id}/staff/create`).send({ ...body, role: 'student' })).status).toBe(400);
    expect((await ownerA.post(`/api/properties/${property.id}/staff/create`).send({ ...body, role: 'owner' })).status).toBe(400);
    expect((await ownerA.post(`/api/properties/${property.id}/staff/create`).send(body)).status).toBe(201);
    expect((await ownerA.post(`/api/properties/${property.id}/staff/create`).send(body)).status).toBe(409);
  });
});

describe('student credentials, email and details', () => {
  it('gives a resident a login, resets it, and changes the email (signing them out)', async () => {
    const owner = await registerOwner();
    const { property, beds } = await makeProperty(owner);
    const resident = await addResident(owner, property.id, { email: 'stu@example.com' });
    await checkIn(owner, resident.id, beds[0].id);

    const made = await owner.post(`/api/residents/${resident.id}/credentials`).send({});
    expect(made.status).toBe(201);
    const temp = made.body.data.temporaryPassword;
    const stu = await loginAs('stu@example.com', temp);
    expect(stu.res.body.data.user).toMatchObject({ role: 'student', mustChangePassword: true });
    await stu.agent.post('/api/auth/change-password').send({ currentPassword: temp, newPassword: 'StudentNew2026' });
    expect((await stu.agent.get('/api/me/stay')).status).toBe(200);

    const again = await owner.post(`/api/residents/${resident.id}/credentials`).send({});
    expect(again.status).toBe(200);
    expect(again.body.data.created ?? false).toBe(false);
    expect((await stu.agent.get('/api/me/stay')).status).toBe(401);

    const changed = await owner.patch(`/api/residents/${resident.id}/account-email`).send({ email: 'new.address@example.com' });
    expect(changed.status).toBe(200);
    expect((await loginAs('stu@example.com', again.body.data.temporaryPassword)).res.status).toBe(401);
    expect((await loginAs('new.address@example.com', again.body.data.temporaryPassword)).res.status).toBe(200);
    expect((await User.findOne({ email: 'new.address@example.com' })).emailVerified).toBe(false);
    expect(await AuditLog.countDocuments({ action: 'student.email.change' })).toBe(1);

    const other = await addResident(owner, property.id, { email: 'taken@example.com' });
    await owner.post(`/api/residents/${other.id}/credentials`).send({});
    expect((await owner.patch(`/api/residents/${resident.id}/account-email`).send({ email: 'taken@example.com' })).status).toBe(409);
  });

  it('keeps these actions away from students, maintenance and other properties', async () => {
    const ctx = await world();
    const maint = await createStaff('maintenance', ctx.property.id);
    const otherOwner = await registerOwner();
    for (const [who, agent] of [['student', ctx.student], ['maintenance', maint]]) {
      expect((await agent.post(`/api/residents/${ctx.resident.id}/credentials`).send({})).status, who).toBe(403);
      expect((await agent.patch(`/api/residents/${ctx.resident.id}/account-email`).send({ email: 'x@example.com' })).status, who).toBe(403);
    }
    expect((await otherOwner.post(`/api/residents/${ctx.resident.id}/credentials`).send({})).status).toBe(404);
    expect((await otherOwner.patch(`/api/residents/${ctx.resident.id}/account-email`).send({ email: 'x@example.com' })).status).toBe(404);
  });

  it('stores guardian, medical and personal details; hides them from maintenance; students edit only their own', async () => {
    const ctx = await world();
    const maint = await createStaff('maintenance', ctx.property.id);
    const patch = {
      guardian: { name: 'Ramesh Sharma', relation: 'Father', phone: '9876543210', email: 'ramesh@example.com' },
      medical: { bloodGroup: 'B+', allergies: 'Penicillin', conditions: 'Asthma', doctorName: 'Dr Rao', doctorPhone: '9000000001' },
      dateOfBirth: '2004-05-17', gender: 'male', institution: 'COEP', permanentAddress: '4 Lake Road, Nashik',
    };
    const saved = await ctx.owner.patch(`/api/residents/${ctx.resident.id}`).send(patch);
    expect(saved.status).toBe(200);
    expect(saved.body.data.resident.medical).toMatchObject({ bloodGroup: 'B+', allergies: 'Penicillin' });
    expect(saved.body.data.resident.guardian.name).toBe('Ramesh Sharma');

    // a later partial patch keeps the siblings
    await ctx.owner.patch(`/api/residents/${ctx.resident.id}`).send({ medical: { allergies: 'None known' } });
    const fetched = (await ctx.owner.get(`/api/residents/${ctx.resident.id}`)).body.data.resident;
    expect(fetched.medical).toMatchObject({ bloodGroup: 'B+', allergies: 'None known', conditions: 'Asthma' });

    expect((await maint.get(`/api/residents/${ctx.resident.id}`)).status).toBe(403);

    expect((await ctx.owner.patch(`/api/residents/${ctx.resident.id}`).send({ medical: { bloodGroup: 'Z+' } })).status).toBe(400);
    expect((await ctx.owner.patch(`/api/residents/${ctx.resident.id}`).send({ medical: { shoeSize: 9 } })).status).toBe(400);
    expect((await ctx.owner.patch(`/api/residents/${ctx.resident.id}`).send({ dateOfBirth: '2999-01-01' })).status).toBe(400);

    const own = await ctx.student.patch('/api/me/details').send({ medical: { medications: 'Inhaler' }, guardian: { phone: '9111111111' } });
    expect(own.status).toBe(200);
    expect(own.body.data.resident.medical).toMatchObject({ medications: 'Inhaler', bloodGroup: 'B+' });
    expect((await ctx.student.patch('/api/me/details').send({ fullName: 'Hacker', status: 'former' })).status).toBe(400);
    expect((await ctx.owner.patch('/api/me/details').send({ medical: { allergies: 'x' } })).status).toBe(403);
  });
});

describe('sign-in hardening', () => {
  it('locks an account after ten wrong passwords, even for the right password, then expires', async () => {
    const owner = await registerOwner();
    for (let i = 0; i < 10; i += 1) await expect(login({ email: owner.email, password: 'Wrong-pass-1' }, {})).rejects.toMatchObject({ statusCode: 401 });
    await expect(login({ email: owner.email, password: 'Passw0rdOK' }, {})).rejects.toMatchObject({ statusCode: 429 });
    await User.updateOne({ email: owner.email }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    await expect(login({ email: owner.email, password: 'Passw0rdOK' }, {})).resolves.toBeTruthy();
  });

  it('kills existing sessions when the password changes', async () => {
    const owner = await registerOwner();
    const second = await loginAs(owner.email, 'Passw0rdOK');
    expect((await second.agent.get('/api/auth/me')).status).toBe(200);
    expect((await owner.post('/api/auth/change-password').send({ currentPassword: 'Passw0rdOK', newPassword: 'Different2026x' })).status).toBe(200);
    expect((await second.agent.get('/api/auth/me')).status).toBe(401);
    expect((await owner.get('/api/auth/me')).status).toBe(200); // the changing session got fresh cookies
  });
});

describe('email one-time code sign-in', () => {
  const codeFor = (email) => outbox.filter((m) => m.to === email && /sign-in code/i.test(m.subject)).at(-1)?.text.match(/\b(\d{6})\b/)?.[1];

  it('signs in with the emailed code once, and never reveals whether an email exists', async () => {
    const owner = await registerOwner();
    const unknown = await request(app).post('/api/auth/otp/request').send({ email: 'ghost@example.com' });
    const known = await request(app).post('/api/auth/otp/request').send({ email: owner.email });
    expect([unknown.status, known.status]).toEqual([200, 200]);
    expect(unknown.body.message).toBe(known.body.message);
    expect(codeFor('ghost@example.com')).toBeUndefined();

    const code = codeFor(owner.email);
    expect(code).toMatch(/^\d{6}$/);
    expect(await LoginOtp.findOne({}).lean()).not.toHaveProperty('code'); // only a hash is stored

    const agent = request.agent(app);
    const ok = await agent.post('/api/auth/otp/verify').send({ email: owner.email, code });
    expect(ok.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await request(app).post('/api/auth/otp/verify').send({ email: owner.email, code })).status).toBe(401); // single use
  });

  it('allows five guesses, then the code is dead; resend has a cooldown', async () => {
    const owner = await registerOwner();
    await request(app).post('/api/auth/otp/request').send({ email: owner.email });
    const code = codeFor(owner.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) expect((await request(app).post('/api/auth/otp/verify').send({ email: owner.email, code: wrong })).status).toBe(401);
    expect((await request(app).post('/api/auth/otp/verify').send({ email: owner.email, code })).status).toBe(401);

    outbox.length = 0;
    await LoginOtp.deleteMany({});
    await request(app).post('/api/auth/otp/request').send({ email: owner.email });
    await request(app).post('/api/auth/otp/request').send({ email: owner.email });
    expect(outbox.filter((m) => /sign-in code/i.test(m.subject))).toHaveLength(1);
    expect((await request(app).post('/api/auth/otp/verify').send({ email: owner.email, code: 'abc123' })).status).toBe(400);
  });

  it('activates an invited user who proves their mailbox, and refuses suspended accounts', async () => {
    const owner = await registerOwner();
    const { property } = await makeProperty(owner);
    await owner.post(`/api/properties/${property.id}/staff/invite`).send({ name: 'Ivy Invited', email: 'ivy@example.com', role: 'warden' });
    await request(app).post('/api/auth/otp/request').send({ email: 'ivy@example.com' });
    const res = await request(app).post('/api/auth/otp/verify').send({ email: 'ivy@example.com', code: codeFor('ivy@example.com') });
    expect(res.body.data.user.status).toBe('active');

    await User.updateOne({ email: 'ivy@example.com' }, { status: 'suspended' });
    outbox.length = 0;
    await LoginOtp.deleteMany({});
    await request(app).post('/api/auth/otp/request').send({ email: 'ivy@example.com' });
    expect(codeFor('ivy@example.com')).toBeUndefined();
  });
});

describe('Google sign-in', () => {
  const stubGoogle = (claims, ok = true) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => ({ iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, email_verified: 'true', ...claims }) })));
  const credential = 'x'.repeat(40);

  it('exposes only public configuration', async () => {
    const cfg = (await request(app).get('/api/auth/config')).body.data;
    expect(cfg).toEqual({ googleClientId: env.GOOGLE_CLIENT_ID, otpEnabled: true });
  });

  it('signs in an existing account and activates an invited one', async () => {
    const owner = await registerOwner();
    stubGoogle({ email: owner.email, name: 'Olive' });
    const res = await request(app).post('/api/auth/google').send({ credential });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(owner.email);

    const { property } = await makeProperty(owner);
    await owner.post(`/api/properties/${property.id}/staff/invite`).send({ name: 'Gia', email: 'gia@example.com', role: 'warden' });
    stubGoogle({ email: 'gia@example.com', name: 'Gia' });
    expect((await request(app).post('/api/auth/google').send({ credential })).body.data.user.status).toBe('active');
  });

  it('only creates new accounts as owners and only on the register screen', async () => {
    stubGoogle({ email: `new${unique()}@example.com`, name: 'Newcomer' });
    expect((await request(app).post('/api/auth/google').send({ credential })).status).toBe(404);
    const reg = await request(app).post('/api/auth/google').send({ credential, intent: 'register' });
    expect(reg.status).toBe(200);
    expect(reg.body.data.user).toMatchObject({ role: 'owner', emailVerified: true });
  });

  it('rejects a token for another app, an unverified email, a bad token and a suspended user', async () => {
    const owner = await registerOwner();
    stubGoogle({ email: owner.email, aud: 'someone-elses-app.apps.googleusercontent.com' });
    expect((await request(app).post('/api/auth/google').send({ credential })).status).toBe(401);
    stubGoogle({ email: owner.email, email_verified: 'false' });
    expect((await request(app).post('/api/auth/google').send({ credential })).status).toBe(401);
    stubGoogle({ email: owner.email, iss: 'https://evil.example.com' });
    expect((await request(app).post('/api/auth/google').send({ credential })).status).toBe(401);
    stubGoogle({}, false);
    expect((await request(app).post('/api/auth/google').send({ credential })).status).toBe(401);
    stubGoogle({ email: owner.email });
    await User.updateOne({ email: owner.email }, { status: 'suspended' });
    expect((await request(app).post('/api/auth/google').send({ credential })).status).toBe(403);
    expect((await request(app).post('/api/auth/google').send({ credential: 'short' })).status).toBe(400);
  });
});

describe('roles cannot cross over', () => {
  it('a student, a maintenance user and a warden are each refused the owner-only and staff-only actions', async () => {
    const ctx = await world();
    const warden = await createStaff('warden', ctx.property.id);
    const maint = await createStaff('maintenance', ctx.property.id);
    const ownerOnly = [
      ['post', `/api/properties/${ctx.property.id}/staff/invite`, { name: 'Zed Zed', email: 'zed@example.com', role: 'warden' }],
      ['post', `/api/properties/${ctx.property.id}/staff/create`, { name: 'Zed Zed', email: 'zed@example.com', role: 'warden' }],
      ['get', `/api/properties/${ctx.property.id}/staff`],
      ['post', '/api/rent-charges/generate', { propertyId: ctx.property.id }],
      ['post', '/api/properties', { name: 'Mine Now' }],
    ];
    for (const [who, agent] of [['student', ctx.student], ['maintenance', maint], ['warden', warden]]) {
      for (const [method, url, body] of ownerOnly) {
        const res = await agent[method](url).send(body);
        expect(res.status, `${who} ${method} ${url}`).toBe(403);
      }
    }
    for (const url of ['/api/residents', '/api/reports/overview', '/api/expenses']) {
      expect((await ctx.student.get(url)).status, `student ${url}`).toBe(403);
    }
    expect((await maint.get('/api/payments')).status).toBe(403);
    expect((await ctx.student.get('/api/me/stay')).status).toBe(200);
    expect((await ctx.owner.get('/api/me/stay')).status).toBe(403); // /me/* student endpoints are not for staff either
  });
});

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { addDays, businessToday } from '../src/utils/dates.js';
import { User } from '../src/models/User.js';
import { DEFAULT_PERMISSIONS } from '../src/config/permissions.js';

export const password = 'Passw0rdOK';
export const RENT = 800000;
export const DEPOSIT = 1000000;
export const day = (offset = 0) => addDays(businessToday(), offset).toISOString().slice(0, 10);

// Wipes every collection at the driver level (Mongoose blocks deleting financial records, on purpose).
export const wipeAll = () => Promise.all(Object.values(mongoose.models).map((m) => m.collection.deleteMany({})));

let n = 0;
export const unique = () => {
  n += 1;
  return n;
};

export const registerOwner = async (label = 'Olive Owner') => {
  const i = unique();
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ name: label, email: `owner${i}@example.com`, password, role: 'owner' });
  return Object.assign(agent, { userId: res.body.data.user.id, email: `owner${i}@example.com` });
};

// Staff straight into the database (role, per-property permissions), logged in.
export const createStaff = async (role, propertyId, permissions = DEFAULT_PERMISSIONS[role]) => {
  const i = unique();
  const user = new User({
    name: `${role} ${i}`, email: `${role}${i}@example.com`, role,
    propertyAccess: propertyId ? [{ property: propertyId, role, permissions: [...permissions] }] : [],
  });
  user.password = password;
  await user.save();
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password });
  return Object.assign(agent, { user, userId: String(user._id) });
};

export const makeProperty = async (owner, { beds = 3, rent = RENT } = {}) => {
  const property = (await owner.post('/api/properties').send({ name: 'Sunrise PG', address: { line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001' } })).body.data.property;
  const room = (await owner.post(`/api/properties/${property.id}/rooms`).send({ number: '201', capacity: 30, defaultMonthlyRent: rent / 100 })).body.data.room;
  const created = (await owner.post(`/api/properties/${property.id}/rooms/${room.id}/beds/bulk`).send({ count: beds })).body.data.items;
  return { property, room, beds: created };
};

export const addResident = async (owner, propertyId, extra = {}) => {
  const i = unique();
  const res = await owner.post('/api/residents').send({ propertyId, fullName: `Resident ${i}`, phone: `97${String(10000000 + i).slice(-8)}`, ...extra });
  return res.body.data.resident;
};

export const checkIn = (owner, residentId, bedId, extra = {}) =>
  owner.post('/api/stays').send({ residentId, bedId, action: 'checkin', checkInDate: day(0), depositPaise: DEPOSIT, termsAcknowledged: true, ...extra });

// Invites the resident as a student, accepts the invite and returns a logged-in agent.
export const makeStudent = async (owner, resident) => {
  const invite = await owner.post(`/api/residents/${resident.id}/invite`);
  await request(app).post('/api/auth/reset-password').send({ token: invite.body.data.inviteToken, password: 'StudentPass1' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: resident.email, password: 'StudentPass1' });
  return Object.assign(agent, { userId: invite.body.data.user.id });
};

// Owner + property + one resident with a student login, checked in, with this month's charge.
export const world = async ({ beds = 4 } = {}) => {
  const owner = await registerOwner();
  const { property, room, beds: bedList } = await makeProperty(owner, { beds });
  const i = unique();
  const resident = await addResident(owner, property.id, { email: `student${i}@example.com` });
  const stay = (await checkIn(owner, resident.id, bedList[0].id)).body.data.stay;
  const student = await makeStudent(owner, resident);
  return { owner, property, room, beds: bedList, resident, stay, student };
};

export const currentPeriod = () => businessToday().toISOString().slice(0, 7);

export const generateCharges = (owner, propertyId, periodKey = currentPeriod()) =>
  owner.post('/api/rent-charges/generate').send({ propertyId, periodKey });

export const pay = (agent, ctx, amountPaise, extra = {}) =>
  agent.post('/api/payments').send({ propertyId: ctx.property.id, residentId: ctx.resident.id, amountPaise, method: 'upi', ...extra });

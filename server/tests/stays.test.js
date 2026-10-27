import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { supportsTransactions } from '../src/config/transactions.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { User } from '../src/models/User.js';
import { Property } from '../src/models/Property.js';
import { Room } from '../src/models/Room.js';
import { Bed } from '../src/models/Bed.js';
import { Resident } from '../src/models/Resident.js';
import { Stay } from '../src/models/Stay.js';
import { addDays, businessToday } from '../src/utils/dates.js';
import { getUserPropertyIds } from '../src/services/propertyAccess.service.js';

const password = 'Passw0rdOK';
const day = (offset = 0) => addDays(businessToday(), offset).toISOString().slice(0, 10);

let ownerCount = 0;
const registerOwner = async () => {
  ownerCount += 1;
  const agent = request.agent(app);
  await agent
    .post('/api/auth/register')
    .send({ name: 'Olive Owner', email: `owner${ownerCount}@example.com`, password, role: 'owner' });
  return agent;
};

const createStaff = async (role, propertyAccess = []) => {
  ownerCount += 1;
  const user = new User({ name: `${role} user`, email: `${role}${ownerCount}@example.com`, role, propertyAccess });
  user.password = password;
  await user.save();
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password });
  return agent;
};

// An owner with one property, one room (capacity 6, rent ₹4500) and `beds` beds.
const setup = async ({ beds = 3, roomRent = 450000 } = {}) => {
  const owner = await registerOwner();
  const property = (
    await owner.post('/api/properties').send({
      name: 'Sunrise PG',
      address: { line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001' },
    })
  ).body.data.property;
  const room = (
    await owner
      .post(`/api/properties/${property.id}/rooms`)
      .send({ number: '201', capacity: 6, ...(roomRent && { defaultMonthlyRent: roomRent / 100 }) })
  ).body.data.room;
  const created = (await owner.post(`/api/properties/${property.id}/rooms/${room.id}/beds/bulk`).send({ count: beds })).body.data.items;
  return { owner, property, room, beds: created };
};

let residentCount = 0;
const addResident = async (agent, propertyId, extra = {}) => {
  residentCount += 1;
  const res = await agent
    .post('/api/residents')
    .send({ propertyId, fullName: `Resident ${residentCount}`, phone: `98765432${String(residentCount).padStart(2, '0')}`, ...extra });
  return res.body.data.resident;
};

const checkIn = (agent, residentId, bedId, extra = {}) =>
  agent.post('/api/stays').send({
    residentId,
    bedId,
    action: 'checkin',
    checkInDate: day(0),
    depositPaise: 500000,
    termsAcknowledged: true,
    ...extra,
  });

const bedStatus = async (id) => (await Bed.findById(id)).status;

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await Promise.all([User, Property, Room, Bed, Resident, Stay].map((m) => m.deleteMany({})));
});

describe('stay indexes', () => {
  it('declares partial unique indexes for active stays', async () => {
    const indexes = await Stay.collection.indexes();
    const byBed = indexes.find((i) => i.name === 'uniq_active_stay_per_bed');
    expect(byBed).toMatchObject({ key: { bed: 1 }, unique: true, partialFilterExpression: { status: 'active' } });
    expect(indexes.find((i) => i.name === 'uniq_active_stay_per_resident')).toMatchObject({ unique: true });
  });

  it('rejects a second active stay on the same bed at the database level', async () => {
    const { owner, property, beds } = await setup();
    const [a, b] = [await addResident(owner, property.id), await addResident(owner, property.id)];
    const base = { property: property.id, room: beds[0].room, bed: beds[0].id, checkInDate: new Date(), monthlyRentPaise: 1, billingDay: 1 };
    await Stay.create({ ...base, resident: a.id });
    await expect(Stay.create({ ...base, resident: b.id })).rejects.toMatchObject({ code: 11000 });
    await Stay.updateMany({}, { status: 'ended' });
    await expect(Stay.create({ ...base, resident: b.id })).resolves.toBeTruthy();
  });
});

describe('check-in', () => {
  it('creates an active stay and marks the bed occupied', async () => {
    const { owner, property, room, beds } = await setup();
    const resident = await addResident(owner, property.id);

    const res = await checkIn(owner, resident.id, beds[0].id, { expectedCheckOutDate: day(180) });
    expect(res.status).toBe(201);
    expect(res.body.data.bed.status).toBe('occupied');
    expect(res.body.data.stay).toMatchObject({
      status: 'active',
      resident: resident.id,
      bed: beds[0].id,
      room: room.id,
      monthlyRentPaise: 450000, // room default
      depositPaise: 500000,
      billingDay: 1,
      agreedDiscountPaise: 0,
    });
    expect(res.body.data.stay.termsAcknowledgedAt).toBeTruthy();
    expect(await bedStatus(beds[0].id)).toBe('occupied');
    expect(await Stay.countDocuments({ status: 'active' })).toBe(1);
  });

  it('prefers the bed rent over the room default, and an explicit rent over both', async () => {
    const { owner, property, room, beds } = await setup();
    await owner.patch(`/api/properties/${property.id}/rooms/${room.id}/beds/${beds[0].id}`).send({ monthlyRent: 5200 });
    const [r1, r2] = [await addResident(owner, property.id), await addResident(owner, property.id)];

    expect((await checkIn(owner, r1.id, beds[0].id)).body.data.stay.monthlyRentPaise).toBe(520000);
    expect((await checkIn(owner, r2.id, beds[1].id, { monthlyRentPaise: 400000, billingDay: 5 })).body.data.stay).toMatchObject({
      monthlyRentPaise: 400000,
      billingDay: 5,
    });
  });

  it('requires some rent source, an explicit deposit, accepted terms and sane discounts', async () => {
    const { owner, property, beds } = await setup({ roomRent: 0 });
    const resident = await addResident(owner, property.id);

    expect((await checkIn(owner, resident.id, beds[0].id)).status).toBe(400);
    const ok = { monthlyRentPaise: 300000 };
    expect((await checkIn(owner, resident.id, beds[0].id, { ...ok, depositPaise: undefined })).status).toBe(400);
    expect((await checkIn(owner, resident.id, beds[0].id, { ...ok, termsAcknowledged: false })).status).toBe(400);
    expect((await checkIn(owner, resident.id, beds[0].id, { ...ok, depositPaise: 10.5 })).status).toBe(400);
    expect((await checkIn(owner, resident.id, beds[0].id, { ...ok, agreedDiscountPaise: 300001 })).status).toBe(400);
    expect((await checkIn(owner, resident.id, beds[0].id, { ...ok, depositPaise: 0 })).status).toBe(201);
    expect(await Stay.countDocuments()).toBe(1);
  });

  it('validates dates', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id);

    expect((await checkIn(owner, resident.id, beds[0].id, { checkInDate: day(1) })).status).toBe(400);
    expect((await checkIn(owner, resident.id, beds[0].id, { checkInDate: day(-2) })).status).toBe(400);
    expect((await checkIn(owner, resident.id, beds[0].id, { checkInDate: '2026-02-31' })).status).toBe(400);
    expect((await checkIn(owner, resident.id, beds[0].id, { expectedCheckOutDate: day(0) })).status).toBe(400);
    expect(await bedStatus(beds[0].id)).toBe('available');
    expect((await checkIn(owner, resident.id, beds[0].id, { checkInDate: day(-1) })).status).toBe(201);
  });

  it('rejects a second check-in to the same bed with 409', async () => {
    const { owner, property, beds } = await setup();
    const [a, b] = [await addResident(owner, property.id), await addResident(owner, property.id)];
    expect((await checkIn(owner, a.id, beds[0].id)).status).toBe(201);
    const second = await checkIn(owner, b.id, beds[0].id);
    expect(second.status).toBe(409);
    expect(await Stay.countDocuments({ bed: beds[0].id, status: 'active' })).toBe(1);
  });

  it('allows exactly one of several parallel check-ins to the same bed', async () => {
    const { owner, property, beds } = await setup();
    const residents = await Promise.all(Array.from({ length: 6 }, () => addResident(owner, property.id)));

    const results = await Promise.all(residents.map((r) => checkIn(owner, r.id, beds[0].id)));

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
    expect(await Stay.countDocuments({ bed: beds[0].id, status: 'active' })).toBe(1);
    expect(await bedStatus(beds[0].id)).toBe('occupied');
  });

  it('keeps beds consistent when one resident races into two beds', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id);

    const results = await Promise.all([checkIn(owner, resident.id, beds[0].id), checkIn(owner, resident.id, beds[1].id)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Stay.countDocuments({ resident: resident.id, status: 'active' })).toBe(1);
    const statuses = await Promise.all([bedStatus(beds[0].id), bedStatus(beds[1].id)]);
    expect(statuses.sort()).toEqual(['available', 'occupied']);
  });

  it('blocks a resident who already has an active stay from taking another bed', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id);
    await checkIn(owner, resident.id, beds[0].id);

    const res = await checkIn(owner, resident.id, beds[1].id);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/transfer/i);
    expect(await bedStatus(beds[1].id)).toBe('available');
  });

  it('rejects former residents, unavailable beds, inactive rooms and cross-property pairs', async () => {
    const { owner, property, room, beds } = await setup();
    const resident = await addResident(owner, property.id);
    await owner.patch(`/api/residents/${resident.id}`).send({ status: 'former' });
    expect((await checkIn(owner, resident.id, beds[0].id)).status).toBe(409);
    await owner.patch(`/api/residents/${resident.id}`).send({ status: 'active' });

    await Bed.updateOne({ _id: beds[0].id }, { status: 'maintenance' });
    expect((await checkIn(owner, resident.id, beds[0].id)).status).toBe(409);

    await Room.updateOne({ _id: room.id }, { status: 'maintenance' });
    expect((await checkIn(owner, resident.id, beds[1].id)).status).toBe(409);
    await Room.updateOne({ _id: room.id }, { status: 'active' });

    const other = (
      await owner.post('/api/properties').send({ name: 'Other', address: { line1: 'x', city: 'y', state: 'z', pincode: '1234' } })
    ).body.data.property;
    const otherRoom = (await owner.post(`/api/properties/${other.id}/rooms`).send({ number: '1', capacity: 2, defaultMonthlyRent: 1000 })).body.data.room;
    const otherBed = (await owner.post(`/api/properties/${other.id}/rooms/${otherRoom.id}/beds/bulk`).send({ count: 1 })).body.data.items[0];
    const res = await checkIn(owner, resident.id, otherBed.id);
    expect(res.status).toBe(400);
    expect(await bedStatus(otherBed.id)).toBe('available');
  });
});

describe('reservations', () => {
  const reserve = (agent, residentId, bedId, extra = {}) =>
    checkIn(agent, residentId, bedId, { action: 'reserve', checkInDate: day(14), ...extra });

  it('reserves a bed with a future date and an active stay', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id);

    const res = await reserve(owner, resident.id, beds[0].id);
    expect(res.status).toBe(201);
    expect(res.body.data.bed.status).toBe('reserved');
    expect(res.body.data.stay).toMatchObject({ status: 'active' });
    expect(res.body.data.stay.reservationTimer).toBe(res.body.data.stay.checkInDate);
    expect(new Date(res.body.data.stay.checkInDate).getTime()).toBeGreaterThan(Date.now());
  });

  it('requires a future date for reserve and rejects future dates for check-in', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id);
    expect((await reserve(owner, resident.id, beds[0].id, { checkInDate: day(0) })).status).toBe(400);
    expect((await checkIn(owner, resident.id, beds[0].id, { checkInDate: day(14) })).status).toBe(400);
  });

  it('keeps a reserved bed from being claimed by anyone else', async () => {
    const { owner, property, beds } = await setup();
    const [a, b] = [await addResident(owner, property.id), await addResident(owner, property.id)];
    await reserve(owner, a.id, beds[0].id);
    expect((await checkIn(owner, b.id, beds[0].id)).status).toBe(409);
  });

  it('does not count reservations as residents in the overview', async () => {
    const { owner, property, beds } = await setup();
    const [a, b] = [await addResident(owner, property.id), await addResident(owner, property.id)];
    await reserve(owner, a.id, beds[0].id);
    await checkIn(owner, b.id, beds[1].id);
    const { overview } = (await owner.get(`/api/properties/${property.id}/overview`)).body.data;
    expect(overview.residentsCount).toBe(1);
    expect(overview.bedsByStatus).toMatchObject({ occupied: 1, reserved: 1, available: 1 });
  });
});

describe('transfers', () => {
  const transfer = (agent, stayId, newBedId, extra = {}) =>
    agent.post(`/api/stays/${stayId}/transfer`).send({ newBedId, transferDate: day(0), ...extra });

  it('moves a resident, keeping history and updating both beds', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id);
    const first = (await checkIn(owner, resident.id, beds[0].id, { checkInDate: day(-1), expectedCheckOutDate: day(90), agreedDiscountPaise: 50000 })).body.data.stay;

    const res = await transfer(owner, first.id, beds[1].id, { reason: 'Noisy neighbours' });
    expect(res.status).toBe(200);
    const { stay, previousStay, bed, releasedBed } = res.body.data;

    expect(previousStay).toMatchObject({ id: first.id, status: 'ended', endedReason: 'transfer', endedNote: 'Noisy neighbours', transferredToStay: stay.id });
    expect(previousStay.actualCheckOutDate).toMatch(day(0));
    expect(stay).toMatchObject({
      status: 'active',
      resident: resident.id,
      bed: beds[1].id,
      transferredFromStay: first.id,
      depositPaise: 500000,
      agreedDiscountPaise: 50000,
      billingDay: 1,
    });
    expect(stay.checkInDate).toMatch(day(0));
    expect(bed).toMatchObject({ id: beds[1].id, status: 'occupied' });
    expect(releasedBed).toMatchObject({ id: beds[0].id, status: 'available' });

    const history = await owner.get(`/api/stays?residentId=${resident.id}`);
    expect(history.body.data.items.map((s) => s.status).sort()).toEqual(['active', 'ended']);
    expect(history.body.data.items[0].bed).toMatchObject({ label: expect.any(String) });
    expect(await Stay.countDocuments({ resident: resident.id })).toBe(2);
  });

  it('uses the new bed’s rent when set, otherwise the room default, with an explicit override winning', async () => {
    const { owner, property, room, beds } = await setup({ beds: 4 });
    await owner.patch(`/api/properties/${property.id}/rooms/${room.id}/beds/${beds[1].id}`).send({ monthlyRent: 6000 });
    const resident = await addResident(owner, property.id);
    const s1 = (await checkIn(owner, resident.id, beds[0].id)).body.data.stay;

    const s2 = (await transfer(owner, s1.id, beds[1].id)).body.data.stay;
    expect(s2.monthlyRentPaise).toBe(600000);
    const s3 = (await transfer(owner, s2.id, beds[2].id)).body.data.stay;
    expect(s3.monthlyRentPaise).toBe(450000);
    const s4 = (await transfer(owner, s3.id, beds[3].id, { monthlyRentPaise: 111100 })).body.data.stay;
    expect(s4.monthlyRentPaise).toBe(111100);
    expect(await Stay.countDocuments({ resident: resident.id })).toBe(4);
  });

  it('refuses beds that are occupied or reserved and leaves everything untouched', async () => {
    const { owner, property, beds } = await setup();
    const [a, b, c] = await Promise.all([addResident(owner, property.id), addResident(owner, property.id), addResident(owner, property.id)]);
    const stayA = (await checkIn(owner, a.id, beds[0].id)).body.data.stay;
    await checkIn(owner, b.id, beds[1].id);
    await checkIn(owner, c.id, beds[2].id, { action: 'reserve', checkInDate: day(10) }); // bed 3 is full of c's reservation

    const free = (await owner.post(`/api/properties/${property.id}/rooms/${beds[0].room}/beds`).send({ label: 'Z' })).body.data.bed;
    await Bed.updateOne({ _id: free.id }, { status: 'reserved' });

    for (const target of [beds[1].id, beds[2].id, free.id]) {
      expect((await transfer(owner, stayA.id, target)).status).toBe(409);
    }
    expect((await Stay.findById(stayA.id)).status).toBe('active');
    expect(await bedStatus(beds[0].id)).toBe('occupied');
  });

  it('validates the target, dates and stay state', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id);
    const stay = (await checkIn(owner, resident.id, beds[0].id, { checkInDate: day(-1) })).body.data.stay;

    expect((await transfer(owner, stay.id, beds[0].id)).status).toBe(400);
    expect((await transfer(owner, stay.id, beds[1].id, { transferDate: day(1) })).status).toBe(400);
    expect((await transfer(owner, stay.id, beds[1].id, { transferDate: day(-2) })).status).toBe(400);
    expect((await transfer(owner, stay.id, new mongoose.Types.ObjectId().toString())).status).toBe(404);

    expect((await transfer(owner, stay.id, beds[1].id)).status).toBe(200);
    expect((await transfer(owner, stay.id, beds[2].id)).status).toBe(409); // already ended
    expect(await bedStatus(beds[2].id)).toBe('available');
  });

  it('refuses to transfer a reservation', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id);
    const stay = (await checkIn(owner, resident.id, beds[0].id, { action: 'reserve', checkInDate: day(7) })).body.data.stay;
    expect((await transfer(owner, stay.id, beds[1].id)).status).toBe(409);
    expect(await bedStatus(beds[1].id)).toBe('available');
  });

  it('lets only one of two residents transfer into the same free bed', async () => {
    const { owner, property, beds } = await setup({ beds: 3 });
    const [a, b] = [await addResident(owner, property.id), await addResident(owner, property.id)];
    const stayA = (await checkIn(owner, a.id, beds[0].id)).body.data.stay;
    const stayB = (await checkIn(owner, b.id, beds[1].id)).body.data.stay;

    const results = await Promise.all([transfer(owner, stayA.id, beds[2].id), transfer(owner, stayB.id, beds[2].id)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await Stay.countDocuments({ bed: beds[2].id, status: 'active' })).toBe(1);
    expect(await Stay.countDocuments({ status: 'active' })).toBe(2);
    const loserStay = results[0].status === 200 ? stayB : stayA;
    const loserBed = results[0].status === 200 ? beds[1] : beds[0];
    expect((await Stay.findById(loserStay.id)).status).toBe('active');
    expect(await bedStatus(loserBed.id)).toBe('occupied');
  });
});

describe('inventory guards now backed by stays', () => {
  it('blocks bed, room and property deactivation while a stay is active', async () => {
    const { owner, property, room, beds } = await setup();
    const resident = await addResident(owner, property.id);
    await checkIn(owner, resident.id, beds[0].id);
    const bedUrl = `/api/properties/${property.id}/rooms/${room.id}/beds/${beds[0].id}`;

    expect((await owner.patch(bedUrl).send({ status: 'available' })).status).toBe(409);
    expect((await owner.patch(bedUrl).send({ status: 'maintenance' })).status).toBe(409);
    expect((await owner.delete(bedUrl)).status).toBe(409);
    expect((await owner.delete(`/api/properties/${property.id}/rooms/${room.id}`)).status).toBe(409);
    expect((await owner.delete(`/api/properties/${property.id}`)).status).toBe(409);
    expect(await bedStatus(beds[0].id)).toBe('occupied');
  });
});

describe('residents', () => {
  it('creates, lists with filters and shows the current bed', async () => {
    const { owner, property, beds } = await setup();
    const created = await owner.post('/api/residents').send({
      propertyId: property.id,
      fullName: 'Asha Verma',
      phone: '+91 98765 43210',
      email: 'ASHA@Example.com',
      emergencyContact: { name: 'Ravi Verma', phone: '9876500000' },
      idVerification: { status: 'verified', reference: 'KYC-1' },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.resident).toMatchObject({ status: 'active', email: 'asha@example.com', idVerification: { status: 'verified' } });
    const other = await addResident(owner, property.id, { fullName: 'Bharat Rao' });
    await checkIn(owner, created.body.data.resident.id, beds[0].id);
    await owner.patch(`/api/residents/${other.id}`).send({ status: 'former' });

    const all = await owner.get(`/api/residents?propertyId=${property.id}`);
    expect(all.body.data.items.map((r) => r.fullName)).toEqual(['Asha Verma', 'Bharat Rao']);
    expect(all.body.data.items[0].currentStay).toMatchObject({ bedLabel: 'A', roomNumber: '201', isReservation: false });
    expect(all.body.data.items[1].currentStay).toBeNull();

    expect((await owner.get('/api/residents?q=asha')).body.data.items).toHaveLength(1);
    expect((await owner.get('/api/residents?q=98765%2043')).body.data.items).toHaveLength(1);
    expect((await owner.get('/api/residents?q=%2B91')).body.data.items).toHaveLength(1);
    expect((await owner.get('/api/residents?status=former')).body.data.items.map((r) => r.fullName)).toEqual(['Bharat Rao']);
    expect((await owner.get('/api/residents?q=.*')).body.data.items).toHaveLength(0);
  });

  it('rejects bad input and refuses to retire a resident with an active stay', async () => {
    const { owner, property, beds } = await setup();
    expect((await owner.post('/api/residents').send({ propertyId: property.id, fullName: 'A', phone: '123' })).status).toBe(400);
    expect((await owner.post('/api/residents').send({ propertyId: property.id, fullName: 'Valid Name', phone: '9876543210', userId: 'x' })).status).toBe(400);

    const resident = await addResident(owner, property.id);
    await checkIn(owner, resident.id, beds[0].id);
    expect((await owner.patch(`/api/residents/${resident.id}`).send({ status: 'former' })).status).toBe(409);
    const patched = await owner.patch(`/api/residents/${resident.id}`).send({ emergencyContact: { phone: '9000000000' }, notes: 'Vegetarian' });
    expect(patched.body.data.resident).toMatchObject({ notes: 'Vegetarian', emergencyContact: { phone: '9000000000' } });
  });

  it('keeps the residents list away from maintenance, even with a stored grant', async () => {
    const { owner, property } = await setup();
    const resident = await addResident(owner, property.id);
    const maint = await createStaff('maintenance', [{ property: property.id, permissions: [PERMISSIONS.RESIDENTS_VIEW] }]);

    expect((await maint.get('/api/residents')).status).toBe(403);
    expect((await maint.get(`/api/residents/${resident.id}`)).status).toBe(403);
    expect((await maint.post('/api/residents').send({ propertyId: property.id, fullName: 'Nope Nope', phone: '9876543210' })).status).toBe(403);
    expect((await maint.patch(`/api/residents/${resident.id}`).send({ notes: 'x' })).status).toBe(403);
    expect((await maint.get('/api/stays')).status).toBe(403);
  });
});

describe('invites', () => {
  it('creates an invited student linked to the resident, who can then activate and sign in', async () => {
    const { owner, property } = await setup();
    const resident = await addResident(owner, property.id, { email: 'student@example.com' });

    const res = await owner.post(`/api/residents/${resident.id}/invite`);
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role: 'student', status: 'invited', email: 'student@example.com' });
    expect(res.body.data.inviteToken).toHaveLength(64);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);

    const user = await User.findOne({ email: 'student@example.com' });
    expect(user.status).toBe('invited');
    expect((await Resident.findById(resident.id)).userId.toString()).toBe(user.id);

    const early = await request(app).post('/api/auth/login').send({ email: 'student@example.com', password: 'Whatever123' });
    expect(early.status).toBe(401); // no usable password until the invite is accepted

    const reset = await request(app).post('/api/auth/reset-password').send({ token: res.body.data.inviteToken, password: 'StudentPass1' });
    expect(reset.status).toBe(200);
    const login = await request(app).post('/api/auth/login').send({ email: 'student@example.com', password: 'StudentPass1' });
    expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({ role: 'student', status: 'active', emailVerified: true });
  });

  it('rejects duplicate invites, existing emails and residents without email', async () => {
    const { owner, property } = await setup();
    const resident = await addResident(owner, property.id, { email: 'dup@example.com' });
    const noEmail = await addResident(owner, property.id);
    const ownerEmail = (await owner.get('/api/auth/me')).body.data.user.email;
    const clash = await addResident(owner, property.id, { email: ownerEmail });

    expect((await owner.post(`/api/residents/${resident.id}/invite`)).status).toBe(201);
    expect((await owner.post(`/api/residents/${resident.id}/invite`)).status).toBe(409);
    expect((await owner.post(`/api/residents/${noEmail.id}/invite`)).status).toBe(400);
    expect((await owner.post(`/api/residents/${clash.id}/invite`)).status).toBe(409);
    expect(await User.countDocuments({ role: 'student' })).toBe(1);
  });

  it('invites during check-in and scopes the student to their stay’s property', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id, { email: 'inline@example.com' });

    const res = await checkIn(owner, resident.id, beds[0].id, { inviteStudent: true });
    expect(res.status).toBe(201);
    expect(res.body.data.invite.user).toMatchObject({ status: 'invited' });
    expect(res.body.data.inviteError).toBeUndefined();

    const student = await User.findOne({ email: 'inline@example.com' });
    expect((await getUserPropertyIds(student)).map(String)).toEqual([property.id]);
  });

  it('fails a check-in with inviteStudent before writing anything when the invite cannot work', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id); // no email
    const res = await checkIn(owner, resident.id, beds[0].id, { inviteStudent: true });
    expect(res.status).toBe(400);
    expect(await bedStatus(beds[0].id)).toBe('available');
    expect(await Stay.countDocuments()).toBe(0);
  });
});

describe('authorization and tenant isolation', () => {
  it('lets another owner see nothing of these records', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id, { email: 'x@example.com' });
    const stay = (await checkIn(owner, resident.id, beds[0].id)).body.data.stay;
    const intruder = await registerOwner();

    expect((await intruder.get(`/api/residents/${resident.id}`)).status).toBe(404);
    expect((await intruder.patch(`/api/residents/${resident.id}`).send({ notes: 'x' })).status).toBe(404);
    expect((await intruder.post(`/api/residents/${resident.id}/invite`)).status).toBe(404);
    expect((await intruder.get(`/api/residents?propertyId=${property.id}`)).status).toBe(404);
    expect((await intruder.get('/api/residents')).body.data.items).toEqual([]);
    expect((await intruder.post('/api/residents').send({ propertyId: property.id, fullName: 'Spy Guy', phone: '9876543210' })).status).toBe(404);

    expect((await intruder.get(`/api/stays/${stay.id}`)).status).toBe(404);
    expect((await intruder.get(`/api/stays?propertyId=${property.id}`)).status).toBe(404);
    expect((await intruder.get('/api/stays')).body.data.items).toEqual([]);
    expect((await intruder.post(`/api/stays/${stay.id}/transfer`).send({ newBedId: beds[1].id, transferDate: day(0) })).status).toBe(404);
    expect((await intruder.post(`/api/stays/${stay.id}/end`).send({})).status).toBe(404);
    expect((await checkIn(intruder, resident.id, beds[1].id)).status).toBe(404);

    const mine = await intruder.post('/api/properties').send({ name: 'Mine', address: { line1: 'a', city: 'b', state: 'c', pincode: '1234' } });
    const myResident = await addResident(intruder, mine.body.data.property.id);
    expect((await checkIn(intruder, myResident.id, beds[1].id)).status).toBe(404);
    expect(await bedStatus(beds[1].id)).toBe('available');
  });

  it('enforces warden property assignment and the stays:write permission', async () => {
    const { owner, property, beds } = await setup();
    const resident = await addResident(owner, property.id);

    const unassigned = await createStaff('warden', []);
    expect((await checkIn(unassigned, resident.id, beds[0].id)).status).toBe(404);
    expect((await unassigned.get(`/api/residents/${resident.id}`)).status).toBe(404);

    const readOnly = await createStaff('warden', [{ property: property.id, permissions: [PERMISSIONS.RESIDENTS_VIEW] }]);
    const blind = await createStaff('warden', [{ property: property.id, permissions: [] }]);
    expect((await blind.get(`/api/residents/${resident.id}`)).status).toBe(403); // access without residents.view
    expect((await readOnly.get(`/api/residents/${resident.id}`)).status).toBe(200);
    expect((await checkIn(readOnly, resident.id, beds[0].id)).status).toBe(403);
    expect((await readOnly.post('/api/residents').send({ propertyId: property.id, fullName: 'Blocked One', phone: '9876543210' })).status).toBe(403);
    expect(await bedStatus(beds[0].id)).toBe('available');

    const warden = await createStaff('warden', [
      { property: property.id, permissions: [PERMISSIONS.STAYS_WRITE, PERMISSIONS.RESIDENTS_WRITE, PERMISSIONS.RESIDENTS_VIEW] },
    ]);
    const added = await warden.post('/api/residents').send({ propertyId: property.id, fullName: 'Warden Added', phone: '9876543210' });
    expect(added.status).toBe(201);
    const stay = await checkIn(warden, added.body.data.resident.id, beds[0].id);
    expect(stay.status).toBe(201);
    expect((await warden.get(`/api/stays/${stay.body.data.stay.id}`)).status).toBe(200);
    expect((await warden.get(`/api/stays?propertyId=${property.id}&status=active`)).body.data.items).toHaveLength(1);
  });

  it('lets a warden not move a resident into a bed that is reserved for someone else', async () => {
    const { owner, property, beds } = await setup();
    const [a, b] = [await addResident(owner, property.id), await addResident(owner, property.id)];
    const warden = await createStaff('warden', [{ property: property.id, permissions: [PERMISSIONS.STAYS_WRITE] }]);
    const stay = (await checkIn(owner, a.id, beds[0].id)).body.data.stay;
    await checkIn(owner, b.id, beds[1].id, { action: 'reserve', checkInDate: day(5) });

    const res = await warden.post(`/api/stays/${stay.id}/transfer`).send({ newBedId: beds[1].id, transferDate: day(0) });
    expect(res.status).toBe(409);
    expect(await bedStatus(beds[1].id)).toBe('reserved');
  });

  it('requires authentication and rejects students', async () => {
    expect((await request(app).get('/api/stays')).status).toBe(401);
    expect((await request(app).get('/api/residents')).status).toBe(401);
    const student = await createStaff('student');
    expect((await student.get('/api/residents')).status).toBe(403);
    expect((await student.get('/api/stays')).status).toBe(403);
  });
});

describe('transaction support detection', () => {
  it('reports the topology the suite is running on', async () => {
    expect(await supportsTransactions()).toBe(Boolean(process.env.TEST_REPLSET));
  });
});

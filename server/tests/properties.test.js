import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Property } from '../src/models/Property.js';
import { Room } from '../src/models/Room.js';
import { Bed } from '../src/models/Bed.js';
import { Resident } from '../src/models/Resident.js';
import { Stay } from '../src/models/Stay.js';
import { PERMISSIONS } from '../src/config/permissions.js';
import { assertPropertyAccess, getUserPropertyIds } from '../src/services/propertyAccess.service.js';

const password = 'Passw0rdOK';
const propertyBody = (name = 'Sunrise PG') => ({
  name,
  address: { line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001' },
});

const registerOwner = async (n) => {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ name: `Owner ${n}`, email: `owner${n}@example.com`, password, role: 'owner' });
  return { agent, user: res.body.data.user };
};

const createWarden = async (n, propertyAccess) => {
  const user = new User({ name: `Warden ${n}`, email: `warden${n}@example.com`, role: 'warden', propertyAccess });
  user.password = password;
  await user.save();
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password });
  return { agent, user };
};

const makeProperty = async (agent, name) => (await agent.post('/api/properties').send(propertyBody(name))).body.data.property;
const makeRoom = async (agent, propertyId, body = {}) =>
  (await agent.post(`/api/properties/${propertyId}/rooms`).send({ number: '201', capacity: 4, ...body })).body.data.room;

beforeAll(() => mongoose.connect(env.MONGO_URI));
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await Promise.all([User, Property, Room, Bed, Resident, Stay].map((m) => m.deleteMany({})));
});

describe('properties', () => {
  it('owner creates a property that appears in the list', async () => {
    const { agent, user } = await registerOwner(1);
    const created = await agent.post('/api/properties').send(propertyBody());
    expect(created.status).toBe(201);
    expect(created.body.data.property).toMatchObject({ name: 'Sunrise PG', type: 'pg', owner: user.id, isActive: true });
    expect(created.body.data.property.settings).toMatchObject({ currency: 'INR', billingDay: 1, gracePeriodDays: 5 });

    const list = await agent.get('/api/properties');
    expect(list.body.data.items.map((p) => p.name)).toEqual(['Sunrise PG']);
    expect(list.body.data.pagination.total).toBe(1);
  });

  it('forbids wardens from creating properties', async () => {
    const { agent } = await createWarden(1, []);
    expect((await agent.post('/api/properties').send(propertyBody())).status).toBe(403);
  });

  it('rejects unknown fields and bad pincodes', async () => {
    const { agent } = await registerOwner(1);
    expect((await agent.post('/api/properties').send({ ...propertyBody(), isActive: false })).status).toBe(400);
    const bad = propertyBody();
    bad.address.pincode = '12';
    expect((await agent.post('/api/properties').send(bad)).status).toBe(400);
  });

  it('hides other owners’ properties with 404 on every property endpoint', async () => {
    const a = await registerOwner(1);
    const b = await registerOwner(2);
    const property = await makeProperty(b.agent, 'B Hostel');
    const base = `/api/properties/${property.id}`;

    expect((await a.agent.get(base)).status).toBe(404);
    expect((await a.agent.patch(base).send({ name: 'Hijacked' })).status).toBe(404);
    expect((await a.agent.delete(base)).status).toBe(404);
    expect((await a.agent.get(`${base}/overview`)).status).toBe(404);
    expect((await a.agent.get('/api/properties')).body.data.items).toEqual([]);
    expect((await Property.findById(property.id)).name).toBe('B Hostel');
  });

  it('patches nested fields without clobbering siblings and soft-deletes', async () => {
    const { agent } = await registerOwner(1);
    const property = await makeProperty(agent);

    const patched = await agent.patch(`/api/properties/${property.id}`).send({ address: { city: 'Mumbai' }, facilities: ['WiFi', 'wifi', 'mess'] });
    expect(patched.status).toBe(200);
    expect(patched.body.data.property.address).toMatchObject({ line1: '12 MG Road', city: 'Mumbai' });
    expect(patched.body.data.property.facilities).toEqual(['wifi', 'mess']);

    expect((await agent.delete(`/api/properties/${property.id}`)).status).toBe(200);
    expect((await Property.findById(property.id)).isActive).toBe(false);
    expect((await agent.get(`/api/properties/${property.id}`)).status).toBe(404);
    expect((await agent.get('/api/properties')).body.data.items).toEqual([]);
  });
});

describe('rooms', () => {
  it('creates rooms, stores rent as paise and returns rupees', async () => {
    const { agent } = await registerOwner(1);
    const property = await makeProperty(agent);
    const room = await makeRoom(agent, property.id, { number: '201a', defaultMonthlyRent: 4500.5, defaultDeposit: 9000 });

    expect(room).toMatchObject({ number: '201A', defaultMonthlyRent: 4500.5, defaultDeposit: 9000, status: 'active', floor: 0 });
    const stored = await Room.findById(room.id).lean();
    expect(stored.defaultMonthlyRent).toBe(450050);
    expect(Number.isInteger(stored.defaultDeposit)).toBe(true);
  });

  it('rejects sub-paisa amounts', async () => {
    const { agent } = await registerOwner(1);
    const property = await makeProperty(agent);
    const res = await agent.post(`/api/properties/${property.id}/rooms`).send({ number: '1', capacity: 2, defaultMonthlyRent: 10.001 });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate room number in the same property with 409', async () => {
    const { agent } = await registerOwner(1);
    const property = await makeProperty(agent);
    await makeRoom(agent, property.id);
    const dup = await agent.post(`/api/properties/${property.id}/rooms`).send({ number: '201', capacity: 2 });
    expect(dup.status).toBe(409);
  });

  it('lists rooms with filters and pagination in numeric order', async () => {
    const { agent } = await registerOwner(1);
    const property = await makeProperty(agent);
    for (const [number, floor] of [['10', 1], ['2', 1], ['G1', 0]]) await makeRoom(agent, property.id, { number, floor });

    const all = await agent.get(`/api/properties/${property.id}/rooms`);
    expect(all.body.data.items.map((r) => r.number)).toEqual(['G1', '2', '10']);

    const floorOne = await agent.get(`/api/properties/${property.id}/rooms?floor=1&limit=1&page=2`);
    expect(floorOne.body.data.items.map((r) => r.number)).toEqual(['10']);
    expect(floorOne.body.data.pagination).toMatchObject({ page: 2, limit: 1, total: 2, pages: 2 });
  });

  it('refuses to shrink capacity below the current bed count', async () => {
    const { agent } = await registerOwner(1);
    const property = await makeProperty(agent);
    const room = await makeRoom(agent, property.id);
    await agent.post(`/api/properties/${property.id}/rooms/${room.id}/beds/bulk`).send({ count: 3 });

    const url = `/api/properties/${property.id}/rooms/${room.id}`;
    expect((await agent.patch(url).send({ capacity: 2 })).status).toBe(400);
    expect((await agent.patch(url).send({ capacity: 3 })).status).toBe(200);
  });

  it('refuses to deactivate a room that has an occupied bed, and cascades otherwise', async () => {
    const { agent } = await registerOwner(1);
    const property = await makeProperty(agent);
    const room = await makeRoom(agent, property.id);
    await agent.post(`/api/properties/${property.id}/rooms/${room.id}/beds/bulk`).send({ count: 2 });
    const url = `/api/properties/${property.id}/rooms/${room.id}`;

    await Bed.updateOne({ room: room.id, label: 'A' }, { status: 'occupied' });
    expect((await agent.delete(url)).status).toBe(409);
    expect((await Room.findById(room.id)).status).toBe('active');

    await Bed.updateOne({ room: room.id, label: 'A' }, { status: 'available' });
    expect((await agent.delete(url)).status).toBe(200);
    expect((await Room.findById(room.id)).status).toBe('inactive');
    expect(await Bed.countDocuments({ room: room.id, status: 'inactive' })).toBe(2);
  });

  it('applies the occupied/reserved guard when deactivating through PATCH too', async () => {
    const { agent } = await registerOwner(1);
    const property = await makeProperty(agent);
    const room = await makeRoom(agent, property.id);
    await agent.post(`/api/properties/${property.id}/rooms/${room.id}/beds`).send({ label: 'a' });
    await Bed.updateOne({ room: room.id }, { status: 'reserved' });
    const res = await agent.patch(`/api/properties/${property.id}/rooms/${room.id}`).send({ status: 'inactive' });
    expect(res.status).toBe(409);
  });
});

describe('beds', () => {
  const setup = async (roomBody) => {
    const { agent } = await registerOwner(1);
    const property = await makeProperty(agent);
    const room = await makeRoom(agent, property.id, roomBody);
    return { agent, property, room, beds: `/api/properties/${property.id}/rooms/${room.id}/beds` };
  };

  it('creates single beds with uppercase labels and rejects duplicates', async () => {
    const { agent, beds } = await setup({ capacity: 4, defaultMonthlyRent: 5000 });
    const created = await agent.post(beds).send({ label: 'a', monthlyRent: 4800 });
    expect(created.status).toBe(201);
    expect(created.body.data.bed).toMatchObject({ label: 'A', status: 'available', monthlyRent: 4800 });
    expect((await agent.post(beds).send({ label: 'A' })).status).toBe(409);
  });

  it('rejects creating beds beyond room capacity with 400', async () => {
    const { agent, beds } = await setup({ capacity: 2 });
    await agent.post(beds).send({ label: 'A' });
    await agent.post(beds).send({ label: 'B' });
    expect((await agent.post(beds).send({ label: 'C' })).status).toBe(400);
    expect((await agent.post(`${beds}/bulk`).send({ count: 1 })).status).toBe(400);
    expect(await Bed.countDocuments()).toBe(2);
  });

  it('bulk-creates labelled beds A–D atomically', async () => {
    const { agent, beds } = await setup({ capacity: 4 });
    const res = await agent.post(`${beds}/bulk`).send({ count: 4, monthlyRent: 3500 });
    expect(res.status).toBe(201);
    expect(res.body.data.items.map((b) => b.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(res.body.data.items.every((b) => b.monthlyRent === 3500 && b.status === 'available')).toBe(true);
    expect((await Bed.findOne({ label: 'A' })).monthlyRent).toBe(350000);
  });

  it('bulk skips taken labels and validates custom labels', async () => {
    const { agent, beds } = await setup({ capacity: 6 });
    await agent.post(beds).send({ label: 'B' });
    const auto = await agent.post(`${beds}/bulk`).send({ count: 2 });
    expect(auto.body.data.items.map((b) => b.label)).toEqual(['A', 'C']);

    expect((await agent.post(`${beds}/bulk`).send({ count: 2, labels: ['X'] })).status).toBe(400);
    expect((await agent.post(`${beds}/bulk`).send({ count: 1, labels: ['A'] })).status).toBe(409);
    expect(await Bed.countDocuments()).toBe(3);
  });

  it('never leaves partial beds behind when a bulk insert fails', async () => {
    const { agent, beds } = await setup({ capacity: 10 });
    await agent.post(beds).send({ label: 'C' });
    const res = await agent.post(`${beds}/bulk`).send({ count: 3, labels: ['A', 'B', 'C'] });
    expect(res.status).toBe(409);
    expect(await Bed.countDocuments()).toBe(1);
  });

  it('lists beds per property with filters', async () => {
    const { agent, property, room, beds } = await setup({ capacity: 4 });
    const other = await makeRoom(agent, property.id, { number: '202', capacity: 2 });
    await agent.post(`${beds}/bulk`).send({ count: 3 });
    await agent.post(`/api/properties/${property.id}/rooms/${other.id}/beds/bulk`).send({ count: 1 });
    await Bed.updateOne({ room: room.id, label: 'B' }, { status: 'maintenance' });

    const all = await agent.get(`/api/properties/${property.id}/beds`);
    expect(all.body.data.pagination.total).toBe(4);
    const byRoom = await agent.get(`/api/properties/${property.id}/beds?roomId=${other.id}`);
    expect(byRoom.body.data.items).toHaveLength(1);
    const byStatus = await agent.get(`/api/properties/${property.id}/rooms/${room.id}/beds?status=maintenance`);
    expect(byStatus.body.data.items.map((b) => b.label)).toEqual(['B']);
  });

  it('blocks status changes on occupied beds and reactivation beyond capacity', async () => {
    const { agent, beds } = await setup({ capacity: 2 });
    const [a, b] = (await agent.post(`${beds}/bulk`).send({ count: 2 })).body.data.items;

    await Bed.updateOne({ _id: a.id }, { status: 'occupied' });
    const release = await agent.patch(`${beds}/${a.id}`).send({ status: 'available' });
    expect(release.status).toBe(409);
    expect((await agent.patch(`${beds}/${a.id}`).send({ status: 'occupied' })).status).toBe(400);

    expect((await agent.delete(`${beds}/${b.id}`)).body.data.bed.status).toBe('inactive');
    await agent.post(beds).send({ label: 'C' });
    const reactivate = await agent.patch(`${beds}/${b.id}`).send({ status: 'available' });
    expect(reactivate.status).toBe(400);
  });

  it('updates rent and clears the override with null', async () => {
    const { agent, beds } = await setup({ capacity: 2 });
    const bed = (await agent.post(`${beds}/bulk`).send({ count: 1, monthlyRent: 3000 })).body.data.items[0];
    const up = await agent.patch(`${beds}/${bed.id}`).send({ monthlyRent: 3200.5, notes: 'Window side' });
    expect(up.body.data.bed).toMatchObject({ monthlyRent: 3200.5, notes: 'Window side' });
    const cleared = await agent.patch(`${beds}/${bed.id}`).send({ monthlyRent: null });
    expect(cleared.body.data.bed.monthlyRent).toBeUndefined();
  });

  it('refuses to deactivate occupied or reserved beds', async () => {
    const { agent, beds } = await setup({ capacity: 2 });
    const bed = (await agent.post(`${beds}/bulk`).send({ count: 1 })).body.data.items[0];
    await Bed.updateOne({ _id: bed.id }, { status: 'reserved' });
    expect((await agent.delete(`${beds}/${bed.id}`)).status).toBe(409);
    expect((await agent.patch(`${beds}/${bed.id}`).send({ status: 'inactive' })).status).toBe(409);
  });
});

describe('overview', () => {
  it('reports counts, rent range and stubs', async () => {
    const { agent } = await registerOwner(1);
    const property = await makeProperty(agent);
    const r1 = await makeRoom(agent, property.id, { number: '1', capacity: 3, defaultMonthlyRent: 4000 });
    const r2 = await makeRoom(agent, property.id, { number: '2', capacity: 2 });
    await agent.post(`/api/properties/${property.id}/rooms/${r1.id}/beds/bulk`).send({ count: 3 });
    await agent.post(`/api/properties/${property.id}/rooms/${r2.id}/beds/bulk`).send({ count: 1, monthlyRent: 6000 });
    await Bed.updateOne({ room: r1.id, label: 'A' }, { status: 'occupied' });
    await Bed.updateOne({ room: r1.id, label: 'B' }, { status: 'inactive' });

    const { overview } = (await agent.get(`/api/properties/${property.id}/overview`)).body.data;
    expect(overview).toMatchObject({
      totalRooms: 2,
      totalBeds: 3,
      bedsByStatus: { available: 2, occupied: 1, reserved: 0, maintenance: 0, inactive: 1 },
      monthlyRentRange: { min: 4000, max: 6000 },
      residentsCount: 0,
      outstandingRent: 0,
    });
  });
});

describe('tenant isolation on nested resources', () => {
  const victim = async () => {
    const { agent } = await registerOwner(2);
    const property = await makeProperty(agent, 'Victim PG');
    const room = await makeRoom(agent, property.id);
    const bed = (await agent.post(`/api/properties/${property.id}/rooms/${room.id}/beds/bulk`).send({ count: 1 })).body.data.items[0];
    return { property, room, bed, rooms: `/api/properties/${property.id}/rooms`, room_: `/api/properties/${property.id}/rooms/${room.id}` };
  };

  it('denies another owner every room endpoint', async () => {
    const { agent } = await registerOwner(1);
    const v = await victim();
    expect((await agent.get(v.rooms)).status).toBe(404);
    expect((await agent.post(v.rooms).send({ number: '9', capacity: 1 })).status).toBe(404);
    expect((await agent.get(v.room_)).status).toBe(404);
    expect((await agent.patch(v.room_).send({ floor: 3 })).status).toBe(404);
    expect((await agent.delete(v.room_)).status).toBe(404);
    expect(await Room.countDocuments({ property: v.property.id })).toBe(1);
  });

  it('denies another owner every bed endpoint', async () => {
    const { agent } = await registerOwner(1);
    const v = await victim();
    const beds = `${v.room_}/beds`;
    expect((await agent.get(beds)).status).toBe(404);
    expect((await agent.get(`/api/properties/${v.property.id}/beds`)).status).toBe(404);
    expect((await agent.post(beds).send({ label: 'Z' })).status).toBe(404);
    expect((await agent.post(`${beds}/bulk`).send({ count: 1 })).status).toBe(404);
    expect((await agent.patch(`${beds}/${v.bed.id}`).send({ notes: 'x' })).status).toBe(404);
    expect((await agent.delete(`${beds}/${v.bed.id}`)).status).toBe(404);
    expect((await Bed.findById(v.bed.id)).status).toBe('available');
  });

  it('does not resolve a room or bed through a different property of the same owner', async () => {
    const { agent } = await registerOwner(1);
    const mine = await makeProperty(agent, 'Mine');
    const other = await makeProperty(agent, 'Other');
    const room = await makeRoom(agent, other.id);
    const bed = (await agent.post(`/api/properties/${other.id}/rooms/${room.id}/beds/bulk`).send({ count: 1 })).body.data.items[0];

    expect((await agent.get(`/api/properties/${mine.id}/rooms/${room.id}`)).status).toBe(404);
    expect((await agent.get(`/api/properties/${mine.id}/rooms/${room.id}/beds`)).status).toBe(404);
    expect((await agent.patch(`/api/properties/${mine.id}/rooms/${room.id}/beds/${bed.id}`).send({ notes: 'x' })).status).toBe(404);
  });

  it('rejects malformed ids with 400 and students with 403', async () => {
    const { agent } = await registerOwner(1);
    expect((await agent.get('/api/properties/not-an-id')).status).toBe(400);

    const student = new User({ name: 'Stu Dent', email: 'stu@example.com', role: 'student' });
    student.password = password;
    await student.save();
    const sAgent = request.agent(app);
    await sAgent.post('/api/auth/login').send({ email: 'stu@example.com', password });
    expect((await sAgent.get('/api/properties')).status).toBe(403);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/properties')).status).toBe(401);
  });
});

describe('warden access', () => {
  it('lets a warden read assigned properties only, never write without permission', async () => {
    const { agent: owner } = await registerOwner(1);
    const assigned = await makeProperty(owner, 'Assigned');
    const hidden = await makeProperty(owner, 'Hidden');
    const room = await makeRoom(owner, assigned.id);

    const { agent } = await createWarden(1, [{ property: assigned.id, permissions: [] }]);
    const list = await agent.get('/api/properties');
    expect(list.body.data.items.map((p) => p.name)).toEqual(['Assigned']);
    expect((await agent.get(`/api/properties/${assigned.id}`)).status).toBe(200);
    expect((await agent.get(`/api/properties/${assigned.id}/rooms/${room.id}`)).status).toBe(200);
    expect((await agent.get(`/api/properties/${hidden.id}`)).status).toBe(404);
    expect((await agent.get(`/api/properties/${hidden.id}/rooms`)).status).toBe(404);

    expect((await agent.post(`/api/properties/${assigned.id}/rooms`).send({ number: '9', capacity: 1 })).status).toBe(403);
    expect((await agent.patch(`/api/properties/${assigned.id}`).send({ name: 'Mine now' })).status).toBe(403);
    expect((await agent.post(`/api/properties/${assigned.id}/rooms/${room.id}/beds`).send({ label: 'A' })).status).toBe(403);
  });

  it('allows writes only for the granted permission', async () => {
    const { agent: owner } = await registerOwner(1);
    const property = await makeProperty(owner);
    const { agent } = await createWarden(1, [{ property: property.id, permissions: [PERMISSIONS.ROOMS_WRITE] }]);

    const room = await agent.post(`/api/properties/${property.id}/rooms`).send({ number: '5', capacity: 2 });
    expect(room.status).toBe(201);
    const bed = await agent.post(`/api/properties/${property.id}/rooms/${room.body.data.room.id}/beds`).send({ label: 'A' });
    expect(bed.status).toBe(403);
  });
});

describe('property access primitives', () => {
  it('scopes getUserPropertyIds to owned, active properties', async () => {
    const { agent, user } = await registerOwner(1);
    const keep = await makeProperty(agent, 'Keep');
    const drop = await makeProperty(agent, 'Drop');
    await agent.delete(`/api/properties/${drop.id}`);
    await makeProperty((await registerOwner(2)).agent, 'Not mine');

    const ids = await getUserPropertyIds(await User.findById(user.id));
    expect(ids.map(String)).toEqual([keep.id]);
  });

  it('throws 404 for inaccessible and 403 for missing permission', async () => {
    const { agent: owner } = await registerOwner(1);
    const property = await makeProperty(owner);
    const warden = await User.findById((await createWarden(1, [{ property: property.id, permissions: ['rooms:write'] }])).user._id);

    await expect(assertPropertyAccess(warden, property.id, { permission: 'rooms:write' })).resolves.toBeUndefined();
    await expect(assertPropertyAccess(warden, property.id, { permission: 'beds:write' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(assertPropertyAccess(warden, new mongoose.Types.ObjectId())).rejects.toMatchObject({ statusCode: 404 });
    await expect(assertPropertyAccess(warden, 'garbage')).rejects.toMatchObject({ statusCode: 404 });
  });
});

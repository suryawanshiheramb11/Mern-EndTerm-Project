/*
 * Demo data: npm run seed            safe merge (does nothing if the demo property already exists)
 *            npm run seed -- --force  drop the demo property and its data, then recreate it
 *
 * Everything goes through the same services the API uses (charges, payments, check-out,
 * complaints), so the numbers are consistent with every invariant. Only rows the demo owns are
 * ever removed: the demo owner's property and the *@stayos.demo accounts.
 */
import { pathToFileURL } from 'node:url';
import { Advance } from '../models/Advance.js';
import { AuditLog } from '../models/AuditLog.js';
import { Bed } from '../models/Bed.js';
import { Complaint } from '../models/Complaint.js';
import { Counter } from '../models/Counter.js';
import { Expense } from '../models/Expense.js';
import { Notification } from '../models/Notification.js';
import { Payment } from '../models/Payment.js';
import { Property } from '../models/Property.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { Refund } from '../models/Refund.js';
import { RentCharge } from '../models/RentCharge.js';
import { Resident } from '../models/Resident.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { User } from '../models/User.js';
import { DEFAULT_PERMISSIONS } from '../config/permissions.js';
import { connectDB, disconnectDB, ensureIndexes } from '../config/db.js';
import { env } from '../config/env.js';
import { addDays, businessToday, periodKeyOfInstant } from '../utils/dates.js';
import { generateForStay } from '../services/charge.service.js';
import * as complaints from '../services/complaint.service.js';
import { commitCheckout } from '../services/checkout.service.js';
import { recordPayment } from '../services/payment.service.js';
import { reconcileOverdue } from '../services/reconcile.service.js';

export const DEMO_PASSWORD = 'Demo@12345';
const DEMO_DOMAIN = '@stayos.demo';
const OWNER_EMAIL = `owner${DEMO_DOMAIN}`;

// Deterministic pseudo-random numbers so every seed produces the same demo.
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const makeUser = async (fields) => {
  const user = new User({ status: 'active', emailVerified: true, ...fields });
  user.password = DEMO_PASSWORD;
  await user.save();
  return user;
};

export const wipeDemo = async () => {
  const owner = await User.findOne({ email: OWNER_EMAIL });
  const properties = owner ? await Property.find({ owner: owner._id }) : [];
  for (const property of properties) {
    const scope = { property: property._id };
    await Promise.all([Stay, Resident, Room, Bed, RentCharge, Payment, Advance, Refund, Complaint, Expense, Notification, AuditLog].map((m) => m.collection.deleteMany(scope)));
    if (property.code) await Counter.collection.deleteMany({ _id: { $regex: `^(receipt|complaint):${property.code}` } });
    await Property.collection.deleteOne({ _id: property._id });
  }
  const demoUsers = await User.find({ email: { $regex: `${DEMO_DOMAIN.replace('.', '\\.')}$` } }, { _id: 1 }).lean();
  const ids = demoUsers.map((u) => u._id);
  await Promise.all([RefreshToken.deleteMany({ user: { $in: ids } }), Notification.collection.deleteMany({ user: { $in: ids } }), User.deleteMany({ _id: { $in: ids } })]);
};

const credentials = (rows) => rows.map((r) => `  ${r.role.padEnd(12)} ${r.email.padEnd(28)} ${DEMO_PASSWORD}`).join('\n');

export const runSeed = async ({ force = false, log = () => {} } = {}) => {
  if (force) await wipeDemo();
  if (await User.exists({ email: OWNER_EMAIL })) {
    log('Demo data already present; use --force to recreate it.');
    return { skipped: true, accounts: [{ role: 'owner', email: OWNER_EMAIL }] };
  }

  const rand = rng(42);
  const today = businessToday();
  const pick = (list) => list[Math.floor(rand() * list.length)];

  /* ---- owner, property, rooms, beds ---- */
  const owner = await makeUser({ name: 'Priya Owner', email: OWNER_EMAIL, role: 'owner' });
  const property = await Property.create({
    owner: owner._id,
    name: 'Sunrise PG',
    type: 'pg',
    address: { line1: '14, 5th Cross, Koramangala', city: 'Bengaluru', state: 'Karnataka', pincode: '560034' },
    contact: { name: 'Priya Owner', phone: '9845012345', email: OWNER_EMAIL },
    facilities: ['wifi', 'laundry', 'meals', 'power backup'],
    settings: { billingDay: 1, gracePeriodDays: 5 },
  });
  const rents = [600000, 700000, 750000, 850000, 900000];
  const rooms = await Room.insertMany(
    Array.from({ length: 25 }, (_, i) => ({
      property: property._id,
      number: String(101 + Math.floor(i / 5) * 100 + (i % 5)),
      floor: Math.floor(i / 5) + 1,
      capacity: 4,
      defaultMonthlyRent: rents[i % rents.length],
      defaultDeposit: rents[i % rents.length] * 2,
      amenities: i % 2 ? ['attached bath'] : ['shared bath'],
    })),
  );
  const beds = await Bed.insertMany(rooms.flatMap((room) => ['A', 'B', 'C', 'D'].map((label) => ({ property: property._id, room: room._id, label }))));
  const roomById = new Map(rooms.map((r) => [String(r._id), r]));

  /* ---- staff ---- */
  const staffSpec = [
    ['Anita Warden', 'warden1', 'warden', DEFAULT_PERMISSIONS.warden],
    ['Rahul Warden', 'warden2', 'warden', ['residents.view', 'residents.edit', 'complaints.manage']], // no payment access
    ['Imran Maintenance', 'maint1', 'maintenance', DEFAULT_PERMISSIONS.maintenance],
    ['Lakshmi Maintenance', 'maint2', 'maintenance', DEFAULT_PERMISSIONS.maintenance],
    ['Joseph Maintenance', 'maint3', 'maintenance', DEFAULT_PERMISSIONS.maintenance],
  ];
  const staff = [];
  for (const [name, handle, role, permissions] of staffSpec) {
    staff.push(await makeUser({ name, email: `${handle}${DEMO_DOMAIN}`, role, propertyAccess: [{ property: property._id, role, permissions: [...permissions] }] }));
  }
  const [warden1, , maint1, maint2] = staff;

  /* ---- 33 residents: 30 stay, 3 check out later ---- */
  const first = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Ananya', 'Diya', 'Aadhya', 'Saanvi', 'Kavya', 'Meera', 'Riya', 'Nisha', 'Pooja', 'Sneha', 'Rohan', 'Karthik', 'Manoj', 'Naveen', 'Pranav', 'Rahul', 'Suresh', 'Tanvi', 'Varun', 'Yash', 'Zoya', 'Harsh', 'Isha'];
  const last = ['Sharma', 'Reddy', 'Nair', 'Iyer', 'Patil', 'Gowda', 'Rao', 'Menon', 'Kulkarni', 'Singh'];
  const residents = [];
  const stays = [];
  for (let i = 0; i < 33; i += 1) {
    const bed = beds[(i * 3) % beds.length]; // stride 3 is coprime with 100, so 33 distinct beds
    const room = roomById.get(String(bed.room));
    const resident = await Resident.create({
      property: property._id,
      fullName: `${first[i]} ${last[i % last.length]}`,
      phone: `98450${String(10000 + i * 37).slice(-5)}`,
      email: i < 3 ? `student${i + 1}${DEMO_DOMAIN}` : undefined,
      idVerification: { status: i % 4 ? 'verified' : 'pending' },
      emergencyContact: { name: `${last[i % last.length]} (parent)`, phone: `99000${String(10000 + i * 11).slice(-5)}` },
      createdBy: owner._id,
    });
    const stay = await Stay.create({
      property: property._id, resident: resident._id, room: room._id, bed: bed._id,
      checkInDate: addDays(today, -(95 + Math.floor(rand() * 25))),
      expectedCheckOutDate: i % 5 === 0 ? addDays(today, 2 + (i % 3)) : addDays(today, 150 + i),
      monthlyRentPaise: room.defaultMonthlyRent,
      depositPaise: room.defaultDeposit,
      billingDay: i % 6 === 0 ? 5 : 1,
      agreedDiscountPaise: i % 9 === 0 ? 50000 : 0,
      termsAcknowledgedAt: new Date(),
      createdBy: owner._id,
    });
    await Bed.updateOne({ _id: bed._id }, { status: 'occupied' });
    residents.push(resident);
    stays.push(stay);
  }

  /* ---- students (3 residents with logins) ---- */
  const students = [];
  for (let i = 0; i < 3; i += 1) {
    const user = await makeUser({ name: residents[i].fullName, email: `student${i + 1}${DEMO_DOMAIN}`, role: 'student' });
    await Resident.updateOne({ _id: residents[i]._id }, { userId: user._id });
    students.push(user);
  }

  /* ---- charges for the last 3 months, then a mix of full / partial / no payments ---- */
  const periods = [-2, -1, 0].map((m) => periodKeyOfInstant(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + m, 15))));
  const methods = ['upi', 'upi', 'cash', 'bank', 'upi', 'card'];
  let paymentCount = 0;
  for (const [i, stay] of stays.entries()) {
    for (const [p, periodKey] of periods.entries()) {
      const { charge } = await generateForStay({ stayId: stay._id, periodKey, today });
      if (!charge) continue;
      const roll = rand();
      const current = p === periods.length - 1;
      const full = current ? 0.45 : 0.75;
      const partial = current ? 0.6 : 0.9;
      if (roll >= partial) continue; // unpaid
      const amountPaise = roll < full ? charge.netDuePaise : Math.round(charge.netDuePaise / 2 / 100) * 100;
      const paidAt = new Date(Math.min(charge.dueDate.getTime() + Math.floor(rand() * 4) * 86_400_000, today.getTime()));
      await recordPayment({
        propertyId: property._id,
        residentId: residents[i]._id,
        amountPaise,
        method: pick(methods),
        reference: i % 3 ? `UTR${400000000 + i * 1000 + p}` : undefined,
        paidAt,
        allocations: [{ chargeId: charge._id, amountPaise }],
        receivedBy: owner._id,
      });
      paymentCount += 1;
    }
  }
  await reconcileOverdue(property._id, today);

  /* ---- three check-outs, leaving refunds pending approval ---- */
  const leaving = [30, 31, 32];
  for (const [n, i] of leaving.entries()) {
    await commitCheckout(owner, stays[i]._id, {
      actualCheckOutDate: today,
      deductions: n === 0 ? [{ amountPaise: 150000, reason: 'Damaged wardrobe door', evidenceRef: 'IMG-2041' }] : [],
      deductOutstandingRent: true,
    });
  }

  /* ---- complaints in every state ---- */
  const issues = [
    ['plumbing', 'Bathroom tap leaking', 'high'], ['electrical', 'Fan makes a loud noise', 'medium'], ['internet', 'Wi-Fi drops every evening', 'high'],
    ['cleaning', 'Corridor not swept for two days', 'low'], ['furniture', 'Cot leg is wobbly', 'medium'], ['food', 'Dinner served cold', 'low'],
    ['security', 'Main gate latch is broken', 'high'], ['electrical', 'Tube light flickering', 'low'], ['plumbing', 'No hot water in the morning', 'medium'],
    ['internet', 'Router in common room offline', 'medium'],
  ];
  const targets = ['new', 'new', 'acknowledged', 'acknowledged', 'assigned', 'in_progress', 'in_progress', 'resolved', 'closed', 'reopened'];
  const created = [];
  for (const [i, [category, title, urgency]] of issues.entries()) {
    const student = students[i % students.length];
    const c = await complaints.createComplaint(student, { category, title, description: `${title}. Please look into this as soon as possible.`, urgency });
    const target = targets[i];
    const worker = i % 2 ? maint1 : maint2;
    if (target !== 'new') await complaints.acknowledge(warden1, c._id, {});
    if (['assigned', 'in_progress', 'resolved', 'closed', 'reopened'].includes(target)) await complaints.assign(warden1, c._id, { assignedTo: worker._id, priority: urgency === 'high' ? 'urgent' : urgency });
    if (['in_progress', 'resolved', 'closed', 'reopened'].includes(target)) await complaints.progress(worker, c._id, { progressNote: 'Inspected the issue and ordered parts.' });
    if (['resolved', 'closed', 'reopened'].includes(target)) await complaints.resolve(worker, c._id, { resolutionNotes: 'Fixed and tested with the resident.' });
    if (target === 'closed') await complaints.close(warden1, c._id, {});
    if (target === 'reopened') await complaints.reopen(student, c._id, { reason: 'The problem came back after two days.' });
    created.push(c);
  }
  // Make two of the open ones overdue so the dashboard has something to show.
  await Complaint.updateMany({ _id: { $in: [created[0]._id, created[4]._id] } }, { slaDueAt: addDays(new Date(), -2) });

  /* ---- ~15 expenses over three months ---- */
  const expenseSpec = [
    ['electricity', 'BESCOM bill', 'BESCOM', 4850000], ['water', 'Tanker water', 'Bengaluru Tankers', 620000], ['internet', 'Fibre broadband', 'ACT Fibernet', 1180000],
    ['food', 'Groceries and vegetables', 'Fresh Mart', 3150000], ['cleaning', 'Housekeeping supplies', 'CleanCo', 410000], ['repairs', 'Plumbing repairs', 'Local plumber', 380000],
    ['salaries', 'Cook and housekeeping staff', undefined, 5200000], ['maintenance', 'AC servicing', 'CoolCare', 540000], ['other', 'Pest control', 'SafeHome', 260000],
  ];
  let expenseCount = 0;
  for (let n = 0; n < 15; n += 1) {
    const [category, description, vendor, amountPaise] = expenseSpec[n % expenseSpec.length];
    const paidAt = addDays(today, -Math.floor((n / 15) * 85) - 1);
    await Expense.create({
      property: property._id, category, description, vendor, paidAt, periodKey: periodKeyOfInstant(paidAt), createdBy: owner._id,
      amountPaise: amountPaise + Math.floor(rand() * 20) * 1000, paymentStatus: n === 3 || n === 11 ? 'pending' : 'paid',
    });
    expenseCount += 1;
  }

  const accounts = [
    { role: 'owner', email: owner.email },
    ...staff.map((u) => ({ role: u.role, email: u.email })),
    ...students.map((u) => ({ role: 'student', email: u.email })),
  ];
  log(`Seeded Sunrise PG.\n\nCredentials (password for all: ${DEMO_PASSWORD}):\n${credentials(accounts)}\n`);
  return {
    skipped: false,
    propertyId: String(property._id),
    counts: {
      rooms: rooms.length, beds: beds.length, residents: residents.length, staff: staff.length, students: students.length,
      charges: await RentCharge.countDocuments({ property: property._id }), payments: paymentCount,
      refunds: await Refund.countDocuments({ property: property._id }), complaints: created.length, expenses: expenseCount,
    },
    accounts,
  };
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const force = process.argv.includes('--force');
  if (env.isProd && !process.argv.includes('--allow-production')) {
    console.error('Refusing to seed with NODE_ENV=production (pass --allow-production if you really mean it).');
    process.exit(1);
  }
  try {
    await connectDB();
    await ensureIndexes();
    const result = await runSeed({ force, log: (m) => console.log(m) });
    if (!result.skipped) console.log('Counts:', result.counts);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

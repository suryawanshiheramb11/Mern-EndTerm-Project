import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { Notification } from '../src/models/Notification.js';
import { Property } from '../src/models/Property.js';
import { RentCharge } from '../src/models/RentCharge.js';
import { runRentReminders } from '../src/jobs/rentReminders.js';
import { reconcileOverdue } from '../src/services/reconcile.service.js';
import { addDays, businessToday } from '../src/utils/dates.js';
import { generateCharges, wipeAll, world, RENT } from './helpers.js';

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(wipeAll);

const overdueCtx = async (lateFeePercent) => {
  const ctx = await world();
  await Property.updateOne({ _id: ctx.property.id }, { $set: { 'settings.lateFeePercent': lateFeePercent } });
  await generateCharges(ctx.owner, ctx.property.id);
  await RentCharge.updateOne({ resident: ctx.resident.id }, { dueDate: addDays(businessToday(), -30), status: 'pending' });
  return ctx;
};

describe('late fees and overdue reminders', () => {
  it('adds the late fee exactly once when a charge goes overdue, and it is payable', async () => {
    const ctx = await overdueCtx(2.5);
    const fee = Math.floor((RENT * 250) / 10000);
    expect((await reconcileOverdue(ctx.property.id)).lateFees).toBe(1);
    await reconcileOverdue(ctx.property.id);
    await RentCharge.updateOne({ resident: ctx.resident.id }, { status: 'pending' }); // re-flip
    await reconcileOverdue(ctx.property.id);

    const charge = (await ctx.student.get('/api/me/charges')).body.data.items[0];
    expect(charge).toMatchObject({ netDuePaise: RENT + fee, outstandingPaise: RENT + fee, status: 'overdue' });
    const doc = await RentCharge.findOne({ resident: ctx.resident.id }).lean();
    expect(doc.adjustments.filter((a) => a.kind === 'late_fee')).toHaveLength(1);
  });

  it('adds nothing when the property has no late fee', async () => {
    const ctx = await overdueCtx(0);
    expect((await reconcileOverdue(ctx.property.id)).lateFees).toBe(0);
    expect((await RentCharge.findOne({ resident: ctx.resident.id }).lean()).netDuePaise).toBe(RENT);
  });

  it('sends one weekly reminder per overdue week, never twice', async () => {
    const ctx = await overdueCtx(0);
    await reconcileOverdue(ctx.property.id);
    const count = () => Notification.countDocuments({ user: ctx.student.userId, title: 'Rent still unpaid' });
    await runRentReminders();
    await runRentReminders();
    expect(await count()).toBe(1); // 30 days overdue -> week 4, once
    await runRentReminders({ today: addDays(businessToday(), 7) });
    expect(await count()).toBe(2);
  });
});

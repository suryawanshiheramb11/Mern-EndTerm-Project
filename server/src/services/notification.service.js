import { Notification } from '../models/Notification.js';
import { Property } from '../models/Property.js';
import { Resident } from '../models/Resident.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { grantSatisfies } from '../config/permissions.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { sendEmail } from './emailTransport.js';

const HOME = { owner: '/owner', warden: '/warden', maintenance: '/maintenance', student: '/student' };
const inr = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d) => new Date(d).toISOString().slice(0, 10);
const id = (v) => String(v._id ?? v);

/* ---------- recipient rules ---------- */

const residentUsers = async (residentId) => {
  const resident = await Resident.findById(residentId, { userId: 1 }).lean();
  return resident?.userId ? [String(resident.userId)] : [];
};

// The owner always counts (owners hold every permission); staff need the grant on this property.
// Wardens only by default: maintenance staff hear about their own assignments, not everyone's.
const staffWith = async (propertyId, permission, roles = ['warden']) => {
  const property = await Property.findById(propertyId, { owner: 1 }).lean();
  const staff = await User.find({ status: 'active', role: { $in: roles }, 'propertyAccess.property': propertyId }).lean();
  const granted = staff.filter((u) => grantSatisfies(u.propertyAccess.find((e) => String(e.property) === String(propertyId))?.permissions ?? [], permission));
  return [...(property ? [String(property.owner)] : []), ...granted.map((u) => String(u._id))];
};

/* ---------- events: who gets what ---------- */

// Each builder returns { type, property, title, body, route(role), key, to: [userId] }[].
const EVENTS = {
  async rent_due_soon({ charge }) {
    return [{
      type: 'rent_due_soon', property: charge.property, to: await residentUsers(charge.resident), route: () => '/student/rent',
      key: `rent_due_soon:${id(charge)}:${date(charge.dueDate)}`,
      title: 'Rent due soon', body: `Rent for ${charge.periodKey} (${inr(Math.max(charge.netDuePaise - charge.paidPaise, 0))} outstanding) is due on ${date(charge.dueDate)}.`,
    }];
  },
  async rent_overdue({ charge }) {
    const to = [...(await residentUsers(charge.resident)), ...(await staffWith(charge.property, 'payments.view'))];
    return [{
      type: 'rent_overdue', property: charge.property, to, route: (role) => `${HOME[role]}/rent`, key: `rent_overdue:${id(charge)}`,
      title: 'Rent overdue', body: `Rent for ${charge.periodKey} was due on ${date(charge.dueDate)} and is overdue.`,
    }];
  },
  // Weekly nudge while rent stays unpaid; `week` is part of the key so each week sends once.
  async rent_overdue_reminder({ charge, week }) {
    return [{
      type: 'rent_overdue', property: charge.property, to: await residentUsers(charge.resident), route: () => '/student/rent',
      key: `rent_overdue_reminder:${id(charge)}:${week}`,
      title: 'Rent still unpaid', body: `Rent for ${charge.periodKey} (${inr(Math.max(charge.netDuePaise - charge.paidPaise, 0))} outstanding, including any late fee) was due on ${date(charge.dueDate)}. Please pay it in the Rent section.`,
    }];
  },
  async payment_recorded({ payment }) {
    return [{
      type: 'payment_recorded', property: payment.property, to: await residentUsers(payment.resident), route: () => '/student/rent', key: `payment_recorded:${id(payment)}`,
      title: 'Payment received', body: `We recorded ${inr(payment.amountPaise)} (receipt ${payment.receiptNumber}).`,
    }];
  },
  async complaint_created({ complaint }) {
    return [{
      type: 'complaint_created', property: complaint.property, to: await staffWith(complaint.property, 'complaints.manage'), route: (role) => `${HOME[role]}/complaints`,
      key: `complaint_created:${id(complaint)}`, title: 'New complaint', body: `${complaint.complaintNumber}: ${complaint.title}`,
    }];
  },
  async task_assigned({ complaint, assigneeId, seq }) {
    return [{
      type: 'task_assigned', property: complaint.property, to: [String(assigneeId)], route: (role) => `${HOME[role]}/complaints`,
      key: `task_assigned:${id(complaint)}:${seq}`, title: 'Task assigned to you', body: `${complaint.complaintNumber}: ${complaint.title}`,
    }];
  },
  async complaint_resolved({ complaint }) {
    return [{
      type: 'complaint_resolved', property: complaint.property, to: await residentUsers(complaint.resident), route: () => '/student/complaints',
      key: `complaint_resolved:${id(complaint)}:${new Date(complaint.resolvedAt).getTime()}`, title: 'Complaint resolved', body: `${complaint.complaintNumber} was marked resolved. Reopen it if the problem persists.`,
    }];
  },
  async refund_pending({ refund }) {
    const property = await Property.findById(refund.property, { owner: 1 }).lean();
    return [{
      type: 'refund_pending', property: refund.property, to: property ? [String(property.owner)] : [], route: () => '/owner/refunds', key: `refund_pending:${id(refund)}`,
      title: 'Refund awaiting approval', body: `A deposit refund of ${inr(refund.refundablePaise)} needs approval.`,
    }];
  },
  async checkout_upcoming({ stay, residentName }) {
    return [{
      type: 'checkout_upcoming', property: stay.property, to: await staffWith(stay.property, 'residents.edit'), route: (role) => `${HOME[role]}/residents/${id(stay.resident)}`,
      key: `checkout_upcoming:${id(stay)}:${date(stay.expectedCheckOutDate)}`, title: 'Check-out coming up', body: `${residentName ?? 'A resident'} is due to check out on ${date(stay.expectedCheckOutDate)}.`,
    }];
  },
  async checkin_upcoming({ stay, residentName }) {
    return [{
      type: 'checkin_upcoming', property: stay.property, to: await staffWith(stay.property, 'residents.edit'), route: (role) => `${HOME[role]}/residents/${id(stay.resident)}`,
      key: `checkin_upcoming:${id(stay)}:${date(stay.checkInDate)}`, title: 'Check-in coming up', body: `${residentName ?? 'A resident'} arrives on ${date(stay.checkInDate)}.`,
    }];
  },
  async announcement({ propertyId, title, body, announcementId }) {
    const residents = await Resident.find({ property: propertyId, status: 'active', userId: { $exists: true } }, { userId: 1 }).lean();
    return [{
      type: 'announcement', property: propertyId, to: residents.map((r) => String(r.userId)), route: () => '/student', key: `announcement:${announcementId}`, title, body,
    }];
  },
};

/* ---------- delivery ---------- */

const deliverEmail = async (user, { title, body, link }) => {
  if (!env.EMAIL_ENABLED || !user?.email) return 'skipped';
  try {
    await sendEmail({ to: user.email, subject: title, text: `${body}\n\n${env.CLIENT_URL}${link}` });
    return 'sent';
  } catch (err) {
    logger.error('Notification email failed', err.message);
    return 'failed';
  }
};

/**
 * notify('payment_recorded', { payment }) resolves the recipients for the event, creates one
 * in-app notification per recipient (skipping any that already exist for that event) and sends the
 * email only for rows that were newly created. Failures here never break the calling operation.
 * Returns { created, skipped }.
 */
export const notify = async (event, payload) => {
  const result = { created: 0, skipped: 0 };
  try {
    const builder = EVENTS[event];
    if (!builder) throw new Error(`Unknown notification event: ${event}`);
    const messages = await builder(payload);

    for (const m of messages) {
      const unique = [...new Set(m.to)];
      const users = new Map((await User.find({ _id: { $in: unique } }, { email: 1, role: 1, status: 1 }).lean()).map((u) => [String(u._id), u]));
      for (const userId of unique) {
        const user = users.get(userId);
        if (!user || user.status === 'suspended') continue;
        const link = m.route(user.role);
        try {
          const row = await Notification.create({ user: userId, property: m.property, type: m.type, title: m.title, body: m.body, link, dedupeKey: `${m.key}:${userId}` });
          result.created += 1;
          const email = await deliverEmail(user, { title: m.title, body: m.body, link });
          if (email !== 'skipped') await Notification.updateOne({ _id: row._id }, { $set: { 'delivery.email': email } });
        } catch (err) {
          if (err?.code === 11000) result.skipped += 1;
          else throw err;
        }
      }
    }
  } catch (err) {
    logger.error(`notify(${event}) failed`, err.message);
  }
  return result;
};

/* ---------- reading ---------- */

export const listNotifications = async (user, { unread, ...paging }) => {
  const filter = { user: user._id, ...(unread && { readAt: { $exists: false } }) };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(paginate(paging).skip).limit(paging.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: user._id, readAt: { $exists: false } }),
  ]);
  return { items, unreadCount, pagination: pageMeta(paging, total) };
};

export const markRead = async (user, notificationId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: user._id, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean();
  if (notification) return notification;
  const existing = await Notification.findOne({ _id: notificationId, user: user._id }).lean(); // already read: idempotent
  if (!existing) throw ApiError.notFound('Notification not found');
  return existing;
};

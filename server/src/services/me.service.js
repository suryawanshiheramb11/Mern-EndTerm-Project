import { Complaint } from '../models/Complaint.js';
import { Notification } from '../models/Notification.js';
import { Property } from '../models/Property.js';
import { Resident } from '../models/Resident.js';
import { Stay } from '../models/Stay.js';
import { ApiError } from '../utils/ApiError.js';
import { getResidentBalance } from './balance.service.js';
import { studentResidentIds } from './scope.js';

/*
 * The student's own view. Every query starts from the resident profile(s) linked to the logged-in
 * user (Resident.userId), so there is no id a student can change to see someone else's data.
 * Lists and receipts reuse the same scoped services as the staff API (charge, payment, refund and
 * complaint services scope students by ownership), exposed under /api/me.
 */

const populateStay = (query) =>
  query.populate('room', 'number floor').populate('bed', 'label').populate('property', 'name address contact');

export const getMyStay = async (user) => {
  const residents = await studentResidentIds(user);
  return populateStay(Stay.findOne({ resident: { $in: residents }, status: 'active' }).sort({ checkInDate: -1 })).lean();
};

export const getProfile = async (user) => {
  const resident = await Resident.findOne({ userId: user._id }).lean();
  const property = resident ? await Property.findById(resident.property, { name: 1, address: 1, contact: 1 }).lean() : null;
  return { user: user.toSafeJSON(), resident, property };
};

/** Dashboard: where they live, what is next due, what they owe, and the latest notice. */
export const getSummary = async (user) => {
  const residents = await studentResidentIds(user);
  const [stay, notice, complaintsOpen] = await Promise.all([
    getMyStay(user),
    Notification.findOne({ user: user._id, type: 'announcement' }).sort({ createdAt: -1 }).lean(),
    Complaint.countDocuments({ resident: { $in: residents }, status: { $nin: ['resolved', 'closed'] } }),
  ]);

  let balance = null;
  let nextDue = null;
  if (residents.length) {
    balance = await getResidentBalance(residents[0]);
    const next = balance.breakdownByCharge.filter((c) => c.outstandingPaise > 0).sort((a, b) => a.dueDate - b.dueDate)[0];
    nextDue = next ? { chargeId: next.chargeId, periodKey: next.periodKey, dueDate: next.dueDate, outstandingPaise: next.outstandingPaise, status: next.status } : null;
  }
  const unread = await Notification.countDocuments({ user: user._id, readAt: { $exists: false } });
  return {
    stay,
    nextDue,
    outstandingPaise: balance?.outstandingPaise ?? 0,
    overduePaise: balance?.overduePaise ?? 0,
    advancesPaise: balance?.advancesPaise ?? 0,
    depositHeldPaise: balance?.depositHeldPaise ?? 0,
    latestNotice: notice && { id: String(notice._id), title: notice.title, body: notice.body, createdAt: notice.createdAt },
    openComplaints: complaintsOpen,
    unreadNotifications: unread,
  };
};

export const assertStudent = (user) => {
  if (user.role !== 'student') throw ApiError.forbidden('Insufficient permissions');
};


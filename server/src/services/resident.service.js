import { Resident } from '../models/Resident.js';
import { Stay } from '../models/Stay.js';
import { User } from '../models/User.js';
import { PERMISSIONS } from '../config/permissions.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/regex.js';
import { toDotPaths } from '../utils/objects.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { generateTempPassword, generateToken, hashToken } from '../utils/tokens.js';
import { assertPropertyAccess, getUserPropertyIds } from './propertyAccess.service.js';
import { loadInScope } from './scope.js';
import { deliverToken, revokeSessionsFor, setTemporaryPassword } from './auth.service.js';
import { writeAudit } from './audit.service.js';
import { studentResidentIds } from './scope.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };

export const createResident = async (user, { propertyId, ...input }) => {
  await assertPropertyAccess(user, propertyId, { permission: PERMISSIONS.RESIDENTS_WRITE });
  const resident = await Resident.create({ ...input, property: propertyId, createdBy: user._id });
  return resident.toObject();
};

export const listResidents = async (user, { propertyId, status, q, ...paging }) => {
  const permission = PERMISSIONS.RESIDENTS_VIEW;
  let propertyScope;
  if (propertyId) {
    await assertPropertyAccess(user, propertyId, { permission });
    propertyScope = propertyId;
  } else {
    propertyScope = { $in: await getUserPropertyIds(user, { permission }) };
  }

  const filter = { property: propertyScope };
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ fullName: rx }, { phone: rx }, { email: rx }];
  }

  const [items, total] = await Promise.all([
    Resident.find(filter).collation(CASE_INSENSITIVE).sort({ fullName: 1 }).skip(paginate(paging).skip).limit(paging.limit).lean(),
    Resident.countDocuments(filter),
  ]);

  const stays = await Stay.find({ resident: { $in: items.map((r) => r._id) }, status: 'active' })
    .populate('bed', 'label')
    .populate('room', 'number')
    .lean();
  const current = new Map(stays.map((s) => [String(s.resident), s]));

  return {
    items: items.map((resident) => {
      const stay = current.get(String(resident._id));
      return {
        resident,
        currentStay: stay && {
          id: String(stay._id),
          bedLabel: stay.bed?.label,
          roomNumber: stay.room?.number,
          isReservation: Boolean(stay.reservationTimer),
        },
      };
    }),
    pagination: pageMeta(paging, total),
  };
};

export const getResident = async (user, id) =>
  (await loadInScope(Resident, id, user, { label: 'Resident', permission: PERMISSIONS.RESIDENTS_VIEW })).toObject();

export const updateResident = async (user, id, patch) => {
  const resident = await loadInScope(Resident, id, user, { label: 'Resident', permission: PERMISSIONS.RESIDENTS_WRITE });

  if (patch.status === 'former' && (await Stay.exists({ resident: resident._id, status: 'active' }))) {
    throw ApiError.conflict('Resident has an active stay');
  }
  return Resident.findByIdAndUpdate(resident._id, { $set: toDotPaths(patch) }, { new: true, runValidators: true }).lean();
};

// Throws before anything is written, so check-in can validate an invite up front.
export const assertInvitable = async (resident) => {
  if (!resident.email) throw ApiError.badRequest('Resident needs an email address to be invited');
  if (resident.userId) throw ApiError.conflict('Resident has already been invited');
  if (await User.exists({ email: resident.email })) throw ApiError.conflict('A user with this email already exists');
};

/**
 * Creates the student's login in 'invited' state and links it to the resident. The invitee sets a
 * password with the one-time token (POST /api/auth/reset-password), which also activates them.
 */
export const inviteResident = async (resident) => {
  await assertInvitable(resident);

  const token = generateToken();
  const account = new User({
    name: resident.fullName,
    email: resident.email,
    role: 'student',
    status: 'invited',
    passwordResetToken: hashToken(token),
    passwordResetExpires: new Date(Date.now() + INVITE_TTL_MS),
  });
  account.password = generateToken(24); // unusable placeholder; replaced when the invite is accepted

  try {
    await account.save();
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict('A user with this email already exists');
    throw err;
  }

  const linked = await Resident.findOneAndUpdate(
    { _id: resident._id, userId: { $exists: false } },
    { userId: account._id },
    { new: true },
  ).lean();
  if (!linked) {
    await User.deleteOne({ _id: account._id });
    throw ApiError.conflict('Resident has already been invited');
  }

  deliverToken('student invite', account.email, token);
  return { resident: linked, user: account, token };
};

export const inviteResidentById = async (user, id) => {
  const resident = await loadInScope(Resident, id, user, { label: 'Resident', permission: PERMISSIONS.RESIDENTS_WRITE });
  return inviteResident(resident);
};

/**
 * Gives the resident a login with a password the owner/warden hands over (generated unless one is
 * supplied). Creates the student account if there is none, otherwise resets its password. The
 * student must change it at first sign-in. The password is returned once and never stored in clear.
 */
export const setResidentCredentials = async (actor, id, { email, password } = {}) => {
  const resident = await loadInScope(Resident, id, actor, { label: 'Resident', permission: PERMISSIONS.RESIDENTS_WRITE });
  const temporary = password ?? generateTempPassword();
  let account = resident.userId ? await User.findById(resident.userId) : null;
  let created = false;

  if (!account) {
    const address = email ?? resident.email;
    if (!address) throw ApiError.badRequest('Give an email address for the login', [{ field: 'email', message: 'Required' }]);
    if (await User.exists({ email: address })) throw ApiError.conflict('A user with this email already exists');
    account = new User({ name: resident.fullName, email: address, role: 'student' });
    account.password = temporary;
    try {
      await account.save();
    } catch (err) {
      if (err?.code === 11000) throw ApiError.conflict('A user with this email already exists');
      throw err;
    }
    const linked = await Resident.findOneAndUpdate({ _id: resident._id, userId: { $exists: false } }, { userId: account._id, email: address }, { new: true });
    if (!linked) {
      await User.deleteOne({ _id: account._id });
      throw ApiError.conflict('This resident already has a login');
    }
    created = true;
  } else if (account.role !== 'student') {
    throw ApiError.conflict('This resident is linked to a non-student account');
  }

  await setTemporaryPassword(account, temporary);
  await writeAudit({
    user: actor, action: created ? 'student.credentials.create' : 'student.password.reset', entityType: 'User', entityId: account._id,
    property: resident.property, after: { email: account.email, mustChangePassword: true },
  });
  return { resident: (await Resident.findById(resident._id).lean()), user: account, temporaryPassword: temporary, created };
};

/** Changes the email a student signs in with (and the resident's contact email). Signs them out everywhere. */
export const changeResidentEmail = async (actor, id, { email }) => {
  const resident = await loadInScope(Resident, id, actor, { label: 'Resident', permission: PERMISSIONS.RESIDENTS_WRITE });
  if (resident.email === email && (!resident.userId || (await User.exists({ _id: resident.userId, email })))) return { resident: resident.toObject(), user: null };
  if (await User.exists({ email, _id: { $ne: resident.userId } })) throw ApiError.conflict('A user with this email already exists');

  const before = resident.email;
  let account = null;
  if (resident.userId) {
    account = await User.findById(resident.userId);
    if (account && account.role === 'student') {
      account.email = email;
      account.emailVerified = false;
      account.passwordChangedAt = new Date();
      account.tokenVersion = (account.tokenVersion ?? 0) + 1;
      try {
        await account.save();
      } catch (err) {
        if (err?.code === 11000) throw ApiError.conflict('A user with this email already exists');
        throw err;
      }
      await revokeSessionsFor(account._id);
    }
  }
  const updated = await Resident.findByIdAndUpdate(resident._id, { $set: { email } }, { new: true }).lean();
  await writeAudit({ user: actor, action: 'student.email.change', entityType: 'Resident', entityId: resident._id, property: resident.property, before: { email: before }, after: { email } });
  return { resident: updated, user: account };
};

/** A student editing their own details (emergency contact, guardian, medical). */
export const updateOwnDetails = async (user, patch) => {
  const [residentId] = await studentResidentIds(user);
  if (!residentId) throw ApiError.notFound('No resident profile is linked to this account');
  return Resident.findByIdAndUpdate(residentId, { $set: toDotPaths(patch) }, { new: true, runValidators: true }).lean();
};

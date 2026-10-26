import { Resident } from '../models/Resident.js';
import { Stay } from '../models/Stay.js';
import { User } from '../models/User.js';
import { PERMISSIONS } from '../config/permissions.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/regex.js';
import { toDotPaths } from '../utils/objects.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { generateToken, hashToken } from '../utils/tokens.js';
import { assertPropertyAccess, getUserPropertyIds } from './propertyAccess.service.js';
import { loadInScope } from './scope.js';
import { deliverToken } from './auth.service.js';

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

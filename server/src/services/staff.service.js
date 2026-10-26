import { User } from '../models/User.js';
import { DEFAULT_PERMISSIONS } from '../config/permissions.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { generateToken, hashToken } from '../utils/tokens.js';
import { writeAudit } from './audit.service.js';
import { deliverToken } from './auth.service.js';
import { sendEmail } from './emailTransport.js';
import { assertPropertyAccess } from './propertyAccess.service.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const present = (user, propertyId) => {
  const entry = user.propertyAccess.find((e) => String(e.property) === String(propertyId));
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, status: user.status, permissions: entry?.permissions ?? [] };
};

/** Owner-only (the route guards the role; this checks they own the property). */
export const inviteStaff = async (owner, propertyId, { email, name, role, permissions }) => {
  await assertPropertyAccess(owner, propertyId);
  if (await User.exists({ email })) throw ApiError.conflict('A user with this email already exists');

  const granted = permissions ?? [...DEFAULT_PERMISSIONS[role]];
  const token = generateToken();
  const user = new User({
    name,
    email,
    role,
    status: 'invited',
    passwordResetToken: hashToken(token),
    passwordResetExpires: new Date(Date.now() + INVITE_TTL_MS),
    propertyAccess: [{ property: propertyId, role, permissions: granted }],
  });
  user.password = generateToken(24); // unusable placeholder; replaced when the invite is accepted
  try {
    await user.save();
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict('A user with this email already exists');
    throw err;
  }

  await writeAudit({ user: owner, action: 'staff.invite', entityType: 'User', entityId: user._id, property: propertyId, after: { email, role, permissions: granted } });

  deliverToken('staff invite', email, token);
  try {
    await sendEmail({ to: email, subject: 'You have been invited to StayOS', text: `${owner.name} invited you as ${role}.\nSet your password: ${env.CLIENT_URL}/reset-password?token=${token}` });
  } catch (err) {
    logger.error('Staff invite email failed', err.message); // the invite stands; the owner can still share the link
  }
  return { user: present(user, propertyId), token };
};

const staffUser = async (propertyId, userId) => {
  const user = await User.findOne({ _id: userId, role: { $in: ['warden', 'maintenance'] }, 'propertyAccess.property': propertyId });
  if (!user) throw ApiError.notFound('Staff member not found');
  return user;
};

export const listStaff = async (owner, propertyId) => {
  await assertPropertyAccess(owner, propertyId);
  const users = await User.find({ role: { $in: ['warden', 'maintenance'] }, 'propertyAccess.property': propertyId }).sort({ name: 1 });
  return users.map((u) => present(u, propertyId));
};

export const updateStaff = async (owner, propertyId, userId, { role, permissions }) => {
  await assertPropertyAccess(owner, propertyId);
  const user = await staffUser(propertyId, userId);
  const before = present(user, propertyId);

  const set = {};
  if (permissions) set['propertyAccess.$.permissions'] = permissions;
  if (role && role !== user.role) {
    // The account has one role, so it can only change while this is its only property.
    if (user.propertyAccess.length > 1) throw ApiError.conflict('This person has access to other properties; their role cannot be changed here');
    set['propertyAccess.$.role'] = role;
    set.role = role;
  }
  const updated = await User.findOneAndUpdate({ _id: user._id, 'propertyAccess.property': propertyId }, { $set: set }, { new: true, runValidators: true });
  const after = present(updated, propertyId);
  await writeAudit({ user: owner, action: 'staff.update', entityType: 'User', entityId: user._id, property: propertyId, before: { role: before.role, permissions: before.permissions }, after: { role: after.role, permissions: after.permissions } });
  return after;
};

/** Removes this property from the person's access. The account itself is never deleted. */
export const revokeStaff = async (owner, propertyId, userId) => {
  await assertPropertyAccess(owner, propertyId);
  const user = await staffUser(propertyId, userId);
  const before = present(user, propertyId);
  await User.updateOne({ _id: user._id }, { $pull: { propertyAccess: { property: propertyId } } });
  await writeAudit({ user: owner, action: 'staff.revoke', entityType: 'User', entityId: user._id, property: propertyId, before: { role: before.role, permissions: before.permissions }, after: { access: 'revoked' } });
  return { revoked: true, userId: String(user._id) };
};

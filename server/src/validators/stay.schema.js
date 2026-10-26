import { z } from 'zod';
import { STAY_STATUSES } from '../models/Stay.js';
import { dateOnly, objectId, paise, pagination } from './common.js';

export const createStaySchema = z
  .object({
    residentId: objectId,
    bedId: objectId,
    action: z.enum(['checkin', 'reserve']),
    checkInDate: dateOnly,
    expectedCheckOutDate: dateOnly.optional(),
    monthlyRentPaise: paise.optional(),
    depositPaise: paise, // required: callers must state the deposit explicitly (0 is allowed)
    billingDay: z.number().int().min(1).max(28).optional(),
    agreedDiscountPaise: paise.optional(),
    termsAcknowledged: z.literal(true, { errorMap: () => ({ message: 'Terms must be acknowledged' }) }),
    inviteStudent: z.boolean().optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.expectedCheckOutDate && body.expectedCheckOutDate <= body.checkInDate) {
      ctx.addIssue({ code: 'custom', path: ['expectedCheckOutDate'], message: 'Must be after the check-in date' });
    }
  });

export const transferStaySchema = z
  .object({
    newBedId: objectId,
    transferDate: dateOnly,
    reason: z.string().trim().min(1).max(300).optional(),
    monthlyRentPaise: paise.optional(),
  })
  .strict();

export const listStaysQuery = z
  .object({
    ...pagination,
    propertyId: objectId.optional(),
    status: z.enum(STAY_STATUSES).optional(),
    residentId: objectId.optional(),
    bedId: objectId.optional(),
  })
  .strict();

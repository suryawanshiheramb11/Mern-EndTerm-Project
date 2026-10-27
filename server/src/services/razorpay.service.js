import crypto from 'node:crypto';
import { RentCharge } from '../models/RentCharge.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { outstandingOf } from '../utils/billing.js';
import { recordPayment } from './payment.service.js';
import { loadInScope } from './scope.js';

/*
 * Online rent payment through Razorpay Standard Checkout (no SDK; plain REST + HMAC).
 *
 *   1. createOrder   – the server picks the amount (the charge's outstanding paise) and creates a
 *                      Razorpay order tagged with the charge/resident/property in `notes`.
 *   2. Checkout runs in the browser and returns order_id, payment_id and signature.
 *   3. verifyAndRecord – checks the HMAC signature, re-reads the order from Razorpay (the amount and
 *                      notes come from Razorpay, never from the client) and records the payment
 *                      idempotently, keyed by the Razorpay payment id.
 *
 * Swap point: `razorpayFetch` is the only function that talks to Razorpay.
 */

const API = 'https://api.razorpay.com/v1';

const credentials = () => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new ApiError(503, 'Online payments are not configured');
  return { keyId: env.RAZORPAY_KEY_ID, secret: env.RAZORPAY_KEY_SECRET };
};

const razorpayFetch = async (path, init = {}) => {
  const { keyId, secret } = credentials();
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(502, 'Could not reach the payment gateway');
  }
  if (!res.ok) throw new ApiError(502, 'The payment gateway rejected the request');
  return res.json();
};

/** HMAC-SHA256(order_id|payment_id) with the key secret, compared in constant time. */
export const isValidSignature = ({ orderId, paymentId, signature }) => {
  const { secret } = credentials();
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const createOrder = async (user, { chargeId, amountPaise: requested }) => {
  credentials();
  const charge = await loadInScope(RentCharge, chargeId, user, { label: 'Charge' });
  const outstanding = outstandingOf(charge, charge.paidPaise);
  if (charge.status === 'waived' || outstanding < 1) throw ApiError.conflict('Nothing is due on this charge');
  // Default is the full balance; a student may pay part of it (Razorpay's minimum is 100 paise).
  const amountPaise = requested ?? outstanding;
  if (amountPaise > outstanding) throw ApiError.badRequest('Validation failed', [{ field: 'amountPaise', message: `Cannot exceed the outstanding ${outstanding} paise` }]);
  if (amountPaise < 100 && amountPaise !== outstanding) throw ApiError.badRequest('Validation failed', [{ field: 'amountPaise', message: 'Minimum online payment is ₹1' }]);

  const order = await razorpayFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: `chg_${String(charge._id).slice(-12)}_${Date.now().toString(36)}`,
      notes: { chargeId: String(charge._id), residentId: String(charge.resident), propertyId: String(charge.property), periodKey: charge.periodKey },
    }),
  });
  return { orderId: order.id, keyId: env.RAZORPAY_KEY_ID, amountPaise, currency: 'INR', description: `Rent ${charge.periodKey}` };
};

export const verifyAndRecord = async (user, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }) => {
  credentials();
  if (!isValidSignature({ orderId, paymentId, signature })) throw ApiError.badRequest('Payment signature could not be verified');

  const order = await razorpayFetch(`/orders/${encodeURIComponent(orderId)}`);
  const { chargeId, residentId, propertyId } = order.notes ?? {};
  // Ownership: the order must be for a charge of the caller's own resident profile.
  const charge = await loadInScope(RentCharge, chargeId, user, { label: 'Charge' });
  if (String(charge.resident) !== residentId || String(charge.property) !== propertyId) throw ApiError.notFound('Charge not found');

  return recordPayment({
    propertyId: charge.property,
    residentId: charge.resident,
    amountPaise: order.amount,
    method: 'razorpay',
    reference: paymentId,
    // Cap at what is still owed; any overpayment (another payment cleared it meanwhile) becomes an advance.
    allocations: [{ chargeId: charge._id, amountPaise: Math.min(order.amount, outstandingOf(charge, charge.paidPaise)) }].filter((a) => a.amountPaise > 0),
    allowAdvance: true,
    idempotencyKey: `rzp_${paymentId}`,
    notes: `Razorpay order ${orderId}`,
    receivedBy: user._id,
  });
};

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureIndexes } from '../src/config/db.js';
import { generateCharges, wipeAll, world, RENT } from './helpers.js';

beforeAll(async () => {
  await mongoose.connect(env.MONGO_URI);
  await ensureIndexes();
});
afterAll(() => mongoose.disconnect());
beforeEach(wipeAll);
afterEach(() => vi.unstubAllGlobals());

const sign = (orderId, paymentId, secret = env.RAZORPAY_KEY_SECRET) =>
  crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

// Fake gateway: remembers created orders so GET /orders/:id returns what POST stored.
const stubGateway = () => {
  const orders = new Map();
  const payments = new Map(); // payment id -> { order_id, amount, status? }
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const path = String(url).replace('https://api.razorpay.com/v1', '');
    if (init.method === 'POST' && path === '/orders') {
      const order = { id: `order_${orders.size + 1}ABCDEF`, ...JSON.parse(init.body) };
      orders.set(order.id, order);
      return { ok: true, json: async () => order };
    }
    if (path.startsWith('/payments/')) {
      const id = decodeURIComponent(path.replace('/payments/', ''));
      const entry = payments.get(id);
      return entry ? { ok: true, json: async () => ({ id, status: 'captured', ...entry }) } : { ok: false, json: async () => ({}) };
    }
    const order = orders.get(path.replace('/orders/', ''));
    return order ? { ok: true, json: async () => order } : { ok: false, json: async () => ({}) };
  }));
  return { orders, payments, capture: (paymentId, orderId, extra = {}) => payments.set(paymentId, { order_id: orderId, amount: orders.get(orderId).amount, ...extra }) };
};

describe('razorpay online payment', () => {
  it('creates an order for the outstanding amount and records a verified-signature payment once', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const charge = (await ctx.student.get('/api/me/charges')).body.data.items[0];
    const gw = stubGateway();

    const order = (await ctx.student.post('/api/me/payments/razorpay/order').send({ chargeId: charge.id })).body.data.order;
    gw.capture('pay_TEST123456', order.orderId);
    expect(order).toMatchObject({ amountPaise: RENT, currency: 'INR', keyId: env.RAZORPAY_KEY_ID });

    const body = { razorpay_order_id: order.orderId, razorpay_payment_id: 'pay_TEST123456', razorpay_signature: sign(order.orderId, 'pay_TEST123456') };
    const first = await ctx.student.post('/api/me/payments/razorpay/verify').send(body);
    expect(first.status).toBe(200);
    expect(first.body.data.payment).toMatchObject({ amountPaise: RENT, method: 'razorpay', reference: 'pay_TEST123456' });
    expect(first.body.data.replayed).toBe(false);

    const again = await ctx.student.post('/api/me/payments/razorpay/verify').send(body);
    expect(again.body.data.replayed).toBe(true);
    expect((await ctx.student.get('/api/me/payments')).body.data.items).toHaveLength(1);
    expect((await ctx.student.get('/api/me/charges')).body.data.items[0].outstandingPaise).toBe(0);
  });

  it('lets a student pay part of the rent, then the rest', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const charge = (await ctx.student.get('/api/me/charges')).body.data.items[0];
    const gw = stubGateway();
    const too = await ctx.student.post('/api/me/payments/razorpay/order').send({ chargeId: charge.id, amountPaise: RENT + 100 });
    expect(too.status).toBe(400);
    expect((await ctx.student.post('/api/me/payments/razorpay/order').send({ chargeId: charge.id, amountPaise: 50 })).status).toBe(400);

    const order = (await ctx.student.post('/api/me/payments/razorpay/order').send({ chargeId: charge.id, amountPaise: 300000 })).body.data.order;
    expect(order.amountPaise).toBe(300000);
    gw.capture('pay_PART123456', order.orderId);
    const ok = { razorpay_order_id: order.orderId, razorpay_payment_id: 'pay_PART123456', razorpay_signature: sign(order.orderId, 'pay_PART123456') };
    expect((await ctx.student.post('/api/me/payments/razorpay/verify').send(ok)).status).toBe(200);
    expect((await ctx.student.get('/api/me/charges')).body.data.items[0]).toMatchObject({ status: expect.stringMatching(/partial|overdue/), outstandingPaise: RENT - 300000 });
  });

  it('rejects a bad signature, staff, another student, and leaves no payment behind', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const charge = (await ctx.student.get('/api/me/charges')).body.data.items[0];
    const gw = stubGateway();
    const order = (await ctx.student.post('/api/me/payments/razorpay/order').send({ chargeId: charge.id })).body.data.order;
    gw.capture('pay_OTHER12345', order.orderId);

    const forged = { razorpay_order_id: order.orderId, razorpay_payment_id: 'pay_FORGED123', razorpay_signature: sign(order.orderId, 'pay_FORGED123', 'wrong') };
    expect((await ctx.student.post('/api/me/payments/razorpay/verify').send(forged)).status).toBe(400);
    expect((await ctx.owner.post('/api/me/payments/razorpay/order').send({ chargeId: charge.id })).status).toBe(403);

    const other = await world();
    expect((await other.student.post('/api/me/payments/razorpay/order').send({ chargeId: charge.id })).status).toBe(404);
    const ok = { razorpay_order_id: order.orderId, razorpay_payment_id: 'pay_OTHER12345', razorpay_signature: sign(order.orderId, 'pay_OTHER12345') };
    expect((await other.student.post('/api/me/payments/razorpay/verify').send(ok)).status).toBe(404);
    expect((await ctx.student.get('/api/me/payments')).body.data.items).toHaveLength(0);
  });

  it('refuses a payment Razorpay has not captured', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const charge = (await ctx.student.get('/api/me/charges')).body.data.items[0];
    const gw = stubGateway();
    const order = (await ctx.student.post('/api/me/payments/razorpay/order').send({ chargeId: charge.id })).body.data.order;
    gw.capture('pay_AUTHONLY12', order.orderId, { status: 'authorized' });
    const body = { razorpay_order_id: order.orderId, razorpay_payment_id: 'pay_AUTHONLY12', razorpay_signature: sign(order.orderId, 'pay_AUTHONLY12') };
    expect((await ctx.student.post('/api/me/payments/razorpay/verify').send(body)).status).toBe(409);
    expect((await ctx.student.get('/api/me/payments')).body.data.items).toHaveLength(0);
  });

  it('webhook: needs a valid signature, records a captured payment once, and ignores other events', async () => {
    const ctx = await world();
    await generateCharges(ctx.owner, ctx.property.id);
    const charge = (await ctx.student.get('/api/me/charges')).body.data.items[0];
    const gw = stubGateway();
    const order = (await ctx.student.post('/api/me/payments/razorpay/order').send({ chargeId: charge.id })).body.data.order;
    gw.capture('pay_WEBHOOK123', order.orderId);

    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_WEBHOOK123', order_id: order.orderId } } } });
    const sig = (body, secret = env.RAZORPAY_WEBHOOK_SECRET) => crypto.createHmac('sha256', secret).update(body).digest('hex');
    const post = (body, signature) => request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(body);

    expect((await post(raw, sig(raw, 'wrong'))).status).toBe(401);
    expect((await ctx.student.get('/api/me/payments')).body.data.items).toHaveLength(0);

    const ok = await post(raw, sig(raw));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ handled: true, replayed: false });
    expect((await post(raw, sig(raw))).body.data.replayed).toBe(true);
    expect((await ctx.student.get('/api/me/payments')).body.data.items).toHaveLength(1);

    const other = JSON.stringify({ event: 'order.paid', payload: {} });
    expect((await post(other, sig(other))).body.data.handled).toBe(false);
  });
});

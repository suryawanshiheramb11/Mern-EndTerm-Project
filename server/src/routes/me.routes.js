import { Router } from 'express';
import * as ctrl from '../controllers/me.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { createComplaintSchema } from '../validators/complaint.schema.js';
import { notificationParams, razorpayOrderSchema, razorpayVerifySchema, notificationsQuery, pageQuery, paymentIdParams } from '../validators/me.schema.js';

/*
 * Student self-service. Everything is scoped to the caller's own resident profile in the service
 * layer (ownership, never an id from the request). Notifications are open to every signed-in role,
 * since staff receive them too.
 */
const router = Router();
const student = authorize('student');

router.use(authenticate);

router.get('/notifications', validate({ query: notificationsQuery }), ctrl.listNotifications);
router.post('/notifications/:id/read', validate({ params: notificationParams }), ctrl.markNotificationRead);

router.get('/summary', student, ctrl.summary);
router.get('/profile', student, ctrl.profile);
router.get('/stay', student, ctrl.stay);
router.get('/charges', student, validate({ query: pageQuery }), ctrl.listCharges);
router.get('/payments', student, validate({ query: pageQuery }), ctrl.listPayments);
router.get('/receipts/:paymentId', student, validate({ params: paymentIdParams }), ctrl.receipt);
router.get('/refunds', student, validate({ query: pageQuery }), ctrl.listRefunds);
router.get('/complaints', student, validate({ query: pageQuery }), ctrl.listComplaints);
router.post('/complaints', student, validate({ body: createComplaintSchema }), ctrl.createComplaint); // alias of POST /api/complaints
router.post('/payments/razorpay/order', student, validate({ body: razorpayOrderSchema }), ctrl.razorpayOrder);
router.post('/payments/razorpay/verify', student, validate({ body: razorpayVerifySchema }), ctrl.razorpayVerify);

export default router;

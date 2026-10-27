import { Router } from 'express';
import authRoutes from './auth.routes.js';
import propertyRoutes from './property.routes.js';
import residentRoutes from './resident.routes.js';
import stayRoutes from './stay.routes.js';
import rentChargeRoutes from './rentCharge.routes.js';
import paymentRoutes from './payment.routes.js';
import refundRoutes from './refund.routes.js';
import complaintRoutes from './complaint.routes.js';
import expenseRoutes from './expense.routes.js';
import reportRoutes from './report.routes.js';
import adminRoutes from './admin.routes.js';
import meRoutes from './me.routes.js';
import webhookRoutes from './webhook.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/properties', propertyRoutes);
router.use('/residents', residentRoutes);
router.use('/stays', stayRoutes);
router.use('/rent-charges', rentChargeRoutes);
router.use('/payments', paymentRoutes);
router.use('/refunds', refundRoutes);
router.use('/complaints', complaintRoutes);
router.use('/expenses', expenseRoutes);
router.use('/reports', reportRoutes);
router.use('/admin', adminRoutes);
router.use('/me', meRoutes);
router.use('/webhooks', webhookRoutes);

export default router;

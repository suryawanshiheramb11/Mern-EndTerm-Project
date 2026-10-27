import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { noStore } from '../middleware/noStore.js';
import { authLimiter, forgotPasswordLimiter, googleLimiter, loginLimiter, otpLimiter, registerLimiter } from '../middleware/rateLimiters.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  googleSchema,
  otpRequestSchema,
  otpVerifySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.schema.js';

const router = Router();

router.use(noStore, authLimiter);

router.post('/register', registerLimiter, validate({ body: registerSchema }), ctrl.register);
router.post('/login', loginLimiter, validate({ body: loginSchema }), ctrl.login);
router.post('/logout', ctrl.logout);
router.post('/refresh', ctrl.refresh);
router.get('/me', authenticate, ctrl.me);
router.post('/forgot-password', forgotPasswordLimiter, validate({ body: forgotPasswordSchema }), ctrl.forgotPassword);
router.post('/reset-password', validate({ body: resetPasswordSchema }), ctrl.resetPassword);
router.post('/verify-email', validate({ body: verifyEmailSchema }), ctrl.verifyEmail);

router.get('/config', ctrl.config);
router.post('/change-password', authenticate, validate({ body: changePasswordSchema }), ctrl.changePassword);
router.post('/google', googleLimiter, validate({ body: googleSchema }), ctrl.google);
router.post('/otp/request', otpLimiter, validate({ body: otpRequestSchema }), ctrl.otpRequest);
router.post('/otp/verify', otpLimiter, validate({ body: otpVerifySchema }), ctrl.otpVerify);

export default router;

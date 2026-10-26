import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { noStore } from '../middleware/noStore.js';
import { authLimiter, forgotPasswordLimiter, loginLimiter, registerLimiter } from '../middleware/rateLimiters.js';
import {
  forgotPasswordSchema,
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

export default router;

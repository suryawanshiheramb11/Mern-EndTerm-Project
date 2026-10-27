import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { handleWebhook } from '../services/razorpay.service.js';

// Server-to-server; authenticated by Razorpay's HMAC signature over the raw body, not by a session.
const router = Router();

router.post('/razorpay', asyncHandler(async (req, res) => {
  const result = await handleWebhook(req.rawBody, req.get('x-razorpay-signature'));
  ApiResponse.send(res, result);
}));

export default router;

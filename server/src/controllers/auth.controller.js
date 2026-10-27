import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../utils/cookies.js';
import { env } from '../config/env.js';
import * as authService from '../services/auth.service.js';

const sessionMeta = (req) => ({ userAgent: req.get('user-agent'), ip: req.ip });

export const register = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.register(req.body, sessionMeta(req));
  setAuthCookies(res, tokens);
  ApiResponse.created(res, { user: user.toSafeJSON() }, 'Registered');
});

export const login = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.login(req.body, sessionMeta(req));
  setAuthCookies(res, tokens);
  ApiResponse.send(res, { user: user.toSafeJSON() }, 'Logged in');
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearAuthCookies(res);
  ApiResponse.send(res, null, 'Logged out');
});

export const refresh = asyncHandler(async (req, res) => {
  try {
    const { user, tokens } = await authService.refresh(req.cookies?.[REFRESH_COOKIE], sessionMeta(req));
    setAuthCookies(res, tokens);
    ApiResponse.send(res, { user: user.toSafeJSON() }, 'Token refreshed');
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
});

export const me = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { user: req.user.toSafeJSON() });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  ApiResponse.send(res, null, 'If that email is registered, a reset link has been sent');
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body);
  ApiResponse.send(res, null, 'Password updated');
});

export const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.body.token);
  ApiResponse.send(res, null, 'Email verified');
});

export const config = asyncHandler(async (_req, res) => {
  ApiResponse.send(res, { googleClientId: env.GOOGLE_CLIENT_ID ?? null, otpEnabled: env.OTP_ENABLED });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.changePassword(req.user._id, req.body, sessionMeta(req));
  setAuthCookies(res, tokens);
  ApiResponse.send(res, { user: user.toSafeJSON() }, 'Password changed');
});

export const google = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.googleSignIn(req.body, sessionMeta(req));
  setAuthCookies(res, tokens);
  ApiResponse.send(res, { user: user.toSafeJSON() }, 'Signed in with Google');
});

export const otpRequest = asyncHandler(async (req, res) => {
  await authService.requestOtp(req.body.email);
  ApiResponse.send(res, null, 'If that email is registered, a sign-in code has been sent');
});

export const otpVerify = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.verifyOtp(req.body, sessionMeta(req));
  setAuthCookies(res, tokens);
  ApiResponse.send(res, { user: user.toSafeJSON() }, 'Signed in');
});

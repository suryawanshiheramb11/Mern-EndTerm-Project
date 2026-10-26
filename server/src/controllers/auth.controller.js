import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../utils/cookies.js';
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

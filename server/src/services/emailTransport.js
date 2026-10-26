import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/*
 * Swap point for real email. Without SMTP_URL, nodemailer's JSON transport renders each message
 * and we log it, so nothing leaves the machine. For production set SMTP_URL, e.g.
 *   SMTP_URL=smtps://user:password@smtp.example.com:465
 * and nothing else changes (a provider SDK could replace `transport.sendMail` the same way).
 */
const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : nodemailer.createTransport({ jsonTransport: true });

// Recent messages, for inspection in dev and tests (never grows beyond 100).
export const outbox = [];

export const sendEmail = async ({ to, subject, text }) => {
  const info = await transport.sendMail({ from: env.EMAIL_FROM, to, subject, text });
  if (!env.SMTP_URL) {
    logger.info(`[dev] email ${info.message}`);
    outbox.push({ to, subject, text, at: new Date() });
    if (outbox.length > 100) outbox.shift();
  }
  return info;
};

import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const REQUIRED = ['MONGO_URI', 'JWT_SECRET', 'COOKIE_SECRET', 'CLIENT_URL'];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const port = Number(process.env.PORT ?? 5001);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  const weak = ['JWT_SECRET', 'COOKIE_SECRET'].filter(
    (key) => process.env[key].length < 32 || process.env[key].startsWith('change-me'),
  );
  if (weak.length) throw new Error(`Insecure production secrets (need 32+ random chars): ${weak.join(', ')}`);
  if (process.env.JWT_SECRET === process.env.COOKIE_SECRET) {
    throw new Error('JWT_SECRET and COOKIE_SECRET must differ');
  }
}

// Number of reverse-proxy hops in front of the API (load balancer, nginx...). Without it,
// req.ip is the proxy's address and every client shares one rate-limit bucket.
const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
if (!Number.isInteger(trustProxy) || trustProxy < 0) {
  throw new Error(`Invalid TRUST_PROXY: ${process.env.TRUST_PROXY}`);
}

// Hosts attachment URLs may point at (complaint photos). Entries are exact hostnames or
// '*.example.com' wildcards. Empty means no attachment URLs are accepted: opt in explicitly.
const attachmentHosts = (process.env.ATTACHMENT_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export const env = Object.freeze({
  ATTACHMENT_ALLOWED_HOSTS: Object.freeze(attachmentHosts),
  TRUST_PROXY: trustProxy,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: port,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES: process.env.JWT_EXPIRES ?? '15m',
  CLIENT_URL: process.env.CLIENT_URL,
  COOKIE_SECRET: process.env.COOKIE_SECRET,
  // CSRF double-submit is on in production unless explicitly disabled; elsewhere it is opt-in.
  CSRF_ENABLED: process.env.CSRF_ENABLED ? process.env.CSRF_ENABLED === 'true' : isProduction,
  // Email: with no SMTP_URL, messages are rendered as JSON and logged (dev/test).
  EMAIL_ENABLED: process.env.EMAIL_ENABLED !== 'false',
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'StayOS <no-reply@stayos.local>',
  SMTP_URL: process.env.SMTP_URL,
  ENABLE_CRON: process.env.ENABLE_CRON === 'true',
  isProd: process.env.NODE_ENV === 'production',
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
  isTest: process.env.NODE_ENV === 'test',
});

export default env;

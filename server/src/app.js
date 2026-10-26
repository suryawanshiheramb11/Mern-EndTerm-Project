import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { ApiResponse } from './utils/ApiResponse.js';
import { logger } from './utils/logger.js';
import { csrfProtection } from './middleware/csrf.js';
import { originGuard } from './middleware/originGuard.js';
import { requestContext } from './middleware/requestContext.js';
import { sanitizeInput } from './middleware/sanitize.js';
import routes from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.disable('x-powered-by');
if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);
// The API serves JSON only, so scripts, frames and plugins are all refused; the client (a separate
// origin) is the only thing allowed to talk to it.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", env.CLIENT_URL],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }),
);
app.use(originGuard);
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(requestContext);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser(env.COOKIE_SECRET));
app.use(sanitizeInput);

if (env.isDev) app.use(morgan('dev'));

// Lightweight request logger (skipped in test; morgan covers dev)
if (!env.isDev && !env.isTest) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });
}

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.isProd ? 300 : 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
  }),
);

app.use('/api', csrfProtection);

app.get('/api/health', (_req, res) => {
  ApiResponse.send(res, { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }, 'Healthy');
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;

import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

let listenersAttached = false;

const attachListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;
  const conn = mongoose.connection;
  conn.on('connected', () => logger.info('MongoDB connected'));
  conn.on('disconnected', () => logger.warn('MongoDB disconnected'));
  conn.on('reconnected', () => logger.info('MongoDB reconnected'));
  conn.on('error', (err) => logger.error('MongoDB error:', err.message));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const connectDB = async () => {
  attachListeners();
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      return mongoose.connection;
    } catch (err) {
      logger.error(`MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt === MAX_RETRIES) throw err;
      await sleep(RETRY_DELAY_MS);
    }
  }
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  }
};

// Unique and partial-unique indexes are load-bearing for bed allocation; build them before serving.
export const ensureIndexes = () => Promise.all(Object.values(mongoose.models).map((model) => model.init()));

// Serverless entry point: connect and build indexes once per instance, reusing the promise.
// A failed attempt clears the cache so the next request retries.
let ready;
export const connectOnce = () => {
  ready ??= (async () => {
    await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 });
    await ensureIndexes();
    return mongoose.connection;
  })().catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
};

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { runOverdueReconcile } from './overdueReconcile.js';
import { runRentReminders } from './rentReminders.js';
import { runUpcomingEvents } from './upcomingEvents.js';

export const JOBS = Object.freeze({
  rentReminders: runRentReminders,
  overdueReconcile: runOverdueReconcile,
  upcomingEvents: runUpcomingEvents,
});

export const runJob = (name, options) => JOBS[name](options);

const DAY_MS = 24 * 60 * 60 * 1000;
// 02:00 IST is 20:30 UTC the previous day.
const msUntilNextRun = (now = new Date()) => {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 20, 30));
  if (next <= now) next.setTime(next.getTime() + DAY_MS);
  return next - now;
};

/**
 * Daily scheduler, started only when ENABLE_CRON=true. It is a plain timer so no cron package is
 * needed; to move to node-cron or an external scheduler, call runJob(name) from that instead.
 * Run only one scheduler per deployment (notification dedupe keeps accidental repeats harmless).
 */
export const startScheduler = () => {
  if (!env.ENABLE_CRON) return null;
  let timer;
  const tick = async () => {
    for (const name of Object.keys(JOBS)) {
      try {
        logger.info(`Job ${name}`, JSON.stringify(await runJob(name)));
      } catch (err) {
        logger.error(`Job ${name} failed`, err);
      }
    }
    timer = setTimeout(tick, msUntilNextRun()).unref();
  };
  timer = setTimeout(tick, msUntilNextRun()).unref();
  logger.info('Daily jobs scheduled');
  return () => clearTimeout(timer);
};

import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

let support;

// Transactions need a replica set or sharded cluster; standalone mongod can't run them.
export const supportsTransactions = () => {
  support ??= mongoose.connection.db
    .admin()
    .command({ hello: 1 })
    .then((info) => Boolean(info.setName) || info.msg === 'isdbgrid')
    .catch(() => false);
  return support;
};

/**
 * Runs `work` atomically. `work` receives { session, onRollback }:
 *  - with transactions: session is a live transaction session and any throw aborts it;
 *  - without: session is undefined, and on any throw the registered compensations run in
 *    reverse order. Register one right after each write that has to be undone.
 * `work` must be safe to re-run from scratch (the driver retries transient transaction errors).
 */
export const runAtomic = async (work) => {
  if (await supportsTransactions()) {
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = await work({ session, onRollback: () => {} });
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  const compensations = [];
  try {
    return await work({ session: undefined, onRollback: (fn) => compensations.push(fn) });
  } catch (err) {
    for (const compensate of compensations.reverse()) {
      try {
        await compensate();
      } catch (rollbackErr) {
        logger.error('Rollback step failed; manual reconciliation may be needed', rollbackErr);
      }
    }
    throw err;
  }
};

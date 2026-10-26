import { Counter } from '../models/Counter.js';

/** Atomically returns the next value of the named sequence (1, 2, 3, ...). */
export const nextSeq = async (id, session) => {
  const counter = await Counter.findOneAndUpdate(
    { _id: id },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session, setDefaultsOnInsert: true },
  );
  return counter.seq;
};

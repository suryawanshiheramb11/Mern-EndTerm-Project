import mongoose from 'mongoose';

// Internal sequence generator. Only ever touched via nextSeq() (findOneAndUpdate + $inc + upsert).
const counterSchema = new mongoose.Schema({ _id: { type: String }, seq: { type: Number, default: 0 } }, { collection: 'counters' });

export const Counter = mongoose.model('Counter', counterSchema);
export default Counter;

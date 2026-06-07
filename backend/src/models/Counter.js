import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // entity name, e.g. 'questions', 'papers', etc.
    seq: { type: Number, default: 999 }, // starts at 999 so first is 1000
  },
  { versionKey: false }
);

export const Counter = mongoose.model('Counter', counterSchema);

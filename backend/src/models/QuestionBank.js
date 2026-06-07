import mongoose from 'mongoose';

const questionBankSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      enum: ['system', 'institution', 'faculty', 'custom'],
      required: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    institution: { type: String, default: null },
    visibility: {
      type: String,
      enum: ['public', 'institution', 'private'],
      required: true,
    },
    isPinned: { type: Boolean, default: false },
    pinnedOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

questionBankSchema.index({ type: 1 });
questionBankSchema.index({ createdBy: 1 });
questionBankSchema.index({ visibility: 1 });
questionBankSchema.index({ institution: 1 });
questionBankSchema.index({ isPinned: -1, pinnedOrder: 1 });

export const QuestionBank = mongoose.model('QuestionBank', questionBankSchema);

import mongoose from 'mongoose';

/** Chapter/topic within a subject (maps to frontend `Chapter`). */
const topicSchema = new mongoose.Schema(
  {
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    name: { type: String, required: true, trim: true },
    chapterNumber: { type: Number, default: null },
    class: { type: Number, required: true, min: 6, max: 12 },
    description: { type: String, default: null },
  },
  { timestamps: true }
);

topicSchema.index({ subjectId: 1, class: 1 });

export const Topic = mongoose.model('Topic', topicSchema);

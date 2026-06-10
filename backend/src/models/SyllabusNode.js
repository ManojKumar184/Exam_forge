import mongoose from 'mongoose';

const syllabusNodeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: {
      type: String,
      enum: ['exam_pattern', 'class', 'subject', 'chapter', 'topic'],
      required: true,
    },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusNode', default: null },
    path: { type: String, required: true }, // Format: ",parent_id1,parent_id2,"
    level: { type: Number, required: true }, // 0: exam_pattern, 1: class, 2: subject, 3: chapter, 4: topic
    isActive: { type: Boolean, default: true },
    isCustom: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// High-performance index for prefix path matching and tree building
syllabusNodeSchema.index({ path: 1 });
syllabusNodeSchema.index({ parentId: 1 });
syllabusNodeSchema.index({ type: 1 });
syllabusNodeSchema.index({ isActive: 1 });

export const SyllabusNode = mongoose.model('SyllabusNode', syllabusNodeSchema);

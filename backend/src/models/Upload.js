import mongoose from 'mongoose';

const uploadSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    filePath: { type: String, required: true },
    fileType: { type: String, enum: ['pdf', 'docx', 'image'], required: true },
    fileSize: { type: Number, default: null },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    questionsExtracted: { type: Number, default: 0 },
    questionsApproved: { type: Number, default: 0 },
    processingError: { type: String, default: null },
    processingStage: {
      type: String,
      enum: [
        'uploaded',
        'parsing',
        'extracting',
        'splitting',
        'reconstructing',
        'persisted',
        'semantic_enrichment',
        'ocr',
        'classifying',
        'review',
        'done',
        'failed',
        'extracting_xml',
        'extracting_omml',
        'saving',
        'completed',
      ],
      default: 'uploaded',
    },
    attempts: { type: Number, default: 0 },
    lastHeartbeat: { type: Date, default: Date.now },
    stageLogs: {
      type: [String],
      default: [],
    },
    extractionWarnings: { type: [String], default: [] },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    progress: { type: Number, default: 0 },
    processedAt: { type: Date, default: null },
    extractedQuestionIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Question',
      default: [],
    },
  },
  { timestamps: true }
);

uploadSchema.index({ uploadedBy: 1, createdAt: -1 });
uploadSchema.index({ status: 1, processingStage: 1 });

export const Upload = mongoose.model('Upload', uploadSchema);

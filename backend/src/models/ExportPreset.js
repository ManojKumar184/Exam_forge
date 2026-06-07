import mongoose from 'mongoose';

const exportPresetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  layout: { type: String, enum: ['single_column', 'two_column'], default: 'single_column' },
  margin: { type: String, enum: ['narrow', 'normal', 'wide'], default: 'normal' },
  fontFamily: { type: String, default: 'times_new_roman' },
  fontSize: { type: Number, default: 11 },
  lineSpacing: { type: Number, default: 1.25 },
  // Header Customization
  showInstitutionLogo: { type: Boolean, default: true },
  institutionLogoUrl: { type: String, default: null },
  institutionName: { type: String, default: null },
  examinationName: { type: String, default: null },
  customHeaderText: { type: String, default: null },
  // Footer Customization
  showPageNumber: { type: Boolean, default: true },
  footerInstitutionName: { type: String, default: null },
  customFooterText: { type: String, default: null },
  // Watermark Settings
  watermarkText: { type: String, default: null },
  watermarkOpacity: { type: Number, default: 0.04 },
  watermarkSize: { type: Number, default: 64 },
  watermarkRotation: { type: Number, default: -25 },
  // Cover Page & Numbering Toggles
  showCoverPage: { type: Boolean, default: false },
  numberingMode: { type: String, enum: ['continuous', 'section_wise'], default: 'continuous' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export const ExportPreset = mongoose.model('ExportPreset', exportPresetSchema);

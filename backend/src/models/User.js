import mongoose from 'mongoose';

const ROLES = ['super_admin', 'faculty', 'student'];
const PUBLIC_REGISTER_ROLES = ['faculty', 'student'];

const refreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    fullName: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ROLES,
      default: 'student',
    },
    avatarUrl: { type: String, default: null },
    schoolInstitute: { type: String, default: null },
    phone: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
      select: false,
    },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

// email already has unique index via `unique: true` — do not duplicate
userSchema.index({ role: 1 });

userSchema.statics.ROLES = ROLES;
userSchema.statics.PUBLIC_REGISTER_ROLES = PUBLIC_REGISTER_ROLES;

export const User = mongoose.model('User', userSchema);

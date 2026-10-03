import { QuestionBank } from '../models/QuestionBank.js';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

export async function validateQuestionBankIds(ids, user) {
  const values = Array.isArray(ids) ? ids : ids ? [ids] : [];
  if (!values.length) return [];
  if (values.some((id) => !mongoose.isValidObjectId(id)) || new Set(values.map(String)).size !== values.length) {
    throw new AppError('Question bank IDs are invalid', 400, 'INVALID_QUESTION_BANKS');
  }
  const institutionId = user.activeInstitutionId || user.defaultInstitutionId;
  const allowed = user.role === 'super_admin'
    ? [{ type: 'system' }, ...(institutionId ? [{ institutionId }] : [])]
    : [
        { institutionId, createdBy: user._id },
        ...(user.membershipRole === 'INSTITUTION_ADMIN' ? [{ institutionId, type: 'institution', visibility: 'institution' }] : []),
      ];
  const banks = await QuestionBank.find({ _id: { $in: values }, $or: allowed }).select('_id').lean();
  if (banks.length !== values.length) {
    throw new AppError('One or more question banks are unavailable to this user', 403, 'QUESTION_BANK_FORBIDDEN');
  }
  return banks.map((bank) => bank._id);
}

export async function resolveDefaultQuestionBankIds(user) {
  if (user?.role === 'super_admin') {
    let bank = await QuestionBank.findOne({ type: 'system', name: 'System Global Bank' });
    if (!bank) bank = await QuestionBank.create({
      name: 'System Global Bank',
      description: 'Global repository of questions accessible by everyone.',
      type: 'system',
      createdBy: null,
      institution: null,
      visibility: 'public',
    });
    return [bank._id];
  }
  if (user?.role === 'faculty') {
    const institutionId = user.activeInstitutionId || user.defaultInstitutionId;
    let bank = await QuestionBank.findOne({ type: 'faculty', name: 'My Questions', createdBy: user._id, institutionId });
    if (!bank) bank = await QuestionBank.create({
      name: 'My Questions',
      description: 'Questions created and approved by this faculty account.',
      type: 'faculty',
      createdBy: user._id,
      institution: user.schoolInstitute || null,
      institutionId,
      visibility: 'private',
    });
    return [bank._id];
  }
  return [];
}

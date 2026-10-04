import { QuestionBank } from '../models/QuestionBank.js';
import { Question } from '../models/Question.js';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

export function buildQuestionBankAccessFilter(user) {
  const institutionId = user.activeInstitutionId || user.defaultInstitutionId;
  if (user.role === 'super_admin') {
    return { $or: [{ type: { $in: ['system', 'system_test'] } }, ...(institutionId ? [{ institutionId }] : [])] };
  }
  return {
    $or: [
      { type: 'system', visibility: 'public' },
      ...(user.role === 'faculty' && user.membershipRole === 'FACULTY'
        ? [{ type: 'system_test', visibleToFaculty: true }]
        : []),
      ...(institutionId ? [{ institutionId, createdBy: user._id }] : []),
      ...(institutionId && user.membershipRole === 'INSTITUTION_ADMIN'
        ? [{ institutionId, type: 'institution', visibility: 'institution' }]
        : []),
    ],
  };
}

export async function validateQuestionBankIds(ids, user) {
  const values = Array.isArray(ids) ? ids : ids ? [ids] : [];
  if (!values.length) return [];
  if (values.some((id) => !mongoose.isValidObjectId(id)) || new Set(values.map(String)).size !== values.length) {
    throw new AppError('Question bank IDs are invalid', 400, 'INVALID_QUESTION_BANKS');
  }
  const accessFilter = buildQuestionBankAccessFilter(user);
  const banks = await QuestionBank.find({ _id: { $in: values }, ...accessFilter }).select('_id').lean();
  if (banks.length !== values.length) {
    throw new AppError('One or more question banks are unavailable to this user', 403, 'QUESTION_BANK_FORBIDDEN');
  }
  return banks.map((bank) => bank._id);
}

export async function getSystemTestBankIds(ids, user) {
  const values = Array.isArray(ids) ? ids : ids ? [ids] : [];
  if (!values.length) return [];
  const filter = user.role === 'super_admin'
    ? { type: 'system_test' }
    : user.role === 'faculty' && user.membershipRole === 'FACULTY'
      ? { type: 'system_test', visibleToFaculty: true }
      : { _id: null };
  const banks = await QuestionBank.find({ _id: { $in: values }, ...filter }).select('_id').lean();
  return banks.map((bank) => bank._id);
}

export async function prepareQuestionBankSources(config, user) {
  const sourceIds = config.bank_ids || config.bankIds || config.bank_id || config.bankId;
  const selectedIds = sourceIds ? await validateQuestionBankIds(sourceIds, user) : [];
  const selectedTestBankIds = await getSystemTestBankIds(selectedIds, user);
  const systemTestBank = await QuestionBank.findOne({ type: 'system_test' }).select('_id').lean();
  const excluded = [...(config.exclude_question_ids || config.excludeQuestionIds || [])].map(String);
  if (systemTestBank && !selectedTestBankIds.some((id) => String(id) === String(systemTestBank._id))) {
    const hiddenContent = await Question.find({ bankIds: systemTestBank._id }).select('_id').lean();
    excluded.push(...hiddenContent.map((question) => String(question._id)));
  }
  return {
    ...config,
    ...(selectedIds.length ? { bank_ids: selectedIds } : {}),
    allow_duplicate_content: selectedTestBankIds.length > 0,
    exclude_question_ids: [...new Set(excluded)],
  };
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

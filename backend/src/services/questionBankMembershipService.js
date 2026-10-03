import { QuestionBank } from '../models/QuestionBank.js';

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

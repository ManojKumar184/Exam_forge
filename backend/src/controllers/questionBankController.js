import { QuestionBank } from '../models/QuestionBank.js';
import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';
import { buildQuestionBankAccessFilter } from '../services/questionBankMembershipService.js';
import { recordAudit } from '../services/auditLogService.js';

export async function list(req, res) {
  const query = buildQuestionBankAccessFilter({ ...req.user, activeInstitutionId: req.institutionId, membershipRole: req.membership?.role });

  if (req.query.type) {
    query.type = req.query.type;
  }

  const banks = await QuestionBank.find(query)
    .populate('createdBy', 'full_name')
    .sort({ isPinned: -1, pinnedOrder: 1, name: 1 });

  const populatedBanks = await Promise.all(
    banks.map(async (bank) => {
      const questionCount = await Question.countDocuments({ bankIds: bank._id, $or: [{ institutionId: req.institutionId }, { institutionId: null, visibility: 'public' }] });
      return {
        ...bank.toObject(),
        questionCount,
      };
    })
  );

  res.json({ success: true, data: populatedBanks });
}

export async function getOne(req, res) {
  const bank = await QuestionBank.findOne({ _id: req.params.id, ...buildQuestionBankAccessFilter({ ...req.user, activeInstitutionId: req.institutionId, membershipRole: req.membership?.role }) });
  if (!bank) throw new AppError('Question Bank not found', 404, 'NOT_FOUND');

  res.json({ success: true, data: bank });
}

export async function setSystemTestVisibility(req, res) {
  if (req.user.role !== 'super_admin') throw new AppError('Only platform administrators can change System Test Bank visibility', 403, 'FORBIDDEN');
  if (typeof req.body.visibleToFaculty !== 'boolean') throw new AppError('visibleToFaculty must be a boolean', 400, 'BAD_REQUEST');
  const bank = await QuestionBank.findOne({ type: 'system_test' });
  if (!bank) throw new AppError('System Test Bank is not initialized. Run the production migrations.', 503, 'SYSTEM_TEST_BANK_UNAVAILABLE');
  const oldState = Boolean(bank.visibleToFaculty);
  const newState = req.body.visibleToFaculty;
  if (oldState !== newState) {
    bank.visibleToFaculty = newState;
    await bank.save();
    await recordAudit({ req, action: newState ? 'system_test_bank_unhidden' : 'system_test_bank_hidden', resource: 'question_bank', resourceId: bank._id, metadata: { oldState, newState } });
  }
  res.json({ success: true, data: bank });
}

export async function create(req, res) {
  const { name, description, type, visibility, institution } = req.body;

  if (!name || !type || !visibility) {
    throw new AppError('Name, type and visibility are required', 400, 'BAD_REQUEST');
  }

  if (type === 'system' && req.user.role !== 'super_admin') {
    throw new AppError('Only super admin can create system question banks', 403, 'FORBIDDEN');
  }
  if (visibility === 'public' && req.user.role !== 'super_admin') throw new AppError('Only platform administrators can publish a global bank', 403, 'FORBIDDEN');
  if (type === 'institution' && !['INSTITUTION_ADMIN', 'SUPER_ADMIN'].includes(req.membership?.role || (req.user.role === 'super_admin' ? 'SUPER_ADMIN' : ''))) throw new AppError('Institution administrator access required', 403, 'FORBIDDEN');

  let bankInst = institution || null;
  if (req.user.role !== 'super_admin') {
    if (type === 'institution') {
      bankInst = req.user.schoolInstitute;
    }
  }

  const bank = await QuestionBank.create({
    name,
    description: description || '',
    type,
    visibility,
    institution: bankInst,
    institutionId: type === 'system' ? null : req.institutionId,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: bank });
}

export async function update(req, res) {
  const bank = await QuestionBank.findOne({ _id: req.params.id, institutionId: req.institutionId });
  if (!bank) throw new AppError('Question Bank not found', 404, 'NOT_FOUND');

  if (req.user.role !== 'super_admin' && (!bank.createdBy || bank.createdBy.toString() !== req.user._id.toString())) {
    throw new AppError('You are not authorized to update this question bank', 403, 'FORBIDDEN');
  }

  const { name, description, type, visibility, institution, isPinned, pinnedOrder } = req.body;
  if (type === 'system' && req.user.role !== 'super_admin') {
    throw new AppError('Only super admin can set bank type to system', 403, 'FORBIDDEN');
  }

  if (name !== undefined) bank.name = name;
  if (description !== undefined) bank.description = description;
  if (type !== undefined) bank.type = type;
  if (visibility !== undefined) bank.visibility = visibility;
  if (visibility === 'public' && req.user.role !== 'super_admin') throw new AppError('Only platform administrators can publish globally', 403, 'FORBIDDEN');
  if (type === 'system' && req.user.role !== 'super_admin') throw new AppError('Only platform administrators can manage system banks', 403, 'FORBIDDEN');
  if (institution !== undefined) {
    if (req.user.role === 'super_admin') {
      bank.institution = institution;
    } else if (type === 'institution') {
      bank.institution = req.user.schoolInstitute;
    }
  }

  if (req.user.role === 'super_admin') {
    if (isPinned !== undefined) bank.isPinned = isPinned;
    if (pinnedOrder !== undefined) bank.pinnedOrder = pinnedOrder;
  }

  await bank.save();
  res.json({ success: true, data: bank });
}

export async function remove(req, res) {
  const bank = await QuestionBank.findOne({ _id: req.params.id, institutionId: req.institutionId });
  if (!bank) throw new AppError('Question Bank not found', 404, 'NOT_FOUND');

  if (bank.type === 'system' || bank.type === 'system_test') {
    throw new AppError('System question banks cannot be deleted', 400, 'BAD_REQUEST');
  }

  if (req.user.role !== 'super_admin' && (!bank.createdBy || bank.createdBy.toString() !== req.user._id.toString())) {
    throw new AppError('You are not authorized to delete this question bank', 403, 'FORBIDDEN');
  }

  // Pull this bank ID from all questions that reference it
  await Question.updateMany(
    { bankIds: bank._id, institutionId: req.institutionId },
    { $pull: { bankIds: bank._id } }
  );

  await bank.deleteOne();
  res.json({ success: true, message: 'Question bank deleted' });
}

export async function assignQuestions(req, res) {
  const bank = await QuestionBank.findOne({ _id: req.params.id, $or: [{ institutionId: req.institutionId }, { type: { $in: ['system', 'system_test'] } }] });
  if (!bank) throw new AppError('Question Bank not found', 404, 'NOT_FOUND');

  if (req.user.role !== 'super_admin') {
    if (bank.type === 'system_test' && !(req.user.role === 'faculty' && req.membership?.role === 'FACULTY' && bank.visibleToFaculty)) {
      throw new AppError('System Test Bank is hidden or unavailable to this membership', 403, 'QUESTION_BANK_FORBIDDEN');
    }
    if (bank.type === 'system' || (bank.type === 'institution' && req.membership?.role !== 'INSTITUTION_ADMIN')) {
      throw new AppError('Faculty cannot publish directly to system or institution banks', 403, 'FORBIDDEN');
    }
    if (!bank.createdBy || bank.createdBy.toString() !== req.user._id.toString()) {
      throw new AppError('You do not own this question bank', 403, 'FORBIDDEN');
    }
  }

  const { questionIds } = req.body;
  if (!Array.isArray(questionIds)) {
    throw new AppError('questionIds must be an array', 400, 'BAD_REQUEST');
  }

  let targetVisibility = 'faculty_bank';
  if (bank.type === 'system') {
    targetVisibility = 'public';
  } else if (bank.type === 'system_test') {
    targetVisibility = 'public';
  } else if (bank.type === 'institution') {
    targetVisibility = 'institution';
  }

  const filter = { _id: { $in: questionIds } };
  filter.institutionId = req.institutionId;
  if (req.user.role !== 'super_admin') {
    filter.ownerId = req.user._id;
  }

  await Question.updateMany(
    filter,
    {
      $addToSet: { bankIds: bank._id },
      $set: {
        isPrivate: false,
        visibility: targetVisibility,
        ...(bank.type === 'system_test' ? { institutionId: null } : {}),
      }
    }
  );

  res.json({ success: true, message: 'Questions successfully assigned to the question bank' });
}

export async function removeQuestions(req, res) {
  const bank = await QuestionBank.findOne({ _id: req.params.id, $or: [{ institutionId: req.institutionId }, { type: { $in: ['system', 'system_test'] } }] });
  if (!bank) throw new AppError('Question Bank not found', 404, 'NOT_FOUND');

  if (bank.type === 'system_test' && req.user.role !== 'super_admin' && !(req.user.role === 'faculty' && req.membership?.role === 'FACULTY' && bank.visibleToFaculty)) {
    throw new AppError('System Test Bank is hidden or unavailable to this membership', 403, 'QUESTION_BANK_FORBIDDEN');
  }
  if (bank.type === 'system' && req.user.role !== 'super_admin') throw new AppError('Only platform administrators can modify the System Global Bank', 403, 'FORBIDDEN');
  if (req.user.role !== 'super_admin' && (!bank.createdBy || bank.createdBy.toString() !== req.user._id.toString())) {
    if (bank.type !== 'system_test') throw new AppError('You are not authorized to remove questions from this question bank', 403, 'FORBIDDEN');
  }

  const { questionIds } = req.body;
  if (!Array.isArray(questionIds)) {
    throw new AppError('questionIds must be an array', 400, 'BAD_REQUEST');
  }

  const filter = { _id: { $in: questionIds } };
  if (bank.type === 'system_test') filter.bankIds = bank._id;
  else filter.institutionId = req.institutionId;
  if (req.user.role !== 'super_admin') {
    filter.ownerId = req.user._id;
  }

  await Question.updateMany(
    filter,
    { $pull: { bankIds: bank._id } }
  );

  // If questions are removed from all banks, revert to private
  await Question.updateMany(
    { ...filter, bankIds: { $size: 0 } },
    { $set: { isPrivate: true, visibility: 'private' } }
  );

  res.json({ success: true, message: 'Questions successfully removed from the question bank' });
}

export async function reorder(req, res) {
  if (req.user.role !== 'super_admin') {
    throw new AppError('Only super admin can reorder question banks', 403, 'FORBIDDEN');
  }

  const { orders } = req.body;
  if (!Array.isArray(orders)) {
    throw new AppError('orders must be an array', 400, 'BAD_REQUEST');
  }

  for (const item of orders) {
    if (item.id) {
      await QuestionBank.findByIdAndUpdate(item.id, {
        isPinned: item.isPinned ?? false,
        pinnedOrder: item.pinnedOrder ?? 0,
      });
    }
  }

  res.json({ success: true, message: 'Question banks reordered successfully' });
}

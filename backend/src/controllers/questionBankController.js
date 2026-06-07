import { QuestionBank } from '../models/QuestionBank.js';
import { Question } from '../models/Question.js';
import { AppError } from '../utils/AppError.js';

export async function list(req, res) {
  const query = {};
  if (req.user.role !== 'super_admin') {
    const userConditions = [
      { visibility: 'public' },
      { createdBy: req.user._id }
    ];
    if (req.user.schoolInstitute) {
      userConditions.push({ visibility: 'institution', institution: req.user.schoolInstitute });
    }
    query.$or = userConditions;
  }

  if (req.query.type) {
    query.type = req.query.type;
  }

  const banks = await QuestionBank.find(query)
    .populate('createdBy', 'full_name')
    .sort({ isPinned: -1, pinnedOrder: 1, name: 1 });

  const populatedBanks = await Promise.all(
    banks.map(async (bank) => {
      const questionCount = await Question.countDocuments({ bankIds: bank._id });
      return {
        ...bank.toObject(),
        questionCount,
      };
    })
  );

  res.json({ success: true, data: populatedBanks });
}

export async function getOne(req, res) {
  const bank = await QuestionBank.findById(req.params.id);
  if (!bank) throw new AppError('Question Bank not found', 404, 'NOT_FOUND');

  if (req.user.role !== 'super_admin') {
    const hasAccess =
      bank.visibility === 'public' ||
      (bank.visibility === 'institution' && bank.institution === req.user.schoolInstitute) ||
      (bank.createdBy && bank.createdBy.toString() === req.user._id.toString());
    if (!hasAccess) {
      throw new AppError('You do not have access to this question bank', 403, 'FORBIDDEN');
    }
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
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: bank });
}

export async function update(req, res) {
  const bank = await QuestionBank.findById(req.params.id);
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
  const bank = await QuestionBank.findById(req.params.id);
  if (!bank) throw new AppError('Question Bank not found', 404, 'NOT_FOUND');

  if (bank.type === 'system') {
    throw new AppError('System question banks cannot be deleted', 400, 'BAD_REQUEST');
  }

  if (req.user.role !== 'super_admin' && (!bank.createdBy || bank.createdBy.toString() !== req.user._id.toString())) {
    throw new AppError('You are not authorized to delete this question bank', 403, 'FORBIDDEN');
  }

  // Pull this bank ID from all questions that reference it
  await Question.updateMany(
    { bankIds: bank._id },
    { $pull: { bankIds: bank._id } }
  );

  await bank.deleteOne();
  res.json({ success: true, message: 'Question bank deleted' });
}

export async function assignQuestions(req, res) {
  const bank = await QuestionBank.findById(req.params.id);
  if (!bank) throw new AppError('Question Bank not found', 404, 'NOT_FOUND');

  if (req.user.role !== 'super_admin') {
    if (bank.type === 'system' || bank.type === 'institution') {
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
  } else if (bank.type === 'institution') {
    targetVisibility = 'institution';
  }

  const filter = { _id: { $in: questionIds } };
  if (req.user.role !== 'super_admin') {
    filter.ownerId = req.user._id;
  }

  await Question.updateMany(
    filter,
    {
      $addToSet: { bankIds: bank._id },
      $set: { isPrivate: false, visibility: targetVisibility }
    }
  );

  res.json({ success: true, message: 'Questions successfully assigned to the question bank' });
}

export async function removeQuestions(req, res) {
  const bank = await QuestionBank.findById(req.params.id);
  if (!bank) throw new AppError('Question Bank not found', 404, 'NOT_FOUND');

  if (req.user.role !== 'super_admin' && (!bank.createdBy || bank.createdBy.toString() !== req.user._id.toString())) {
    throw new AppError('You are not authorized to remove questions from this question bank', 403, 'FORBIDDEN');
  }

  const { questionIds } = req.body;
  if (!Array.isArray(questionIds)) {
    throw new AppError('questionIds must be an array', 400, 'BAD_REQUEST');
  }

  const filter = { _id: { $in: questionIds } };
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

import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { toProfile } from '../utils/userMapper.js';

function buildUserFilter(query) {
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.search) {
    filter.$or = [
      { email: { $regex: query.search, $options: 'i' } },
      { fullName: { $regex: query.search, $options: 'i' } },
    ];
  }
  if (query.is_active !== undefined) {
    filter.isActive = query.is_active === 'true' || query.is_active === true;
  }
  return filter;
}

export async function listUsers(query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 50)));
  const filter = buildUserFilter(query);

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  return {
    items: users.map(toProfile),
    total,
    page,
    limit,
  };
}

export async function getUserById(id) {
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  return toProfile(user);
}

export async function updateUser(id, body) {
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  if (body.full_name !== undefined) user.fullName = body.full_name;
  if (body.role !== undefined) user.role = body.role;
  if (body.is_active !== undefined) user.isActive = Boolean(body.is_active);
  if (body.approval_status !== undefined) user.approvalStatus = body.approval_status;
  if (body.approvalStatus !== undefined) user.approvalStatus = body.approvalStatus;
  if (body.school_institute !== undefined) user.schoolInstitute = body.school_institute;
  if (body.phone !== undefined) user.phone = body.phone;

  await user.save();
  return toProfile(user);
}

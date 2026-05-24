/**
 * Maps MongoDB User document to frontend Profile shape (Supabase-era compatibility).
 */
export function toProfile(user) {
  if (!user) return null;
  const doc = user.toObject ? user.toObject() : user;
  return {
    id: doc._id.toString(),
    email: doc.email,
    full_name: doc.fullName,
    avatar_url: doc.avatarUrl || null,
    role: doc.role,
    school_institute: doc.schoolInstitute || null,
    phone: doc.phone || null,
    is_active: doc.isActive !== false,
    created_at: doc.createdAt?.toISOString?.() || new Date().toISOString(),
    updated_at: doc.updatedAt?.toISOString?.() || new Date().toISOString(),
  };
}

export function toAuthUser(user) {
  if (!user) return null;
  const doc = user.toObject ? user.toObject() : user;
  return {
    id: doc._id.toString(),
    email: doc.email,
  };
}

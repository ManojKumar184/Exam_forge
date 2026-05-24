function idStr(v) {
  return v?.toString?.() ?? v;
}

export function mapSubject(doc) {
  return {
    id: idStr(doc._id),
    name: doc.name,
    code: doc.code,
    icon: doc.icon,
    color: doc.color,
    created_at: doc.createdAt?.toISOString(),
    updated_at: doc.updatedAt?.toISOString(),
  };
}

export function mapTopic(doc) {
  return {
    id: idStr(doc._id),
    subject_id: idStr(doc.subjectId),
    name: doc.name,
    chapter_number: doc.chapterNumber,
    class: doc.class,
    description: doc.description,
    created_at: doc.createdAt?.toISOString(),
    updated_at: doc.updatedAt?.toISOString(),
    subject: doc.subjectId?.name ? { name: doc.subjectId.name } : undefined,
  };
}

export function mapExamType(doc) {
  return {
    id: idStr(doc._id),
    name: doc.name,
    code: doc.code,
    description: doc.description,
    is_active: doc.isActive !== false,
    created_at: doc.createdAt?.toISOString(),
  };
}

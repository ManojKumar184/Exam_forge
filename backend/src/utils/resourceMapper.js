function idStr(v) {
  return v?.toString?.() ?? v;
}

// mapSubject, mapTopic, mapExamType removed — flat Subject/Topic/ExamType collections were dropped.
// Use syllabus API (SyllabusNode) for curriculum data.
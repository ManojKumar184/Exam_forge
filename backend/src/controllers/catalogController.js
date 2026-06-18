// Flat Subject, Topic, ExamType collections were removed.
// All syllabus data lives in the SyllabusNode collection.
// Use /api/syllabus endpoints instead.

export async function listSubjects(req, res) {
  res.json({ success: true, data: [] });
}

export async function listTopics(req, res) {
  res.json({ success: true, data: [] });
}

export async function listExamTypes(req, res) {
  res.json({ success: true, data: [] });
}

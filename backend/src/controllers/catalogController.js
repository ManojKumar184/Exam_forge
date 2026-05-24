import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { ExamType } from '../models/ExamType.js';
import { mapSubject, mapTopic, mapExamType } from '../utils/resourceMapper.js';

export async function listSubjects(req, res) {
  const subjects = await Subject.find({ isActive: true }).sort({ name: 1 });
  res.json({ success: true, data: subjects.map(mapSubject) });
}

export async function listTopics(req, res) {
  const filter = {};
  if (req.query.subject_id) filter.subjectId = req.query.subject_id;
  const topics = await Topic.find(filter)
    .populate('subjectId', 'name code color icon')
    .sort({ chapterNumber: 1, name: 1 });
  res.json({
    success: true,
    data: topics.map((t) => {
      const mapped = mapTopic(t);
      if (t.subjectId && typeof t.subjectId === 'object') {
        mapped.subject = mapSubject(t.subjectId);
      }
      return mapped;
    }),
  });
}

export async function listExamTypes(req, res) {
  const examTypes = await ExamType.find({ isActive: true }).sort({ name: 1 });
  res.json({ success: true, data: examTypes.map(mapExamType) });
}

import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { Question } from './models/Question.js';
import { SyllabusNode } from './models/SyllabusNode.js';
import { Subject } from './models/Subject.js';
import { ExamType } from './models/ExamType.js';
import { Topic } from './models/Topic.js';

export async function migrateSyllabus() {
  console.log('[migration] Starting syllabus mapping migration for existing questions...');

  // Fetch all questions with existing populated relations
  const questions = await Question.find({}).populate(['subjectId', 'chapterId', 'examTypeId']);
  console.log(`[migration] Found ${questions.length} questions to process.`);

  let migratedCount = 0;

  for (const question of questions) {
    // Check if the question already has syllabus mappings
    if (question.syllabusMappings && question.syllabusMappings.length > 0) {
      continue;
    }

    const mapping = {
      examPatternId: null,
      classId: null,
      subjectId: null,
      chapterId: null,
      topicId: null,
    };

    // 1. Try to find Exam Pattern
    if (question.examTypeId) {
      const examCode = question.examTypeId.code; // e.g., 'JEE_MAIN', 'NEET', 'CBSE'
      const patternNode = await SyllabusNode.findOne({
        type: 'exam_pattern',
        code: examCode,
      });
      if (patternNode) {
        mapping.examPatternId = patternNode._id;
      }
    }

    // 2. Try to find Class
    if (mapping.examPatternId && question.class) {
      const className = `Class ${question.class}`; // e.g., 'Class 11'
      const classNode = await SyllabusNode.findOne({
        type: 'class',
        parentId: mapping.examPatternId,
        name: { $regex: new RegExp(className, 'i') },
      });
      if (classNode) {
        mapping.classId = classNode._id;
      }
    }

    // 3. Try to find Subject
    if (mapping.classId && question.subjectId) {
      const subjectName = question.subjectId.name; // e.g., 'Physics', 'Chemistry'
      const subjectNode = await SyllabusNode.findOne({
        type: 'subject',
        parentId: mapping.classId,
        name: { $regex: new RegExp(subjectName, 'i') },
      });
      if (subjectNode) {
        mapping.subjectId = subjectNode._id;
      }
    }

    // 4. Try to find Chapter
    if (mapping.subjectId && question.chapterId) {
      const chapterName = question.chapterId.name; // e.g., 'Kinematics'
      const chapterNode = await SyllabusNode.findOne({
        type: 'chapter',
        parentId: mapping.subjectId,
        name: { $regex: new RegExp(chapterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      });
      if (chapterNode) {
        mapping.chapterId = chapterNode._id;
      }
    }

    // If we matched at least an exam pattern or subject, add to mappings
    if (mapping.examPatternId || mapping.subjectId) {
      question.syllabusMappings = [mapping];
      await question.save();
      migratedCount++;
    }
  }

  console.log(`[migration] Completed. Migrated ${migratedCount} questions.`);
}

// Support running directly
if (process.argv[1] && process.argv[1].endsWith('migrateSyllabus.js')) {
  async function runDirectly() {
    await connectDatabase();
    await migrateSyllabus();
    await disconnectDatabase();
    process.exit(0);
  }
  runDirectly().catch((err) => {
    console.error('[migration] Migration failed:', err);
    process.exit(1);
  });
}

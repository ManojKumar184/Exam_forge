/**
 * syllabusCatalog.js
 *
 * Loads the SyllabusNode tree and provides utilities to:
 * 1. Build a structured catalog (subjects, chapters, examPatterns, classes)
 * 2. Resolve names/IDs to SyllabusNode IDs and produce syllabusMappings
 * 3. Build a prompt context string for LLM classification constraints
 */

import { SyllabusNode } from '../models/SyllabusNode.js';

/**
 * Load all active SyllabusNodes and organize them into a structured catalog.
 * @returns {Promise<Object>} syllabus catalog with typed node arrays and tree helpers
 */
export async function loadSyllabusCatalog() {
  const nodes = await SyllabusNode.find({ isActive: true }).lean();
  return buildSyllabusCatalogFromNodes(nodes);
}

/**
 * Build a syllabus catalog from an array of SyllabusNode documents.
 * Used for both loading from DB and testing with fixtures.
 */
export function buildSyllabusCatalogFromNodes(nodes) {
  const byType = {};
  const byId = {};
  const byCode = {};
  const byParent = {};

  for (const node of nodes) {
    const id = node._id.toString();
    byId[id] = node;
    if (node.code) byCode[node.code.toUpperCase()] = node;

    if (!byType[node.type]) byType[node.type] = [];
    byType[node.type].push(node);

    const parentId = node.parentId ? node.parentId.toString() : 'root';
    if (!byParent[parentId]) byParent[parentId] = [];
    byParent[parentId].push(node);
  }

  return {
    // Typed node arrays
    examPatterns: byType['exam_pattern'] || [],
    classes: byType['class'] || [],
    subjects: byType['subject'] || [],
    chapters: byType['chapter'] || [],
    topics: byType['topic'] || [],
    allNodes: nodes,

    // Indexes for fast lookup
    byId,
    byCode,
    byParent,

    // Children helper
    getChildren(parentId) {
      return byParent[parentId] || [];
    },
  };
}

/**
 * Normalize text for comparison.
 */
function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Find a node by name with fuzzy matching.
 */
function findNodeByName(name, nodeList) {
  if (!name || !nodeList?.length) return null;
  const n = normalize(name);
  return nodeList.find(node => normalize(node.name) === n)
      || nodeList.find(node => normalize(node.name).includes(n) || n.includes(normalize(node.name)))
      || null;
}

/**
 * Build a context string for the LLM prompt listing available subjects, chapters, and their topics.
 */
export function buildSyllabusPromptContext(syllabusCatalog) {
  if (!syllabusCatalog) return '';

  const parts = [];

  // Exam patterns
  if (syllabusCatalog.examPatterns.length) {
    const names = syllabusCatalog.examPatterns.map(n => n.name).join(', ');
    parts.push(`Available Exam Patterns: ${names}`);
  }

  // Classes
  if (syllabusCatalog.classes.length) {
    const classNames = syllabusCatalog.classes.map(n => n.name).join(', ');
    parts.push(`Available Classes: ${classNames}`);
  }

  // Subjects with their chapters and topics
  if (syllabusCatalog.subjects.length) {
    const subjectLines = syllabusCatalog.subjects.map(subj => {
      const subjId = subj._id.toString();
      const chapters = syllabusCatalog.getChildren(subjId)
        .filter(c => c.type === 'chapter')
        .map(c => {
          const chId = c._id.toString();
          const topics = syllabusCatalog.getChildren(chId)
            .filter(t => t.type === 'topic')
            .map(t => t.name);
          if (topics.length) {
            return `  ${c.name} — Topics: ${topics.join(', ')}`;
          }
          return `  ${c.name}`;
        });
      if (chapters.length) {
        parts.push(`  ${subj.name} — Chapters:`);
        parts.push(...chapters);
      } else {
        parts.push(`  ${subj.name}`);
      }
    });
    parts.push('Available Subjects and their Chapters & Topics:');
    parts.push(...subjectLines);
  }

  return parts.join('\n');
}

/**
 * Resolve hints (subject name, chapter/topic name, exam pattern name, class name)
 * from LLM classification to SyllabusNode IDs and produce a syllabusMappings entry.
 *
 * @param {Object} hints - { subject, topic, examType, class }
 * @param {Object} syllabusCatalog - the catalog from loadSyllabusCatalog()
 * @returns {Array|null} syllabus mapping array (each entry is { examPatternId, classId, ... }) or null
 */
export function resolveHintsToSyllabusMappings(hints, syllabusCatalog) {
  if (!hints || !syllabusCatalog) return null;

  const mapping = {
    examPatternId: null,
    classId: null,
    subjectId: null,
    chapterId: null,
    topicId: null,
  };

  // Resolve exam pattern
  if (hints.examType) {
    const examPattern = findNodeByName(hints.examType, syllabusCatalog.examPatterns)
      || syllabusCatalog.byCode[hints.examType.toUpperCase()]
      || null;
    if (examPattern) {
      mapping.examPatternId = examPattern._id;
    }
  }

  // Resolve class
  if (hints.class) {
    const className = String(hints.class);
    const classNode = findNodeByName(className, syllabusCatalog.classes)
      || syllabusCatalog.classes.find(c => c.name === className)
      || null;
    if (classNode) {
      mapping.classId = classNode._id;
    }
  }

  // Resolve subject
  if (hints.subject) {
    const subjectNode = findNodeByName(hints.subject, syllabusCatalog.subjects)
      || null;
    if (subjectNode) {
      mapping.subjectId = subjectNode._id;

      // If we also have a chapter hint, try to find it within this subject
      if (hints.topic || hints.chapter) {
        const chapterName = hints.chapter || hints.topic;
        const childChapters = syllabusCatalog.getChildren(subjectNode._id.toString())
          .filter(c => c.type === 'chapter');
        const chapterNode = findNodeByName(chapterName, childChapters);
        if (chapterNode) {
          mapping.chapterId = chapterNode._id;

          // Try to find a topic within this chapter
          if (hints.topic && hints.topic !== chapterName) {
            const childTopics = syllabusCatalog.getChildren(chapterNode._id.toString())
              .filter(t => t.type === 'topic');
            const topicNode = findNodeByName(hints.topic, childTopics);
            if (topicNode) {
              mapping.topicId = topicNode._id;
            }
          }
        } else if (hints.topic && subjectNode) {
          // Try matching as a topic directly under subject if not found as chapter
          const childTopics = syllabusCatalog.getChildren(subjectNode._id.toString())
            .filter(t => t.type === 'topic');
          const topicNode = findNodeByName(hints.topic, childTopics);
          if (topicNode) {
            mapping.topicId = topicNode._id;
          }
        }
      }
    }
  }

  // Only return if at least one syllabus mapping was resolved
  // Always return as an array to match the Question schema (array of mappings)
  const hasMapping = Object.values(mapping).some(v => v !== null);
  return hasMapping ? [mapping] : null;
}



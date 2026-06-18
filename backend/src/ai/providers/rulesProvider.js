import { BaseAIProvider } from './baseProvider.js';
import { classifyExtractedQuestion } from '../../extraction/metadataClassifier.js';
import { resolveHintsToSyllabusMappings } from '../syllabusCatalog.js';

/**
 * Normalize text for fuzzy comparison.
 */
function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Match question text against syllabus chapter and topic names.
 * First tries exact chapter name match, then partial word match,
 * then checks topic names (children of chapters) for broader keyword matching.
 *
 * @param {string} questionText
 * @param {Object} syllabusCatalog - From buildSyllabusCatalogFromNodes
 * @param {string|null} subjectName - Optional subject name to scope chapter search
 * @returns {Object|null} The matched SyllabusNode (chapter) or null
 */
function detectChapterFromSyllabus(questionText, syllabusCatalog, subjectName) {
  if (!questionText || !syllabusCatalog?.chapters?.length) return null;

  const textLower = questionText.toLowerCase();

  // Scope chapters to the question's subject (if known) to avoid false matches
  // across subjects (e.g., "Equilibrium" is a Chemistry chapter, not Physics).
  let scopedChapters = syllabusCatalog.chapters;
  if (subjectName && syllabusCatalog.subjects?.length) {
    const subjectNode = syllabusCatalog.subjects.find(
      s => s.name.toLowerCase().trim() === subjectName.toLowerCase().trim()
    );
    if (subjectNode) {
      const subjectId = subjectNode._id.toString();
      scopedChapters = syllabusCatalog.chapters.filter(
        ch => ch.parentId?.toString() === subjectId
      );
      // If no chapters found under this subject, fall back to all chapters
      if (scopedChapters.length === 0) {
        scopedChapters = syllabusCatalog.chapters;
      }
    }
  }

  // Step 1: Try exact chapter name match (full chapter name appears in text)
  for (const ch of scopedChapters) {
    const nameLower = ch.name.toLowerCase();
    if (textLower.includes(nameLower)) {
      return ch;
    }
  }

  // Step 2: Try partial word match — score all chapters and return the best match
  // to avoid first-match-wins issues with overly lenient thresholds.
  let bestChapter = null;
  let bestScore = 0;

  for (const ch of scopedChapters) {
    const words = ch.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) continue;

    const matchCount = words.filter(w => {
      if (textLower.includes(w)) return true;
      // Try stripping common suffixes to handle singular/plural mismatches
      const stripped = w.replace(/es$/, '').replace(/s$/, '').replace(/ing$/, '').replace(/ed$/, '');
      return stripped !== w && stripped.length > 3 && textLower.includes(stripped);
    }).length;

    // Use proportion-based scoring so that 1/1 (Equilibrium) ≈ 3/3 (full match)
    // while 1/3 < 2/3 for tie-breaking
    const score = matchCount / words.length;

    if (matchCount >= Math.max(1, Math.floor(words.length / 2)) && score > bestScore) {
      bestChapter = ch;
      bestScore = score;
    }
  }

  if (bestChapter) return bestChapter;

  // Step 3: Try matching against topic names (children of chapters)
  // A question might mention "Coulomb's Law" (topic) but not "Electric Charges and Fields" (chapter)
  if (syllabusCatalog.topics?.length && syllabusCatalog.byParent) {
    // Build a map from topic names to their parent chapters
    const topicToChapter = new Map();
    // Scope topic search to the same subject as steps 1-2 for consistency
    for (const ch of scopedChapters) {
      const chId = ch._id.toString();
      const childTopics = syllabusCatalog.byParent[chId] || [];
      for (const topic of childTopics) {
        if (topic.type !== 'topic') continue;
        const topicNameLower = topic.name.toLowerCase();
        topicToChapter.set(topicNameLower, ch);
        // Also store significant words from topic name
        const topicWords = topicNameLower.split(/\s+/).filter(w => w.length > 3);
        for (const word of topicWords) {
          if (textLower.includes(word)) {
            topicToChapter.set(word, ch);
          }
        }
      }
    }

    // Check if question text contains any topic name
    for (const [topicKey, chapter] of topicToChapter.entries()) {
      if (textLower.includes(topicKey)) {
        return chapter;
      }
    }
  }

  // Step 4: Try regex-based chapter header detection (e.g., "Chapter 1: Electric Charges and Fields")
  const chapterHeaderMatch = questionText.match(/\b(?:chapter|unit|topic)\s*[-.:]?\s*([^\n,.]{3,60})/i);
  if (chapterHeaderMatch) {
    const headerName = normalize(chapterHeaderMatch[1]);
    for (const ch of syllabusCatalog.chapters) {
      if (normalize(ch.name).includes(headerName) || headerName.includes(normalize(ch.name))) {
        return ch;
      }
    }
  }

  return null;
}

/**
 * Detect a specific topic name from the question text within a given chapter.
 * Scans the chapter's child topics for names that appear in the question text.
 *
 * @param {string} questionText
 * @param {Object} chapterNode - Detected SyllabusNode (chapter)
 * @param {Object} syllabusCatalog
 * @returns {string|null} The matched topic name, or null
 */
function detectTopicInChapter(questionText, chapterNode, syllabusCatalog) {
  if (!questionText || !chapterNode || !syllabusCatalog?.byParent) return null;
  const textLower = questionText.toLowerCase();
  const chId = chapterNode._id.toString();
  const childTopics = syllabusCatalog.byParent[chId] || [];

  // First try full topic name match
  for (const topic of childTopics) {
    if (topic.type !== 'topic') continue;
    if (textLower.includes(topic.name.toLowerCase())) {
      return topic.name;
    }
  }

  // Try significant word match for longer topic names
  for (const topic of childTopics) {
    if (topic.type !== 'topic') continue;
    const words = topic.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) continue;
    const matchCount = words.filter(w => textLower.includes(w)).length;
    if (matchCount >= Math.max(1, words.length - 1)) {
      return topic.name;
    }
  }

  return null;
}

/**
 * Walk up the syllabus parent chain to infer class from a chapter node.
 * Returns class as a number (e.g., 12 for "Class 12"), or null if not found.
 */
function inferClassFromChapterPath(chapterNode, syllabusCatalog) {
  if (!chapterNode || !syllabusCatalog?.byId) return null;

  // Walk up from chapter -> subject -> class
  let current = chapterNode;
  const visited = new Set();
  while (current && current.parentId) {
    const parentId = current.parentId.toString();
    if (visited.has(parentId)) break;
    visited.add(parentId);

    const parent = syllabusCatalog.byId[parentId];
    if (!parent) break;

    if (parent.type === 'class') {
      const classMatch = parent.name.match(/(\d+)/);
      if (classMatch) return parseInt(classMatch[1], 10);
    }

    current = parent;
  }

  return null;
}

export class RulesProvider extends BaseAIProvider {
  constructor() {
    super('rules');
  }

  isConfigured() {
    return true;
  }

  async classify(question, catalog, docMeta = {}, uploadContext = {}) {
    const result = classifyExtractedQuestion(question, catalog, docMeta, uploadContext);

    const syllabusCatalog = catalog?.syllabus || null;
    console.log('[rulesProvider] classify called V2', {
      hasSyllabus: !!syllabusCatalog,
      chaptersCount: syllabusCatalog?.chapters?.length || 0,
      questionTextPreview: (question.questionText || '').slice(0, 80),
      resultChapterId: result.chapterId,
      resultSubjectName: result.subjectName,
      resultClass: result.class
    });

    // Always run syllabus-based chapter detection when syllabus catalog is available.
    // We do this even when result.chapterId is already set because the flat Topic model
    // _id differs from SyllabusNode _ids — we need SyllabusNode IDs for syllabusMappings.
    let chapterId = null; // Will be set from syllabus detection below
    let topicName = null; // Will be set from syllabus detection below
    let classLevel = result.class;

    if (syllabusCatalog?.chapters?.length) {
      const detectedChapter = detectChapterFromSyllabus(
        question.questionText || '',
        syllabusCatalog,
        result.subjectName
      );

      console.log('[rulesProvider] chapter detection result', {
        detected: !!detectedChapter,
        chapterName: detectedChapter?.name || null,
        wasSetFromRules: !!(result.chapterId),
      });

      if (detectedChapter) {
        // Store the SyllabusNode._id as chapterId
        // Note: This references the SyllabusNode collection, not the flat Topic model
        chapterId = detectedChapter._id.toString();

        // Try to detect a specific topic name within the detected chapter
        // If the question mentions "Coulomb's Law", we want topicName = "Coulomb's Law"
        // not just "Electric Charges and Fields" (the parent chapter)
        const detectedTopicName = detectTopicInChapter(
          question.questionText || '',
          detectedChapter,
          syllabusCatalog
        );
        topicName = detectedTopicName || detectedChapter.name;

        // Infer class from the chapter's position in the syllabus tree
        // Only override if class wasn't explicitly detected (was using default 11)
        const inferredClass = inferClassFromChapterPath(detectedChapter, syllabusCatalog);
        if (inferredClass && (!classLevel || classLevel === 11)) {
          classLevel = inferredClass;
        }
      } else {
        // Fallback: use flat model result if syllabus detection found nothing
        chapterId = result.chapterId?.toString?.() || result.chapterId;
        topicName = result.topicName || null;
      }
    } else {
      // No syllabus catalog available — use flat model result as-is
      chapterId = result.chapterId?.toString?.() || result.chapterId;
      topicName = result.topicName || null;
    }

    // Resolve syllabusMappings using names from metadataClassifier
    // Flat model IDs (Subject._id) cannot be directly mapped to SyllabusNode IDs since
    // they belong to separate collections; we match by name instead.
    let syllabusMappings = null;
    if (syllabusCatalog && (result.subjectName || result.examTypeName || topicName)) {
      try {
        syllabusMappings = resolveHintsToSyllabusMappings(
          {
            subject: result.subjectName || null,
            topic: topicName,
            examType: result.examTypeName || null,
            class: classLevel,
          },
          syllabusCatalog
        );
      } catch {
        // syllabus mappings are optional, silently continue
      }
    }

    return {
      class: classLevel,
      subjectId: result.subjectId?.toString?.() || result.subjectId,
      chapterId,
      examTypeId: result.examTypeId?.toString?.() || result.examTypeId,
      difficulty: result.difficulty,
      tags: result.tags,
      confidence: (result.aiConfidence || 30) / 100,
      status: result.status,
      extractionWarnings: result.extractionWarnings,
      aiMetadata: result.aiMetadata,
      syllabusMappings,
      subjectName: result.subjectName || null,
      topicName,
      examTypeName: result.examTypeName || null,
    };
  }
}

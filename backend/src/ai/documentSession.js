// backend/src/ai/documentSession.js

/**
 * Simple in‑memory session store for document‑level classification.
 * Each session tracks syllabus, document metadata and question results.
 */

class DocumentSession {
  constructor({ docId, syllabusTree, metadata, questions }) {
    this.docId = docId;
    this.syllabusTree = syllabusTree; // object representation of the syllabus
    this.metadata = metadata; // document‑level metadata (e.g., title, source)
    this.questions = questions || []; // array of question objects (already parsed/cleaned)
    this.results = []; // classification results per batch
    this.createdAt = new Date();
  }
}

// Export a singleton map: sessionId -> DocumentSession
export const sessionMap = new Map();

export { DocumentSession };

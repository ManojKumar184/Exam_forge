/**
 * AI classification service — Phase 4
 *
 * Providers: OpenAI, Gemini, Ollama (planned)
 * NOT IMPLEMENTED in Phase 1 — upload pipeline will call this module.
 */
export class AIClassificationService {
  static STATUS = 'NOT_IMPLEMENTED';

  async classifyQuestion(_extractedText, _context = {}) {
    throw new Error(
      'AI classification is not implemented yet. See docs/MERN_MIGRATION.md Phase 4.'
    );
  }
}

export const aiClassificationService = new AIClassificationService();

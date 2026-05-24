/**
 * AI classification stub — Phase 4 will plug OpenAI / Gemini / Ollama here.
 * Returns editable metadata without fabricating question content.
 */
export async function classifyQuestionMetadata(question) {
  return {
    aiConfidence: 0,
    aiMetadata: {
      provider: 'none',
      status: 'NOT_IMPLEMENTED',
      message: 'AI classification available in Phase 4',
      suggested: {
        class: question.class,
        difficulty: question.difficulty,
        questionType: question.questionType,
      },
    },
  };
}

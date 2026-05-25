/**
 * Base contract for optional AI classification providers.
 */
export class BaseAIProvider {
  constructor(name) {
    this.name = name;
  }

  isConfigured() {
    return false;
  }

  /**
   * @returns {Promise<null|{
   *   class?: number,
   *   subjectId?: string,
   *   chapterId?: string,
   *   examTypeId?: string,
   *   difficulty?: string,
   *   questionType?: string,
   *   tags?: string[],
   *   confidence?: number,
   *   reasoning?: string,
   * }>}
   */
  async classify(_question, _catalog, _docMeta) {
    return null;
  }
}

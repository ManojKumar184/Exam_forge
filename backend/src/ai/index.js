import { runClassificationPipeline } from './classificationPipeline.js';
import { getLlmProvider, getRulesProvider, listConfiguredProviders } from './providerRegistry.js';
import { classifyQuestionMetadata } from './classifyQuestion.js';

export class AIClassificationService {
  async classifyQuestion(question, catalog, docMeta = {}, uploadContext = {}) {
    return classifyQuestionMetadata(question, catalog, docMeta, uploadContext);
  }

  getStatus() {
    return {
      rules: true,
      llm: getLlmProvider()?.name || null,
      configured: listConfiguredProviders(),
    };
  }
}

export const aiClassificationService = new AIClassificationService();

export { classifyQuestionMetadata } from './classifyQuestion.js';
export { listConfiguredProviders, getLlmProvider } from './providerRegistry.js';

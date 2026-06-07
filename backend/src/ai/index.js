import { runClassificationPipeline, runClassificationPipelineBatch } from './classificationPipeline.js';
import { getLlmProvider, getRulesProvider, listConfiguredProviders } from './providerRegistry.js';
import { classifyQuestionMetadata, classifyQuestionMetadataBatch } from './classifyQuestion.js';

export class AIClassificationService {
  async classifyQuestion(question, catalog, docMeta = {}, uploadContext = {}) {
    return classifyQuestionMetadata(question, catalog, docMeta, uploadContext);
  }

  async classifyQuestionBatch(questions, catalog, docMeta = {}, uploadContext = {}) {
    return classifyQuestionMetadataBatch(questions, catalog, docMeta, uploadContext);
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

export { classifyQuestionMetadata, classifyQuestionMetadataBatch } from './classifyQuestion.js';
export { listConfiguredProviders, getLlmProvider } from './providerRegistry.js';


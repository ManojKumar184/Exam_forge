import { env } from '../config/env.js';
import { RulesProvider } from './providers/rulesProvider.js';
import { OllamaProvider } from './providers/ollamaProvider.js';

const rules = new RulesProvider();
const ollama = new OllamaProvider();

const LLM_PROVIDERS = {
  ollama,
};

export function getRulesProvider() {
  return rules;
}

/**
 * Optional LLM provider from AI_PROVIDER env (openai|gemini|ollama|none).
 */
export function getLlmProvider() {
  const key = (env.ai.provider || 'none').toLowerCase();
  if (key === 'none' || !key) return null;
  const p = LLM_PROVIDERS[key];
  return p?.isConfigured() ? p : null;
}

export function getOllamaProvider() {
  return ollama;
}

export function listConfiguredProviders() {
  const list = ['rules'];
  for (const [name, p] of Object.entries(LLM_PROVIDERS)) {
    if (p.isConfigured()) list.push(name);
  }
  return list;
}

import { env } from '../config/env.js';
import { RulesProvider } from './providers/rulesProvider.js';
import { OpenAIProvider } from './providers/openaiProvider.js';
import { GeminiProvider } from './providers/geminiProvider.js';
import { OllamaProvider } from './providers/ollamaProvider.js';

const rules = new RulesProvider();
const openai = new OpenAIProvider();
const gemini = new GeminiProvider();
const ollama = new OllamaProvider();

const LLM_PROVIDERS = {
  openai,
  gemini,
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

export function listConfiguredProviders() {
  const list = ['rules'];
  for (const [name, p] of Object.entries(LLM_PROVIDERS)) {
    if (p.isConfigured()) list.push(name);
  }
  return list;
}

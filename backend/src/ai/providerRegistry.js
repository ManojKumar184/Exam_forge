import { env } from '../config/env.js';
import { RulesProvider } from './providers/rulesProvider.js';
import { SpaceProvider } from './providers/spaceProvider.js';

const rules = new RulesProvider();
const space = new SpaceProvider();

const LLM_PROVIDERS = {
  space,
};

export function getRulesProvider() {
  return rules;
}

/**
 * Get the configured LLM provider from AI_PROVIDER env (space|none).
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


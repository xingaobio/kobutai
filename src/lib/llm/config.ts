/** Model configuration shapes. Kept free of pi-ai imports so content scripts can share them cheaply. */

/** A user-added OpenAI- or Anthropic-compatible server (Ollama, LM Studio, vLLM, a gateway, a proxy…). */
export interface CustomEndpoint {
  /** Provider id, always prefixed `custom-`. */
  id: string;
  name: string;
  baseUrl: string;
  api: 'openai-completions' | 'anthropic-messages';
  models: string[];
}

export interface LlmSettings {
  enabled: boolean;
  /** Selected model: pi-ai provider id + model id. Empty = none chosen yet. */
  provider: string;
  model: string;
  custom: CustomEndpoint[];
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = { enabled: false, provider: '', model: '', custom: [] };

export const CUSTOM_PREFIX = 'custom-';

export function customId(name: string, taken: readonly string[]): string {
  const slug =
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'endpoint';
  let id = CUSTOM_PREFIX + slug;
  for (let n = 2; taken.includes(id); n++) id = `${CUSTOM_PREFIX}${slug}-${n}`;
  return id;
}

/** True when the selection points at a model that can be asked. */
export function isConfigured(s: LlmSettings): boolean {
  return s.enabled && !!s.provider && !!s.model;
}

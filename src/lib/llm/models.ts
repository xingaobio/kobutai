import {
  createModels,
  createProvider,
  type AuthContext,
  type CredentialStore,
  type Model,
  type Models,
  type MutableModels,
  type Provider,
  type ProviderAuth,
} from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { registerBunOAuthFlows } from '@earendil-works/pi-ai/bun-oauth';
import { builtinProviders } from '@earendil-works/pi-ai/providers/all';
import type { CustomEndpoint } from './config';

// pi-ai loads its sign-in flows through a runtime import a bundle can't follow;
// register the bundled copies instead (their node:http / node:crypto use is shimmed).
registerBunOAuthFlows();

/** Need desktop credential files (AWS / gcloud) or have no chat models. */
const UNSUPPORTED = new Set(['amazon-bedrock', 'google-vertex', 'typesafe']);
/** Anthropic's terms don't allow Claude Pro/Max sign-in from third-party apps, so Anthropic is API key only. */
const NO_SUBSCRIPTION_LOGIN = new Set(['anthropic']);

/** Browsers have no environment variables or credential files. */
const BROWSER_AUTH: AuthContext = { env: async () => undefined, fileExists: async () => false };

function withAuth(p: Provider, auth: ProviderAuth): Provider {
  return Object.create(p, { auth: { value: auth, enumerable: true } }) as Provider;
}

export function builtins(): Provider[] {
  return builtinProviders()
    .filter((p) => !UNSUPPORTED.has(p.id))
    .map((p) => (NO_SUBSCRIPTION_LOGIN.has(p.id) && p.auth.oauth ? withAuth(p, { apiKey: p.auth.apiKey }) : p));
}

export function customProvider(c: CustomEndpoint): Provider {
  const baseUrl = c.baseUrl.replace(/\/+$/, '');
  const models: Model<CustomEndpoint['api']>[] = c.models.map((id) => ({
    id,
    name: id,
    api: c.api,
    provider: c.id,
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_768,
    maxTokens: 4096,
    // Most self-hosted OpenAI-compatible servers only know the basics.
    ...(c.api === 'openai-completions'
      ? { compat: { supportsDeveloperRole: false, supportsReasoningEffort: false, supportsStore: false } }
      : {}),
  }));
  return createProvider({
    id: c.id,
    name: c.name,
    baseUrl,
    auth: {
      apiKey: {
        name: `${c.name} API key`,
        login: async (i) => {
          const key = (
            await i.prompt({ type: 'secret', message: `${c.name} 的 API key（本地服务没有 key 就留空）` })
          ).trim();
          return { type: 'api_key', key: key || undefined };
        },
        // Keyless local servers count as configured once added.
        resolve: async ({ credential }) =>
          credential?.key
            ? { auth: { apiKey: credential.key }, source: 'stored credential' }
            : { auth: { apiKey: 'none' }, source: 'no key' },
      },
    },
    models,
    api: c.api === 'anthropic-messages' ? anthropicMessagesApi() : openAICompletionsApi(),
  });
}

export function createHdModels(credentials: CredentialStore, custom: readonly CustomEndpoint[] = []): MutableModels {
  const models = createModels({ credentials, authContext: BROWSER_AUTH });
  for (const p of builtins()) models.setProvider(p);
  for (const c of custom) models.setProvider(customProvider(c));
  return models;
}

// --- Host permissions ---------------------------------------------------------

/** Sign-in hosts that aren't a model's baseUrl. */
const OAUTH_ORIGINS: Record<string, string[]> = {
  'github-copilot': ['https://github.com/*', 'https://api.github.com/*', 'https://*.githubcopilot.com/*'],
  openai: ['https://auth.openai.com/*'],
  'openai-codex': ['https://auth.openai.com/*'],
  'kimi-coding': ['https://auth.kimi.com/*'],
  xai: ['https://auth.x.ai/*'],
  meta: ['https://auth.meta.com/*', 'https://api.meta.ai/*'],
};
/** Lets the sign-in dialog read the localhost redirect URL that finishes a browser login. */
export const LOOPBACK_ORIGINS = ['http://localhost/*', 'http://127.0.0.1/*'];

/** `https://host/*` for a URL; `{template}` host labels become a leading wildcard. Null when not expressible. */
export function originPattern(url: string): string | null {
  const m = /^(https?):\/\/([^/?#]+)/.exec(url);
  if (!m) return null;
  const host = m[2]!.replace(/:\d+$/, '').replace(/^\{[^}]+\}(?=\.)/, '*');
  if (!/^(\*\.)?[a-z0-9.-]+$/i.test(host) && host !== '[::1]') return null;
  return `${m[1]}://${host}/*`;
}

/** Origins the extension must be allowed to reach to use (and, for OAuth, sign in to) a provider. */
export function originsFor(models: Models, providerId: string, type: 'api_key' | 'oauth'): string[] {
  const p = models.getProvider(providerId);
  const set = new Set<string>();
  for (const u of [p?.baseUrl, ...models.getAllModels(providerId).map((m) => m.baseUrl)]) {
    const o = u && originPattern(u);
    if (o) set.add(o);
  }
  if (type === 'oauth') for (const o of [...(OAUTH_ORIGINS[providerId] ?? []), ...LOOPBACK_ORIGINS]) set.add(o);
  return [...set];
}

/** Cheap, fast models make good taggers: prefer those when picking a default. */
export function pickDefaultModel(available: readonly Model<string>[]): Model<string> | undefined {
  return available.find((m) => /haiku|mini|flash|lite|small|turbo/i.test(m.id)) ?? available[0];
}

import { describe, expect, test } from 'vitest';
import { customId, isConfigured, DEFAULT_LLM_SETTINGS } from './config';
import { builtins, createHdModels, originPattern, originsFor, pickDefaultModel } from './models';
import { deliverLoopback, createServer, isLoopbackPending } from './shims/node-http';
import { randomBytes } from './shims/node-crypto';
import { storageCredentialStore, type CredentialMap } from './store';

function memStore() {
  let data: CredentialMap = {};
  const item = { getValue: async () => data, setValue: async (v: CredentialMap) => void (data = v) };
  return { store: storageCredentialStore(item), data: () => data };
}

describe('credential store', () => {
  test('read / list / modify / delete', async () => {
    const { store, data } = memStore();
    expect(await store.read('openai')).toBeUndefined();
    await store.modify('openai', async () => ({ type: 'api_key', key: 'sk-1' }));
    expect(await store.read('openai')).toEqual({ type: 'api_key', key: 'sk-1' });
    expect(await store.list()).toEqual([{ providerId: 'openai', type: 'api_key' }]);
    // undefined leaves the entry alone
    expect(await store.modify('openai', async () => undefined)).toEqual({ type: 'api_key', key: 'sk-1' });
    await store.delete('openai');
    expect(data()).toEqual({});
  });

  test('concurrent writes for different providers both land', async () => {
    const { store, data } = memStore();
    await Promise.all([
      store.modify('a', async () => ({ type: 'api_key', key: '1' })),
      store.modify('b', async () => ({ type: 'oauth', access: 'x', refresh: 'y', expires: 1 })),
    ]);
    expect(Object.keys(data()).sort()).toEqual(['a', 'b']);
  });
});

describe('providers', () => {
  test('browser-incompatible providers are left out; Claude is API key only', () => {
    const ids = builtins().map((p) => p.id);
    expect(ids).not.toContain('amazon-bedrock');
    expect(ids).not.toContain('google-vertex');
    const anthropic = builtins().find((p) => p.id === 'anthropic')!;
    expect(anthropic.auth.oauth).toBeUndefined();
    expect(anthropic.auth.apiKey).toBeDefined();
    expect(anthropic.getModels().length).toBeGreaterThan(0);
    expect(builtins().find((p) => p.id === 'github-copilot')!.auth.oauth?.isSubscription).toBe(true);
  });

  test('nothing is available until connected; keyless custom endpoints are', async () => {
    const { store } = memStore();
    const models = createHdModels(store, [
      { id: 'custom-lm', name: 'LM', baseUrl: 'http://127.0.0.1:1234/v1', api: 'openai-completions', models: ['a', 'b'] },
    ]);
    expect((await models.getAvailable()).map((m) => `${m.provider}/${m.id}`)).toEqual(['custom-lm/a', 'custom-lm/b']);
    await store.modify('deepseek', async () => ({ type: 'api_key', key: 'k' }));
    expect((await models.getAvailable('deepseek')).length).toBeGreaterThan(0);
  });

  test('origins to request', () => {
    expect(originPattern('https://api.openai.com/v1')).toBe('https://api.openai.com/*');
    expect(originPattern('http://localhost:11434/v1')).toBe('http://localhost/*');
    expect(originPattern('https://{resource}.openai.azure.com/openai/v1')).toBe('https://*.openai.azure.com/*');
    expect(originPattern('ftp://x')).toBeNull();
    const models = createHdModels(memStore().store);
    expect(originsFor(models, 'deepseek', 'api_key')).toEqual(['https://api.deepseek.com/*']);
    const copilot = originsFor(models, 'github-copilot', 'oauth');
    expect(copilot).toEqual(expect.arrayContaining(['https://github.com/*', 'http://localhost/*', 'http://127.0.0.1/*']));
  });

  test('default model prefers small fast ones', () => {
    const m = (id: string) => ({ id }) as Parameters<typeof pickDefaultModel>[0][number];
    expect(pickDefaultModel([m('big-pro'), m('gpt-5-mini')])?.id).toBe('gpt-5-mini');
    expect(pickDefaultModel([m('only')])?.id).toBe('only');
    expect(pickDefaultModel([])).toBeUndefined();
  });
});

describe('config', () => {
  test('custom ids are unique slugs', () => {
    expect(customId('My Ollama!', [])).toBe('custom-my-ollama');
    expect(customId('My Ollama', ['custom-my-ollama'])).toBe('custom-my-ollama-2');
    expect(customId('本地', [])).toBe('custom-endpoint');
  });
  test('configured needs enabled + a model', () => {
    expect(isConfigured(DEFAULT_LLM_SETTINGS)).toBe(false);
    expect(isConfigured({ ...DEFAULT_LLM_SETTINGS, enabled: true, provider: 'p', model: 'm' })).toBe(true);
  });
});

describe('shims', () => {
  test('virtual loopback server receives the captured redirect', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.url);
      res.writeHead(req.url.includes('code=') ? 200 : 400).end('ok');
    });
    await new Promise<void>((r) => server.listen(53692, '127.0.0.1', r));
    expect(server.address()).toMatchObject({ port: 53692 });
    const url = new URL('http://localhost:53692/callback?code=abc&state=s');
    expect(isLoopbackPending(url)).toBe(true);
    expect(isLoopbackPending(new URL('http://localhost:9/x'))).toBe(false);
    expect(isLoopbackPending(new URL('https://evil.com:53692/x'))).toBe(false);
    expect(await deliverLoopback(url)).toBe(200);
    expect(await deliverLoopback(new URL('http://127.0.0.1:53692/callback'))).toBe(400);
    expect(seen).toEqual(['/callback?code=abc&state=s', '/callback']);
    server.close();
    expect(await deliverLoopback(url)).toBeNull();
  });

  test('port 0 gets a free port', async () => {
    const server = createServer(() => {});
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address()!;
    expect(port).toBeGreaterThan(49151);
    expect(isLoopbackPending(new URL(`http://127.0.0.1:${port}/cb`))).toBe(true);
    server.close();
  });

  test('randomBytes encodings', () => {
    expect(randomBytes(32).toString('base64url')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomBytes(4).toString('hex')).toMatch(/^[0-9a-f]{8}$/);
  });
});

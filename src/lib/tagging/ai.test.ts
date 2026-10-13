import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type FauxResponseStep,
  type TranscriptContext,
} from '@earendil-works/pi-ai';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createHdModels } from '../llm/models';
import { storageCredentialStore, type CredentialMap } from '../llm/store';
import { aiTags, classify } from './ai';

const info = { site: 'www.youtube.com', title: 'YOASOBI「アイドル」', artist: 'Ayase / YOASOBI' };

function faux(...responses: FauxResponseStep[]) {
  const f = fauxProvider();
  const models = createModels();
  models.setProvider(f.provider);
  f.setResponses(responses);
  const m = f.getModel();
  return { models, ref: { provider: m.provider, model: m.id }, state: f.state };
}

describe('classify', () => {
  test('sends only metadata and reads the tool call', async () => {
    let seen: TranscriptContext | undefined;
    const { models, ref } = faux((ctx) => {
      seen = ctx;
      return fauxAssistantMessage(fauxToolCall('set_tags', { type: 'music', genre: 'anime' }), { stopReason: 'toolUse' });
    });
    expect(await classify(info, ref, models)).toEqual({ ok: true, tags: { type: 'music', genre: 'anime', source: 'ai' } });
    // Privacy: the only user content is the three metadata fields.
    const users = seen!.messages.filter((m) => m.role === 'user');
    expect(users).toHaveLength(1);
    expect(JSON.parse(users[0]!.content as string)).toEqual({ site: info.site, title: info.title, artist: info.artist });
  });

  test('falls back to JSON in plain text', async () => {
    const { models, ref } = faux(fauxAssistantMessage(fauxText('Sure: {"type":"podcast","genre":"none"}')));
    expect(await classify(info, ref, models)).toEqual({ ok: true, tags: { type: 'podcast', genre: null, source: 'ai' } });
  });

  test('video answers keep a valid video kind; others drop it', async () => {
    const v = faux(fauxAssistantMessage(fauxToolCall('set_tags', { type: 'video', genre: 'none', vclass: 'info' })));
    expect(await classify(info, v.ref, v.models)).toEqual({ ok: true, tags: { type: 'video', genre: null, vclass: 'info', source: 'ai' } });
    const bad = faux(fauxAssistantMessage(fauxToolCall('set_tags', { type: 'video', genre: 'none', vclass: 'drama' })));
    expect(await classify(info, bad.ref, bad.models)).toEqual({ ok: true, tags: { type: 'video', genre: null, source: 'ai' } });
    const music = faux(fauxAssistantMessage(fauxToolCall('set_tags', { type: 'music', genre: 'rock', vclass: 'ent' })));
    expect(await classify(info, music.ref, music.models)).toEqual({ ok: true, tags: { type: 'music', genre: 'rock', source: 'ai' } });
  });

  test('non-music answers drop the genre', async () => {
    const { models, ref } = faux(fauxAssistantMessage(fauxToolCall('set_tags', { type: 'video', genre: 'rock' })));
    expect(await classify(info, ref, models)).toMatchObject({ ok: true, tags: { type: 'video', genre: null } });
  });

  test.each([
    ['invalid enum', fauxAssistantMessage(fauxToolCall('set_tags', { type: 'music', genre: 'polka' }))],
    ['not json', fauxAssistantMessage('music!')],
    ['provider error', fauxAssistantMessage([], { stopReason: 'error', errorMessage: 'boom' })],
  ])('fails on %s', async (_, reply) => {
    const { models, ref } = faux(reply);
    const r = await classify(info, ref, models);
    expect(r.ok).toBe(false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const again = faux(reply);
    expect(await aiTags(info, again.ref, again.models)).toBeNull();
  });

  test('unknown model makes no request', async () => {
    const { models, state } = faux();
    expect(await classify(info, { provider: 'faux', model: 'nope' }, models)).toMatchObject({ ok: false });
    expect(state.callCount).toBe(0);
  });
});

describe('custom OpenAI-compatible endpoint, end to end', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sse = (...chunks: object[]) =>
    new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
  const chunk = (delta: object, finish: string | null = null) => ({
    id: 'c1',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'qwen3:8b',
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

  test('keyless local server gets a tool call request and answers', async () => {
    const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const req = url instanceof Request ? url : new Request(url, init);
        calls.push({ url: req.url, headers: req.headers, body: await req.json() });
        return sse(
          chunk({
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 't1',
                type: 'function',
                function: { name: 'set_tags', arguments: '{"type":"music","genre":"rock"}' },
              },
            ],
          }),
          chunk({}, 'tool_calls'),
        );
      }),
    );
    let creds: CredentialMap = {};
    const store = storageCredentialStore({ getValue: async () => creds, setValue: async (v) => void (creds = v) });
    const models = createHdModels(store, [
      { id: 'custom-ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1/', api: 'openai-completions', models: ['qwen3:8b'] },
    ]);
    const r = await classify(info, { provider: 'custom-ollama', model: 'qwen3:8b' }, models);
    expect(r).toEqual({ ok: true, tags: { type: 'music', genre: 'rock', source: 'ai' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(calls[0]!.body.model).toBe('qwen3:8b');
    expect((calls[0]!.body.tools as { function: { name: string } }[])[0]!.function.name).toBe('set_tags');
  });
});

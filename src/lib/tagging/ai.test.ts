import { describe, expect, test, vi } from 'vitest';
import { DEFAULT_AI_SETTINGS, aiClient, aiTags, type AiSettings } from './ai';

const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, enabled: true, apiKey: 'sk-ant-test' };
const info = { site: 'www.youtube.com', title: 'YOASOBI「アイドル」', artist: 'Ayase / YOASOBI' };

function fakeFetch(reply: { text?: string; stop_reason?: string; status?: number }) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    if (reply.status && reply.status !== 200)
      return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }), {
        status: reply.status,
        headers: { 'content-type': 'application/json' },
      });
    return new Response(
      JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: settings.model,
        content: reply.text === undefined ? [] : [{ type: 'text', text: reply.text }],
        stop_reason: reply.stop_reason ?? 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('aiTags', () => {
  test('sends only metadata and parses structured output', async () => {
    const { fn, calls } = fakeFetch({ text: '{"type":"music","genre":"anime"}' });
    const tags = await aiTags(info, settings, aiClient(settings, fn));
    expect(tags).toEqual({ type: 'music', genre: 'anime', source: 'ai' });

    expect(calls).toHaveLength(1);
    const { url, headers, body } = calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages?beta=true');
    expect(headers.get('x-api-key')).toBe('sk-ant-test');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    // Privacy: the only user content is the three metadata fields.
    const messages = body.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0]!.content)).toEqual({ site: info.site, title: info.title, artist: info.artist });
    expect(JSON.stringify(body)).not.toContain('http');
  });

  test('non-music answers drop the genre', async () => {
    const { fn } = fakeFetch({ text: '{"type":"video","genre":"rock"}' });
    expect(await aiTags(info, settings, aiClient(settings, fn))).toEqual({ type: 'video', genre: null, source: 'ai' });
  });

  test.each([
    ['refusal', { stop_reason: 'refusal', text: '' }],
    ['invalid enum', { text: '{"type":"music","genre":"polka"}' }],
    ['not json', { text: 'music!' }],
    ['no text', {}],
    ['http error', { status: 400 }],
  ])('returns null on %s', async (_, reply) => {
    const { fn } = fakeFetch(reply);
    expect(await aiTags(info, settings, aiClient(settings, fn))).toBeNull();
  });

  test('disabled or missing key makes no request', async () => {
    const { fn, calls } = fakeFetch({ text: '{}' });
    expect(await aiTags(info, { ...settings, enabled: false }, aiClient(settings, fn))).toBeNull();
    expect(await aiTags(info, { ...settings, apiKey: '' }, aiClient(settings, fn))).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test('custom base URL', async () => {
    const s = { ...settings, baseURL: 'https://gateway.example.com' };
    const { fn, calls } = fakeFetch({ text: '{"type":"podcast","genre":"none"}' });
    expect(await aiTags(info, s, aiClient(s, fn))).toEqual({ type: 'podcast', genre: null, source: 'ai' });
    expect(calls[0]!.url.startsWith('https://gateway.example.com/v1/messages')).toBe(true);
  });
});

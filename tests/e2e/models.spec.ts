import type { BrowserContext, Page } from '@playwright/test';
import { audio, expect, songPage, test } from './fixtures';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

/** A fake OpenAI-compatible server whose model always answers set_tags(music, anime). */
async function serveLlm(context: BrowserContext, calls: string[]) {
  await context.route('https://llm.example/**', (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    calls.push(req.url());
    const chunk = (delta: object, finish: string | null = null) => ({
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'tagger-1',
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    const call = { index: 0, id: 't1', type: 'function', function: { name: 'set_tags', arguments: '{"type":"music","genre":"anime"}' } };
    const body =
      [chunk({ role: 'assistant', tool_calls: [call] }), chunk({}, 'tool_calls')].map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') +
      'data: [DONE]\n\n';
    return route.fulfill({ headers: { ...CORS, 'content-type': 'text/event-stream' }, body });
  });
}

const credentialsOf = (page: Page) =>
  page.evaluate(async () => {
    const c = (globalThis as unknown as { chrome: typeof browser }).chrome;
    return ((await c.storage.local.get('llmCredentials')).llmCredentials ?? {}) as Record<string, Record<string, unknown>>;
  });

test('custom endpoint: add, test, and AI tags new content in the background', async ({ context, extensionId, open }) => {
  const calls: string[] = [];
  await serveLlm(context, calls);
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#models`);
  await opts.getByTestId('custom-url').fill('https://llm.example/v1');
  await opts.getByTestId('custom-models').fill('tagger-1');
  await opts.getByRole('button', { name: '添加端点' }).click();
  await expect(opts.getByTestId('custom')).toContainText('llm.example');
  // The first usable model is picked automatically.
  await expect(opts.getByTestId('model-select')).toHaveValue('custom-llm-example::tagger-1');
  await opts.getByTestId('model-test').click();
  await expect(opts.getByTestId('model-test-result')).toContainText('成功：music / anime');
  await opts.screenshot({ path: 'test-results/models.png', fullPage: true });

  // Rules alone can't tell this is anime; the model can.
  const p = await open('a.test', songPage('Untitled Track 7', 'Nobody'));
  await audio(p).play();
  await expect.poll(() => calls.length).toBeGreaterThanOrEqual(2);
  await expect(p.getByTestId('happydesk-mascot')).toHaveAttribute('data-pack', 'momo');
});

test('API key: entered in the dialog, persisted, removable', async ({ context, extensionId }) => {
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#models`);
  await opts.getByTestId('key-provider').selectOption('deepseek');
  await opts.getByRole('button', { name: '添加 key' }).click();
  const dialog = opts.getByTestId('login-dialog');
  await dialog.getByTestId('login-input').fill('sk-test-123');
  await dialog.getByRole('button', { name: '确定' }).click();
  await expect(dialog).toBeHidden();
  await expect(opts.getByTestId('keyed')).toContainText('DeepSeek');
  await expect(opts.getByTestId('model-select')).toHaveValue(/^deepseek::/);
  expect((await credentialsOf(opts)).deepseek).toEqual({ type: 'api_key', key: 'sk-test-123' });

  await opts.reload();
  await expect(opts.getByTestId('keyed')).toContainText('DeepSeek');
  await opts.getByTestId('keyed').getByRole('button', { name: '移除' }).click();
  await expect(opts.getByTestId('keyed')).toHaveCount(0);
  expect((await credentialsOf(opts)).deepseek).toBeUndefined();
});

/** OpenRouter's token endpoint, answering any code with the given key. */
async function serveOpenRouterToken(context: BrowserContext, key: string, seen: unknown[]) {
  await context.route('https://openrouter.ai/api/v1/auth/keys', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    seen.push(route.request().postDataJSON());
    return route.fulfill({ headers: CORS, contentType: 'application/json', body: JSON.stringify({ key }) });
  });
}

/** Start "Sign in with OpenRouter"; returns the sign-in tab and the loopback callback URL it would redirect to. */
async function startOpenRouterLogin(context: BrowserContext, opts: Page) {
  const tab = context.waitForEvent('page');
  await opts.getByTestId('subscription').filter({ hasText: 'OpenRouter' }).getByRole('button', { name: '登录' }).click();
  const signIn = await tab;
  // Tabs opened by the extension skip Playwright routing on their first load, so read the
  // sign-in URL from the dialog's fallback link instead of the tab.
  const href = await opts.getByTestId('login-dialog').locator('a[href^="https://openrouter.ai/auth"]').getAttribute('href');
  const callback = new URL(href!).searchParams.get('callback_url')!;
  expect(callback).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback\//);
  return { signIn, callback };
}

test('OAuth sign-in: the localhost redirect is caught in the browser and exchanged', async ({ context, extensionId }) => {
  const seen: unknown[] = [];
  await serveOpenRouterToken(context, 'sk-or-from-oauth', seen);
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#models`);
  const { signIn, callback } = await startOpenRouterLogin(context, opts);
  // The provider approves and redirects the sign-in tab to the loopback URL, where nothing listens.
  await signIn.goto(`${callback}?code=granted-code`).catch(() => {});
  await expect(opts.getByTestId('login-dialog')).toBeHidden({ timeout: 15_000 });
  // The dead-end localhost tab was closed for the user.
  await expect.poll(() => signIn.isClosed()).toBe(true);
  const row = opts.getByTestId('subscription').filter({ hasText: 'OpenRouter' });
  await expect(row).toContainText('已登录');
  expect(seen).toEqual([expect.objectContaining({ code: 'granted-code', code_challenge_method: 'S256' })]);
  expect((await credentialsOf(opts)).openrouter).toMatchObject({ type: 'oauth', access: 'sk-or-from-oauth' });
  await expect(opts.getByTestId('model-select')).toHaveValue(/^openrouter::/);

  await row.getByRole('button', { name: '退出' }).click();
  await expect(row).not.toContainText('已登录');
  await expect.poll(async () => (await credentialsOf(opts)).openrouter).toBeUndefined();
});

test('OAuth sign-in: pasting the redirect URL works when it is not caught', async ({ context, extensionId }) => {
  const seen: unknown[] = [];
  await serveOpenRouterToken(context, 'sk-or-pasted', seen);
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#models`);
  const { signIn, callback } = await startOpenRouterLogin(context, opts);
  await signIn.close();
  const dialog = opts.getByTestId('login-dialog');
  await dialog.getByTestId('login-input').fill(`${callback}?code=pasted-code`);
  await dialog.getByRole('button', { name: '确定' }).click();
  await expect(dialog).toBeHidden();
  expect(seen).toEqual([expect.objectContaining({ code: 'pasted-code' })]);
  expect((await credentialsOf(opts)).openrouter).toMatchObject({ type: 'oauth', access: 'sk-or-pasted' });
});

test('Claude subscription sign-in is not offered; Anthropic is API key only', async ({ context, extensionId }) => {
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#models`);
  await expect(opts.getByTestId('subscription').first()).toBeVisible();
  await expect(opts.getByTestId('subscription').filter({ hasText: /Anthropic|Claude/ })).toHaveCount(0);
  await expect(opts.getByTestId('key-provider').locator('option[value="anthropic"]')).toHaveCount(1);
});

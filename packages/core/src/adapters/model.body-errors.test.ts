// model.ts — D35.2 (R08 C2): doc + parse THAN phan hoi nam TRONG phan loai loi. Huy khi dang doc than = nhu timeout
// (het han luot ⇒ ModelDeadlineError; con gio ⇒ retryable); than 200 khong phai JSON = retryable. Moi nhanh provider.
// 0 mang: fetch gia.
import { afterEach, describe, expect, it } from 'vitest';
import { ModelDeadlineError, ModelUnavailableError } from '../domain/errors.js';
import { callModel, setGeminiFetchForTest, setOpenRouterFetchForTest } from './model.js';

const OK_GEMINI = { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
const OK_OAI = { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
const CALL = { route: 'community' as const, system: 's', messages: [{ role: 'user' as const, content: 'hi' }] };

const ENV = ['MODEL_PROVIDER', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'MODEL_COMMUNITY', 'MODEL_FALLBACKS', 'MODEL_DEFAULT', 'DATABASE_URL'];
const saved = new Map<string, string | undefined>();
function env(over: Record<string, string>) {
  for (const k of ENV) {
    if (!saved.has(k)) saved.set(k, process.env[k]);
    delete process.env[k];
  }
  Object.assign(process.env, { MODEL_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', MODEL_COMMUNITY: 'main-model', MODEL_FALLBACKS: '', ...over });
}
afterEach(() => {
  setGeminiFetchForTest(null);
  setOpenRouterFetchForTest(null);
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  saved.clear();
});

/** Header 200 den ngay, than treo toi khi signal huy (giong OpenRouter gui header som cho request dai). */
const stallBody =
  (): typeof fetch =>
  async (_u, init) => {
    const signal = init?.signal ?? undefined;
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"x":['));
        signal?.addEventListener('abort', () => c.error(signal.reason ?? new Error('aborted')), { once: true });
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
  };

const badJson = (): typeof fetch => async () => new Response('<html>proxy</html>', { status: 200 });

const PROVIDERS = [
  { name: 'gemini', setup: () => env({}), set: setGeminiFetchForTest, ok: OK_GEMINI },
  { name: 'openrouter', setup: () => env({ MODEL_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' }), set: setOpenRouterFetchForTest, ok: OK_OAI },
] as const;

for (const p of PROVIDERS) {
  describe(`than phan hoi — ${p.name}`, () => {
    it('stall_body: abort khi dang doc than, het han luot ⇒ ModelDeadlineError (khong loi tho)', async () => {
      p.setup();
      p.set(stallBody());
      const t0 = Date.now();
      const err = await callModel({ ...CALL, deadlineAt: Date.now() + 1200 }).catch((e) => e);
      expect(err).toBeInstanceOf(ModelDeadlineError);
      expect(Date.now() - t0).toBeLessThan(2000);
    });

    it('stall_body KHONG deadline nhung abort ⇒ van la ModelUnavailableError (khong loi tho)', async () => {
      p.setup();
      // fetch gia tu abort than ngay (nhu mang cat giua chung)
      p.set(async () => {
        const stream = new ReadableStream({ start: (c) => c.error(new Error('socket hang up')) });
        return new Response(stream, { status: 200 });
      });
      const err = await callModel({ ...CALL, deadlineAt: Date.now() + 1500 }).catch((e) => e);
      expect(err).toBeInstanceOf(ModelUnavailableError);
    }, 10_000);

    it('bad_json (200, than khong phai JSON) cuoi cung het gio ⇒ ModelDeadlineError, khong SyntaxError tho', async () => {
      p.setup();
      p.set(badJson());
      const err = await callModel({ ...CALL, deadlineAt: Date.now() + 1500 }).catch((e) => e);
      expect(err).toBeInstanceOf(ModelDeadlineError);
      expect((err as Error).name).not.toBe('SyntaxError');
    }, 10_000);

    it('bad_json lan 1, lan 2 tot ⇒ retry thanh cong (retryable)', async () => {
      p.setup();
      let calls = 0;
      p.set(async () => {
        calls += 1;
        return calls === 1 ? new Response('<html>x</html>', { status: 200 }) : new Response(JSON.stringify(p.ok), { status: 200, headers: { 'content-type': 'application/json' } });
      });
      const res = await callModel({ ...CALL, deadlineAt: Date.now() + 5000 });
      expect(res.message.content[0]).toMatchObject({ type: 'text', text: 'ok' });
      expect(calls).toBe(2);
    }, 10_000);
  });
}

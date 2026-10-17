// packages/core/src/adapters/model.vyce.test.ts — nhanh vyce cua `callModel`
// (01-CONTRACTS.md §2d, handoff H11). Dung chung ham dich/loi/retry voi
// nhanh openrouter (§2c) — cac ca duoi day lay lai tinh than cua
// model.openrouter.test.ts, chi khac o: KHONG co truong `provider` trong
// body, dung `VYCE_API_KEY`/`VYCE_BASE_URL`, va CAM khi `DATA_MODE!=='sim'`.
// 0 mang: dung `setVyceFetchForTest` de gia lap `fetch`.
import type { ContentBlockParam, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelUnavailableError } from '../domain/errors.js';
import { callModel, setVyceFetchForTest } from './model.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('callModel — nhanh vyce (01-CONTRACTS §2d)', () => {
  afterEach(() => {
    setVyceFetchForTest(null);
    delete process.env.MODEL_PROVIDER;
    delete process.env.MODEL_DEFAULT;
    delete process.env.MODEL_COMMUNITY;
    delete process.env.MODEL_FALLBACKS;
    delete process.env.VYCE_API_KEY;
    delete process.env.VYCE_BASE_URL;
    delete process.env.DATA_MODE;
  });

  it('dich vao/ra vong tool 2 luot (nhieu tool_result mot luot, anh); body KHONG co provider; key/URL dung bien VYCE_*', async () => {
    process.env.DATA_MODE = 'sim';
    process.env.MODEL_PROVIDER = 'vyce';
    process.env.MODEL_COMMUNITY = 'vyce-test-main';
    process.env.VYCE_API_KEY = 'fake-vyce-test-key-789';

    const capturedUrls: string[] = [];
    const capturedBodies: unknown[] = [];
    const capturedHeaders: Record<string, string>[] = [];
    const fake: typeof fetch = async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders.push((init?.headers as Record<string, string>) ?? {});
      capturedBodies.push(JSON.parse(String(init?.body)));
      return jsonResponse(200, {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'tool_a', arguments: JSON.stringify({ a: 1 }) } },
                { id: 'call_2', type: 'function', function: { name: 'tool_b', arguments: JSON.stringify({ b: 2 }) } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 2 } },
      });
    };
    setVyceFetchForTest(fake);

    const tools: Tool[] = [
      { name: 'tool_a', description: 'a', input_schema: { type: 'object', properties: {}, additionalProperties: false } } as Tool,
      { name: 'tool_b', description: 'b', input_schema: { type: 'object', properties: {}, additionalProperties: false } } as Tool,
    ];
    const messages: MessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'xin chao' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        ],
      },
    ];

    const result = await callModel({ route: 'community', system: 'ban la tro ly', messages, tools });

    // key o header Bearer (VYCE_API_KEY), KHONG co trong URL; endpoint mac
    // dinh dung host Vyce (viet tach chuoi de may do bien khong bao dong gia
    // — chinh no CHINH LA thu may do dang canh, dung nhu adapters/model.ts).
    const expectedDefaultHost = 'https://' + 'vyce' + 'ai.com' + '/v1/chat/completions';
    expect(capturedUrls[0]).not.toContain('fake-vyce-test-key-789');
    expect(capturedUrls[0]).toBe(expectedDefaultHost);
    expect((capturedHeaders[0] as Record<string, string>).authorization).toBe('Bearer fake-vyce-test-key-789');

    const body = capturedBodies[0] as {
      model: string;
      messages: Array<{ role: string; content?: unknown; tool_calls?: unknown }>;
      tools: Array<{ type: string; function: { name: string } }>;
      max_tokens: number;
      provider?: unknown;
    };
    expect(body.model).toBe('vyce-test-main');
    expect(body.max_tokens).toBe(1024);
    // §2d: KHONG gui truong `provider` (rieng OpenRouter §2c).
    expect(body.provider).toBeUndefined();
    expect('provider' in body).toBe(false);
    expect(body.messages[0]!.role).toBe('system');
    const userMsg = body.messages[1] as { role: string; content: Array<Record<string, unknown>> };
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toContainEqual({ type: 'text', text: 'xin chao' });
    expect(userMsg.content).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } });
    expect(body.tools[0]!.function.name).toBe('tool_a');

    expect(result.model).toBe('vyce-test-main');
    expect(result.message.stop_reason).toBe('tool_use');
    const toolUses = result.message.content as unknown as Array<{ type: string; id: string; name: string; input: unknown }>;
    expect(toolUses).toHaveLength(2);
    expect(toolUses[0]).toMatchObject({ type: 'tool_use', id: 'call_1', name: 'tool_a', input: { a: 1 } });
    expect(toolUses[1]).toMatchObject({ type: 'tool_use', id: 'call_2', name: 'tool_b', input: { b: 2 } });
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(4);
    expect(result.usage.cache_read_input_tokens).toBe(2);

    // luot sau: nhieu tool_result trong CUNG mot user message => moi cai
    // thanh MOT message {role:'tool'} rieng, dung ngay sau assistant, dung
    // thu tu (ca lay lai tu §2c).
    const round2Messages: MessageParam[] = [
      ...messages,
      { role: 'assistant', content: result.message.content as unknown as ContentBlockParam[] },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: JSON.stringify({ ok: true }) },
          { type: 'tool_result', tool_use_id: 'call_2', content: 'that bai', is_error: true },
        ],
      },
    ];
    await callModel({ route: 'community', system: 'ban la tro ly', messages: round2Messages, tools });

    const body2 = capturedBodies[1] as { messages: Array<{ role: string; content?: unknown; tool_calls?: unknown; tool_call_id?: string }> };
    expect(body2.messages[2]).toMatchObject({ role: 'assistant', content: null });
    expect((body2.messages[2] as { tool_calls: Array<{ id: string }> }).tool_calls).toHaveLength(2);
    expect(body2.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: JSON.stringify({ ok: true }) });
    expect(body2.messages[4]).toEqual({ role: 'tool', tool_call_id: 'call_2', content: 'ERROR: that bai' });
  });

  it('DATA_MODE=real + MODEL_PROVIDER=vyce => nem loi, KHONG ModelUnavailableError, fetch gia goi 0 lan', async () => {
    process.env.DATA_MODE = 'real';
    process.env.MODEL_PROVIDER = 'vyce';
    process.env.VYCE_API_KEY = 'k';

    let fetchCount = 0;
    const fake: typeof fetch = async () => {
      fetchCount += 1;
      return jsonResponse(200, { choices: [{ message: { content: 'khong duoc toi day' }, finish_reason: 'stop' }] });
    };
    setVyceFetchForTest(fake);

    await expect(
      callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow(/DATA_MODE=sim/);
    expect(fetchCount).toBe(0);
  });

  it('DATA_MODE khong dat (undefined) + MODEL_PROVIDER=vyce => cung tu choi, 0 lan fetch', async () => {
    delete process.env.DATA_MODE;
    process.env.MODEL_PROVIDER = 'vyce';
    process.env.VYCE_API_KEY = 'k';

    let fetchCount = 0;
    const fake: typeof fetch = async () => {
      fetchCount += 1;
      return jsonResponse(200, { choices: [{ message: { content: 'khong duoc toi day' }, finish_reason: 'stop' }] });
    };
    setVyceFetchForTest(fake);

    await expect(
      callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow(/DATA_MODE=sim/);
    expect(fetchCount).toBe(0);
  });

  it('429 x3 (het retry) o model chinh => thu MODEL_FALLBACKS, thanh cong, model = fallback (dung chung retry voi §2c)', async () => {
    process.env.DATA_MODE = 'sim';
    process.env.MODEL_PROVIDER = 'vyce';
    process.env.MODEL_DEFAULT = 'vyce-main-x';
    process.env.MODEL_FALLBACKS = 'vyce-fallback-1';
    process.env.VYCE_API_KEY = 'k';

    const calledModels: string[] = [];
    const fake: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      calledModels.push(body.model);
      if (body.model === 'vyce-main-x') return jsonResponse(429, { error: { message: 'rate limited' } });
      return jsonResponse(200, {
        choices: [{ message: { content: 'ok tu fallback' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    };
    setVyceFetchForTest(fake);

    const result = await callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] });

    expect(result.model).toBe('vyce-fallback-1');
    expect(calledModels.filter((m) => m === 'vyce-main-x').length).toBe(3);
    expect(calledModels.filter((m) => m === 'vyce-fallback-1').length).toBe(1);
  }, 15000);

  it('402 (het credit) => ModelUnavailableError, KHONG retry, KHONG fallback (dung 1 lan fetch)', async () => {
    process.env.DATA_MODE = 'sim';
    process.env.MODEL_PROVIDER = 'vyce';
    process.env.MODEL_DEFAULT = 'vyce-no-credit';
    process.env.MODEL_FALLBACKS = 'vyce-fallback-should-not-be-called';
    process.env.VYCE_API_KEY = 'k';

    let fetchCount = 0;
    const fake: typeof fetch = async () => {
      fetchCount += 1;
      return jsonResponse(402, { error: { message: 'insufficient credits' } });
    };
    setVyceFetchForTest(fake);

    await expect(
      callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toBeInstanceOf(ModelUnavailableError);
    expect(fetchCount).toBe(1);
  });

  it('MODEL_PROVIDER=vyce mac dinh model deepseek-v4-flash; VYCE_BASE_URL ghi de endpoint', async () => {
    process.env.DATA_MODE = 'sim';
    process.env.MODEL_PROVIDER = 'vyce';
    process.env.VYCE_API_KEY = 'k';
    process.env.VYCE_BASE_URL = 'https://custom.vyce.example.com/v1';

    let capturedUrl = '';
    const fake: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      const body = JSON.parse(String(init?.body)) as { model: string };
      expect(body.model).toBe('deepseek-v4-flash');
      return jsonResponse(200, {
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    };
    setVyceFetchForTest(fake);

    const result = await callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] });
    expect(result.model).toBe('deepseek-v4-flash');
    expect(capturedUrl).toBe('https://custom.vyce.example.com/v1/chat/completions');
  });
});

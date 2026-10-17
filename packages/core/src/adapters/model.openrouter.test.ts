// packages/core/src/adapters/model.openrouter.test.ts — nhanh openrouter cua
// `callModel` (01-CONTRACTS.md §2c, handoff H10). 0 mang: dung
// `setOpenRouterFetchForTest` de gia lap `fetch`, dung nguyen `Tool`/
// `MessageParam` dang Anthropic o dau vao (§2 giu nguyen chu ky).
import type { ContentBlockParam, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelUnavailableError } from '../domain/errors.js';
import { callModel, setOpenRouterFetchForTest } from './model.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('callModel — nhanh openrouter (01-CONTRACTS §2c)', () => {
  afterEach(() => {
    setOpenRouterFetchForTest(null);
    delete process.env.MODEL_PROVIDER;
    delete process.env.MODEL_DEFAULT;
    delete process.env.MODEL_COMMUNITY;
    delete process.env.MODEL_FALLBACKS;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_BASE_URL;
  });

  it('dich vao/ra vong tool 2 luot (nhieu tool_result mot luot, anh); data_collection:deny; key o header Bearer', async () => {
    process.env.MODEL_PROVIDER = 'openrouter';
    process.env.MODEL_COMMUNITY = 'or-test-main';
    process.env.OPENROUTER_API_KEY = 'sk-or-secret-123';

    const capturedUrls: string[] = [];
    const capturedBodies: unknown[] = [];
    const capturedHeaders: Record<string, string>[] = [];
    const fake: typeof fetch = async (input, init) => {
      capturedUrls.push(String(input));
      capturedHeaders.push((init?.headers as Record<string, string>) ?? {});
      capturedBodies.push(JSON.parse(String(init?.body)));
      return jsonResponse(200, {
        model: 'google/gemini-3.6-flash',
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
    setOpenRouterFetchForTest(fake);

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

    // key o header Bearer, KHONG co trong URL.
    expect(capturedUrls[0]).not.toContain('sk-or-secret-123');
    expect(capturedUrls[0]).toContain('/chat/completions');
    expect((capturedHeaders[0] as Record<string, string>).authorization).toBe('Bearer sk-or-secret-123');

    const body = capturedBodies[0] as {
      model: string;
      messages: Array<{ role: string; content?: unknown; tool_calls?: unknown }>;
      tools: Array<{ type: string; function: { name: string } }>;
      max_tokens: number;
      provider: { data_collection: string };
    };
    expect(body.model).toBe('or-test-main');
    expect(body.max_tokens).toBe(1024);
    // BAT BUOC — Luat 91/2025 (01-CONTRACTS §2c).
    expect(body.provider.data_collection).toBe('deny');
    expect(body.messages[0]!.role).toBe('system');
    // user message co anh => mang part {type:'text'}/{type:'image_url'}.
    const userMsg = body.messages[1] as { role: string; content: Array<Record<string, unknown>> };
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toContainEqual({ type: 'text', text: 'xin chao' });
    expect(userMsg.content).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } });
    expect(body.tools[0]!.function.name).toBe('tool_a');

    // dich ra: 2 tool_calls => 2 khoi tool_use, stop_reason luon tool_use.
    expect(result.model).toBe('or-test-main');
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
    // thu tu.
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
    // [0]=system, [1]=user(anh), [2]=assistant(tool_calls), [3]=tool(call_1), [4]=tool(call_2).
    expect(body2.messages[2]).toMatchObject({ role: 'assistant', content: null });
    expect((body2.messages[2] as { tool_calls: Array<{ id: string }> }).tool_calls).toHaveLength(2);
    expect(body2.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: JSON.stringify({ ok: true }) });
    expect(body2.messages[4]).toEqual({ role: 'tool', tool_call_id: 'call_2', content: 'ERROR: that bai' });
  });

  it('429 x3 (het retry) o model chinh => thu MODEL_FALLBACKS, thanh cong, model = fallback', async () => {
    process.env.MODEL_PROVIDER = 'openrouter';
    process.env.MODEL_DEFAULT = 'or-main-x';
    process.env.MODEL_FALLBACKS = 'or-fallback-1';
    process.env.OPENROUTER_API_KEY = 'k';

    const calledModels: string[] = [];
    const fake: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      calledModels.push(body.model);
      if (body.model === 'or-main-x') return jsonResponse(429, { error: { message: 'rate limited' } });
      return jsonResponse(200, {
        choices: [{ message: { content: 'ok tu fallback' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    };
    setOpenRouterFetchForTest(fake);

    const result = await callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] });

    expect(result.model).toBe('or-fallback-1');
    // 3 lan goi model chinh (1 + 2 retry) roi 1 lan fallback thanh cong.
    expect(calledModels.filter((m) => m === 'or-main-x').length).toBe(3);
    expect(calledModels.filter((m) => m === 'or-fallback-1').length).toBe(1);
    expect(result.message.stop_reason).toBe('end_turn');
  }, 15000);

  it('402 (het credit) => ModelUnavailableError, KHONG retry, KHONG fallback (dung 1 lan fetch)', async () => {
    process.env.MODEL_PROVIDER = 'openrouter';
    process.env.MODEL_DEFAULT = 'or-no-credit';
    process.env.MODEL_FALLBACKS = 'or-fallback-should-not-be-called';
    process.env.OPENROUTER_API_KEY = 'k';

    let fetchCount = 0;
    const calledModels: string[] = [];
    const fake: typeof fetch = async (_input, init) => {
      fetchCount += 1;
      const body = JSON.parse(String(init?.body)) as { model: string };
      calledModels.push(body.model);
      return jsonResponse(402, { error: { message: 'insufficient credits' } });
    };
    setOpenRouterFetchForTest(fake);

    await expect(
      callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toBeInstanceOf(ModelUnavailableError);
    expect(fetchCount).toBe(1);
    expect(calledModels).toEqual(['or-no-credit']);
  });

  it('400 => nem loi ngay, khong retry, dung 1 lan fetch', async () => {
    process.env.MODEL_PROVIDER = 'openrouter';
    process.env.MODEL_DEFAULT = 'or-bad-request';
    process.env.OPENROUTER_API_KEY = 'k';

    let fetchCount = 0;
    const fake: typeof fetch = async () => {
      fetchCount += 1;
      return jsonResponse(400, { error: { message: 'invalid argument' } });
    };
    setOpenRouterFetchForTest(fake);

    await expect(
      callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.not.toBeInstanceOf(ModelUnavailableError);
    expect(fetchCount).toBe(1);
  });

  it('arguments cua tool_call khong parse duoc JSON => input = {}', async () => {
    process.env.MODEL_PROVIDER = 'openrouter';
    process.env.MODEL_DEFAULT = 'or-bad-args';
    process.env.OPENROUTER_API_KEY = 'k';

    const fake: typeof fetch = async () =>
      jsonResponse(200, {
        choices: [
          {
            message: { content: null, tool_calls: [{ id: 'call_x', type: 'function', function: { name: 'tool_a', arguments: '{not-json' } }] },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    setOpenRouterFetchForTest(fake);

    const result = await callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] });
    const toolUse = result.message.content[0] as { type: string; input: unknown };
    expect(toolUse.type).toBe('tool_use');
    expect(toolUse.input).toEqual({});
  });

  it('MODEL_PROVIDER=openrouter mac dinh model google/gemini-3.6-flash khi khong dat MODEL_DEFAULT/MODEL_COMMUNITY', async () => {
    process.env.MODEL_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'k';

    const fake: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      expect(body.model).toBe('google/gemini-3.6-flash');
      return jsonResponse(200, {
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    };
    setOpenRouterFetchForTest(fake);

    const result = await callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] });
    expect(result.model).toBe('google/gemini-3.6-flash');
  });

  it('OPENROUTER_BASE_URL ghi de endpoint mac dinh', async () => {
    process.env.MODEL_PROVIDER = 'openrouter';
    process.env.MODEL_DEFAULT = 'or-custom-base';
    process.env.OPENROUTER_API_KEY = 'k';
    process.env.OPENROUTER_BASE_URL = 'https://custom.example.com/v1';

    let capturedUrl = '';
    const fake: typeof fetch = async (input) => {
      capturedUrl = String(input);
      return jsonResponse(200, {
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    };
    setOpenRouterFetchForTest(fake);

    await callModel({ route: 'community', system: 'he thong', messages: [{ role: 'user', content: 'hi' }] });
    expect(capturedUrl).toBe('https://custom.example.com/v1/chat/completions');
  });
});

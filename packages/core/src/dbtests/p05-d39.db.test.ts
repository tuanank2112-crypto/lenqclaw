// p05-d39.db.test.ts — hai sua D39 (H12 §3.0): (a) node `tools` nang lan TRUOC khi chay tool `extendsDeadline`
// ⇒ embed nhan han `rag`; (b) botUid: DATA_MODE=sim + thread `sim-%` ⇒ BOT_UID_SIM bat ke cot own_uid. Embed bang fetch GIA.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { setEmbedFetchForTest, setEmbedRetryDelaysForTest } from '../adapters/model.js';
import { BOT_UID_CACHE_MS, botUid, resetBotUidCache, resolveBotUid } from '../agent/community/bot.js';
import { toolsNode } from '../agent/community/graph/nodes/tools.js';
import type { TurnStateT } from '../agent/community/graph/state.js';
import type { ToolContext } from '../domain/types.js';
import { BOT_UID_SIM } from '../sim/sim-transport.js';

const targets: string[] = [];
let ownUidBefore: string | null = null;

beforeAll(async () => {
  process.env.GEMINI_API_KEY = 'test-embed-key';
  setEmbedRetryDelaysForTest([1, 1]);
  ownUidBefore = (await sql<{ own_uid: string | null }>(`select own_uid from zalo_accounts where id = 'community'`))[0]?.own_uid ?? null;
});
afterEach(() => {
  setEmbedFetchForTest(null);
  resetBotUidCache();
});
afterAll(async () => {
  setEmbedRetryDelaysForTest(null);
  delete process.env.GEMINI_API_KEY;
  await sql(`update zalo_accounts set own_uid = $1 where id = 'community'`, [ownUidBefore]);
  if (targets.length > 0) await sql(`delete from audit_log where action = 'kb.search' and target = any($1::text[])`, [targets]);
  await closeDb();
});

/** Embed gia: tra vector sau `delayMs`, ton trong AbortSignal (het han ⇒ nem). */
function slowEmbed(delayMs: number, log: { calls: number }): typeof fetch {
  return async (_url, init) => {
    log.calls++;
    await new Promise<void>((resolve, reject) => {
      const sig = init?.signal as AbortSignal | undefined;
      const t = setTimeout(resolve, delayMs);
      sig?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new Error('aborted'));
      });
    });
    const n = (JSON.parse(String(init?.body)) as { requests: unknown[] }).requests.length;
    const values = Array.from({ length: 1024 }, (_, i) => (i === 7 ? 1 : 0));
    return new Response(JSON.stringify({ embeddings: Array.from({ length: n }, () => ({ values })) }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

function toolsState(threadId: string, remainingMs: number): TurnStateT {
  const now = Date.now();
  const fastDeadline = now + remainingMs;
  const ctx = { requester: { uid: 'u1', role: 'member', displayName: null }, threadId, deadlineAt: fastDeadline } as unknown as ToolContext;
  return {
    ctx,
    lane: 'fast',
    deadlineAt: fastDeadline,
    rounds: 0,
    answered: 0,
    toolMs: 0,
    request: { kind: 'group_mention', threadId, receivedAt: fastDeadline - 5000, requester: { uid: 'u1', role: 'member' } },
    messages: [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'tu1', name: 'search_knowledge', input: { query: `zq${randomUUID().slice(0, 8)} agent` } }] },
    ],
  } as unknown as TurnStateT;
}

describe('D39 (a): node tools nang lan TRUOC khi chay tool extendsDeadline', () => {
  it('luot fast con 1000 ms (< 3500, > 300) goi search_knowledge ⇒ embed nhan han rag (khong roi ve lexical)', async () => {
    const threadId = `p05-d39-${randomUUID().slice(0, 8)}`;
    targets.push(threadId);
    const log = { calls: 0 };
    setEmbedFetchForTest(slowEmbed(1200, log)); // 1200 ms > con lai cua han fast (1000), < embedTimeout 1500
    const out = await toolsNode(toolsState(threadId, 1000));
    expect(out.lane).toBe('rag');
    expect(log.calls).toBe(1);
    const a = await sql<{ data: { vector: boolean } }>(`select data from audit_log where action = 'kb.search' and target = $1`, [threadId]);
    expect(a).toHaveLength(1);
    expect(a[0]!.data.vector).toBe(true);
  });
  it('con < TOOL_MIN_MS (300) ⇒ KHONG chay tool, KHONG nang lan', async () => {
    const threadId = `p05-d39-${randomUUID().slice(0, 8)}`;
    const log = { calls: 0 };
    setEmbedFetchForTest(slowEmbed(10, log));
    const out = await toolsNode(toolsState(threadId, 100));
    expect(log.calls).toBe(0);
    expect(out.lane).toBe('fast');
  });
});

describe('D39 (b): botUid sim', () => {
  it('cot own_uid co uid that + DATA_MODE=sim + thread sim-% ⇒ BOT_UID_SIM; thread that ⇒ uid that', async () => {
    await sql(`update zalo_accounts set own_uid = '8801234' where id = 'community'`);
    const env = { DATA_MODE: 'sim' } as NodeJS.ProcessEnv;
    const simThread = `sim-${randomUUID().slice(0, 6)}`;
    expect(await botUid('community', env, Date.now, simThread)).toBe(BOT_UID_SIM);
    // D41/F2: resolveBotUid tinh sim theo threadId cua CHINH luot (khong con co dung chung trong cache)
    expect(resolveBotUid(env, 'community', simThread)).toBe(BOT_UID_SIM);
    expect(await botUid('community', env, () => Date.now() + BOT_UID_CACHE_MS + 1, 'g-real-1')).toBe('8801234');
    expect(resolveBotUid(env, 'community', 'g-real-1')).toBe('8801234');
    expect(resolveBotUid(env, 'community', simThread)).toBe(BOT_UID_SIM);
  });
});

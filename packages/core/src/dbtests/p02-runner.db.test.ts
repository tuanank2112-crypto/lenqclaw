// packages/core/src/dbtests/p02-runner.db.test.ts — SPEC-P02 §9.2, §9.5:
// runner `core:run` xu ly tin vao (inbound_events) ⇒ co dong outbox; mot tin
// xu ly toi da mot lan; dung em khi abort.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '../adapters/db.js';
import { setModelClientForTest, setTriageClientForTest, type ModelClientLike } from '../adapters/model.js';
import { simInbound } from '../sim/sim-transport.js';
import { drainInbound, runInboundLoop } from '../runner/inbound-runner.js';
import { REGISTER_REPLY } from '../agent/pii.js';

// G16: test tu dat provider; client gia NEM LOI ⇒ 0 mang, triage = null.
process.env.MODEL_PROVIDER = 'anthropic';
const poison: ModelClientLike = {
  messages: {
    async create() {
      throw new Error('p02-runner: khong duoc goi model trong test nay');
    },
  },
} as unknown as ModelClientLike;

async function outboxFor(threadId: string): Promise<Array<{ body: { text?: string } }>> {
  return sql(`select body from outbox where thread_id = $1 and kind = 'text' order by id`, [threadId]);
}

beforeAll(() => {
  setModelClientForTest(poison);
  setTriageClientForTest(poison);
});

afterAll(async () => {
  setModelClientForTest(null);
  setTriageClientForTest(null);
  await closeDb();
});

describe('inbound runner (core:run)', () => {
  it('tin vao tu nguoi la tren bql ⇒ runner ⇒ outbox co REGISTER_REPLY; chay lai khong tra loi trung', async () => {
    // Rut sach hang doi cu (neu co) de do dung tin cua test nay.
    await drainInbound();
    const thread = `zalo-real-${randomUUID().slice(0, 8)}`;
    await simInbound({ account: 'bql', threadId: thread, threadType: 'user', senderUid: thread, text: 'chào ban quản lý' });
    const n = await drainInbound();
    expect(n).toBe(1);
    const out = await outboxFor(thread);
    expect(out.length).toBe(1);
    expect(out[0]!.body.text).toBe(REGISTER_REPLY);
    expect(await drainInbound()).toBe(0);
    expect((await outboxFor(thread)).length).toBe(1);
    const ie = await sql<{ processed_at: string | null }>(`select processed_at from inbound_events where thread_id = $1`, [thread]);
    expect(ie[0]!.processed_at).not.toBeNull();
  });

  it('tin khan cap ⇒ runner ⇒ EMERGENCY_REPLY (0 model)', async () => {
    const thread = `zalo-real-${randomUUID().slice(0, 8)}`;
    await simInbound({ account: 'bql', threadId: thread, threadType: 'user', senderUid: thread, text: 'nhà em bốc khói' });
    await drainInbound();
    const out = await outboxFor(thread);
    expect(out.length).toBe(1);
    expect(out[0]!.body.text).toMatch(/khẩn cấp/);
  });

  it('runInboundLoop: xu ly tin moi den trong vong lap, dung khi abort', async () => {
    const controller = new AbortController();
    const thread = `zalo-real-${randomUUID().slice(0, 8)}`;
    let processed = 0;
    const loop = runInboundLoop({
      intervalMs: 50,
      signal: controller.signal,
      onProcessed: () => {
        processed++;
      },
    });
    await simInbound({ account: 'bql', threadId: thread, threadType: 'user', senderUid: thread, text: 'xin chào' });
    const deadline = Date.now() + 10_000;
    while ((await outboxFor(thread)).length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    controller.abort();
    await loop; // tra ve ⇒ da dung em
    expect((await outboxFor(thread)).length).toBe(1);
    expect(processed).toBeGreaterThanOrEqual(1);
  });
});

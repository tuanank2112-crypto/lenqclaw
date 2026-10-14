// packages/core/src/dbtests/p02-runner.db.test.ts — runner `core:run` xu ly tin
// vao (inbound_events) => co dong outbox; mot tin xu ly toi da mot lan; dung em
// khi abort. P01: handler la khung router => DM nhan `STUB_DM_REPLY`.

import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '../adapters/db.js';
import { simInbound } from '../sim/sim-transport.js';
import { drainInbound, runInboundLoop } from '../runner/inbound-runner.js';
import { STUB_DM_REPLY } from '../agent/community/router.js';

async function outboxFor(threadId: string): Promise<Array<{ body: { text?: string } }>> {
  return sql(`select body from outbox where thread_id = $1 and kind = 'text' order by id`, [threadId]);
}

afterAll(async () => {
  await closeDb();
});

describe('inbound runner (core:run)', () => {
  it('DM tu nguoi la => runner => outbox co STUB_DM_REPLY; chay lai khong tra loi trung', async () => {
    // Rut sach hang doi cu (neu co) de do dung tin cua test nay.
    await drainInbound();
    const thread = `zalo-real-${randomUUID().slice(0, 8)}`;
    await simInbound({ account: 'community', threadId: thread, threadType: 'user', senderUid: thread, text: 'chào bạn' });
    const n = await drainInbound();
    expect(n).toBe(1);
    const out = await outboxFor(thread);
    expect(out.length).toBe(1);
    expect(out[0]!.body.text).toBe(STUB_DM_REPLY);
    expect(await drainInbound()).toBe(0);
    expect((await outboxFor(thread)).length).toBe(1);
    const ie = await sql<{ processed_at: string | null }>(`select processed_at from inbound_events where thread_id = $1`, [thread]);
    expect(ie[0]!.processed_at).not.toBeNull();
  });

  it('tin nhom => khung ingest chi audit, 0 outbox', async () => {
    await drainInbound();
    const thread = `sim-group-${randomUUID().slice(0, 8)}`;
    await simInbound({
      account: 'community',
      threadId: thread,
      threadType: 'group',
      senderUid: 'sim-mem-1',
      text: 'xin chào cả nhóm',
    });
    await drainInbound();
    expect((await outboxFor(thread)).length).toBe(0);
    const a = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action = 'group.ingest_stub' and target = $1`,
      [thread]
    );
    expect(a[0]!.c).toBe(1);
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
    await simInbound({ account: 'community', threadId: thread, threadType: 'user', senderUid: thread, text: 'xin chào' });
    const deadline = Date.now() + 10_000;
    while ((await outboxFor(thread)).length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    controller.abort();
    await loop; // tra ve => da dung em
    expect((await outboxFor(thread)).length).toBe(1);
    expect(processed).toBeGreaterThanOrEqual(1);
  });
});

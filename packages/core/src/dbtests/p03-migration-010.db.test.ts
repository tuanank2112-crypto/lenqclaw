// p03-migration-010.db.test.ts — SPEC-P03 §11 hang 17: migration 010 (D31/D32) co du cot/bang/view va view
// `reply_latency` tinh dung `core_ms = e2e_ms − hold_ms` (01-CONTRACTS §4). Ap tu rong + `applied 0` khi chay lai:
// bang chung may o evidence/P03/migration-010-probe.txt (DB tam).

import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { enqueue } from '../adapters/transport.js';
import { runMigrations } from '../db/migrate.js';

afterAll(async () => {
  await closeDb();
});

describe('migration 010_ops_latency', () => {
  it('chay lai ⇒ applied 0 (idempotent theo schema_migrations)', async () => {
    const r = await runMigrations();
    expect(r.applied).toBe(0);
    const m = await sql<{ version: string }>(`select version from schema_migrations where version like '010%'`);
    expect(m.length).toBe(1);
  });

  it('cot moi cua turn_traces / outbox, bang process_heartbeats / alert_state, chi muc', async () => {
    const cols = await sql<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns where table_schema = 'public' and
         ((table_name = 'turn_traces' and column_name in ('inbound_event_id','received_at','lane','queued_ms','pre_turn_ms','triage_ms','model_ms','tool_ms','deadline_hit'))
       or (table_name = 'outbox' and column_name in ('inbound_event_id','picked_at','hold_reason')))`
    );
    expect(cols.filter((c) => c.table_name === 'turn_traces')).toHaveLength(9);
    expect(cols.filter((c) => c.table_name === 'outbox')).toHaveLength(3);
    const idx = await sql<{ indexname: string }>(
      `select indexname from pg_indexes where indexname in ('turn_traces_lane_time_idx','outbox_inbound_event_idx','inbound_events_pending_thread_idx')`
    );
    expect(idx).toHaveLength(3);
    const t = await sql<{ table_name: string }>(`select table_name from information_schema.tables where table_name in ('process_heartbeats','alert_state')`);
    expect(t).toHaveLength(2);
  });

  it("CHECK: lane ngoai fast|rag|background bi tu choi; process_heartbeats.name chi runner|worker", async () => {
    await expect(sql(`insert into process_heartbeats (name, pid, host, started_at, beat_at) values ('khac', 1, 'h', now(), now())`)).rejects.toThrow();
    const thread = `mig010-${randomUUID().slice(0, 8)}`;
    await expect(
      sql(
        `insert into turn_traces (zalo_account_id, thread_id, thread_type, kind, outcome, lane) values ('community', $1, 'group', 'group_mention', 'replied', 'turbo')`,
        [thread]
      )
    ).rejects.toThrow();
  });

  it('view reply_latency: core_ms = e2e_ms − hold_ms; hold_ms = 0 khi khong co hold_reason; hang lane khac bi bo qua', async () => {
    const thread = `mig010-${randomUUID().slice(0, 8)}`;
    const ev = await sql<{ id: string }>(
      `insert into inbound_events (zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload, received_at)
       values ('community', $1, $2, 'group', 'u', false, '{}'::jsonb, '2026-10-17 10:00:00+00') returning id::text`,
      [`mig-${thread}`, thread]
    );
    const eid = ev[0]!.id;
    // tin tra loi bi pacer GIU 7.8 s vi gap nhom (hold_reason) ⇒ core = e2e − hold
    await sql(
      `insert into turn_traces (zalo_account_id, thread_id, thread_type, kind, outcome, lane, inbound_event_id, received_at, model_ms)
       values ('community', $1, 'group', 'group_mention', 'replied', 'fast', $2, '2026-10-17 10:00:00+00', 1000)`,
      [thread, eid]
    );
    const o1 = await enqueue({ zaloAccountId: 'community', threadId: thread, threadType: 'group', kind: 'text', body: { text: 'x' }, inboundEventId: Number(eid) });
    await sql(
      `update outbox set status = 'sent', created_at = '2026-10-17 10:00:01.2+00', picked_at = '2026-10-17 10:00:09+00',
              sent_at = '2026-10-17 10:00:09.5+00', hold_reason = 'group_gap' where id = $1`,
      [o1]
    );
    const v = await sql<{ runtime_ms: number; e2e_ms: number; hold_ms: number; core_ms: number; send_ms: number }>(
      `select runtime_ms, e2e_ms, hold_ms, core_ms, send_ms from reply_latency where thread_id = $1`,
      [thread]
    );
    expect(v).toEqual([{ runtime_ms: 1200, e2e_ms: 9500, hold_ms: 7800, core_ms: 1700, send_ms: 500 }]);

    // khong co hold_reason ⇒ hold_ms = 0, core = e2e
    const thread2 = `mig010-${randomUUID().slice(0, 8)}`;
    const ev2 = await sql<{ id: string }>(
      `insert into inbound_events (zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload, received_at)
       values ('community', $1, $2, 'group', 'u', false, '{}'::jsonb, '2026-10-17 10:00:00+00') returning id::text`,
      [`mig-${thread2}`, thread2]
    );
    await sql(
      `insert into turn_traces (zalo_account_id, thread_id, thread_type, kind, outcome, lane, inbound_event_id, received_at)
       values ('community', $1, 'group', 'group_mention', 'replied', 'rag', $2, '2026-10-17 10:00:00+00')`,
      [thread2, ev2[0]!.id]
    );
    const o2 = await enqueue({ zaloAccountId: 'community', threadId: thread2, threadType: 'group', kind: 'text', body: { text: 'x' }, inboundEventId: Number(ev2[0]!.id) });
    await sql(
      `update outbox set status = 'sent', created_at = '2026-10-17 10:00:03+00', picked_at = '2026-10-17 10:00:03.3+00',
              sent_at = '2026-10-17 10:00:03.9+00' where id = $1`,
      [o2]
    );
    const v2 = await sql<{ e2e_ms: number; hold_ms: number; core_ms: number }>(`select e2e_ms, hold_ms, core_ms from reply_latency where thread_id = $1`, [thread2]);
    expect(v2).toEqual([{ e2e_ms: 3900, hold_ms: 0, core_ms: 3900 }]);

    // luot nen (lane background) khong vao view
    const thread3 = `mig010-${randomUUID().slice(0, 8)}`;
    await sql(
      `insert into turn_traces (zalo_account_id, thread_id, thread_type, kind, outcome, lane, inbound_event_id, received_at)
       values ('community', $1, 'group', 'group_ambient_flush', 'silent', 'background', 1, now())`,
      [thread3]
    );
    expect(await sql(`select 1 from reply_latency where thread_id = $1`, [thread3])).toHaveLength(0);
  });
});

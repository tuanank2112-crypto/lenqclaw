// p05-approval-event.db.test.ts — F4 (SPEC-P05 §5.5, §11): duong WORKER bao ket qua the duyet. `completeApproval` thang CAS
// `approved → executed|failed` ⇒ DUNG MOT su kien he thong `approval_executed` (cung dinh dang `enqueueSystemEvent` cua core);
// goi lai (thua CAS) ⇒ khong them. Can DB da migrate (`npm run test:db` o root). Chi don dong do chinh test tao (G34).

import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@lenqclaw/core';
import { completeApproval } from '../store.js';
import { uid } from './group-helpers.js';

const threads: string[] = [];

async function mkApproved(status: 'approved' | 'pending' = 'approved'): Promise<{ id: string; thread: string }> {
  const thread = uid('g-f4');
  threads.push(thread);
  const r = await sql<{ id: string }>(
    `insert into approvals (zalo_account_id, kind, thread_id, target_uid, reason, requested_by, status, expires_at)
     values ('community', 'kick_member', $1, $2, 'thu', 'agent', $3, now() + interval '1 day') returning id::text as id`,
    [thread, uid('u-f4'), status]
  );
  return { id: r[0]!.id, thread };
}

const sysEvents = (thread: string) =>
  sql<{ payload: { kind: string; event: string; data: { approvalId: string; threadId: string } }; thread_type: string; sender_uid: string }>(
    `select payload, thread_type, sender_uid from inbound_events where thread_id = $1 and payload->>'event' = 'approval_executed'`,
    [thread]
  );

afterAll(async () => {
  if (threads.length > 0) {
    await sql(`update inbound_events set processed_at = now() where processed_at is null and thread_id = any($1::text[])`, [threads]);
    await sql(`delete from outbox where body->>'approvalId' in (select id::text from approvals where thread_id = any($1::text[]))`, [threads]);
    await sql(`delete from approvals where thread_id = any($1::text[])`, [threads]);
  }
  await closeDb();
});

describe('F4 — worker completeApproval sinh approval_executed', () => {
  it('thang CAS ⇒ true + dung 1 su kien (dinh dang enqueueSystemEvent); goi lai ⇒ false, khong them', async () => {
    const { id, thread } = await mkApproved();
    expect(await completeApproval(id, true, { ok: 1 })).toBe(true);
    const ev = await sysEvents(thread);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ sender_uid: 'system', thread_type: 'group', payload: { kind: 'system', event: 'approval_executed', data: { approvalId: id, threadId: thread } } });
    expect(await completeApproval(id, true, { ok: 1 })).toBe(false);
    expect(await completeApproval(id, false, { err: 1 })).toBe(false);
    expect(await sysEvents(thread)).toHaveLength(1);
    const st = await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [id]);
    expect(st[0]!.status).toBe('executed');
  });
  it('that bai (ok=false) ⇒ failed + 1 su kien', async () => {
    const { id, thread } = await mkApproved();
    expect(await completeApproval(id, false, { error: { name: 'X' } })).toBe(true);
    expect(await sysEvents(thread)).toHaveLength(1);
    expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [id]))[0]!.status).toBe('failed');
  });
  it('the khong o trang thai approved (pending) ⇒ false, 0 su kien', async () => {
    const { id, thread } = await mkApproved('pending');
    expect(await completeApproval(id, true, {})).toBe(false);
    expect(await sysEvents(thread)).toHaveLength(0);
  });
  it('hai worker cung luc (song song) ⇒ dung 1 su kien', async () => {
    const { id, thread } = await mkApproved();
    const rs = await Promise.all([completeApproval(id, true, {}), completeApproval(id, true, {})]);
    expect(rs.filter(Boolean)).toHaveLength(1);
    expect(await sysEvents(thread)).toHaveLength(1);
  });
});

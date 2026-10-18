// p05-fix-f11.db.test.ts — F11 (SPEC-P05 §4.1, §11): loi SAU khi da xep `delete_message` (vd `createApproval` nem) van `stop='deleted'`
// ⇒ tin spam kem @bot KHONG duoc tra loi. File rieng vi `vi.mock` ap len ca file. Chi don dong do chinh test tao (G34).

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const flag = vi.hoisted(() => ({ failCreate: false }));
vi.mock('../services/approvals.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/approvals.js')>();
  return {
    ...real,
    createApproval: (...a: Parameters<typeof real.createApproval>) => (flag.failCreate ? Promise.reject(new Error('createApproval boom')) : real.createApproval(...a)),
  };
});

import { closeDb, sql } from '../adapters/db.js';
import { setTriageFetchForTest } from '../adapters/model.js';
import { invalidatePersonaCache } from '../agent/community/persona.js';
import { SCAM_PHRASES } from '../services/moderation-grid.js';
import {
  ACCOUNT,
  agentRunsForThread,
  auditCount,
  drainStale,
  installFakeModel,
  mkGroup,
  outboxFor,
  pinBotUidForTest,
  runAll,
  send,
  tracesFor,
  uninstallFakeModel,
  uniq,
} from './p03-helpers.js';

const made: string[] = [];
let restoreBotUid: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  restoreBotUid = await pinBotUidForTest();
  installFakeModel();
  await drainStale();
});

afterAll(async () => {
  flag.failCreate = false;
  uninstallFakeModel();
  setTriageFetchForTest(null);
  invalidatePersonaCache();
  if (made.length > 0) {
    await sql(`update outbox set status = 'cancelled' where thread_id = any($1::text[]) and status in ('queued','sending')`, [made]);
    await sql(`delete from moderation_events where thread_id = any($1::text[])`, [made]);
    await sql(`delete from moderation_scores where thread_id = any($1::text[])`, [made]);
    await sql(`delete from approvals where thread_id = any($1::text[])`, [made]);
    await sql(`delete from group_messages where thread_id = any($1::text[])`, [made]);
    await sql(`delete from group_members where thread_id = any($1::text[])`, [made]);
    await sql(`delete from zalo_groups where thread_id = any($1::text[])`, [made]);
  }
  await sql(`update inbound_events set processed_at = now() where processed_at is null and thread_id = any($1::text[])`, [made]);
  await restoreBotUid();
  await closeDb();
});

describe('F11 — loi sau khi da xep delete_message van stop=deleted', () => {
  it('diem 2.5 + scam kem @bot ⇒ block_requested; createApproval nem ⇒ 1 delete_message, audit moderation.error, 0 agent_runs, 0 tin text', async () => {
    const g = await mkGroup({ moderation: true });
    made.push(g);
    await sql(`update zalo_groups set bot_is_admin = true where zalo_account_id = $2 and thread_id = $1`, [g, ACCOUNT]);
    const sender = uniq('sim-f11');
    await sql(`insert into moderation_scores (zalo_account_id, thread_id, zalo_uid, score, strikes, updated_at) values ($1,$2,$3,2.5,3,now())`, [ACCOUNT, g, sender]);
    flag.failCreate = true;
    try {
      const s = await send({ threadId: g, senderUid: sender, text: `Chào cả nhà, ${SCAM_PHRASES[13]} nhé`, mentionBot: true });
      await runAll();
      const acts = await sql<{ body: Record<string, unknown> }>(`select body from outbox where thread_id = $1 and kind = 'action'`, [g]);
      expect(acts).toHaveLength(1);
      expect(acts[0]!.body).toMatchObject({ action: 'delete_message', msgId: s.msgId, uidFrom: sender });
      expect(await auditCount('moderation.error', g)).toBe(1);
      expect(await agentRunsForThread(g)).toBe(0);
      expect(await tracesFor(g)).toHaveLength(0);
      expect(await outboxFor(g)).toHaveLength(0);
    } finally {
      flag.failCreate = false;
    }
  });
});

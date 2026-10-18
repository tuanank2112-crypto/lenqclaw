// p05-fix.db.test.ts — vong sua P05 sau tham dinh R13 (H14, SPEC-P05 §11): M2, F1, F3, F5, F6, F7, F8 tren DB that, qua pipeline
// (`routeInboundEvent`) voi triage/model GIA (0 mang). Moi test tao nhom/uid rieng; chi don dong do chinh test tao (G34).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { setTriageFetchForTest } from '../adapters/model.js';
import { getGroup } from '../agent/community/buffer.js';
import { invalidatePersonaCache } from '../agent/community/persona.js';
import { WARN_GROUP_TEXT } from '../agent/community/prompts/system.js';
import { decideApprovalTool } from '../agent/community/tools/approval-tools.js';
import { ApprovalRequiredError, IntentNotConfirmedError } from '../domain/errors.js';
import type { GroupMessageRow, ToolContext } from '../domain/types.js';
import { createApproval, decideApproval, idShortOf } from '../services/approvals.js';
import { SCAM_PHRASES } from '../services/moderation-grid.js';
import { moderateGroupMessage } from '../services/moderation.js';
import { enqueueAction } from '../services/outbox-actions.js';
import { findBufferedMessage } from '../agent/community/buffer.js';
import {
  ACCOUNT,
  agentRunsForThread,
  auditCount,
  count,
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

/** Triage gia: `OKMARK` ⇒ ok 0.9; `SPAMMARK` ⇒ spam 0.8; cum scam ⇒ scam 0.9; `TRIAGEDOWN` ⇒ HTTP 500 (⇒ triage null); con lai ok. */
const triageFetch: typeof fetch = async (_url, init) => {
  const raw = String(init?.body ?? '');
  if (raw.includes('TRIAGEDOWN')) return new Response('down', { status: 500 });
  const spam = raw.includes('SPAMMARK');
  const scam = !spam && !raw.includes('OKMARK') && SCAM_PHRASES.some((p) => raw.includes(p));
  const payload = {
    verdict: spam ? 'spam' : scam ? 'scam' : 'ok',
    confidence: spam ? 0.8 : 0.9,
    is_question: false,
    question_confidence: 0.1,
    lead_intent: false,
    lead_confidence: 0.1,
    wants_private: false,
  };
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};

async function mk(over: Parameters<typeof mkGroup>[0] & { botAdmin?: boolean; policy?: 'manual' | 'auto_approve' | 'agent_review' } = {}): Promise<string> {
  const { botAdmin = true, policy = 'manual', ...rest } = over;
  const g = await mkGroup({ moderation: true, ...rest });
  made.push(g);
  await sql(`update zalo_groups set bot_is_admin = $2, join_policy = $4 where zalo_account_id = $3 and thread_id = $1`, [g, botAdmin, ACCOUNT, policy]);
  return g;
}

beforeAll(async () => {
  restoreBotUid = await pinBotUidForTest();
  installFakeModel();
  setTriageFetchForTest(triageFetch);
  await drainStale();
});

afterAll(async () => {
  uninstallFakeModel();
  invalidatePersonaCache();
  if (made.length > 0) {
    await sql(`update outbox set status = 'cancelled' where thread_id = any($1::text[]) and status in ('queued','sending')`, [made]);
    await sql(`delete from moderation_events where thread_id = any($1::text[])`, [made]);
    await sql(`delete from moderation_scores where thread_id = any($1::text[])`, [made]);
    await sql(`delete from approvals where thread_id = any($1::text[])`, [made]);
    await sql(`delete from group_messages where thread_id = any($1::text[])`, [made]);
    await sql(`delete from group_members where thread_id = any($1::text[])`, [made]);
    await sql(`delete from group_sessions where thread_id = any($1::text[])`, [made]);
    await sql(`delete from zalo_groups where thread_id = any($1::text[])`, [made]);
  }
  await sql(`update inbound_events set processed_at = now() where processed_at is null and thread_id = any($1::text[])`, [made]);
  await restoreBotUid();
  await closeDb();
});

const eventsOf = (g: string, uid?: string) =>
  sql<{ verdict: string; source: string; action: string; grid_hits: string[] }>(
    `select verdict, source, action, grid_hits from moderation_events where thread_id = $1 ${uid ? 'and zalo_uid = $2' : ''} order by id`,
    uid ? [g, uid] : [g]
  );
const actionsOf = (g: string) =>
  sql<{ id: number; body: Record<string, unknown> }>(`select id::int as id, body from outbox where thread_id = $1 and kind = 'action' order by id`, [g]);
const scamText = (i = 0, tag = ''): string => `Chào cả nhà, ${SCAM_PHRASES[i]} nhé mọi người ${tag}`.trim();

describe('M2 — applyModeration (duong PIPELINE) khong xoa tin > 24 gio', () => {
  it('tin scam received_at 25 gio truoc ⇒ 0 delete_message, audit moderation.cannot_delete {reason:too_old}, ha ve warn', async () => {
    const g = await mk();
    const sender = uniq('sim-m2');
    // worker offline lau roi chay bu `inbound_events`: tin da nam trong dem tu 25 gio truoc (ingest `on conflict do nothing` giu received_at cu)
    const msgId = `m2-${randomUUID()}`;
    await sql(
      `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, cli_msg_id, sender_uid, msg_type, text, received_at)
       values ($1,$2,$3,$4,$5,'webchat',$6, now() - interval '25 hours')`,
      [ACCOUNT, g, msgId, `cli-${randomUUID()}`, sender, scamText(8)]
    );
    const s = await send({ threadId: g, senderUid: sender, text: scamText(8), msgId });
    await runAll();
    expect(await actionsOf(g)).toHaveLength(0);
    const au = await sql<{ data: { reason?: string } }>(`select data from audit_log where action = 'moderation.cannot_delete' and target = $1`, [g]);
    expect(au).toHaveLength(1);
    expect(au[0]!.data.reason).toBe('too_old');
    expect((await eventsOf(g, sender))[0]).toMatchObject({ verdict: 'scam', action: 'warn' });
    const row = await sql<{ deleted_at: string | null }>(`select deleted_at::text from group_messages where zalo_msg_id = $1`, [s.msgId]);
    expect(row[0]!.deleted_at).toBeNull();
  });
});

describe('F1 — decide_approval khong duyet khi nguoi quyet do du / phu dinh', () => {
  const ctxOf = (g: string, text: string) =>
    ({
      kind: 'group_mention',
      account: ACCOUNT,
      threadId: g,
      requester: { uid: 'sim-owner', role: 'owner', displayName: null },
      group: {},
      focusMessages: [{ senderUid: 'sim-owner', text }],
      inboundEventId: 0,
    }) as unknown as ToolContext;

  for (const phrase of ['đừng duyệt', 'chưa duyệt', 'khoan duyệt']) {
    it(`"${phrase} <ma>" ⇒ IntentNotConfirmedError (ca approve va reject), the van pending, 0 outbox`, async () => {
      const g = await mk();
      const victim = uniq('sim-f1');
      await sql(`insert into group_members (zalo_account_id, thread_id, zalo_uid, role, display_name) values ($1,$2,$3,'member','V') on conflict do nothing`, [ACCOUNT, g, victim]);
      const id = (await createApproval({ account: ACCOUNT, kind: 'kick_member', threadId: g, targetUid: victim, reason: 'thử', requestedBy: 'agent', now: new Date() })).id;
      const short = idShortOf(id);
      for (const decision of ['approve', 'reject'] as const) {
        await expect(decideApprovalTool.run(ctxOf(g, `${phrase} ${short}`), { approval_id: short, decision })).rejects.toBeInstanceOf(IntentNotConfirmedError);
      }
      expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [id]))[0]!.status).toBe('pending');
      expect(await actionsOf(g)).toHaveLength(0);
      expect(await count(`select 1 from outbox where thread_id = $1 and kind = 'action'`, [g])).toBe(0);
    });
  }
});

describe('F3 / F6 — tin bi kiem duyet xu ly thi KHONG chay luot, ke ca khi kem @bot', () => {
  it('F3: bot KHONG la phu nhom + scam kem @bot ⇒ dung 1 tin ra (canh cao), 0 agent_runs, 0 trace', async () => {
    const g = await mk({ botAdmin: false });
    const sender = uniq('sim-f3');
    await send({ threadId: g, senderUid: sender, text: scamText(9), mentionBot: true });
    await runAll();
    expect((await outboxFor(g)).map((t) => t.body.text)).toEqual([WARN_GROUP_TEXT('scam')]);
    expect(await actionsOf(g)).toHaveLength(0);
    expect(await agentRunsForThread(g)).toBe(0);
    expect(await tracesFor(g)).toHaveLength(0);
    expect((await eventsOf(g, sender))[0]).toMatchObject({ verdict: 'scam', source: 'grid', action: 'warn' });
  });

  it('F6: bot la phu nhom + scam kem @bot ⇒ chi 1 delete_message, 0 tin text, 0 agent_runs, 0 trace', async () => {
    const g = await mk({ botAdmin: true });
    const sender = uniq('sim-f6');
    const s = await send({ threadId: g, senderUid: sender, text: scamText(10), mentionBot: true });
    await runAll();
    const acts = await actionsOf(g);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.body).toMatchObject({ action: 'delete_message', msgId: s.msgId, uidFrom: sender });
    expect(await outboxFor(g)).toHaveLength(0);
    expect(await agentRunsForThread(g)).toBe(0);
    expect(await tracesFor(g)).toHaveLength(0);
  });
});

describe('F5 — model `ok` bac luoi hard; triage null thi luoi van xoa', () => {
  it('scam_phrase + triage ok (OKMARK) ⇒ 0 outbox, 0 event, audit moderation.grid_overruled {hit:scam_phrase}', async () => {
    const g = await mk();
    const sender = uniq('sim-f5a');
    const s = await send({ threadId: g, senderUid: sender, text: scamText(11, 'OKMARK') });
    await runAll();
    expect(await count(`select 1 from outbox where thread_id = $1`, [g])).toBe(0);
    expect(await eventsOf(g)).toHaveLength(0);
    const au = await sql<{ data: { hit?: string } }>(`select data from audit_log where action = 'moderation.grid_overruled' and target = $1`, [g]);
    expect(au).toHaveLength(1);
    expect(au[0]!.data.hit).toBe('scam_phrase');
    const row = await sql<{ deleted_at: string | null }>(`select deleted_at::text from group_messages where zalo_msg_id = $1`, [s.msgId]);
    expect(row[0]!.deleted_at).toBeNull();
  });

  it('triage null (triage sap, TRIAGEDOWN) ⇒ luoi van xoa: event scam/grid, 1 delete_message', async () => {
    const g = await mk();
    const sender = uniq('sim-f5b');
    await send({ threadId: g, senderUid: sender, text: scamText(12, 'TRIAGEDOWN') });
    await runAll();
    expect((await eventsOf(g, sender))[0]).toMatchObject({ verdict: 'scam', source: 'grid', action: 'delete' });
    expect((await actionsOf(g)).map((a) => a.body.action)).toEqual(['delete_message']);
    expect(await auditCount('moderation.grid_overruled', g)).toBe(0);
  });
});

describe('F7 — review_join approve:false chi khi co the duyet hop le hoac nhom agent_review', () => {
  const card = async (g: string, kind: 'reject_join' | 'approve_join', uid: string) =>
    (await createApproval({ account: ACCOUNT, kind, threadId: g, targetUid: uid, reason: 'thử', requestedBy: 'moderation', now: new Date() })).id;
  const staff = 'staff:44444444-4444-4444-8444-444444444444';

  it('thieu approvalId / the pending / sai uid / the khac nhom ⇒ ApprovalRequiredError, 0 outbox', async () => {
    const g = await mk({ policy: 'manual' });
    const other = await mk({ policy: 'manual' });
    const u = uniq('sim-f7');
    await expect(enqueueAction({ threadId: g, action: 'review_join', uids: [u], approve: false })).rejects.toBeInstanceOf(ApprovalRequiredError);
    const pend = await card(g, 'reject_join', u);
    await expect(enqueueAction({ threadId: g, action: 'review_join', uids: [u], approve: false, approvalId: pend })).rejects.toBeInstanceOf(ApprovalRequiredError);
    await expect(enqueueAction({ threadId: g, action: 'review_join', uids: [u], approve: false, approvalId: randomUUID() })).rejects.toBeInstanceOf(ApprovalRequiredError);
    await decideApproval({ id: pend, decision: 'approve', decidedBy: staff, now: new Date() }).catch(() => undefined);
    // da approved: sai uid hoac sai nhom van bi chan
    await expect(enqueueAction({ threadId: g, action: 'review_join', uids: ['nguoi-khac'], approve: false, approvalId: pend })).rejects.toBeInstanceOf(ApprovalRequiredError);
    await expect(enqueueAction({ threadId: other, action: 'review_join', uids: [u], approve: false, approvalId: pend })).rejects.toBeInstanceOf(ApprovalRequiredError);
    // the approve_join dang pending khong du
    const ap = await card(g, 'approve_join', uniq('sim-f7b'));
    await expect(enqueueAction({ threadId: g, action: 'review_join', uids: [u], approve: false, approvalId: ap })).rejects.toBeInstanceOf(ApprovalRequiredError);
    expect(await actionsOf(other)).toHaveLength(0);
  });

  it('the reject_join approved (qua decideApproval) ⇒ outbox review_join approve:false co approvalId', async () => {
    const g = await mk({ policy: 'manual' });
    const u = uniq('sim-f7c');
    const id = await card(g, 'reject_join', u);
    const r = await decideApproval({ id, decision: 'approve', decidedBy: staff, now: new Date() });
    expect(r.outboxId).not.toBeNull();
    expect((await actionsOf(g))[0]!.body).toMatchObject({ action: 'review_join', uids: [u], approve: false, approvalId: id });
  });

  it('the approve_join bi TU CHOI ⇒ decideApproval reject xep review_join approve:false (co approvalId cua the)', async () => {
    const g = await mk({ policy: 'manual' });
    const u = uniq('sim-f7d');
    const id = await card(g, 'approve_join', u);
    const r = await decideApproval({ id, decision: 'reject', decidedBy: staff, now: new Date() });
    expect(r.outboxId).not.toBeNull();
    expect((await actionsOf(g))[0]!.body).toMatchObject({ action: 'review_join', uids: [u], approve: false, approvalId: id });
    // the approve_join rejected + dung uid: enqueue lai van hop le; sai uid thi khong
    await expect(enqueueAction({ threadId: g, action: 'review_join', uids: ['khac'], approve: false, approvalId: id })).rejects.toBeInstanceOf(ApprovalRequiredError);
  });

  it('nhom agent_review ⇒ khong can approvalId; nhom manual/auto_approve thi can; approve:true luon tu do', async () => {
    const ag = await mk({ policy: 'agent_review' });
    const u = uniq('sim-f7e');
    await expect(enqueueAction({ threadId: ag, action: 'review_join', uids: [u], approve: false })).resolves.toBeGreaterThan(0);
    const au = await mk({ policy: 'auto_approve' });
    await expect(enqueueAction({ threadId: au, action: 'review_join', uids: [u], approve: false })).rejects.toBeInstanceOf(ApprovalRequiredError);
    await expect(enqueueAction({ threadId: au, action: 'review_join', uids: [u], approve: true })).resolves.toBeGreaterThan(0);
  });
});

describe('F8 — repeat_burst khong tinh tin dang xet (tin giong het thu 5 khong hit, thu 6 hit)', () => {
  async function insertMsgs(g: string, sender: string, n: number, text: string): Promise<void> {
    for (let i = 0; i < n; i++) {
      await sql(
        `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, cli_msg_id, sender_uid, msg_type, text, received_at)
         values ($1,$2,$3,$4,$5,'webchat',$6, now() - make_interval(secs => $7))`,
        [ACCOUNT, g, `f8-${randomUUID()}`, `cli-${randomUUID()}`, sender, text, 60 - i]
      );
    }
  }
  async function verdictOfLast(g: string, sender: string, prior: number): Promise<{ verdict: string; hits: string[] }> {
    const text = 'Mua ngay giá sốc hôm nay';
    await insertMsgs(g, sender, prior, text);
    const cur = await sql<{ id: number }>(
      `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, cli_msg_id, sender_uid, msg_type, text, received_at)
       values ($1,$2,$3,$4,$5,'webchat',$6, now()) returning id::int as id`,
      [ACCOUNT, g, `f8-cur-${randomUUID()}`, `cli-${randomUUID()}`, sender, text]
    );
    const row = (await findBufferedMessage(ACCOUNT, g, cur[0]!.id)) as GroupMessageRow;
    const group = (await getGroup(ACCOUNT, g))!;
    const out = await moderateGroupMessage(row, null, { account: ACCOUNT, group, sender: { uid: sender, role: 'member' }, now: new Date() });
    const ev = await eventsOf(g, sender);
    return { verdict: out.verdict, hits: ev.flatMap((e) => e.grid_hits) };
  }

  it('4 tin truoc + tin dang xet (thu 5) ⇒ KHONG hit', async () => {
    const g = await mk();
    const r = await verdictOfLast(g, uniq('sim-f8a'), 4);
    expect(r).toEqual({ verdict: 'ok', hits: [] });
  });
  it('5 tin truoc + tin dang xet (thu 6) ⇒ hit repeat_burst (spam, luoi)', async () => {
    const g = await mk();
    const r = await verdictOfLast(g, uniq('sim-f8b'), 5);
    expect(r.verdict).toBe('spam');
    expect(r.hits).toContain('repeat_burst');
  });
});

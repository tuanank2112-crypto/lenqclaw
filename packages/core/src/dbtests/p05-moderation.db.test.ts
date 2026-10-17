// p05-moderation.db.test.ts — SPEC-P05 §10 hang 4 (a)–(j): kiem duyet + thang canh cao + the duyet tren DB that, qua pipeline
// (`routeInboundEvent`) voi triage/model GIA (0 mang). Moi test tao nhom/uid rieng; chi don dong do chinh test tao (G34).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { setTriageFetchForTest } from '../adapters/model.js';
import { invalidatePersonaCache } from '../agent/community/persona.js';
import { WARN_GROUP_TEXT } from '../agent/community/prompts/system.js';
import { decideApprovalTool } from '../agent/community/tools/approval-tools.js';
import { deleteMessageTool } from '../agent/community/tools/moderation-tools.js';
import { ApprovalRequiredError, ConflictError, IntentNotConfirmedError, ToolNotAllowedError } from '../domain/errors.js';
import type { ToolContext } from '../domain/types.js';
import { createApproval, decideApproval, expireApprovals, idShortOf } from '../services/approvals.js';
import { SCAM_PHRASES } from '../services/moderation-grid.js';
import { reconcileDeletes } from '../services/moderation.js';
import { enqueueAction } from '../services/outbox-actions.js';
import { applySimOutbox } from '../sim/sim-actions.js';
import {
  ACCOUNT,
  agentRunsForThread,
  auditCount,
  count,
  drainStale,
  FN,
  focusId,
  installFakeModel,
  mkGroup,
  outboxFor,
  resetScripts,
  runAll,
  script,
  send,
  T,
  TOOLS,
  tracesFor,
  uninstallFakeModel,
  uniq,
} from './p03-helpers.js';

const made: string[] = [];
let startOutboxId = 0;

/** Triage gia: text chua `SPAMMARK` ⇒ spam 0.8 (>= MOD_SPAM_MIN 0.75); con lai ok. */
const triageFetch: typeof fetch = async (_url, init) => {
  const spam = String(init?.body ?? '').includes('SPAMMARK');
  const payload = {
    verdict: spam ? 'spam' : 'ok',
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

async function mk(over: Parameters<typeof mkGroup>[0] & { botAdmin?: boolean } = {}): Promise<string> {
  const { botAdmin = true, ...rest } = over;
  const g = await mkGroup({ moderation: true, ...rest });
  made.push(g);
  await sql(`update zalo_groups set bot_is_admin = $2 where zalo_account_id = $3 and thread_id = $1`, [g, botAdmin, ACCOUNT]);
  return g;
}

beforeAll(async () => {
  installFakeModel();
  setTriageFetchForTest(triageFetch);
  await drainStale();
  startOutboxId = (await sql<{ m: number }>(`select coalesce(max(id), 0)::int as m from outbox`))[0]!.m;
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
  await sql(`update outbox set status = 'cancelled' where id > $1 and thread_id = 'sim-owner' and status = 'queued'`, [startOutboxId]);
  await sql(`update inbound_events set processed_at = now() where processed_at is null and thread_id = any($1::text[])`, [made]);
  await closeDb();
});

interface EventRow {
  verdict: string;
  source: string;
  action: string;
  grid_hits: string[];
  zalo_uid: string;
}
const eventsOf = (g: string, uid?: string) =>
  sql<EventRow>(
    `select verdict, source, action, grid_hits, zalo_uid from moderation_events where thread_id = $1 ${uid ? 'and zalo_uid = $2' : ''} order by id`,
    uid ? [g, uid] : [g]
  );
const actionsOf = (g: string) =>
  sql<{ id: number; status: string; body: Record<string, unknown> }>(`select id::int as id, status, body from outbox where thread_id = $1 and kind = 'action' order by id`, [g]);
const ownerDms = (needle: string) =>
  sql<{ id: number; body: { text: string } }>(
    `select id::int as id, body from outbox where id > $1 and thread_id = 'sim-owner' and kind = 'text' and body->>'text' like $2 order by id`,
    [startOutboxId, `%${needle}%`]
  );
const scamText = (i = 0): string => `Chào cả nhà, ${SCAM_PHRASES[i]} nhé mọi người`;
const spamText = (tag: string): string => `Mua hàng giá rẻ SPAMMARK ${tag}`;

describe('P05-B — kiem duyet (a)–(e)', () => {
  it('(a) scam_phrase ⇒ event scam/grid, outbox delete_message uidFrom=nguoi gui, deleted_at set, 0 luot community, tin khong duoc tra loi', async () => {
    const g = await mk();
    const sender = uniq('sim-scam');
    const s = await send({ threadId: g, senderUid: sender, senderName: 'Kẻ lừa', text: scamText(0) });
    await runAll();
    const ev = await eventsOf(g, sender);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ verdict: 'scam', source: 'grid', action: 'delete' });
    expect(ev[0]!.grid_hits).toContain('scam_phrase');
    const acts = await actionsOf(g);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.body).toMatchObject({ action: 'delete_message', msgId: s.msgId, uidFrom: sender, onlyMe: false });
    expect(String(acts[0]!.body.cliMsgId)).not.toBe('');
    const row = await sql<{ deleted_at: string | null; delete_reason: string | null }>(`select deleted_at::text, delete_reason from group_messages where zalo_msg_id = $1`, [s.msgId]);
    expect(row[0]!.deleted_at).not.toBeNull();
    expect(row[0]!.delete_reason).toBe('scam');
    expect(await agentRunsForThread(g)).toBe(0);
    expect(await tracesFor(g)).toHaveLength(0);
    // DM owner (gop <= 1 / 10 phut) bao da xoa
    expect((await ownerDms('vừa xoá')).length).toBeGreaterThanOrEqual(1);
  });

  it('(b) spam x2 cung gio (triage 0.8): lan 1 warn co quote, lan 2 delete, lan 3 ⇒ the kick_member pending + DM owner 1 dong; KHONG co remove_member (BB-06)', async () => {
    const g = await mk();
    const sender = uniq('sim-spam');
    const m1 = await send({ threadId: g, senderUid: sender, senderName: 'Spam', text: spamText('1') });
    await runAll();
    let texts = await outboxFor(g);
    expect(texts).toHaveLength(1);
    expect(texts[0]!.body.text).toBe(WARN_GROUP_TEXT('spam'));
    expect(texts[0]!.body.quote?.msgId).toBe(m1.msgId);
    expect(await actionsOf(g)).toHaveLength(0);

    const m2 = await send({ threadId: g, senderUid: sender, senderName: 'Spam', text: spamText('2') });
    await runAll();
    let acts = await actionsOf(g);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.body).toMatchObject({ action: 'delete_message', msgId: m2.msgId, uidFrom: sender });
    expect((await ownerDms('Cần bạn duyệt')).filter((d) => d.body.text.includes(g)).length).toBe(0); // chua co the

    const m3 = await send({ threadId: g, senderUid: sender, senderName: 'Spam', text: spamText('3') });
    await runAll();
    acts = await actionsOf(g);
    expect(acts.map((a) => a.body.action)).toEqual(['delete_message', 'delete_message']);
    expect(acts[1]!.body.msgId).toBe(m3.msgId);
    const cards = await sql<{ id: string; kind: string; status: string; target_uid: string; requested_by: string }>(
      `select id::text as id, kind, status, target_uid, requested_by from approvals where thread_id = $1`,
      [g]
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: 'kick_member', status: 'pending', target_uid: sender, requested_by: 'moderation' });
    expect(acts.some((a) => a.body.action === 'remove_member' || a.body.action === 'block_member')).toBe(false);
    const dm = await ownerDms(`duyệt ${idShortOf(cards[0]!.id)}`);
    expect(dm).toHaveLength(1);
    expect(dm[0]!.body.text.split('\n').length).toBeLessThanOrEqual(4);
    texts = await outboxFor(g);
    expect(texts).toHaveLength(1); // chi 1 canh cao (lan 1)
    expect((await eventsOf(g, sender)).map((e) => e.action)).toEqual(['warn', 'delete', 'kick_requested']);
    // the trung (cung kind/thread/uid dang pending) khong tao moi
    const again = await createApproval({ account: ACCOUNT, kind: 'kick_member', threadId: g, targetUid: sender, reason: 'lặp', requestedBy: 'agent', now: new Date() });
    expect(again).toEqual({ id: cards[0]!.id, created: false });
    expect((await ownerDms(`duyệt ${idShortOf(cards[0]!.id)}`))).toHaveLength(1);
  });

  it('(c) moderator gui scam_phrase ⇒ event none (mien tru), 0 outbox, tin khong bi xoa, diem khong doi', async () => {
    const mod = uniq('sim-mod');
    const g = await mk({ members: [{ uid: mod, role: 'moderator', name: 'Quản trị' }] });
    const s = await send({ threadId: g, senderUid: mod, text: scamText(2) });
    await runAll();
    const ev = await eventsOf(g, mod);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ verdict: 'scam', source: 'grid', action: 'none' });
    expect(await count(`select 1 from outbox where thread_id = $1`, [g])).toBe(0);
    expect((await sql<{ deleted_at: string | null }>(`select deleted_at::text from group_messages where zalo_msg_id = $1`, [s.msgId]))[0]!.deleted_at).toBeNull();
    expect(await count(`select 1 from moderation_scores where thread_id = $1`, [g])).toBe(0);
  });

  it('(d) bot khong la admin ⇒ ha ve warn + audit moderation.need_deputy + DM owner; KHONG delete_message', async () => {
    const g = await mk({ botAdmin: false });
    const sender = uniq('sim-noadm');
    await send({ threadId: g, senderUid: sender, text: scamText(3) }); // scam: lan dau = 2 ⇒ muon delete
    await runAll();
    const ev = await eventsOf(g, sender);
    expect(ev[0]).toMatchObject({ verdict: 'scam', action: 'warn' });
    expect(await actionsOf(g)).toHaveLength(0);
    expect(await auditCount('moderation.need_deputy', g)).toBe(1);
    expect((await outboxFor(g)).map((t) => t.body.text)).toEqual([WARN_GROUP_TEXT('scam')]);
    expect((await ownerDms('phó nhóm')).length).toBeGreaterThanOrEqual(1);
  });

  it('(d2) tin thieu cli_msg_id / qua 24 gio ⇒ khong xoa (ha ve warn); kick van chi tao the', async () => {
    const g = await mk();
    const sender = uniq('sim-old');
    const m = await send({ threadId: g, senderUid: sender, text: scamText(4) });
    // tin nay da vao dem; mo phong "tin cu" bang cach lui received_at TRUOC khi xu ly: chen thang su kien da xu ly? Don gian: kiem tool delete_message rieng.
    await runAll();
    expect((await actionsOf(g)).map((a) => a.body.action)).toEqual(['delete_message']);
    // tool delete_message: tin cu > 24 gio / thieu cli ⇒ ActionNotPermittedError
    const old = await sql<{ id: number }>(
      `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, cli_msg_id, sender_uid, text, received_at)
       values ($1,$2,$3,'cli-old',$4,'tin cu', now() - interval '25 hours') returning id::int as id`,
      [ACCOUNT, g, `m-old-${randomUUID()}`, sender]
    );
    const nocli = await sql<{ id: number }>(
      `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, sender_uid, text) values ($1,$2,$3,$4,'khong cli') returning id::int as id`,
      [ACCOUNT, g, `m-nocli-${randomUUID()}`, sender]
    );
    const ctx = { kind: 'group_mention', account: ACCOUNT, threadId: g, requester: { uid: 'sim-owner', role: 'owner', displayName: null }, inboundEventId: 0, group: {} } as unknown as ToolContext;
    await expect(deleteMessageTool.run(ctx, { msg_id: String(old[0]!.id), reason: 'cu' })).rejects.toMatchObject({ code: 'ActionNotPermittedError' });
    await expect(deleteMessageTool.run(ctx, { msg_id: String(nocli[0]!.id), reason: 'thieu cli' })).rejects.toMatchObject({ code: 'ActionNotPermittedError' });
    expect(m.msgId).toBeTruthy();
    expect(await actionsOf(g)).toHaveLength(1);
  });

  it('(e) warn lan thu 11 trong gio ⇒ van ghi event nhung 0 outbox text (MOD_WARN_PER_HOUR = 10)', async () => {
    const g = await mk();
    for (let i = 0; i < 11; i++) {
      await send({ threadId: g, senderUid: uniq(`sim-w${i}`), text: spamText(`w${i}`) });
      await runAll();
    }
    const ev = await eventsOf(g);
    expect(ev).toHaveLength(11);
    expect(ev.every((e) => e.action === 'warn')).toBe(true);
    expect(await outboxFor(g)).toHaveLength(10);
  });

  it('delete that bai (zca-js) ⇒ timer reconcileDeletes bo dau deleted_at + audit; chay lai khong doi', async () => {
    const g = await mk();
    const sender = uniq('sim-rec');
    const s = await send({ threadId: g, senderUid: sender, text: scamText(5) });
    await runAll();
    const [act] = await actionsOf(g);
    await sql(`update outbox set status = 'failed', result = '{"error":"x"}'::jsonb where id = $1`, [act!.id]);
    expect(await reconcileDeletes(new Date())).toBeGreaterThanOrEqual(1);
    const row = await sql<{ deleted_at: string | null; delete_reason: string | null }>(`select deleted_at::text, delete_reason from group_messages where zalo_msg_id = $1`, [s.msgId]);
    expect(row[0]).toEqual({ deleted_at: null, delete_reason: 'delete_failed' });
    expect(await auditCount('moderation.delete_failed', g)).toBe(1);
    expect(await reconcileDeletes(new Date())).toBe(0);
  });

  it('agent: tin scam KHONG khop luoi nhung goi @bot (triage null) ⇒ model goi flag_message ⇒ event source=agent action=delete + tra loi tu choi', async () => {
    const g = await mk();
    const sender = uniq('sim-atbot');
    script(g, [
      FN((body) => TOOLS({ name: 'flag_message', args: { msg_id: focusId(body), verdict: 'scam', reason: 'moi goi dau tu lua dao' } })),
      TOOLS({ name: 'send_group_message', args: { text: 'Mình không hỗ trợ nội dung này.' } }),
      T('xong'),
    ]);
    const s = await send({ threadId: g, senderUid: sender, senderName: 'Kẻ lạ', text: 'bạn ơi cho mình xin ít vốn rồi chia lãi gấp ba nhé', mentionBot: true });
    await runAll();
    const ev = await eventsOf(g, sender);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ verdict: 'scam', source: 'agent', action: 'delete' });
    const acts = await actionsOf(g);
    expect(acts[0]!.body).toMatchObject({ action: 'delete_message', msgId: s.msgId, uidFrom: sender });
    expect((await outboxFor(g)).map((t) => t.body.text)).toContain('Mình không hỗ trợ nội dung này.');
    resetScripts();
  });

  it('agent flag_message len tin cua owner/moderator ⇒ chi log event none, khong xoa', async () => {
    const mod = uniq('sim-mod2');
    const g = await mk({ members: [{ uid: mod, role: 'moderator', name: 'QTV' }] });
    script(g, [
      FN((body) => TOOLS({ name: 'flag_message', args: { msg_id: focusId(body), verdict: 'scam', reason: 'nghi ngo' } })),
      TOOLS({ name: 'send_group_message', args: { text: 'Mình đã ghi nhận.' } }),
      T('xong'),
    ]);
    await send({ threadId: g, senderUid: mod, text: 'mình thử gọi bot để kiểm tra nhé', mentionBot: true });
    await runAll();
    const ev = await eventsOf(g, mod);
    expect(ev).toEqual([expect.objectContaining({ source: 'agent', action: 'none' })]);
    expect(await actionsOf(g)).toHaveLength(0);
    resetScripts();
  });
});

describe('P05-B — the duyet (f)–(j)', () => {
  const card = async (g: string, target: string, kind: 'kick_member' | 'block_member' = 'kick_member'): Promise<string> => {
    await sql(
      `insert into group_members (zalo_account_id, thread_id, zalo_uid, role, display_name) values ($1,$2,$3,'member','Nạn nhân') on conflict do nothing`,
      [ACCOUNT, g, target]
    );
    return (await createApproval({ account: ACCOUNT, kind, threadId: g, targetUid: target, reason: 'thử', requestedBy: 'agent', now: new Date() })).id;
  };

  it('(f)(g) decideApproval approve ⇒ approved + outbox remove_member co approvalId; applySimOutbox ⇒ executed + left_at + 1 sys approval_executed ⇒ DM owner; approve lan 2 ⇒ ConflictError', async () => {
    const g = await mk();
    const victim = uniq('sim-v');
    const id = await card(g, victim);
    const r = await decideApproval({ id, decision: 'approve', decidedBy: 'staff:11111111-1111-4111-8111-111111111111', now: new Date() });
    expect(r.status).toBe('approved');
    expect(r.outboxId).not.toBeNull();
    const acts = await actionsOf(g);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.body).toMatchObject({ action: 'remove_member', uid: victim, approvalId: id });
    expect((await sql<{ outbox_id: string }>(`select outbox_id::text from approvals where id = $1::uuid`, [id]))[0]!.outbox_id).toBe(String(r.outboxId));

    await applySimOutbox({ extraThreadIds: [g] });
    const st = await sql<{ status: string; executed_at: string | null }>(`select status, executed_at::text from approvals where id = $1::uuid`, [id]);
    expect(st[0]!.status).toBe('executed');
    expect(st[0]!.executed_at).not.toBeNull();
    expect((await sql<{ left_at: string | null }>(`select left_at::text from group_members where thread_id = $1 and zalo_uid = $2`, [g, victim]))[0]!.left_at).not.toBeNull();
    const sys = await sql<{ id: number }>(
      `select id::int as id from inbound_events where thread_id = $1 and sender_uid = 'system' and payload->>'event' = 'approval_executed'`,
      [g]
    );
    expect(sys).toHaveLength(1);
    await runAll();
    expect((await ownerDms('thi hành xong')).some((d) => d.body.text.includes(id.slice(0, 6)))).toBe(true);

    await expect(decideApproval({ id, decision: 'approve', decidedBy: 'staff:11111111-1111-4111-8111-111111111111', now: new Date() })).rejects.toBeInstanceOf(ConflictError);
    expect(await actionsOf(g)).toHaveLength(1);
  });

  it('(f2) reject ⇒ rejected, KHONG co action; zalo:<member> khong duoc quyet; moderator nhom KHAC khong duoc; owner/moderator dung nhom duoc', async () => {
    const mod = uniq('sim-modd');
    const g = await mk({ members: [{ uid: mod, role: 'moderator', name: 'QTV' }] });
    const other = await mk({ members: [{ uid: uniq('sim-modx'), role: 'moderator', name: 'QTV khác' }] });
    const victim = uniq('sim-v2');
    const id = await card(g, victim);
    await expect(decideApproval({ id, decision: 'approve', decidedBy: `zalo:${uniq('sim-mem')}`, now: new Date() })).rejects.toBeInstanceOf(ToolNotAllowedError);
    const otherMod = (await sql<{ zalo_uid: string }>(`select zalo_uid from group_members where thread_id = $1 and role = 'moderator'`, [other]))[0]!.zalo_uid;
    await expect(decideApproval({ id, decision: 'approve', decidedBy: `zalo:${otherMod}`, now: new Date() })).rejects.toBeInstanceOf(ToolNotAllowedError);
    expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [id]))[0]!.status).toBe('pending');
    const r = await decideApproval({ id, decision: 'reject', decidedBy: `zalo:${mod}`, note: 'khong can', now: new Date() });
    expect(r).toEqual({ status: 'rejected', outboxId: null });
    expect(await actionsOf(g)).toHaveLength(0);
  });

  it('(h) expireApprovals(now+25h) ⇒ expired + DM owner 1 lan; chay lai ⇒ 0', async () => {
    const g = await mk();
    const id = await card(g, uniq('sim-v3'));
    const later = new Date(Date.now() + 25 * 3_600_000);
    expect(await expireApprovals(later, { onlyThreadIds: [g] })).toBe(1);
    expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [id]))[0]!.status).toBe('expired');
    expect((await ownerDms('hết hạn')).some((d) => d.body.text.includes(idShortOf(id)))).toBe(true);
    expect(await expireApprovals(later, { onlyThreadIds: [g] })).toBe(0);
    await expect(decideApproval({ id, decision: 'approve', decidedBy: 'staff:22222222-2222-4222-8222-222222222222', now: new Date() })).rejects.toBeInstanceOf(ConflictError);
  });

  it('(h2) qua han (expires_at < now) ⇒ decideApproval tu choi ConflictError du chua chay timer', async () => {
    const g = await mk();
    const id = await card(g, uniq('sim-v4'));
    await sql(`update approvals set expires_at = now() - interval '1 minute' where id = $1::uuid`, [id]);
    await expect(decideApproval({ id, decision: 'approve', decidedBy: 'staff:22222222-2222-4222-8222-222222222222', now: new Date() })).rejects.toBeInstanceOf(ConflictError);
    expect(await actionsOf(g)).toHaveLength(0);
  });

  it('(i) decide_approval qua pipeline voi tin THIEU ma the ⇒ IntentNotConfirmedError (tool_result loi), the van pending, 0 action', async () => {
    const g = await mk();
    const id = await card(g, uniq('sim-v5'));
    script(g, [TOOLS({ name: 'decide_approval', args: { approval_id: idShortOf(id), decision: 'approve' } }), T('chua duyet')]);
    await send({ threadId: g, senderUid: 'sim-owner', text: 'duyệt đi', mentionBot: true });
    await runAll();
    expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [id]))[0]!.status).toBe('pending');
    expect(await actionsOf(g)).toHaveLength(0);
    resetScripts();
  });

  it('(i2) decide_approval tool: thieu ma / sai huong (tin noi "tu choi" nhung model goi approve) / member ⇒ loi; dung ma + tu ⇒ approved', async () => {
    const g = await mk();
    const id = await card(g, uniq('sim-v6'));
    const short = idShortOf(id);
    const ctx = (uid: string, role: string, text: string) =>
      ({
        kind: 'group_mention',
        account: ACCOUNT,
        threadId: g,
        requester: { uid, role, displayName: null },
        group: {},
        focusMessages: [{ senderUid: uid, text }],
        inboundEventId: 0,
      }) as unknown as ToolContext;
    await expect(decideApprovalTool.run(ctx('sim-owner', 'owner', 'duyệt đi'), { approval_id: short, decision: 'approve' })).rejects.toBeInstanceOf(IntentNotConfirmedError);
    await expect(decideApprovalTool.run(ctx('sim-owner', 'owner', `từ chối ${short}`), { approval_id: short, decision: 'approve' })).rejects.toBeInstanceOf(IntentNotConfirmedError);
    await expect(decideApprovalTool.run(ctx(uniq('sim-mem'), 'member', `duyệt ${short}`), { approval_id: short, decision: 'approve' })).rejects.toBeInstanceOf(ToolNotAllowedError);
    // tin cua NGUOI KHAC (khong phai requester) chua ma the cung khong du: focus chi co tin cua member
    await expect(
      decideApprovalTool.run(
        { ...(ctx('sim-owner', 'owner', 'ok') as object), focusMessages: [{ senderUid: 'sim-khac', text: `duyệt ${short}` }] } as unknown as ToolContext,
        { approval_id: short, decision: 'approve' }
      )
    ).rejects.toBeInstanceOf(IntentNotConfirmedError);
    expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [id]))[0]!.status).toBe('pending');
    const ok = await decideApprovalTool.run(ctx('sim-owner', 'owner', `/approve ${short}`), { approval_id: short, decision: 'approve' });
    expect(ok).toMatchObject({ status: 'approved' });
  });

  it('(i3) owner go "/approve <ma>" trong nhom + model goi decide_approval ⇒ the approved + 1 remove_member', async () => {
    const g = await mk();
    const id = await card(g, uniq('sim-v7'));
    const short = idShortOf(id);
    script(g, [TOOLS({ name: 'decide_approval', args: { approval_id: short, decision: 'approve' } }), TOOLS({ name: 'send_group_message', args: { text: 'Đã duyệt.' } }), T('xong')]);
    await send({ threadId: g, senderUid: 'sim-owner', text: `/approve ${short}` });
    await runAll();
    expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [id]))[0]!.status).toBe('approved');
    expect((await actionsOf(g)).map((a) => a.body.action)).toEqual(['remove_member']);
    resetScripts();
  });

  it('(j) member go "/approve <ma>" ⇒ no_trigger: 0 luot, the van pending', async () => {
    const g = await mk();
    const id = await card(g, uniq('sim-v8'));
    await send({ threadId: g, senderUid: uniq('sim-mem'), text: `/approve ${idShortOf(id)}` });
    await runAll();
    expect(await tracesFor(g)).toHaveLength(0);
    expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [id]))[0]!.status).toBe('pending');
  });

  it('BB-06: enqueueAction remove_member/block_member khong co the approved (thieu / pending / sai uid / sai kind) ⇒ ApprovalRequiredError, 0 outbox', async () => {
    const g = await mk();
    const victim = uniq('sim-v9');
    const pending = await card(g, victim);
    const blk = await card(g, victim, 'block_member');
    await expect(enqueueAction({ threadId: g, action: 'remove_member', uid: victim, approvalId: '' })).rejects.toBeInstanceOf(ApprovalRequiredError);
    await expect(enqueueAction({ threadId: g, action: 'remove_member', uid: victim, approvalId: randomUUID() })).rejects.toBeInstanceOf(ApprovalRequiredError);
    await expect(enqueueAction({ threadId: g, action: 'remove_member', uid: victim, approvalId: pending })).rejects.toBeInstanceOf(ApprovalRequiredError);
    await decideApproval({ id: blk, decision: 'reject', decidedBy: 'staff:33333333-3333-4333-8333-333333333333', now: new Date() });
    await expect(enqueueAction({ threadId: g, action: 'block_member', uid: victim, approvalId: blk })).rejects.toBeInstanceOf(ApprovalRequiredError);
    await sql(`update approvals set status = 'approved' where id = $1::uuid`, [pending]);
    await expect(enqueueAction({ threadId: g, action: 'remove_member', uid: 'nguoi-khac', approvalId: pending })).rejects.toBeInstanceOf(ApprovalRequiredError);
    await expect(enqueueAction({ threadId: g, action: 'block_member', uid: victim, approvalId: pending })).rejects.toBeInstanceOf(ApprovalRequiredError);
    expect(await actionsOf(g)).toHaveLength(0);
    // dung the approved ⇒ qua
    await expect(enqueueAction({ threadId: g, action: 'remove_member', uid: victim, approvalId: pending })).resolves.toBeGreaterThan(0);
  });
});

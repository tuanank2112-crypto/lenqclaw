// p05-join-welcome.db.test.ts — SPEC-P05 §10 hang 5: duyet vao nhom (3 policy) + chao thanh vien moi, qua pipeline voi model GIA.
// Moi test tao nhom/uid rieng; chi don dong do chinh test tao (G34).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { invalidatePersonaCache } from '../agent/community/persona.js';
import { WELCOME_TEMPLATE } from '../agent/community/prompts/system.js';
import { createApproval, decideApproval, idShortOf } from '../services/approvals.js';
import { applyJoinDefault, expireJoinRequests } from '../services/join-requests.js';
import { runTimers } from '../services/timers.js';
import { applySimOutbox } from '../sim/sim-actions.js';
import {
  ACCOUNT,
  agentRunsForThread,
  auditCount,
  drainStale,
  EMPTY,
  FN,
  HTTP,
  installFakeModel,
  mkGroup,
  modelBodies,
  bodyText,
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

async function mk(over: Parameters<typeof mkGroup>[0] & { policy?: 'manual' | 'auto_approve' | 'agent_review'; welcome?: boolean } = {}): Promise<string> {
  const { policy = 'manual', welcome = true, ...rest } = over;
  const g = await mkGroup({ ...rest });
  made.push(g);
  await sql(`update zalo_groups set join_policy = $2, welcome_enabled = $3, bot_is_admin = true where zalo_account_id = $4 and thread_id = $1`, [g, policy, welcome, ACCOUNT]);
  return g;
}

beforeAll(async () => {
  installFakeModel();
  await drainStale();
  startOutboxId = (await sql<{ m: number }>(`select coalesce(max(id), 0)::int as m from outbox`))[0]!.m;
});

afterAll(async () => {
  uninstallFakeModel();
  invalidatePersonaCache();
  if (made.length > 0) {
    await sql(`update outbox set status = 'cancelled' where thread_id = any($1::text[]) and status in ('queued','sending')`, [made]);
    await sql(`delete from approvals where thread_id = any($1::text[])`, [made]);
    await sql(`delete from join_requests where thread_id = any($1::text[])`, [made]);
    await sql(`delete from group_messages where thread_id = any($1::text[])`, [made]);
    await sql(`delete from group_members where thread_id = any($1::text[])`, [made]);
    await sql(`delete from group_sessions where thread_id = any($1::text[])`, [made]);
    await sql(`delete from zalo_groups where thread_id = any($1::text[])`, [made]);
  }
  await sql(`update outbox set status = 'cancelled' where id > $1 and thread_id = 'sim-owner' and status = 'queued'`, [startOutboxId]);
  await sql(`update inbound_events set processed_at = now() where processed_at is null and thread_id = any($1::text[])`, [made]);
  await closeDb();
});

const actionsOf = (g: string) =>
  sql<{ id: number; status: string; body: { action: string; uids?: string[]; approve?: boolean; uid?: string; approvalId?: string } }>(
    `select id::int as id, status, body from outbox where thread_id = $1 and kind = 'action' order by id`,
    [g]
  );
const joinRows = (g: string) =>
  sql<{ zalo_uid: string; decision: string; decided_by: string | null; reason: string | null }>(
    `select zalo_uid, decision, decided_by, reason from join_requests where thread_id = $1 order by id`,
    [g]
  );
const ownerDms = (needle: string) =>
  sql<{ id: number; body: { text: string } }>(
    `select id::int as id, body from outbox where id > $1 and thread_id = 'sim-owner' and kind = 'text' and body->>'text' like $2 order by id`,
    [startOutboxId, `%${needle}%`]
  );
const joinEvent = (g: string, event: 'join' | 'join_request' | 'leave' | 'add_admin' | 'remove_member', uids: string[], names: string[] = uids.map((u) => `Tên ${u}`)) =>
  send({ threadId: g, senderUid: 'zalo-sim', text: '', event, eventUids: uids, eventNames: names });
const sysEvents = (g: string, event: string) =>
  sql<{ id: number; payload: { data: { uids?: string[]; uid?: string } } }>(
    `select id::int as id, payload from inbound_events where thread_id = $1 and sender_uid = 'system' and payload->>'event' = $2 order by id`,
    [g, event]
  );

describe('P05-C — duyet vao nhom (§6)', () => {
  it('auto_approve ⇒ dung 1 action review_join approve:true cho moi uid, join_requests approved/policy, 0 agent_runs, 0 luot', async () => {
    const g = await mk({ policy: 'auto_approve' });
    const [a, b] = [uniq('sim-ja'), uniq('sim-jb')];
    await joinEvent(g, 'join_request', [a, b]);
    await runAll();
    const acts = await actionsOf(g);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.body).toMatchObject({ action: 'review_join', uids: [a, b], approve: true });
    expect(await joinRows(g)).toEqual([
      { zalo_uid: a, decision: 'approved', decided_by: 'policy', reason: null },
      { zalo_uid: b, decision: 'approved', decided_by: 'policy', reason: null },
    ]);
    expect(await agentRunsForThread(g)).toBe(0);
    expect(await tracesFor(g)).toHaveLength(0);
    expect(await auditCount('join.approved', g)).toBe(2);
  });

  it('manual ⇒ 1 the approve_join / uid + DM owner; owner duyet ⇒ review_join approve:true co approvalId ⇒ executed + thanh vien; tu choi ⇒ approve:false', async () => {
    const g = await mk({ policy: 'manual' });
    const [a, b] = [uniq('sim-ma'), uniq('sim-mb')];
    await joinEvent(g, 'join_request', [a, b]);
    await runAll();
    expect(await actionsOf(g)).toHaveLength(0);
    const cards = await sql<{ id: string; target_uid: string; kind: string; status: string; payload: { display_name: string } }>(
      `select id::text as id, target_uid, kind, status, payload from approvals where thread_id = $1 order by target_uid`,
      [g]
    );
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.kind === 'approve_join' && c.status === 'pending')).toBe(true);
    expect(cards.map((c) => c.payload.display_name).sort()).toEqual([`Tên ${a}`, `Tên ${b}`].sort());
    for (const c of cards) expect(await ownerDms(`duyệt ${idShortOf(c.id)}`)).toHaveLength(1);
    expect((await joinRows(g)).map((j) => j.decision)).toEqual(['pending', 'pending']);

    const ca = cards.find((c) => c.target_uid === a)!;
    const cb = cards.find((c) => c.target_uid === b)!;
    await decideApproval({ id: ca.id, decision: 'approve', decidedBy: 'staff:44444444-4444-4444-8444-444444444444', now: new Date() });
    await decideApproval({ id: cb.id, decision: 'reject', decidedBy: 'staff:44444444-4444-4444-8444-444444444444', note: 'khong phu hop', now: new Date() });
    const acts = await actionsOf(g);
    expect(acts.map((x) => [x.body.uids, x.body.approve])).toEqual([[[a], true], [[b], false]]);
    expect(acts[0]!.body.approvalId).toBe(ca.id);
    await applySimOutbox({ extraThreadIds: [g] });
    expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [ca.id]))[0]!.status).toBe('executed');
    expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [cb.id]))[0]!.status).toBe('rejected');
    const jr = await joinRows(g);
    expect(jr.find((j) => j.zalo_uid === a)).toMatchObject({ decision: 'approved' });
    expect(jr.find((j) => j.zalo_uid === b)).toMatchObject({ decision: 'rejected' });
    expect((await sql<{ left_at: string | null }>(`select left_at::text from group_members where thread_id = $1 and zalo_uid = $2`, [g, a]))).toHaveLength(1);
    expect(await agentRunsForThread(g)).toBe(0);
  });

  it('agent_review + model goi review_join_request reject co ly do ⇒ action approve:false + join_requests rejected/agent; model nhin thay uid + ten (untrusted) + so lan xin truoc', async () => {
    const g = await mk({ policy: 'agent_review', systemPrompt: 'Tiêu chí: chỉ nhận người làm trong ngành AI.' });
    const u = uniq('sim-jr');
    await sql(`insert into join_requests (zalo_account_id, thread_id, zalo_uid, display_name, decision, decided_by, decided_at) values ($1,$2,$3,'Tên cũ','rejected','agent', now())`, [ACCOUNT, g, u]);
    script(g, [TOOLS({ name: 'review_join_request', args: { uid: u, decision: 'reject', reason: 'Không thuộc ngành AI theo tiêu chí nhóm.' } }), T('xong')]);
    await joinEvent(g, 'join_request', [u], ['Bán Hàng Online']);
    await runAll();
    const acts = await actionsOf(g);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.body).toMatchObject({ action: 'review_join', uids: [u], approve: false });
    const jr = await joinRows(g);
    expect(jr.at(-1)).toMatchObject({ zalo_uid: u, decision: 'rejected', decided_by: 'agent' });
    expect(jr.at(-1)!.reason).toContain('tiêu chí');
    const first = bodyText(modelBodies(g)[0]!);
    expect(first).toContain('<<<untrusted join_request>>>');
    expect(first).toContain(u);
    expect(first).toContain('Bán Hàng Online');
    expect(first).toContain('số lần xin vào trước: 1');
    expect(modelBodies(g)[0]!.systemInstruction.parts.map((p) => p.text).join(' ')).toContain('chỉ nhận người làm trong ngành AI');
    expect((await tracesFor(g)).map((t) => [t.kind, t.outcome])).toEqual([['group_join_review', 'replied']]);
    resetScripts();
  });

  it('agent_review + reject thieu ly do (< 10 ky tu) ⇒ tool loi ⇒ model khong quyet thanh cong ⇒ CHO VAO mac dinh (Q9)', async () => {
    const g = await mk({ policy: 'agent_review' });
    const u = uniq('sim-jr2');
    script(g, [TOOLS({ name: 'review_join_request', args: { uid: u, decision: 'reject', reason: 'khong' } }), T('thoi')]);
    await joinEvent(g, 'join_request', [u]);
    await runAll();
    const acts = await actionsOf(g);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.body).toMatchObject({ action: 'review_join', uids: [u], approve: true });
    expect((await joinRows(g))[0]).toMatchObject({ decision: 'approved', decided_by: 'default', reason: 'model_silent' });
    expect(await auditCount('join_review.default', g)).toBe(1);
    resetScripts();
  });

  it('agent_review + model im (khong goi tool) ⇒ approve mac dinh; model sap (HTTP 500) ⇒ approve mac dinh; chi 1 action moi uid', async () => {
    const g = await mk({ policy: 'agent_review' });
    const [silent, down] = [uniq('sim-js'), uniq('sim-jd')];
    script(g, [T('Mình chưa rõ nên im lặng.')]);
    await joinEvent(g, 'join_request', [silent]);
    await runAll();
    resetScripts();
    script(g, [HTTP(500)], { repeatLast: true });
    await joinEvent(g, 'join_request', [down]);
    await runAll();
    const acts = await actionsOf(g);
    expect(acts.map((a) => [a.body.uids, a.body.approve])).toEqual([[[silent], true], [[down], true]]);
    expect((await joinRows(g)).map((j) => [j.decision, j.decided_by])).toEqual([['approved', 'default'], ['approved', 'default']]);
    resetScripts();
  });

  it('applyJoinDefault khi yeu cau da duoc quyet ⇒ khong lam gi (khong action thu hai)', async () => {
    const g = await mk({ policy: 'agent_review' });
    const u = uniq('sim-jx');
    await sql(`insert into join_requests (zalo_account_id, thread_id, zalo_uid, decision, decided_by, decided_at) values ($1,$2,$3,'rejected','staff:x', now())`, [ACCOUNT, g, u]);
    expect(await applyJoinDefault({ account: ACCOUNT, threadId: g, uid: u, now: new Date() })).toBe(false);
    expect(await actionsOf(g)).toHaveLength(0);
  });

  it('agent_review nhung nhom doi sang policy khac / yeu cau khong con pending ⇒ system_event bo qua, 0 luot', async () => {
    const g = await mk({ policy: 'manual' });
    const u = uniq('sim-jz');
    // phat su kien he thong thang (policy hien la manual)
    const { enqueueSystemEvent } = await import('../services/system-events.js');
    await sql(`insert into join_requests (zalo_account_id, thread_id, zalo_uid) values ($1,$2,$3)`, [ACCOUNT, g, u]);
    await enqueueSystemEvent({ event: 'join_request', threadId: g, uid: u });
    await runAll();
    expect(await tracesFor(g)).toHaveLength(0);
    expect(await auditCount('join_review.skip', g)).toBe(1);
  });

  it('expireJoinRequests: pending qua JOIN_REQUEST_TTL_HOURS (48) ⇒ expired + audit; chua qua han thi giu; chay lai ⇒ 0', async () => {
    const g = await mk({ policy: 'manual' });
    const u = uniq('sim-je');
    await sql(`insert into join_requests (zalo_account_id, thread_id, zalo_uid, requested_at) values ($1,$2,$3, now())`, [ACCOUNT, g, u]);
    expect(await expireJoinRequests(new Date(Date.now() + 47 * 3_600_000), { onlyThreadIds: [g] })).toBe(0);
    expect(await expireJoinRequests(new Date(Date.now() + 49 * 3_600_000), { onlyThreadIds: [g] })).toBe(1);
    expect((await joinRows(g))[0]).toMatchObject({ decision: 'expired', decided_by: 'timer' });
    expect(await expireJoinRequests(new Date(Date.now() + 49 * 3_600_000), { onlyThreadIds: [g] })).toBe(0);
    expect(await auditCount('join.expired', g)).toBe(1);
  });
});

describe('P05-C — su kien nhom khac (§6–§7)', () => {
  it('leave / remove_member ⇒ left_at; add_admin 2 lan ⇒ DUNG 1 sync_group_info dang cho; nhom tat ⇒ audit event_disabled va khong lam gi', async () => {
    const g = await mk();
    const u = uniq('sim-l');
    await sql(`insert into group_members (zalo_account_id, thread_id, zalo_uid, role) values ($1,$2,$3,'member')`, [ACCOUNT, g, u]);
    await joinEvent(g, 'leave', [u]);
    await runAll();
    expect((await sql<{ left_at: string | null }>(`select left_at::text from group_members where thread_id = $1 and zalo_uid = $2`, [g, u]))[0]!.left_at).not.toBeNull();
    await joinEvent(g, 'add_admin', [u]);
    await joinEvent(g, 'add_admin', [u]);
    await runAll();
    expect((await actionsOf(g)).filter((a) => a.body.action === 'sync_group_info')).toHaveLength(1);

    const off = await mk();
    await sql(`update zalo_groups set enabled = false where thread_id = $1`, [off]);
    await joinEvent(off, 'join', [uniq('sim-off')]);
    await runAll();
    expect(await auditCount('group.event_disabled', off)).toBe(1);
    expect(await sql(`select 1 from group_members where thread_id = $1`, [off])).toHaveLength(0);
  });
});

describe('P05-C — chao thanh vien moi (§7)', () => {
  it('join 3 nguoi trong 2 phut ⇒ sau runTimers(now+3 phut) dung 1 welcome_flush voi 3 uid ⇒ 1 outbox text co 3 mention; chay timer lai ⇒ khong them su kien', async () => {
    const g = await mk();
    const us = [uniq('sim-w1'), uniq('sim-w2'), uniq('sim-w3')];
    script(g, [FN(() => TOOLS({ name: 'send_group_message', args: { text: 'Chào mừng các bạn vào nhóm nhé!', mention_uids: us } })), T('xong')]);
    for (const u of us) await joinEvent(g, 'join', [u]);
    await runAll();
    expect((await sql<{ welcomed_at: string | null }>(`select welcomed_at::text from group_members where thread_id = $1`, [g])).every((m) => m.welcomed_at === null)).toBe(true);
    expect((await sql<{ welcome_pending_since: string | null }>(`select welcome_pending_since::text from group_sessions where thread_id = $1`, [g]))[0]!.welcome_pending_since).not.toBeNull();

    const early = await runTimers(new Date(Date.now() + 60_000));
    expect(early.steps.flushWelcomes).toBe(0); // chua qua WELCOME_DEBOUNCE_SEC (120 s)
    const rep = await runTimers(new Date(Date.now() + 3 * 60_000));
    expect(rep.steps.flushWelcomes).toBeGreaterThanOrEqual(1);
    const ev = await sysEvents(g, 'welcome_flush');
    expect(ev).toHaveLength(1);
    expect([...ev[0]!.payload.data.uids!].sort()).toEqual([...us].sort());
    expect((await sql<{ welcome_pending_since: string | null }>(`select welcome_pending_since::text from group_sessions where thread_id = $1`, [g]))[0]!.welcome_pending_since).toBeNull();

    await runAll();
    const texts = await outboxFor(g);
    expect(texts).toHaveLength(1);
    expect(texts[0]!.body.mentions).toHaveLength(3);
    expect((await tracesFor(g)).map((t) => [t.kind, t.outcome])).toEqual([['group_welcome', 'replied']]);
    await runTimers(new Date(Date.now() + 10 * 60_000));
    expect(await sysEvents(g, 'welcome_flush')).toHaveLength(1);
    resetScripts();
  });

  it('chao 2 lan: thanh vien da duoc chao KHONG bi chao lai o dot flush sau (welcomed_at dat truoc luot)', async () => {
    const g = await mk();
    const [a, b, c] = [uniq('sim-c1'), uniq('sim-c2'), uniq('sim-c3')];
    script(g, [TOOLS({ name: 'send_group_message', args: { text: 'Chào mừng nhé!' } }), T('xong')], { repeatLast: true });
    await joinEvent(g, 'join', [a]);
    await joinEvent(g, 'join', [b]);
    await runAll();
    await runTimers(new Date(Date.now() + 3 * 60_000));
    await runAll();
    await joinEvent(g, 'join', [c]);
    await runAll();
    await runTimers(new Date(Date.now() + 6 * 60_000));
    const ev = await sysEvents(g, 'welcome_flush');
    expect(ev).toHaveLength(2);
    expect([...ev[0]!.payload.data.uids!].sort()).toEqual([a, b].sort());
    expect(ev[1]!.payload.data.uids).toEqual([c]);
    await runAll();
    resetScripts();
  });

  it('welcome_enabled=false ⇒ khong gom, khong su kien; nhom tat giua chung ⇒ xoa phien cho, khong luot', async () => {
    const g = await mk({ welcome: false });
    await joinEvent(g, 'join', [uniq('sim-nw')]);
    await runAll();
    expect(await sql(`select 1 from group_sessions where thread_id = $1 and welcome_pending_since is not null`, [g])).toHaveLength(0);
    await runTimers(new Date(Date.now() + 5 * 60_000));
    expect(await sysEvents(g, 'welcome_flush')).toHaveLength(0);

    const g2 = await mk();
    await joinEvent(g2, 'join', [uniq('sim-nw2')]);
    await runAll();
    await sql(`update zalo_groups set welcome_enabled = false where thread_id = $1`, [g2]);
    await runTimers(new Date(Date.now() + 5 * 60_000));
    expect(await sysEvents(g2, 'welcome_flush')).toHaveLength(0);
    expect(await sql(`select 1 from group_sessions where thread_id = $1 and welcome_pending_since is not null`, [g2])).toHaveLength(0);
  });

  it('model sap ⇒ host gui WELCOME_TEMPLATE (ten that, ten nhom, ten bot) dung 1 tin', async () => {
    const g = await mk();
    const us = [uniq('sim-d1'), uniq('sim-d2')];
    script(g, [HTTP(500)], { repeatLast: true });
    await joinEvent(g, 'join', [us[0]!], ['An Nguyễn']);
    await joinEvent(g, 'join', [us[1]!], ['Bình Trần']);
    await runAll();
    await runTimers(new Date(Date.now() + 3 * 60_000));
    await runAll();
    const texts = await outboxFor(g);
    expect(texts).toHaveLength(1);
    const names = (await sql<{ zalo_uid: string; display_name: string }>(`select zalo_uid, display_name from group_members where thread_id = $1`, [g]));
    const ordered = us.map((u) => names.find((n) => n.zalo_uid === u)!.display_name);
    expect(texts[0]!.body.text).toBe(WELCOME_TEMPLATE(ordered, `Nhóm test ${g}`, 'Claw'));
    expect((await tracesFor(g)).map((t) => t.outcome)).toEqual(['model_down']);
    resetScripts();
  });

  it('model khong goi tool va khong text sau nudge ⇒ WELCOME_TEMPLATE (fallback) dung 1 tin; co text cuoi ⇒ auto_post (BB-05)', async () => {
    const g = await mk();
    const u = uniq('sim-f1');
    script(g, [EMPTY], { repeatLast: true }); // khong tool, khong text (sau nudge van vay) ⇒ D12 fallback
    await joinEvent(g, 'join', [u], ['Chi Lê']);
    await runAll();
    await runTimers(new Date(Date.now() + 3 * 60_000));
    await runAll();
    const texts = await outboxFor(g);
    expect(texts).toHaveLength(1);
    expect(texts[0]!.body.text).toBe(WELCOME_TEMPLATE(['Chi Lê'], `Nhóm test ${g}`, 'Claw'));
    resetScripts();
  });

  it('the duyet announce: createApproval(announce) ⇒ duyet ⇒ outbox text ⇒ executed ngay', async () => {
    const g = await mk();
    const { id } = await createApproval({ account: ACCOUNT, kind: 'announce', threadId: g, reason: 'thông báo', payload: { text: 'Họp nhóm 20h tối nay.' }, requestedBy: 'agent', now: new Date() });
    const r = await decideApproval({ id, decision: 'approve', decidedBy: 'staff:55555555-5555-4555-8555-555555555555', now: new Date() });
    expect(r.outboxId).not.toBeNull();
    expect((await outboxFor(g)).map((t) => t.body.text)).toEqual(['Họp nhóm 20h tối nay.']);
    expect((await sql<{ status: string }>(`select status from approvals where id = $1::uuid`, [id]))[0]!.status).toBe('executed');
    expect(randomUUID()).toBeTruthy();
  });
});

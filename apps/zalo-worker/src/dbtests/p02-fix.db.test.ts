// apps/zalo-worker/src/dbtests/p02-fix.db.test.ts — vong sua P02 (ke hoach 02, D29 diem 1-4, 8).
// Moi `describe` mang nhan "D29.<n>" de loc bang `-t`. DB that, zca-js GIA, 0 mang.
// Du lieu tu co lap: moi test dung thread/uid rieng (`uid()`), don dep cuoi test (G29).

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@lenqclaw/core';
import { AccountPacer } from '../pacer.js';
import { ZaloActionError, ZaloRateLimitError, type ZaloSessionLike } from '../client.js';
import * as store from '../store.js';
import { FAST, connectedSession, dropGroup, enqueueId, makeGroup, outboxRow, resetAccount, uid } from './group-helpers.js';

const ACCOUNT = 'community';

beforeEach(async () => {
  await resetAccount();
});

afterAll(async () => {
  await resetAccount();
  await sql(`update inbound_events set processed_at = now() where processed_at is null`);
  await closeDb();
});

function pacerFor(s: { getSession: () => ZaloSessionLike | null }, now?: () => number) {
  return new AccountPacer(ACCOUNT, FAST, () => s.getSession(), { rng: () => 0, ...(now ? { now } : {}) });
}

async function auditCount(action: string, target: string): Promise<number> {
  const r = await sql<{ c: number }>(`select count(*)::int as c from audit_log where action = $1 and target = $2`, [action, target]);
  return r[0]!.c;
}

async function mkApproval(over: { kind?: string; status?: string; thread: string; target?: string }): Promise<string> {
  return (
    await sql<{ id: string }>(
      `insert into approvals (zalo_account_id, kind, thread_id, target_uid, reason, requested_by, status, expires_at)
       values ($1,$2,$3,$4,'test','agent',$5, now() + interval '1 hour') returning id`,
      [ACCOUNT, over.kind ?? 'kick_member', over.thread, over.target ?? 'u-bad', over.status ?? 'approved']
    )
  )[0]!.id;
}

async function approvalRow(id: string) {
  return (await sql<{ status: string; executed_at: string | null }>(`select status, executed_at::text from approvals where id=$1::uuid`, [id]))[0]!;
}

function act(group: string, body: Record<string, unknown>): Promise<number> {
  return enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'action', body });
}

const zaloCalls = (fake: { actions: Array<{ kind: string }> }, kinds: string[]) => fake.actions.filter((a) => kinds.includes(a.kind));

describe('D29.1 — kick/block CHI khi co the duyet hop le (BB-06, lop chan cuoi)', () => {
  const cases: Array<{ name: string; action: 'remove_member' | 'block_member'; setup: (g: string) => Promise<Record<string, unknown>> }> = [
    { name: 'khong approvalId (remove_member)', action: 'remove_member', setup: async () => ({}) },
    { name: 'approvalId khong phai uuid', action: 'remove_member', setup: async () => ({ approvalId: 'khong-phai-uuid' }) },
    { name: 'approvalId khong ton tai', action: 'remove_member', setup: async () => ({ approvalId: '00000000-0000-4000-8000-000000000000' }) },
    { name: 'approval pending (remove_member)', action: 'remove_member', setup: async (g) => ({ approvalId: await mkApproval({ thread: g, status: 'pending' }) }) },
    {
      name: 'approval rejected (block_member)',
      action: 'block_member',
      setup: async (g) => ({ approvalId: await mkApproval({ thread: g, kind: 'block_member', status: 'rejected' }) }),
    },
    { name: 'approval da executed (dung lai the cu)', action: 'remove_member', setup: async (g) => ({ approvalId: await mkApproval({ thread: g, status: 'executed' }) }) },
    { name: 'uid dich lech target_uid cua the', action: 'remove_member', setup: async (g) => ({ approvalId: await mkApproval({ thread: g, target: 'u-khac' }) }) },
    { name: 'the khac thread', action: 'remove_member', setup: async () => ({ approvalId: await mkApproval({ thread: uid('g-khac') }) }) },
    { name: 'the kind kick_member dung cho block_member', action: 'block_member', setup: async (g) => ({ approvalId: await mkApproval({ thread: g, kind: 'kick_member' }) }) },
  ];

  for (const c of cases) {
    it(`${c.name} ⇒ failed(approval_invalid), KHONG goi Zalo, audit zalo.action_blocked, the khong bi dong`, async () => {
      const { s, fake } = await connectedSession();
      const group = uid('g');
      await makeGroup(group);
      const extra = await c.setup(group);
      const id = await act(group, { action: c.action, uid: 'u-bad', ...extra });
      await pacerFor(s).tick();
      expect(zaloCalls(fake, ['removeMember', 'blockMember'])).toEqual([]);
      const row = await outboxRow(id);
      expect(row.status).toBe('failed');
      expect(row.body.fail_reason).toBe('approval_invalid');
      expect(await auditCount('zalo.action_blocked', group)).toBe(1);
      expect(await auditCount('zalo.action', group)).toBe(0);
      if (typeof extra.approvalId === 'string' && /^[0-9a-f-]{36}$/.test(extra.approvalId)) {
        const a = await sql<{ status: string }>(`select status from approvals where id=$1::uuid`, [extra.approvalId]);
        if (a[0]) expect(['pending', 'rejected', 'executed', 'approved']).toContain(a[0].status); // khong bi chuyen sang failed
      }
      await sql(`delete from outbox where body->>'approvalId' in (select id::text from approvals where thread_id = $1 or id::text = $2)`, [group, String(extra.approvalId ?? '')]).catch(() => undefined);
      await sql(`delete from approvals where thread_id = $1 or id::text = $2`, [group, String(extra.approvalId ?? '')]).catch(() => undefined);
      await dropGroup(group);
      await s.stop();
    });
  }

  it('the HOP LE ⇒ goi Zalo dung 1 lan, approved → executed', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    const ap = await mkApproval({ thread: group });
    const id = await act(group, { action: 'remove_member', uid: 'u-bad', approvalId: ap });
    await pacerFor(s).tick();
    expect(zaloCalls(fake, ['removeMember']).length).toBe(1);
    expect((await outboxRow(id)).status).toBe('sent');
    expect((await approvalRow(ap)).status).toBe('executed');
    await sql(`delete from outbox where body->>'approvalId' = $1`, [ap]);
    await sql(`delete from approvals where id=$1::uuid`, [ap]);
    await dropGroup(group);
    await s.stop();
  });

  it('hai hang outbox CUNG approval ⇒ chi MOT lan goi Zalo; hang con lai failed(approval_invalid)', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    const ap = await mkApproval({ thread: group });
    const a = await act(group, { action: 'remove_member', uid: 'u-bad', approvalId: ap });
    const b = await act(group, { action: 'remove_member', uid: 'u-bad', approvalId: ap });
    await pacerFor(s).tick();
    await pacerFor(s).tick();
    expect(zaloCalls(fake, ['removeMember']).length).toBe(1);
    const statuses = [(await outboxRow(a)).status, (await outboxRow(b)).status].sort();
    expect(statuses).toEqual(['failed', 'sent']);
    expect((await approvalRow(ap)).status).toBe('executed');
    await sql(`delete from outbox where body->>'approvalId' = $1`, [ap]);
    await sql(`delete from approvals where id=$1::uuid`, [ap]);
    await dropGroup(group);
    await s.stop();
  });

  it('hai pacer (hai tick dong thoi) cung approval ⇒ chi MOT lan goi Zalo (CAS trong DB)', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    const ap = await mkApproval({ thread: group });
    await act(group, { action: 'remove_member', uid: 'u-bad', approvalId: ap });
    await act(group, { action: 'remove_member', uid: 'u-bad', approvalId: ap });
    await Promise.all([pacerFor(s).tick(), pacerFor(s).tick()]);
    expect(zaloCalls(fake, ['removeMember']).length).toBe(1);
    await sql(`delete from outbox where body->>'approvalId' = $1`, [ap]);
    await sql(`delete from approvals where id=$1::uuid`, [ap]);
    await dropGroup(group);
    await s.stop();
  });

  it('claimApproval la CAS: lan 2 (the con approved nhung da nhan) ⇒ false; releaseApproval ⇒ nhan lai duoc', async () => {
    const group = uid('g');
    const ap = await mkApproval({ thread: group });
    expect(await store.claimApproval(ap, ACCOUNT, group, 'remove_member', 'u-bad')).toBe(true);
    expect((await approvalRow(ap)).status).toBe('approved'); // chua hoan tat ⇒ van approved, chi co executed_at
    expect(await store.claimApproval(ap, ACCOUNT, group, 'remove_member', 'u-bad')).toBe(false);
    await store.releaseApproval(ap);
    expect(await store.claimApproval(ap, ACCOUNT, group, 'remove_member', 'u-bad')).toBe(true);
    await sql(`delete from outbox where body->>'approvalId' = $1`, [ap]);
    await sql(`delete from approvals where id=$1::uuid`, [ap]);
  });

  it('loi Zalo ro rang (ZaloActionError) ⇒ approval failed; the do KHONG dung lai duoc', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    const ap = await mkApproval({ thread: group });
    fake.nextActionError = new ZaloActionError('boom', 100);
    await act(group, { action: 'remove_member', uid: 'u-bad', approvalId: ap });
    await pacerFor(s).tick();
    expect((await approvalRow(ap)).status).toBe('failed');
    await act(group, { action: 'remove_member', uid: 'u-bad', approvalId: ap });
    await pacerFor(s).tick();
    expect(zaloCalls(fake, ['removeMember']).length).toBe(1);
    await sql(`delete from outbox where body->>'approvalId' = $1`, [ap]);
    await sql(`delete from approvals where id=$1::uuid`, [ap]);
    await dropGroup(group);
    await s.stop();
  });

  it('ZaloRateLimitError (chua thi hanh) ⇒ requeue VA tra the (lan sau van chay duoc)', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    const ap = await mkApproval({ thread: group });
    fake.nextActionError = new ZaloRateLimitError('221');
    const id = await act(group, { action: 'remove_member', uid: 'u-bad', approvalId: ap });
    await pacerFor(s).tick();
    expect((await outboxRow(id)).status).toBe('queued');
    expect((await approvalRow(ap)).status).toBe('approved');
    expect((await approvalRow(ap)).executed_at).toBeNull();
    await sql(`delete from outbox where body->>'approvalId' = $1`, [ap]);
    await sql(`delete from approvals where id=$1::uuid`, [ap]);
    await dropGroup(group);
    await s.stop();
  });
});

describe('D29.2 — nhom chua khai / enabled=false ⇒ huy moi text/action (tru sync_group_info)', () => {
  it('nhom CHUA khai: delete_message + create_poll ⇒ cancelled(group_unknown) + audit, KHONG goi Zalo', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    const a = await act(group, { action: 'delete_message', msgId: 'm1', cliMsgId: 'c1', uidFrom: 'u' });
    const b = await act(group, { action: 'create_poll', question: 'q', options: ['a', 'b'] });
    await pacerFor(s).tick();
    expect(fake.actions).toEqual([]);
    for (const id of [a, b]) {
      const row = await outboxRow(id);
      expect(row.status).toBe('cancelled');
      expect(row.body.cancel_reason).toBe('group_unknown');
    }
    expect(await auditCount('pacer.group_unknown', group)).toBe(2);
    await s.stop();
  });

  it('nhom enabled=false: text + action ⇒ cancelled(group_disabled) + audit, KHONG goi Zalo', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    await sql(`update zalo_groups set enabled = false where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, group]);
    const t = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'x' } });
    const a = await act(group, { action: 'create_note', title: 't' });
    await pacerFor(s).tick();
    expect(fake.actions).toEqual([]);
    expect(fake.sent).toEqual([]);
    for (const id of [t, a]) {
      const row = await outboxRow(id);
      expect(row.status).toBe('cancelled');
      expect(row.body.cancel_reason).toBe('group_disabled');
    }
    expect(await auditCount('pacer.group_disabled', group)).toBe(2);
    await dropGroup(group);
    await s.stop();
  });

  it('sync_group_info tren nhom chua khai VAN chay (tao dong enabled=false); text sau do van bi huy (group_disabled)', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    fake.groupInfo = { name: 'Nhóm lạ', adminIds: [], creatorId: 'x', memberIds: ['u1'], memVerList: [], totalMember: 1, setting: { joinAppr: 1 } };
    fake.memberNames = { u1: 'An' };
    const sync = await act(group, { action: 'sync_group_info' });
    await pacerFor(s).tick();
    expect((await outboxRow(sync)).status).toBe('sent');
    const g = await sql<{ enabled: boolean }>(`select enabled from zalo_groups where zalo_account_id=$1 and thread_id=$2`, [ACCOUNT, group]);
    expect(g[0]!.enabled).toBe(false);
    const t = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'x' } });
    await pacerFor(s).tick();
    expect((await outboxRow(t)).body.cancel_reason).toBe('group_disabled');
    expect(fake.sent.filter((x) => x.kind === 'text')).toEqual([]);
    await dropGroup(group);
    await s.stop();
  });
});

describe('D29.3 — ngan sach dem bang dong ho DB, khong phai dong ho worker', () => {
  it('dong ho worker lech +20 phut: 3 tin gui 50 phut truoc (ngan sach 3) VAN tinh ⇒ tin thu 4 giu queued, note group_budget', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group, 3);
    for (let i = 0; i < 3; i++) {
      const old = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: `cũ ${i}` } });
      await sql(`update outbox set status='sent', sent_at = now() - interval '50 minutes' where id=$1`, [old]);
    }
    const id = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'tin 4' } });
    // +20′ < groupTextTtlMin (30′): chi cua so ngan sach chiu anh huong, tin khong bi huy vi TTL.
    const skewed = () => Date.now() + 20 * 60_000;
    const r = await pacerFor(s, skewed).tick();
    expect(r.note).toBe('group_budget');
    expect((await outboxRow(id)).status).toBe('queued');
    expect(fake.sent.filter((x) => x.kind === 'text')).toEqual([]);
    await dropGroup(group);
    await s.stop();
  });

  it('groupTextSentLastHour khong con tham so dong ho (chi account + thread)', () => {
    expect(store.groupTextSentLastHour.length).toBe(2);
  });
});

describe('D29.4 — action khong idempotent: loi mo ho ⇒ failed(outcome_unknown), KHONG thu lai', () => {
  const bodies: Array<[string, Record<string, unknown>]> = [
    ['create_poll', { action: 'create_poll', question: 'q', options: ['a', 'b'] }],
    ['create_reminder', { action: 'create_reminder', title: 't', startTime: 1_900_000_000_000, repeat: 0 }],
    ['create_note', { action: 'create_note', title: 't' }],
    ['update_group_settings', { action: 'update_group_settings', settings: { lockSendMsg: true } }],
  ];
  for (const [name, body] of bodies) {
    it(`${name}: loi mang ⇒ failed(outcome_unknown), goi Zalo dung 1 lan du tick lai`, async () => {
      const { s, fake } = await connectedSession();
      const group = uid('g');
      await makeGroup(group);
      fake.nextActionError = new Error('ECONNRESET');
      const id = await act(group, body);
      const pacer = pacerFor(s);
      await pacer.tick();
      await pacer.tick();
      expect(fake.actions.length).toBe(1);
      const row = await outboxRow(id);
      expect(row.status).toBe('failed');
      expect(row.body.fail_reason).toBe('outcome_unknown');
      await dropGroup(group);
      await s.stop();
    });
  }

  it('ZaloRateLimitError (Zalo chua thi hanh) ⇒ van requeue, khong failed', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    fake.nextActionError = new ZaloRateLimitError('221');
    const id = await act(group, { action: 'create_poll', question: 'q', options: ['a', 'b'] });
    await pacerFor(s).tick();
    expect((await outboxRow(id)).status).toBe('queued');
    await dropGroup(group);
    await s.stop();
  });

  it('delete_message (idempotent): loi mang van thu lai nhu cu (queued)', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group);
    fake.nextActionError = new Error('ECONNRESET');
    const id = await act(group, { action: 'delete_message', msgId: 'm1', cliMsgId: 'c1', uidFrom: 'u' });
    await pacerFor(s).tick();
    expect((await outboxRow(id)).status).toBe('queued');
    await dropGroup(group);
    await s.stop();
  });
});

describe('D29.8 — ngan sach phan biet cua so 1 gio va dem ca hang sending', () => {
  async function seed(group: string, status: string, ago: string): Promise<number> {
    const id = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'm' } });
    if (status === 'sent') await sql(`update outbox set status='sent', sent_at = now() - $2::interval where id=$1`, [id, ago]);
    else await sql(`update outbox set status=$3, created_at = now() - $2::interval where id=$1`, [id, ago, status]);
    return id;
  }

  it('hang gui 30 va 59 phut truoc VAN tinh; hang 61 phut truoc KHONG tinh', async () => {
    const group = uid('g');
    const ids = [await seed(group, 'sent', '30 minutes'), await seed(group, 'sent', '59 minutes'), await seed(group, 'sent', '61 minutes')];
    expect(await store.groupTextSentLastHour(ACCOUNT, group)).toBe(2);
    await sql(`update outbox set status='cancelled' where id = any($1)`, [ids]);
  });

  it('hang dang gui (sending) tinh vao ngan sach; queued thi khong', async () => {
    const group = uid('g');
    const ids = [await seed(group, 'sent', '10 minutes'), await seed(group, 'sending', '1 minute'), await seed(group, 'queued', '1 minute')];
    expect(await store.groupTextSentLastHour(ACCOUNT, group)).toBe(2);
    await sql(`update outbox set status='cancelled' where id = any($1)`, [ids]);
  });

  it('o pacer: ngan sach 2, 1 sent + 1 sending ⇒ tin moi giu queued (group_budget)', async () => {
    const { s, fake } = await connectedSession();
    const group = uid('g');
    await makeGroup(group, 2);
    await seed(group, 'sent', '45 minutes');
    await seed(group, 'sending', '1 minute');
    const id = await enqueueId({ zaloAccountId: ACCOUNT, threadId: group, threadType: 'group', kind: 'text', body: { text: 'moi' } });
    const r = await pacerFor(s).tick();
    expect(r.note).toBe('group_budget');
    expect((await outboxRow(id)).status).toBe('queued');
    expect(fake.sent.filter((x) => x.kind === 'text')).toEqual([]);
    await sql(`update outbox set status='cancelled' where thread_id=$1`, [group]);
    await dropGroup(group);
    await s.stop();
  });
});

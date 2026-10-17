// apps/web/tests/sim-send.db.test.ts — POST /api/dev/sim/send va GET /api/dev/sim/thread
// voi kenh gia lap NHOM (SPEC-P02 ke hoach 02 §7.3, §10 hang 4).
// Tu co lap (G29): moi test danh dau hang doi inbound_events cu da xong truoc khi gui.

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { closeDb, enqueue, sql, type StaffRole } from '@lenqclaw/core';
import { POST as simSend } from '../app/api/dev/sim/send/route';
import { GET as simThread } from '../app/api/dev/sim/thread/route';
import { createSessionCookie, SESSION_COOKIE_NAME } from '../lib/auth/session';

const staffIds = new Map<StaffRole, string>();

async function staffId(role: StaffRole): Promise<string> {
  const cached = staffIds.get(role);
  if (cached) return cached;
  const rows = await sql<{ id: string }>(
    `insert into staff_users (email, password_hash, role) values ($1,'x',$2) returning id`,
    [`sim-send-${role}-${randomUUID().slice(0, 8)}@test.local`, role]
  );
  staffIds.set(role, rows[0]!.id);
  return rows[0]!.id;
}

async function cookie(role: StaffRole): Promise<Record<string, string>> {
  return { cookie: `${SESSION_COOKIE_NAME}=${await createSessionCookie(await staffId(role), role)}` };
}

async function send(role: StaffRole | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (role) Object.assign(headers, await cookie(role));
  return simSend(new NextRequest('http://localhost/api/dev/sim/send', { method: 'POST', headers, body: JSON.stringify(body) }));
}

function thread(): string {
  return `sim-group-send-${randomUUID().slice(0, 8)}`;
}

async function inboundOf(threadId: string) {
  return sql<{ zalo_msg_id: string; sender_uid: string; thread_type: string; payload: Record<string, unknown> }>(
    `select zalo_msg_id, sender_uid, thread_type, payload from inbound_events where zalo_account_id='community' and thread_id=$1 order by id`,
    [threadId]
  );
}

const BASE = { account: 'community', threadType: 'group', senderUid: 'sim-mem-1' } as const;

describe('/api/dev/sim/send — kenh gia lap nhom (db)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
  });

  beforeEach(async () => {
    process.env.DATA_MODE = 'sim';
    await sql(`update inbound_events set processed_at = now() where processed_at is null`);
    await sql(`update outbox set status = 'cancelled' where status = 'queued'`);
  });

  afterEach(() => {
    delete process.env.DATA_MODE;
  });

  afterAll(async () => {
    await sql(`update inbound_events set processed_at = now() where processed_at is null`);
    await closeDb();
  });

  it('mentionBot:true ⇒ inbound_events.payload.mentions[0].uid = "sim-bot", pos/len tro dung "@bot"', async () => {
    const t = thread();
    const res = await send('admin', { ...BASE, threadId: t, text: 'xin chào @bot', mentionBot: true, senderName: 'Nguyễn Văn An' });
    expect(res.status).toBe(200);
    const rows = await inboundOf(t);
    expect(rows.length).toBe(1);
    expect(rows[0]!.thread_type).toBe('group');
    const p = rows[0]!.payload as { mentions: Array<{ uid: string; pos: number; len: number }>; text: string; d_name: string; kind: string };
    expect(p.kind).toBe('text');
    expect(p.mentions[0]!.uid).toBe('sim-bot');
    expect(p.text.slice(p.mentions[0]!.pos, p.mentions[0]!.pos + p.mentions[0]!.len)).toBe('@bot');
    expect(p.d_name).toBe('Nguyễn Văn An');
  });

  it('event:"join_request" ⇒ payload.kind="group_event", event/uids dung, text khong bat buoc', async () => {
    const t = thread();
    const res = await send('admin', { ...BASE, threadId: t, senderUid: 'sim-owner', event: 'join_request', eventUids: ['sim-new-1'], eventNames: ['Khách Mới'] });
    expect(res.status).toBe(200);
    const rows = await inboundOf(t);
    expect(rows[0]!.zalo_msg_id).toMatch(/^gev-sim-/);
    expect(rows[0]!.payload).toMatchObject({ kind: 'group_event', event: 'join_request', uids: ['sim-new-1'], names: ['Khách Mới'] });
  });

  it('senderUid:"system" ⇒ 400 reserved_sender (khong gia mao su kien he thong)', async () => {
    const res = await send('admin', { ...BASE, threadId: thread(), senderUid: 'system', text: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('reserved_sender');
  });

  it('sticker khong can text ⇒ kind=unsupported; quote tin da co ⇒ payload.quote.owner_id = nguoi gui goc', async () => {
    const t = thread();
    expect((await send('admin', { ...BASE, threadId: t, msgType: 'chat.sticker' })).status).toBe(200);
    const first = await send('admin', { ...BASE, threadId: t, senderUid: 'sim-mem-3', text: 'tin gốc', senderName: 'Lê Hoàng Cường' });
    expect(first.status).toBe(200);
    const rows0 = await inboundOf(t);
    expect(rows0[0]!.payload).toMatchObject({ kind: 'unsupported', text: '[thành viên gửi sticker — chưa hỗ trợ]' });
    const quoted = rows0[1]!.zalo_msg_id;
    expect((await send('admin', { ...BASE, threadId: t, text: 'đồng ý', quoteMsgId: quoted })).status).toBe(200);
    const rows = await inboundOf(t);
    expect(rows[2]!.payload.quote).toEqual({ owner_id: 'sim-mem-3', global_msg_id: quoted, msg: 'tin gốc' });
  });

  it('body sai ⇒ 400 invalid_body: su kien o DM, event la, mentionBot sai kieu, msgType la, text rong cho tin text; quote la ⇒ 400 quote_not_found', async () => {
    const t = thread();
    for (const bad of [
      { ...BASE, threadId: t, threadType: 'user', event: 'join' },
      { ...BASE, threadId: t, event: 'ban_hang' },
      { ...BASE, threadId: t, text: 'x', mentionBot: 'yes' },
      { ...BASE, threadId: t, text: 'x', msgType: 'chat.video' },
      { ...BASE, threadId: t, text: '' },
      { ...BASE, threadId: t, text: 'x', mentionUids: [1] },
    ]) {
      const res = await send('admin', bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect((await res.json()).error).toBe('invalid_body');
    }
    const res = await send('admin', { ...BASE, threadId: t, text: 'x', quoteMsgId: 'khong-co-tin-nay' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('quote_not_found');
    expect((await inboundOf(t)).length).toBe(0);
  });

  it('DATA_MODE ≠ sim ⇒ 404; chua dang nhap ⇒ 403; operator ⇒ 403', async () => {
    const body = { ...BASE, threadId: thread(), text: 'x' };
    delete process.env.DATA_MODE;
    expect((await send('admin', body)).status).toBe(404);
    process.env.DATA_MODE = 'sim';
    expect((await send(null, body)).status).toBe(403);
    expect((await send('operator', body)).status).toBe(403);
  });

  it('GET /api/dev/sim/thread ⇒ { messages, actions }: su kien, tin bot sau tick, hanh dong, tin da xoa gach ngang', async () => {
    const t = thread();
    await sql(`insert into zalo_groups (zalo_account_id, thread_id, name, enabled) values ('community',$1,'Nhóm thử',true)`, [t]);
    const a = await send('admin', { ...BASE, threadId: t, text: 'tin sẽ bị xoá' });
    expect(a.status).toBe(200);
    const msgId = (await inboundOf(t))[0]!.zalo_msg_id;
    // P03: tin den qua pipeline nen da nam trong dem (ingest) — danh dau xoa dong co san thay vi chen moi.
    const upd = await sql(
      `update group_messages set cli_msg_id = 'cli-x', deleted_at = now()
        where zalo_account_id = 'community' and thread_id = $1 and zalo_msg_id = $2 returning id`,
      [t, msgId]
    );
    expect(upd).toHaveLength(1);
    await send('admin', { ...BASE, threadId: t, senderUid: 'sim-owner', event: 'join', eventUids: ['sim-new-2'], eventNames: ['Người Mới'] });
    const actionId = await enqueue({
      zaloAccountId: 'community',
      threadId: t,
      threadType: 'group',
      kind: 'action',
      body: { action: 'delete_message', msgId },
    });
    await sql(`update outbox set status='sent', result='{"status":0}'::jsonb where id=$1`, [actionId]);
    const res = await simThread(
      new NextRequest(`http://localhost/api/dev/sim/thread?account=community&threadId=${t}`, { headers: await cookie('admin') })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      messages: Array<{ kind: string; text: string; deleted: boolean; msgId: string | null }>;
      actions: Array<{ action: string; status: string; result: unknown }>;
    };
    expect(data.messages.find((m) => m.msgId === msgId)).toMatchObject({ kind: 'in', text: 'tin sẽ bị xoá', deleted: true });
    expect(data.messages.some((m) => m.kind === 'event' && m.text.includes('join'))).toBe(true);
    expect(data.actions).toEqual([expect.objectContaining({ action: 'delete_message', status: 'sent', result: { status: 0 } })]);
    await sql(`delete from group_messages where thread_id=$1`, [t]);
    await sql(`delete from zalo_groups where thread_id=$1`, [t]);
    await sql(`update outbox set status='cancelled' where thread_id=$1 and status='queued'`, [t]);
  });
});

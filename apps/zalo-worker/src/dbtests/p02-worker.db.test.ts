// apps/zalo-worker/src/dbtests/p02-worker.db.test.ts — nghiem thu may giai
// doan 1 (SPEC-P02 §8, §9.5) voi zca-js GIA (0 mang). Can DB da migrate +
// seed + seed-sim (`npm run test:db` o root lam truoc).

import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, enqueue, sql } from '@lenqclaw/core';
import { AccountSession } from '../account-session.js';
import { AccountPacer } from '../pacer.js';
import { PACER_DEFAULTS, type PacerConfig } from '../config.js';
import { decryptSession, encryptSession } from '../crypto.js';
import { ZaloAuthError, ZaloNetworkError, ZaloRateLimitError } from '../client.js';
import { seededRng, verifySendLog } from '../pacer-policy.js';
import { saveSessionCas, loadAccount } from '../store.js';
import { FakeZaloClient, fakeMessage, type FakeSession } from '../testing/fake-client.js';

const KEY = randomBytes(32);
const FAST: PacerConfig = { ...PACER_DEFAULTS };
const SECRET = { cookie: [{ key: 'zpw_sek', value: 'COOKIE-SECRET-VALUE' }], imei: 'IMEI-SECRET-VALUE', userAgent: 'UA/1' };

/** `enqueue` tra id bigserial (pg tra chuoi) — chuan hoa ve number cho so sanh. */
async function enqueueId(...args: Parameters<typeof enqueue>): Promise<number> {
  return Number(await enqueue(...args));
}

function uid(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function resetAccount(): Promise<void> {
  await sql(
    `update zalo_accounts set session_enc = null, session_state = 'logged_out', login_requested_at = null,
       qr_data_url = null, qr_expires_at = null, updated_at = now() where id = 'community'`
  );
  // Tach test: tin cu cua tai khoan khong con 'queued' de pacer khong gui nham.
  await sql(`update outbox set status = 'cancelled' where zalo_account_id = 'community' and status in ('queued','sending')`);
}

async function connectedSession(client = new FakeZaloClient(), cfg: PacerConfig = FAST, sleeps: number[] = []) {
  await sql(`update zalo_accounts set session_enc = $1, updated_at = now() where id = 'community'`, [
    encryptSession(SECRET, KEY, 'community'),
  ]);
  const s = new AccountSession('community', client, KEY, cfg, {
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    rng: () => 0,
  });
  await s.start();
  return { s, client, fake: client.last };
}

async function alertsSince(kind: string, since: string): Promise<number> {
  const r = await sql<{ c: number }>(
    `select count(*)::int as c from audit_log where action = 'zalo.alert' and target = 'community'
       and data->>'kind' = $1 and created_at >= $2::timestamptz`,
    [kind, since]
  );
  return r[0]!.c;
}

async function dbNow(): Promise<string> {
  return (await sql<{ n: string }>(`select clock_timestamp()::text as n`))[0]!.n;
}

beforeEach(async () => {
  await resetAccount();
});

afterAll(async () => {
  await resetAccount();
  await closeDb();
});

describe('luong vao (§3, §8, §9.1)', () => {
  it('tin trung 3 lan ⇒ 1 dong inbound_events', async () => {
    const { s, fake } = await connectedSession();
    const m = fakeMessage({ threadId: uid('u'), content: 'xin chào' });
    fake.emitMessage(m);
    fake.emitMessage(m);
    fake.emitMessage(m);
    await s.idle();
    const r = await sql<{ c: number }>(
      `select count(*)::int as c from inbound_events where zalo_account_id='community' and zalo_msg_id=$1`,
      [m.msgId]
    );
    expect(r[0]!.c).toBe(1);
    await s.stop();
  });

  it('tin anh ⇒ noi dung thay the, payload giu du lieu goc, cho runner xu ly', async () => {
    const { s, fake } = await connectedSession();
    const m = fakeMessage({ threadId: uid('u'), msgType: 'chat.photo', content: { href: 'https://f/a.jpg' } });
    fake.emitMessage(m);
    await s.idle();
    const r = await sql<{ payload: Record<string, unknown>; processed_at: string | null; is_self: boolean }>(
      `select payload, processed_at, is_self from inbound_events where zalo_account_id='community' and zalo_msg_id=$1`,
      [m.msgId]
    );
    expect(r[0]!.payload.text).toBe('[thành viên gửi ảnh — chưa hỗ trợ]');
    expect((r[0]!.payload.raw as Record<string, unknown>).msgType).toBe('chat.photo');
    expect(r[0]!.processed_at).toBeNull();
    expect(r[0]!.is_self).toBe(false);
    await s.stop();
  });

  it('tin nhom ⇒ luu inbound_events (thread_type=group), khong hen "da xem" (P02 ke hoach 02)', async () => {
    const { s, fake } = await connectedSession();
    const m = fakeMessage({ threadId: uid('g'), threadType: 'group' });
    fake.emitMessage(m);
    await s.idle();
    const r = await sql<{ thread_type: string }>(`select thread_type from inbound_events where zalo_msg_id=$1`, [m.msgId]);
    expect(r.map((x) => x.thread_type)).toEqual(['group']);
    await s.stop();
  });

  it('"da xem" chi hen cho nguoi da nhan dien, tre 2–6 s', async () => {
    const { s, fake } = await connectedSession();
    const known = uid('known');
    const unknownUid = uid('stranger');
    await sql(`insert into account_owners (zalo_account_id, zalo_uid, label) values ('community',$1,'test')`, [known]);
    fake.emitMessage(fakeMessage({ threadId: known, senderUid: known }));
    fake.emitMessage(fakeMessage({ threadId: unknownUid, senderUid: unknownUid }));
    await s.idle();
    const rows = await sql<{ thread_id: string; delay_ms: number }>(
      `select thread_id, extract(epoch from (not_before - created_at)) * 1000 as delay_ms
       from outbox where zalo_account_id='community' and kind='seen' and thread_id = any($1) and status='queued'`,
      [[known, unknownUid]]
    );
    expect(rows.map((r) => r.thread_id)).toEqual([known]);
    expect(Number(rows[0]!.delay_ms)).toBeGreaterThanOrEqual(1900);
    expect(Number(rows[0]!.delay_ms)).toBeLessThanOrEqual(6100);
    await sql(`delete from account_owners where zalo_account_id='community' and zalo_uid=$1`, [known]);
    await s.stop();
  });

  it('is_self KHONG khop outbox ⇒ takeover 30 phut; tin bot ke tiep cua thread ⇒ cancelled (§8)', async () => {
    const { s, fake } = await connectedSession();
    const thread = uid('u');
    fake.emitMessage(fakeMessage({ threadId: thread, senderUid: 'community-self-uid', isSelf: true, content: 'Chị đợi em chút ạ' }));
    await s.idle();
    const conv = await sql<{ mins: number }>(
      `select extract(epoch from (human_takeover_until - now())) / 60 as mins from conversations
       where zalo_account_id='community' and thread_id=$1`,
      [thread]
    );
    expect(Number(conv[0]!.mins)).toBeGreaterThan(29);
    expect(Number(conv[0]!.mins)).toBeLessThanOrEqual(30.1);
    const ie = await sql<{ processed_at: string | null; payload: Record<string, unknown> }>(
      `select processed_at, payload from inbound_events where zalo_account_id='community' and thread_id=$1`,
      [thread]
    );
    expect(ie[0]!.processed_at).not.toBeNull(); // runner KHONG xu ly tin cua chinh tai khoan
    expect(ie[0]!.payload.staff_manual).toBe(true);

    const botId = await enqueueId({ zaloAccountId: 'community', threadId: thread, threadType: 'user', kind: 'text', body: { text: 'Bot trả lời' } });
    const secondId = await enqueueId({
      zaloAccountId: 'community',
      threadId: thread,
      threadType: 'user',
      kind: 'text',
      body: { text: 'Bot trả lời tiếp' },
    });
    const pacer = new AccountPacer('community', { ...FAST, typingMinMs: 0, typingMaxMs: 0 }, () => s.getSession(), { rng: () => 0 });
    await pacer.tick();
    const st = await sql<{ id: number; status: string }>(`select id::int as id, status from outbox where id = any($1) order by id`, [
      [botId, secondId],
    ]);
    expect(st.find((r) => r.id === botId)!.status).toBe('cancelled');
    expect(st.find((r) => r.id === secondId)!.status).toBe('cancelled'); // khong co ngoai le (P01)
    await s.stop();
  });

  it('is_self KHOP outbox.zalo_msg_id (tin bot vong ve) ⇒ khong takeover', async () => {
    const { s, fake } = await connectedSession();
    const thread = uid('u');
    const id = await enqueueId({ zaloAccountId: 'community', threadId: thread, threadType: 'user', kind: 'text', body: { text: 'Chào anh' } });
    await sql(`update outbox set status='sent', zalo_msg_id='echo-1-${thread}' where id=$1`, [id]);
    fake.emitMessage(fakeMessage({ threadId: thread, msgId: `echo-1-${thread}`, isSelf: true, content: 'Chào anh' }));
    await s.idle();
    const conv = await sql(`select 1 from conversations where zalo_account_id='community' and thread_id=$1 and human_takeover_until > now()`, [thread]);
    expect(conv.length).toBe(0);
    await s.stop();
  });

  it('takeover do handoff_to_staff (khong co tin nhan vien gui tay) ⇒ tin cho (BUSY_REPLY) VAN gui (§9.7 Q2)', async () => {
    const { s } = await connectedSession();
    const thread = uid('u');
    await sql(
      `insert into conversations (zalo_account_id, thread_id, human_takeover_until) values ('community',$1, now() + interval '30 minutes')`,
      [thread]
    );
    const id = await enqueueId({ zaloAccountId: 'community', threadId: thread, threadType: 'user', kind: 'text', body: { text: 'Xin lỗi, hệ thống đang bận, vui lòng thử lại sau ít phút.' } });
    const pacer = new AccountPacer('community', { ...FAST, typingMinMs: 0, typingMaxMs: 0 }, () => s.getSession(), { rng: () => 0 });
    await pacer.tick();
    const st = await sql<{ status: string }>(`select status from outbox where id=$1`, [id]);
    expect(st[0]!.status).toBe('sent');
    await s.stop();
  });
});

describe('watchdog (§6, §8)', () => {
  it('dong 3003 ⇒ kicked, bao dong, KHONG dang nhap lai, khong gui gi', async () => {
    const since = await dbNow();
    const { s, client, fake } = await connectedSession();
    const loginsBefore = client.cookieLogins;
    const thread = uid('u');
    const id = await enqueueId({ zaloAccountId: 'community', threadId: thread, threadType: 'user', kind: 'text', body: { text: 'Tin chờ' } });
    fake.emitClose(3003);
    await s.idle();
    expect((await loadAccount('community'))!.session_state).toBe('kicked');
    expect(await alertsSince('kicked', since)).toBe(1);
    expect(client.cookieLogins).toBe(loginsBefore);
    expect(fake.listening).toBe(false);
    const pacer = new AccountPacer('community', FAST, () => s.getSession());
    const r = await pacer.tick();
    expect(r.note).toBe('no_session');
    expect((await sql<{ status: string }>(`select status from outbox where id=$1`, [id]))[0]!.status).toBe('queued');
    await s.stop();
  });

  it('dong 3000 ⇒ kicked', async () => {
    const { s, fake } = await connectedSession();
    fake.emitClose(3000);
    await s.idle();
    expect((await loadAccount('community'))!.session_state).toBe('kicked');
    await s.stop();
  });

  it('1006 ⇒ reconnecting, dang nhap lai bang cookie ⇒ connected', async () => {
    const sleeps: number[] = [];
    const client = new FakeZaloClient();
    const { s, fake } = await connectedSession(client, FAST, sleeps);
    client.nextCookieLogin.push(new ZaloNetworkError('mang'), 'ok');
    fake.emitClose(1006);
    await s.idle();
    expect(sleeps).toEqual([5000, 10000]);
    expect((await loadAccount('community'))!.session_state).toBe('connected');
    expect(client.last).not.toBe(fake);
    expect(client.last.listening).toBe(true);
    await s.stop();
  });

  it('1006 lien tuc qua 10 lan ⇒ dead + bao dong', async () => {
    const since = await dbNow();
    const sleeps: number[] = [];
    const client = new FakeZaloClient();
    const { s, fake } = await connectedSession(client, FAST, sleeps);
    for (let i = 0; i < 12; i++) client.nextCookieLogin.push(new ZaloNetworkError('mang'));
    fake.emitClose(1006);
    await s.idle();
    expect(sleeps.length).toBe(10);
    expect((await loadAccount('community'))!.session_state).toBe('dead');
    expect(await alertsSince('dead', since)).toBe(1);
    await s.stop();
  });

  it('cookie het han khi dang nhap lai ⇒ logged_out + bao dong', async () => {
    const since = await dbNow();
    const client = new FakeZaloClient();
    const { s, fake } = await connectedSession(client);
    client.nextCookieLogin.push(new ZaloAuthError('het han'));
    fake.emitClose(1006);
    await s.idle();
    expect((await loadAccount('community'))!.session_state).toBe('logged_out');
    expect(await alertsSince('cookie_expired', since)).toBe(1);
    await s.stop();
  });

  it('im 20 phut trong gio 7–22h ⇒ API doc nhe; loi ⇒ nhu 1006', async () => {
    let now = new Date('2026-09-25T03:00:00Z').getTime(); // 10h ICT
    const client = new FakeZaloClient();
    await sql(`update zalo_accounts set session_enc = $1, updated_at = now() where id = 'community'`, [encryptSession(SECRET, KEY, 'community')]);
    const s = new AccountSession('community', client, KEY, FAST, { now: () => now, sleep: async () => {} });
    await s.start();
    expect(await s.watchdogTick()).toBe('skipped');
    now += 20 * 60_000;
    expect(await s.watchdogTick()).toBe('probe_ok');
    now += 20 * 60_000;
    client.last.probeError = new ZaloNetworkError('probe');
    const first = client.last;
    expect(await s.watchdogTick()).toBe('probe_failed');
    await s.idle();
    expect(client.last).not.toBe(first); // da dang nhap lai
    expect((await loadAccount('community'))!.session_state).toBe('connected');
    await s.stop();
  });

  it('session_enc sai khoa ⇒ logged_out + bao dong, khong goi login', async () => {
    const since = await dbNow();
    await sql(`update zalo_accounts set session_enc = $1, updated_at = now() where id = 'community'`, [
      encryptSession(SECRET, randomBytes(32), 'community'),
    ]);
    const client = new FakeZaloClient();
    const s = new AccountSession('community', client, KEY, FAST);
    await s.start();
    expect(client.cookieLogins).toBe(0);
    expect((await loadAccount('community'))!.session_state).toBe('logged_out');
    expect(await alertsSince('session_decrypt_failed', since)).toBe(1);
  });
});

describe('dang nhap QR + luu phien (§2, §9.2)', () => {
  it('login_requested_at ⇒ QR ghi vao zalo_accounts (TTL 3 phut) ⇒ quet ⇒ API doc OK ⇒ luu session_enc ma hoa, xoa qr_*, connected', async () => {
    const client = new FakeZaloClient();
    let qrSeen: { qr_data_url: string | null; ttl_s: number } | null = null;
    client.qrScript = {
      events: [{ type: 'qr', imageDataUrl: 'data:image/png;base64,UVJfVEVTVA==' }],
      result: 'ok',
      secret: SECRET,
    };
    const origLoginQR = client.loginQR.bind(client);
    client.loginQR = async (onEvent) => {
      const sess = await origLoginQR(async (e) => {
        await onEvent(e);
        const r = await sql<{ qr_data_url: string | null; ttl_s: number }>(
          `select qr_data_url, extract(epoch from (qr_expires_at - now())) as ttl_s from zalo_accounts where id='community'`
        );
        qrSeen = r[0]!;
      });
      return sess;
    };
    await sql(`update zalo_accounts set login_requested_at = now() where id='community'`);
    const s = new AccountSession('community', client, KEY, FAST);
    expect(await s.pollLoginRequest()).toBe(true);
    expect(qrSeen!.qr_data_url).toBe('data:image/png;base64,UVJfVEVTVA==');
    expect(Number(qrSeen!.ttl_s)).toBeGreaterThan(170);
    expect(Number(qrSeen!.ttl_s)).toBeLessThanOrEqual(180);
    const row = await sql<{ session_enc: Buffer; session_state: string; qr_data_url: string | null; login_requested_at: string | null }>(
      `select session_enc, session_state, qr_data_url, login_requested_at from zalo_accounts where id='community'`
    );
    expect(row[0]!.session_state).toBe('connected');
    expect(row[0]!.qr_data_url).toBeNull();
    expect(row[0]!.login_requested_at).toBeNull();
    expect(row[0]!.session_enc.toString('latin1')).not.toContain('COOKIE-SECRET-VALUE');
    expect(row[0]!.session_enc.toString('latin1')).not.toContain('IMEI-SECRET-VALUE');
    expect(decryptSession(row[0]!.session_enc, KEY, 'community')).toEqual(SECRET);
    expect(await s.pollLoginRequest()).toBe(false); // da nhan roi
    await s.stop();
  });

  it('API doc thu THAT BAI ⇒ KHONG luu session_enc, logged_out + bao dong', async () => {
    const since = await dbNow();
    const client = new FakeZaloClient();
    client.nextSessionProbeError = new ZaloAuthError('doc that bai');
    await sql(`update zalo_accounts set login_requested_at = now() where id='community'`);
    const s = new AccountSession('community', client, KEY, FAST);
    await s.pollLoginRequest();
    const row = await loadAccount('community');
    expect(row!.session_enc).toBeNull();
    expect(row!.session_state).toBe('logged_out');
    expect(await alertsSince('qr_probe_failed', since)).toBe(1);
  });

  it('CAS session_enc theo updated_at: ban cu ⇒ tu choi; syncCookies ghi khi cookie doi', async () => {
    const { s, fake } = await connectedSession();
    const before = (await loadAccount('community'))!.updated_at;
    // Ben khac ghi truoc ⇒ updated_at cu khong con khop.
    await sql(`update zalo_accounts set updated_at = clock_timestamp() where id='community'`);
    expect(await saveSessionCas('community', encryptSession(SECRET, KEY, 'community'), before)).toBeNull();
    const cur = (await loadAccount('community'))!.updated_at;
    const ok = await saveSessionCas('community', encryptSession(SECRET, KEY, 'community'), cur);
    expect(ok).not.toBeNull();
    expect(ok).not.toBe(cur);

    expect(await s.syncCookies()).toBe('unchanged');
    (fake as FakeSession).secret = { ...SECRET, cookie: [{ key: 'zpw_sek', value: 'REFRESHED' }] };
    expect(await s.syncCookies()).toBe('saved');
    const saved = decryptSession((await loadAccount('community'))!.session_enc!, KEY, 'community');
    expect(saved.cookie).toEqual([{ key: 'zpw_sek', value: 'REFRESHED' }]);
    await s.stop();
  });
});

describe('pacer tren DB (§5, §8)', () => {
  it('gia lap 50 tin / 20 nguoi qua outbox that + dong ho ao ⇒ gui het, 0 vi pham bang §5', async () => {
    let now = 0;
    const client = new FakeZaloClient('community-self-uid', () => now);
    const { s } = await connectedSession(client);
    const rng = seededRng(7);
    const threads = Array.from({ length: 20 }, () => uid('p'));
    const targets = [...threads];
    while (targets.length < 50) targets.push(threads[Math.floor(rng() * threads.length)]!);
    for (const t of targets) {
      await enqueue({ zaloAccountId: 'community', threadId: t, threadType: 'user', kind: 'text', body: { text: `Tin cho ${t}` } });
    }
    const pacer = new AccountPacer('community', FAST, () => s.getSession(), { now: () => now, rng: seededRng(11) });
    const fake = client.last;
    for (let i = 0; i < 3600 && fake.sent.filter((x) => x.kind === 'text').length < 50; i++) {
      await pacer.tick();
      now += FAST.tickMs;
    }
    const texts = fake.sent.filter((x) => x.kind === 'text');
    expect(texts.length).toBe(50);
    expect(verifySendLog(texts.map((x) => ({ at: x.at, threadId: x.threadId })), FAST)).toEqual([]);
    // moi tin text co "dang go" dung truoc
    const typings = fake.sent.filter((x) => x.kind === 'typing').length;
    expect(typings).toBeGreaterThanOrEqual(50);
    await s.stop();
  }, 120_000);

  it('tin dai ⇒ tach <= 1800 ky tu, moi doan mot dong outbox, gui dung thu tu', async () => {
    let now = 0;
    const client = new FakeZaloClient('community-self-uid', () => now);
    const { s } = await connectedSession(client);
    const thread = uid('long');
    const long = 'Anh chị vui lòng kiểm tra van tổng. '.repeat(120);
    const id = await enqueueId({ zaloAccountId: 'community', threadId: thread, threadType: 'user', kind: 'text', body: { text: long } });
    const pacer = new AccountPacer('community', FAST, () => s.getSession(), { now: () => now, rng: () => 0 });
    for (let i = 0; i < 120; i++) {
      await pacer.tick();
      now += 1000;
    }
    const rows = await sql<{ id: number; status: string; len: number }>(
      `select id::int as id, status, char_length(body->>'text') as len from outbox
       where zalo_account_id='community' and thread_id=$1 and kind='text' order by coalesce((body->>'split_of')::bigint, id), coalesce((body->>'part')::int,0)`,
      [thread]
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0]!.id).toBe(id);
    for (const r of rows) {
      expect(r.len).toBeLessThanOrEqual(1800);
      expect(r.status).toBe('sent');
    }
    const sent = client.last.sent.filter((x) => x.kind === 'text').map((x) => x.text).join(' ');
    expect(sent.replace(/\s+/g, ' ').trim()).toBe(long.replace(/\s+/g, ' ').trim());
    await s.stop();
  });

  it('khong tra msgId ⇒ tin giu queued, lui 30 phut, bao dong rate_limited', async () => {
    const since = await dbNow();
    let now = 0;
    const client = new FakeZaloClient('community-self-uid', () => now);
    const { s } = await connectedSession(client);
    const thread = uid('rl');
    const id = await enqueueId({ zaloAccountId: 'community', threadId: thread, threadType: 'user', kind: 'text', body: { text: 'Xin chào' } });
    client.last.nextSend.push('no_msg_id');
    const pacer = new AccountPacer('community', { ...FAST, typingMinMs: 0, typingMaxMs: 0 }, () => s.getSession(), { now: () => now });
    await pacer.tick();
    expect((await sql<{ status: string }>(`select status from outbox where id=$1`, [id]))[0]!.status).toBe('queued');
    expect(await alertsSince('rate_limited', since)).toBe(1);
    now += 29 * 60_000;
    expect((await pacer.tick()).note).toBe('backoff');
    now += 60_000;
    await pacer.tick();
    expect((await sql<{ status: string }>(`select status from outbox where id=$1`, [id]))[0]!.status).toBe('sent');
    await s.stop();
  });

  it('loi ma 221 ⇒ lui nhu tren', async () => {
    const client = new FakeZaloClient();
    const { s } = await connectedSession(client);
    const id = await enqueueId({ zaloAccountId: 'community', threadId: uid('rl'), threadType: 'user', kind: 'text', body: { text: 'A' } });
    client.last.nextSend.push(new ZaloRateLimitError('221'));
    const pacer = new AccountPacer('community', { ...FAST, typingMinMs: 0, typingMaxMs: 0 }, () => s.getSession());
    await pacer.tick();
    expect((await sql<{ status: string }>(`select status from outbox where id=$1`, [id]))[0]!.status).toBe('queued');
    expect(pacer.policy.isBackingOff(Date.now())).toBe(true);
    await s.stop();
  });

  it('tin vao nhom chua khai trong zalo_groups ⇒ cancelled (group_unknown), KHONG gui (P02 ke hoach 02 §5)', async () => {
    const { s, fake } = await connectedSession();
    const id = await enqueueId({ zaloAccountId: 'community', threadId: uid('g'), threadType: 'group', kind: 'text', body: { text: 'A' } });
    const pacer = new AccountPacer('community', FAST, () => s.getSession());
    await pacer.tick();
    const row = await sql<{ status: string; reason: string }>(`select status, body->>'cancel_reason' as reason from outbox where id=$1`, [id]);
    expect(row[0]).toEqual({ status: 'cancelled', reason: 'group_unknown' });
    expect(fake.sent.filter((x) => x.kind === 'text')).toEqual([]);
    await s.stop();
  });
});

describe('dang xuat + trang thai QR (§9.8, G18/G19)', () => {
  it('logout_requested_at ⇒ dung listener, khong con gui/nhan, session_enc null, logged_out', async () => {
    const { s, fake } = await connectedSession();
    const thread = uid('u');
    await sql(`update zalo_accounts set logout_requested_at = now() where id='community'`);
    expect(await s.pollLogoutRequest()).toBe(true);
    expect(fake.listening).toBe(false);
    const row = await loadAccount('community');
    expect(row!.session_enc).toBeNull();
    // Tin vao sau khi da dang xuat: listener da ngat nen phat tin (goi thang handler)
    // khong con lam thay doi DB — mo phong "khong con nhan" bang cach kiem listening=false.
    fake.emitMessage(fakeMessage({ threadId: thread }));
    await s.idle();
    const ie = await sql(`select 1 from inbound_events where zalo_account_id='community' and thread_id=$1`, [thread]);
    expect(ie.length).toBe(0);
    // Pacer khong con phien (getSession() tra null khi khong connected) ⇒ khong gui.
    const id = await enqueueId({ zaloAccountId: 'community', threadId: thread, threadType: 'user', kind: 'text', body: { text: 'A' } });
    const pacer = new AccountPacer('community', FAST, () => s.getSession());
    const r = await pacer.tick();
    expect(r.note).toBe('no_session');
    expect((await sql<{ status: string }>(`select status from outbox where id=$1`, [id]))[0]!.status).toBe('queued');
    await s.stop();
  });

  it('khong co logout_requested_at ⇒ pollLogoutRequest tra false, khong doi gi', async () => {
    const { s } = await connectedSession();
    expect(await s.pollLogoutRequest()).toBe(false);
    expect((await loadAccount('community'))!.session_state).toBe('connected');
    await s.stop();
  });

  it('chuoi su kien QR qr→scanned→expired ⇒ qr_state dung tung buoc, KHONG tu xin QR moi (§9.8 vung cam)', async () => {
    const client = new FakeZaloClient();
    client.qrScript = {
      events: [
        { type: 'qr', imageDataUrl: 'data:image/png;base64,UVI=' },
        { type: 'scanned' },
        { type: 'expired' },
      ],
      result: new ZaloAuthError('het han, khong xac nhan'),
    };
    await sql(`update zalo_accounts set login_requested_at = now() where id='community'`);
    const seen: Array<string | null> = [];
    const origLoginQR = client.loginQR.bind(client);
    client.loginQR = async (onEvent) => {
      return origLoginQR(async (e) => {
        await onEvent(e);
        seen.push((await sql<{ qr_state: string | null }>(`select qr_state from zalo_accounts where id='community'`))[0]!.qr_state);
      });
    };
    const s = new AccountSession('community', client, KEY, FAST);
    expect(await s.pollLoginRequest()).toBe(true);
    expect(seen).toEqual(['waiting_scan', 'scanned', 'expired']);
    // Loi (het han) ⇒ luong QR ket thuc, khong tu goi loginQR lan nua (chi 1 lan qrLogins).
    expect(client.qrLogins).toBe(1);
    const row = await loadAccount('community');
    expect(row!.session_state).toBe('logged_out');
    await s.stop();
  });

  it('su kien declined ⇒ qr_state="declined"', async () => {
    const client = new FakeZaloClient();
    client.qrScript = {
      events: [{ type: 'qr', imageDataUrl: 'data:image/png;base64,UVI=' }, { type: 'declined' }],
      result: new ZaloAuthError('tu choi tren dien thoai'),
    };
    await sql(`update zalo_accounts set login_requested_at = now() where id='community'`);
    const s = new AccountSession('community', client, KEY, FAST);
    await s.pollLoginRequest();
    const row = await sql<{ qr_state: string | null; session_state: string }>(
      `select qr_state, session_state from zalo_accounts where id='community'`
    );
    expect(row[0]!.qr_state).toBe('declined');
    expect(row[0]!.session_state).toBe('logged_out');
    await s.stop();
  });

  it('dang nhap QR xong ⇒ qr_state null (session_enc test kia da phu waiting_scan/scanned)', async () => {
    const client = new FakeZaloClient();
    client.qrScript = {
      events: [{ type: 'qr', imageDataUrl: 'data:image/png;base64,UVI=' }, { type: 'scanned' }],
      result: 'ok',
      secret: SECRET,
    };
    await sql(`update zalo_accounts set login_requested_at = now() where id='community'`);
    const s = new AccountSession('community', client, KEY, FAST);
    await s.pollLoginRequest();
    const row = await sql<{ qr_state: string | null; session_state: string }>(
      `select qr_state, session_state from zalo_accounts where id='community'`
    );
    expect(row[0]!.qr_state).toBeNull();
    expect(row[0]!.session_state).toBe('connected');
    await s.stop();
  });
});

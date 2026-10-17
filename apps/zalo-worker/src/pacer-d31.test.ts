// SPEC-D31 §7.1 (P03b-A): pacer uu tien tin tra loi (T8), typing tuoi (T7), picked_at / hold_reason (§7.1.4).
// Store GIA (vi.mock, 0 DB) + FakeSession (0 mang). Dong ho ao do test dieu khien.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PACER_DEFAULTS, readPacerConfig, type PacerConfig } from './config.js';
import { PacerPolicy, pickNext, type QueueItem } from './pacer-policy.js';
import { FakeSession } from './testing/fake-client.js';

interface Row {
  id: number;
  thread_id: string;
  thread_type: 'user' | 'group';
  kind: 'text' | 'typing';
  body: Record<string, unknown>;
  attempts: number;
  staff_takeover: boolean;
  created_ms: number;
  inbound_event_id: number | null;
  status: string;
}

const st = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  picks: [] as Array<{ id: number; hold: string | null }>,
  nextId: 1,
}));

vi.mock('./store.js', () => {
  const find = (id: number) => st.rows.find((r) => r.id === id)! as unknown as Row;
  return {
    fetchDue: async () => st.rows.filter((r) => (r as unknown as Row).status === 'queued').map((r) => ({ ...r })),
    cancelRow: async () => undefined,
    markSending: async (id: number, hold?: string | null) => {
      const r = find(id);
      if (r.status !== 'queued') return false;
      r.status = 'sending';
      st.picks.push({ id, hold: hold ?? null });
      return true;
    },
    markSent: async (id: number) => {
      find(id).status = 'sent';
    },
    markFailed: async (id: number) => {
      find(id).status = 'failed';
    },
    requeue: async (id: number) => {
      find(id).status = 'queued';
    },
    splitRow: async () => undefined,
    recentSent: async () => [],
    alert: async () => undefined,
    groupGate: async () => ({ budget: 20, enabled: true }),
    groupTextSentLastHour: async () => 0,
    linkSentGroupMessage: async () => 1,
    auditPacer: async () => undefined,
  };
});

import { AccountPacer } from './pacer.js';

const CFG: PacerConfig = { ...PACER_DEFAULTS };
const T0 = 1_800_000_000_000;

function add(over: Partial<Row> & Pick<Row, 'kind' | 'body'>): Row {
  const r: Row = {
    id: st.nextId++,
    thread_id: 'g1',
    thread_type: 'group',
    attempts: 0,
    staff_takeover: false,
    created_ms: T0,
    inbound_event_id: null,
    status: 'queued',
    ...over,
  };
  st.rows.push(r as unknown as Record<string, unknown>);
  return r;
}

function setup(cfg: PacerConfig = CFG) {
  let now = T0;
  const fake = new FakeSession('bot-uid', { cookie: [], imei: 'i', userAgent: 'u' }, () => now);
  const pacer = new AccountPacer('community', cfg, () => fake, { now: () => now, rng: () => 0 });
  return { fake, pacer, advance: (ms: number) => (now += ms) };
}

beforeEach(() => {
  st.rows = [];
  st.picks = [];
  st.nextId = 1;
});

describe('cau hinh D31', () => {
  it('PACER_TICK_MS mac dinh 250, PACER_TYPING_FRESH_MS mac dinh 8000, env ghi de', () => {
    expect([PACER_DEFAULTS.tickMs, PACER_DEFAULTS.typingFreshMs]).toEqual([250, 8000]);
    expect(readPacerConfig({ PACER_TYPING_FRESH_MS: '5000' }).typingFreshMs).toBe(5000);
  });
  it('khong noi gap/ngan sach D09 (§7.2)', () => {
    expect([PACER_DEFAULTS.groupGapMs, PACER_DEFAULTS.groupJitterMs, PACER_DEFAULTS.maxPerMinute]).toEqual([8000, 3000, 10]);
  });
});

describe('pickNext — uu tien tin tra loi (T8)', () => {
  const q = (...items: Array<[number, string, boolean]>): QueueItem[] =>
    items.map(([id, threadId, reply]) => ({ id, threadId, isGroup: true, reply }));

  it('thread co hang DAU la tin tra loi duoc xet truoc, du hang cua thread khac xep truoc', () => {
    const p = new PacerPolicy(CFG, () => 0);
    expect(pickNext(0, q([1, 'A', false], [2, 'B', true]), p)?.id).toBe(2);
  });
  it('khong co tin tra loi ⇒ giu thu tu cu (hang xep truoc thang)', () => {
    const p = new PacerPolicy(CFG, () => 0);
    expect(pickNext(0, q([1, 'A', false], [2, 'B', false]), p)?.id).toBe(1);
  });
  it('trong mot thread giu thu tu: hang dau KHONG phai tra loi ⇒ tin tra loi sau no khong vuot', () => {
    const p = new PacerPolicy(CFG, () => 0);
    // thread A: A1 (chu dong) roi A2 (tra loi); thread B: B1 (chu dong). A khong duoc coi la "thread tra loi".
    expect(pickNext(0, q([1, 'A', false], [2, 'A', true], [3, 'B', false]), p)?.id).toBe(1);
    // chi con A: van la A1 truoc A2.
    expect(pickNext(0, q([1, 'A', false], [2, 'A', true]), p)?.id).toBe(1);
  });
  it('thread tra loi bi gap giu ⇒ roi xuong thread con lai; KHONG nuoi gap (check giu nguyen)', () => {
    const p = new PacerPolicy(CFG, () => 0);
    p.record(0, 'B', true); // B vua duoc gui — gap nhom 8 s
    const blocked: string[] = [];
    const got = pickNext(1000, q([1, 'A', false], [2, 'B', true]), p, (i, r) => blocked.push(`${i.threadId}:${r}`));
    expect(got?.id).toBe(1);
    expect(blocked).toEqual(['B:group_gap']);
  });
});

describe('pacer — typing tuoi (T7) va hold_reason (§7.1.4)', () => {
  it('typing som da gui <= 8 s ⇒ tin text khong gui typing lap va khong tre (typing dai 1–3 s van bo qua)', async () => {
    const { fake, pacer, advance } = setup();
    add({ kind: 'typing', body: { typing: true }, inbound_event_id: 7 });
    await pacer.tick(); // gui "dang go" som (pha su kien)
    expect(fake.sent.map((s) => s.kind)).toEqual(['typing']);
    advance(1500);
    add({ kind: 'text', body: { text: 'xin chào bạn' }, inbound_event_id: 7 });
    const r = await pacer.tick();
    expect(r.sentText).toBe(1); // gui NGAY trong tick nay
    expect(fake.sent.map((s) => s.kind)).toEqual(['typing', 'text']); // dung 1 typing
  });

  it('khong co typing som ⇒ van typing + tre (hanh vi cu); typing da cu > 8 s ⇒ typing lai', async () => {
    const { fake, pacer, advance } = setup();
    add({ kind: 'text', body: { text: 'tin 1' } });
    let r = await pacer.tick();
    expect(r.sentText).toBe(0); // dang tre "dang go"
    expect(fake.sent.map((s) => s.kind)).toEqual(['typing']);
    advance(4000);
    r = await pacer.tick();
    expect(r.sentText).toBe(1);
    // tin 2: 20 s sau (qua gap nhom + qua typingFreshMs)
    advance(20_000);
    add({ kind: 'text', body: { text: 'tin 2' } });
    await pacer.tick();
    expect(fake.sent.filter((s) => s.kind === 'typing').length).toBe(2);
  });

  it('typing cua tin vua gui >8 s truoc ⇒ khong con tuoi; <=8 s ⇒ tuoi (ranh gioi 8000)', async () => {
    const { fake, pacer, advance } = setup({ ...CFG, groupGapMs: 0, groupJitterMs: 0 });
    add({ kind: 'typing', body: { typing: true } });
    await pacer.tick();
    advance(8000);
    add({ kind: 'text', body: { text: 'dung 8 s' } });
    expect((await pacer.tick()).sentText).toBe(1); // 8000 <= 8000 ⇒ tuoi
    expect(fake.sent.filter((s) => s.kind === 'typing').length).toBe(1);
  });

  it('hold_reason = ly do DAU TIEN: bi group_gap giu roi gui ⇒ markSending(id, "group_gap"); khong bi giu ⇒ null', async () => {
    const { pacer, advance } = setup({ ...CFG, typingMinMs: 0, typingMaxMs: 0 });
    const a = add({ kind: 'text', body: { text: 'a' }, inbound_event_id: 1 });
    await pacer.tick();
    expect(st.picks).toEqual([{ id: a.id, hold: null }]);
    advance(1000);
    const b = add({ kind: 'text', body: { text: 'b' }, inbound_event_id: 2, created_ms: T0 + 1000 });
    await pacer.tick(); // gap nhom 8 s chua het ⇒ giu
    expect(st.picks.length).toBe(1);
    advance(9000);
    await pacer.tick(); // ·· vi rng=0 jitter 0 ⇒ gap 8000
    advance(3000);
    await pacer.tick();
    expect(st.picks.at(-1)).toEqual({ id: b.id, hold: 'group_gap' });
  });

  it('hold_reason la ly do DAU TIEN du ly do doi sau do (per_minute)', async () => {
    const { pacer, advance } = setup({ ...CFG, typingMinMs: 0, typingMaxMs: 0, maxPerMinute: 1, groupGapMs: 1000, groupJitterMs: 0 });
    add({ kind: 'text', body: { text: 'a' }, thread_id: 'g1' });
    await pacer.tick();
    advance(100);
    const b = add({ kind: 'text', body: { text: 'b' }, thread_id: 'g2' });
    await pacer.tick(); // g2 khong co gap, nhung per_minute (1/phut) chan
    advance(61_000);
    await pacer.tick();
    expect(st.picks.at(-1)).toEqual({ id: b.id, hold: 'per_minute' });
  });

  it('tin tra loi (inbound_event_id) cua thread khac duoc gui truoc tin chu dong du xep sau (T8)', async () => {
    const { fake, pacer } = setup({ ...CFG, typingMinMs: 0, typingMaxMs: 0 });
    add({ kind: 'text', body: { text: 'chu dong' }, thread_id: 'gA', inbound_event_id: null });
    add({ kind: 'text', body: { text: 'tra loi' }, thread_id: 'gB', inbound_event_id: 9 });
    await pacer.tick();
    const texts = fake.sent.filter((s) => s.kind === 'text');
    expect(texts.map((t) => t.text)).toEqual(['tra loi']);
  });
});

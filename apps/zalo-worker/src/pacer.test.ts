// SPEC-P02 §4–§5, §9 (ke hoach 02): pacer nhom + action voi store GIA (vi.mock, 0 DB)
// va FakeSession (0 mang). Dong ho ao `now` do test dieu khien.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PACER_DEFAULTS, type PacerConfig } from './config.js';
import { ZaloActionError, ZaloRateLimitError } from './client.js';
import { buildSplitBodies } from './pacer-policy.js';
import { FakeSession } from './testing/fake-client.js';

interface Row {
  id: number;
  thread_id: string;
  thread_type: 'user' | 'group';
  kind: 'text' | 'image' | 'typing' | 'seen' | 'action' | 'react';
  body: Record<string, unknown>;
  attempts: number;
  staff_takeover: boolean;
  created_ms: number;
  status: string;
  result?: unknown;
  msgId?: string | null;
  reason?: string;
}

const st = vi.hoisted(() => ({
  rows: [] as Row[],
  log: [] as Array<[string, ...unknown[]]>,
  budget: new Map<string, number | null>(),
  disabled: new Set<string>(),
  claimOk: true,
  used: new Map<string, number>(),
  nextId: 1,
}));

vi.mock('./store.js', async () => {
  const policy = await import('./pacer-policy.js');
  const find = (id: number) => st.rows.find((r) => r.id === id)!;
  return {
    fetchDue: async () => st.rows.filter((r) => r.status === 'queued').map((r) => ({ ...r })),
    cancelRow: async (id: number, reason: string) => {
      find(id).status = 'cancelled';
      find(id).reason = reason;
      st.log.push(['cancelRow', id, reason]);
    },
    markSending: async (id: number) => {
      const r = find(id);
      if (r.status !== 'queued') return false;
      r.status = 'sending';
      r.attempts++;
      return true;
    },
    markSent: async (id: number, msgId: string | null, result?: unknown) => {
      const r = find(id);
      r.status = 'sent';
      r.msgId = msgId;
      r.result = result;
      st.log.push(['markSent', id]);
    },
    markFailed: async (id: number, reason: string, result?: unknown) => {
      const r = find(id);
      r.status = 'failed';
      r.reason = reason;
      r.result = result;
      st.log.push(['markFailed', id, reason]);
    },
    requeue: async (id: number) => {
      find(id).status = 'queued';
      st.log.push(['requeue', id]);
    },
    splitRow: async (row: Row, parts: string[]) => {
      const bodies = policy.buildSplitBodies(row.id, row.body, parts);
      find(row.id).body = bodies[0]!;
      for (let i = 1; i < bodies.length; i++) {
        st.rows.push({ ...row, id: st.nextId++, body: bodies[i]!, status: 'queued', attempts: 0 });
      }
    },
    recentSent: async () => [],
    alert: async (_acc: string, kind: string, data: unknown) => {
      st.log.push(['alert', kind, data]);
    },
    groupGate: async (_acc: string, thread: string) =>
      st.budget.has(thread) && st.budget.get(thread) !== null
        ? { budget: st.budget.get(thread)!, enabled: !st.disabled.has(thread) }
        : null,
    claimApproval: async () => st.claimOk,
    releaseApproval: async () => {
      st.log.push(['releaseApproval']);
    },
    groupTextSentLastHour: async (_acc: string, thread: string) => st.used.get(thread) ?? 0,
    linkSentGroupMessage: async (outboxId: number, msgId: string) => {
      st.log.push(['link', outboxId, msgId]);
      return 1;
    },
    auditPacer: async (action: string, thread: string) => {
      st.log.push(['auditPacer', action, thread]);
    },
    auditAction: async (action: string, data: unknown) => {
      st.log.push(['auditAction', action, data]);
    },
    completeApproval: async (id: string, ok: boolean) => {
      st.log.push(['completeApproval', id, ok]);
      return true;
    },
    markBotNotAdmin: async (_acc: string, thread: string) => {
      st.log.push(['markBotNotAdmin', thread]);
    },
    applyGroupSync: async () => ({ botIsAdmin: true }),
  };
});

import { AccountPacer, buildOutboundText } from './pacer.js';

const CFG: PacerConfig = { ...PACER_DEFAULTS, typingMinMs: 0, typingMaxMs: 0 };
const T0 = 1_800_000_000_000;

function add(over: Partial<Row> & Pick<Row, 'kind' | 'body'>): Row {
  const r: Row = {
    id: st.nextId++,
    thread_id: 'g1',
    thread_type: 'group',
    attempts: 0,
    staff_takeover: false,
    created_ms: T0,
    status: 'queued',
    ...over,
  };
  st.rows.push(r);
  return r;
}

function setup(cfg: PacerConfig = CFG) {
  let now = T0;
  const fake = new FakeSession('bot-uid', { cookie: [], imei: 'i', userAgent: 'u' }, () => now);
  const pacer = new AccountPacer('community', cfg, () => fake, { now: () => now, rng: () => 0 });
  return { fake, pacer, advance: (ms: number) => (now += ms), clock: () => now };
}

const names = () => st.log.map((l) => l[0]);

beforeEach(() => {
  st.rows = [];
  st.log = [];
  st.budget = new Map([['g1', 20]]);
  st.disabled = new Set();
  st.claimOk = true;
  st.used = new Map();
  st.nextId = 1;
});

describe('text nhom (§4.3, §5)', () => {
  it('"dang go" (typing) di TRUOC text nhom, text gui vao thread nhom', async () => {
    const { fake, pacer } = setup();
    add({ kind: 'text', body: { text: 'Chào cả nhóm' } });
    const r = await pacer.tick();
    expect(r.sentText).toBe(1);
    expect(fake.sent.map((s) => [s.kind, s.threadType])).toEqual([
      ['typing', 'group'],
      ['text', 'group'],
    ]);
  });

  it('gui xong ⇒ linkSentGroupMessage(outboxId, msgId that) de doi "out-<id>"', async () => {
    const { fake, pacer } = setup();
    const row = add({ kind: 'text', body: { text: 'xin chào' } });
    await pacer.tick();
    const link = st.log.find((l) => l[0] === 'link')!;
    expect(link[1]).toBe(row.id);
    expect(String(link[2])).toMatch(/^fake-out-/);
    expect(fake.sent.filter((s) => s.kind === 'text').length).toBe(1);
  });

  it('tin dai 2 phan: CHI part 0 co quote; mention chi o phan chua no', async () => {
    const { fake, pacer, advance } = setup({ ...CFG, maxChars: 40 });
    const quote = { msgId: 'q1', cliMsgId: 'qc1', uidFrom: 'u-an', content: 'gốc', msgType: 'webchat', ts: '1', ttl: 0 };
    const text = `@An ${'a'.repeat(30)} ${'b'.repeat(30)}`;
    add({ kind: 'text', body: { text, quote, mentions: [{ uid: 'u-an', pos: 0, len: 3 }, { uid: 'u-b', pos: 40, len: 5 }] } });
    for (let i = 0; i < 4; i++) {
      await pacer.tick();
      advance(15_000); // qua groupGap (8 s) + jitter
    }
    const texts = fake.sent.filter((s) => s.kind === 'text');
    expect(texts.length).toBe(2);
    expect(texts[0]!.quote?.msgId).toBe('q1');
    expect(texts[1]!.quote).toBeUndefined();
    expect(texts[0]!.mentions).toEqual([{ uid: 'u-an', pos: 0, len: 3 }]); // mention o phan sau bi bo, khong bia
    expect(texts[1]!.mentions).toBeUndefined();
  });

  it('buildSplitBodies + buildOutboundText: part>0 khong mang quote du body co', () => {
    const quote = { msgId: 'q', cliMsgId: 'c', uidFrom: 'u', content: 'x', msgType: 'webchat', ts: '1', ttl: 0 };
    const bodies = buildSplitBodies(7, { text: 'abc def', quote }, ['abc', 'def']);
    expect(bodies.map((b) => b.part)).toEqual([0, 1]);
    const mk = (b: Record<string, unknown>) => ({ ...add({ kind: 'text', body: { ...b, quote } }) }); // ep quote vao part 1
    expect(buildOutboundText(mk(bodies[0]!)).quote?.msgId).toBe('q');
    expect(buildOutboundText(mk(bodies[1]!)).quote).toBeUndefined();
  });

  it('nhom khong co dong zalo_groups ⇒ cancelled(group_unknown) + audit, KHONG gui', async () => {
    const { fake, pacer } = setup();
    st.budget.delete('g1');
    const row = add({ kind: 'text', body: { text: 'x' } });
    const r = await pacer.tick();
    expect(row.status).toBe('cancelled');
    expect(row.reason).toBe('group_unknown');
    expect(r.cancelled).toBe(1);
    expect(st.log).toContainEqual(['auditPacer', 'pacer.group_unknown', 'g1']);
    expect(fake.sent).toEqual([]);
  });

  it('het ngan sach gio ⇒ giu queued, note group_budget; qua TTL ⇒ cancelled(budget_expired) + audit', async () => {
    const { fake, pacer, advance } = setup();
    st.budget.set('g1', 3);
    st.used.set('g1', 3);
    const row = add({ kind: 'text', body: { text: 'cho ngân sách' } });
    const r1 = await pacer.tick();
    expect(row.status).toBe('queued');
    expect(r1.note).toBe('group_budget');
    expect(fake.sent).toEqual([]);
    advance(31 * 60_000);
    const r2 = await pacer.tick();
    expect(row.status).toBe('cancelled');
    expect(row.reason).toBe('budget_expired');
    expect(r2.cancelled).toBe(1);
    expect(st.log).toContainEqual(['auditPacer', 'pacer.budget_expired', 'g1']);
  });

  it('con ngan sach (used < budget) ⇒ gui', async () => {
    const { fake, pacer } = setup();
    st.budget.set('g1', 3);
    st.used.set('g1', 2);
    add({ kind: 'text', body: { text: 'còn một suất' } });
    expect((await pacer.tick()).sentText).toBe(1);
    expect(fake.sent.some((s) => s.kind === 'text')).toBe(true);
  });

  it('nhom KHONG gui "da xem": hang seen nhom bi huy; DM van gui', async () => {
    const { fake, pacer } = setup();
    const seenGroup = add({ kind: 'seen', body: { seen: { uidFrom: 'u', msgId: 'm' } } });
    const seenDm = add({ kind: 'seen', thread_id: 'u-dm', thread_type: 'user', body: { seen: { uidFrom: 'u-dm', msgId: 'm' } } });
    await pacer.tick();
    expect(seenGroup.status).toBe('cancelled');
    expect(seenGroup.reason).toBe('seen_group_forbidden');
    expect(seenDm.status).toBe('sent');
    expect(fake.sent.filter((s) => s.kind === 'seen').length).toBe(1);
  });
});

describe('action trong pacer (§4.1, §4.2, §9)', () => {
  const del = { action: 'delete_message', msgId: 'm1', cliMsgId: 'c1', uidFrom: 'nguoi-gui', onlyMe: false };

  it('delete_message: gui, markSent+result, audit zalo.action (ok, khong noi dung), approvalId ⇒ completeApproval(true)', async () => {
    const { fake, pacer } = setup();
    const row = add({ kind: 'action', body: { ...del, approvalId: 'ap-1' } });
    const r = await pacer.tick();
    expect(r.sentActions).toBe(1);
    expect(row.status).toBe('sent');
    expect(row.result).toEqual({ status: 0 });
    expect(st.log).toContainEqual(['auditAction', 'zalo.action', { action: 'delete_message', thread: 'g1', ok: true, code: null }]);
    expect(st.log).toContainEqual(['completeApproval', 'ap-1', true]);
    expect(fake.actions[0]!.kind).toBe('deleteMessage');
  });

  it('thieu cliMsgId ⇒ failed(cli_msg_id_missing), 0 lan goi Zalo, audit zalo.action_failed', async () => {
    const { fake, pacer } = setup();
    const row = add({ kind: 'action', body: { action: 'delete_message', msgId: 'm1', uidFrom: 'u' } });
    await pacer.tick();
    expect(row.status).toBe('failed');
    expect(row.reason).toBe('cli_msg_id_missing');
    expect(fake.actions).toEqual([]);
    expect(names()).toContain('auditAction');
  });

  it('ZaloActionError 166 ⇒ failed, bot_is_admin=false, alert deputy_missing, result.error.code=166, approval failed', async () => {
    const { fake, pacer } = setup();
    fake.nextActionError = new ZaloActionError('thieu quyen', 166);
    const row = add({ kind: 'action', body: { action: 'remove_member', uid: 'u9', approvalId: 'ap-2' } });
    await pacer.tick();
    expect(row.status).toBe('failed');
    expect(row.result).toMatchObject({ error: { name: 'ZaloActionError', code: 166 } });
    expect(st.log).toContainEqual(['markBotNotAdmin', 'g1']);
    expect(st.log.find((l) => l[0] === 'alert')?.[1]).toBe('deputy_missing');
    expect(st.log).toContainEqual(['auditAction', 'zalo.action_failed', { action: 'remove_member', thread: 'g1', ok: false, code: 166 }]);
    expect(st.log).toContainEqual(['completeApproval', 'ap-2', false]);
  });

  it('review_join tra 166 cho uid ⇒ failed + bot_is_admin=false; 170/178 ⇒ sent', async () => {
    const { fake, pacer } = setup();
    fake.reviewResult = { u1: 166 };
    const bad = add({ kind: 'action', body: { action: 'review_join', uids: ['u1'], approve: true } });
    await pacer.tick();
    expect(bad.status).toBe('failed');
    expect(st.log).toContainEqual(['markBotNotAdmin', 'g1']);
    fake.reviewResult = { u2: 170, u3: 178 };
    const ok = add({ kind: 'action', body: { action: 'review_join', uids: ['u2', 'u3'], approve: false } });
    await pacer.tick();
    expect(ok.status).toBe('sent');
    expect(ok.result).toEqual({ u2: 170, u3: 178 });
  });

  it('ma 221 khi thi hanh ⇒ requeue + backoff tai khoan (khong failed)', async () => {
    const { fake, pacer } = setup();
    fake.nextActionError = new ZaloRateLimitError('221');
    const row = add({ kind: 'action', body: { action: 'lock_poll', pollId: 1 } });
    await pacer.tick();
    expect(row.status).toBe('queued');
    expect(pacer.policy.isBackingOff(T0)).toBe(true);
  });

  it('thu tu tick: action TRUOC text; toi da actionsPerTick (3) action/tick', async () => {
    const { fake, pacer } = setup();
    const text = add({ kind: 'text', body: { text: 'sau action' } });
    const acts = [1, 2, 3, 4, 5].map(() => add({ kind: 'action', body: { action: 'lock_poll', pollId: 1 } }));
    const r = await pacer.tick();
    expect(r.sentActions).toBe(3);
    expect(acts.filter((a) => a.status === 'sent').length).toBe(3);
    expect(acts.filter((a) => a.status === 'queued').length).toBe(2);
    expect(text.status).toBe('sent');
    const order = st.log.filter((l) => l[0] === 'markSent').map((l) => l[1]);
    expect(order.indexOf(text.id)).toBeGreaterThan(order.indexOf(acts[2]!.id));
    expect(fake.actions.length).toBe(3);
  });

  it('action tinh maxPerMinute: maxPerMinute=2 ⇒ chi 2 action/phut, note per_minute', async () => {
    const { pacer } = setup({ ...CFG, maxPerMinute: 2 });
    const acts = [1, 2, 3].map(() => add({ kind: 'action', body: { action: 'lock_poll', pollId: 1 } }));
    const r = await pacer.tick();
    expect(r.sentActions).toBe(2);
    expect(r.note).toBe('per_minute');
    expect(acts[2]!.status).toBe('queued');
  });

  it('hanh dong cam / la ⇒ failed(unknown_action), khong goi Zalo', async () => {
    const { fake, pacer } = setup();
    const row = add({ kind: 'action', body: { action: 'frobnicate' } });
    await pacer.tick();
    expect(row.status).toBe('failed');
    expect(row.reason).toBe('unknown_action');
    expect(fake.actions).toEqual([]);
  });

  it('react: thi hanh qua addReaction; that bai ⇒ failed im lang (khong alert)', async () => {
    const { fake, pacer } = setup();
    fake.nextActionError = new ZaloActionError('x', 100);
    const row = add({ kind: 'react', body: { react: { icon: '/-heart', msgId: 'm', cliMsgId: 'c' } } });
    await pacer.tick();
    expect(row.status).toBe('failed');
    expect(names()).not.toContain('alert');
    expect(fake.actions[0]!.kind).toBe('addReaction');
  });
});

describe('D29.1 — kick/block can the duyet hop le (lop chan cuoi; kiem CAS nam o store)', () => {
  it('claimApproval tu choi (khong approvalId / the sai) ⇒ failed(approval_invalid), 0 lan goi Zalo, audit zalo.action_blocked', async () => {
    const { fake, pacer } = setup();
    st.claimOk = false;
    const noId = add({ kind: 'action', body: { action: 'remove_member', uid: 'u9' } });
    const bad = add({ kind: 'action', body: { action: 'block_member', uid: 'u9', approvalId: 'ap-sai' } });
    await pacer.tick();
    expect(noId.status).toBe('failed');
    expect(noId.reason).toBe('approval_invalid');
    expect(bad.status).toBe('failed');
    expect(bad.reason).toBe('approval_invalid');
    expect(fake.actions).toEqual([]);
    expect(st.log.filter((l) => l[0] === 'auditAction' && l[1] === 'zalo.action_blocked').length).toBe(2);
    expect(st.log.some((l) => l[0] === 'completeApproval')).toBe(false);
  });
});

describe('D29.8 — gap nhom tren DUONG GUI THAT (pacer.sendText ghi record(isGroup=true))', () => {
  it('2 text cung nhom: tick +4 s ⇒ chua gui tin 2 (gap nhom 8 s); +12 s ⇒ gui', async () => {
    const { fake, pacer, advance } = setup();
    add({ kind: 'text', body: { text: 'một' } });
    expect((await pacer.tick()).sentText).toBe(1);
    const second = add({ kind: 'text', body: { text: 'hai' } });
    advance(4_000);
    const r = await pacer.tick();
    expect(r.sentText).toBe(0);
    expect(second.status).toBe('queued');
    advance(8_000);
    expect((await pacer.tick()).sentText).toBe(1);
    expect(fake.sent.filter((x) => x.kind === 'text').length).toBe(2);
  });
});

describe('D29.8 — log khong chua noi dung tin', () => {
  it('gui text + chay action ⇒ KHONG dong log nao (stdout) chua noi dung', async () => {
    const secret = 'NOI-DUNG-TIN-BI-MAT-98765';
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(((c: string | Uint8Array) => {
      chunks.push(String(c));
      return true;
    }) as typeof process.stdout.write);
    try {
      const { pacer } = setup();
      add({ kind: 'text', body: { text: secret } });
      add({ kind: 'action', body: { action: 'create_note', title: secret } });
      await pacer.tick();
    } finally {
      spy.mockRestore();
    }
    expect(chunks.length).toBeGreaterThan(0); // co log thi moi co y nghia
    expect(chunks.join('')).not.toContain(secret);
  });
});

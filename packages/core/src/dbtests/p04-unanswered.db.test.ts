// p04-unanswered.db.test.ts — SPEC-P04 §8 hang 4: cau hoi bo trong (5 ca `db-checks (b)` q1–q5 + ca mo rong) + `runTimers`
// ⇒ dung 1 `sys-%` event, lan 2 ⇒ 0; luot `group_unanswered` di het duong do thi (model gia). Hang ghi truc tiep bang SQL
// (khong qua `ingest`, vi `ingest` tu danh dau answered_at) voi `received_at` tinh theo `NOW` tham so.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '../adapters/db.js';
import { readCommunityConfig } from '../services/community-config.js';
import { findUnansweredQuestions, pickUnanswered } from '../services/knowledge.js';
import { runTimers } from '../services/timers.js';
import {
  ACCOUNT,
  auditCount,
  count,
  drainStale,
  FN,
  focusId,
  installFakeModel,
  mkGroup,
  modelCalls,
  outboxFor,
  resetScripts,
  runAll,
  script,
  T,
  tracesFor,
  TOOLS,
  uninstallFakeModel,
  uniq,
} from './p03-helpers.js';

const cfg = readCommunityConfig();
const NOW = new Date();
const minAgo = (m: number): Date => new Date(NOW.getTime() - m * 60_000);

interface MsgArgs {
  thread: string;
  msgId: string;
  sender: string;
  at: Date;
  question?: boolean;
  self?: boolean;
  deleted?: boolean;
  quote?: string;
  mentions?: string[];
  answeredAt?: Date | null;
}
async function msg(a: MsgArgs): Promise<number> {
  const r = await sql<{ id: number }>(
    `insert into group_messages (zalo_account_id, thread_id, zalo_msg_id, sender_uid, sender_name, is_self, text, mentions, quote_msg_id,
                                 is_question, answered_at, deleted_at, received_at)
     values ($1,$2,$3,$4,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12) returning id::int as id`,
    [
      ACCOUNT,
      a.thread,
      a.msgId,
      a.sender,
      a.self ?? false,
      a.question ? 'Làm sao để tạo bình chọn trong nhóm?' : 'tin thuong',
      JSON.stringify((a.mentions ?? []).map((uid) => ({ uid, pos: 0, len: 1 }))),
      a.quote ?? null,
      a.question ?? false,
      a.answeredAt ?? null,
      a.deleted ? NOW : null,
      a.at,
    ]
  );
  return r[0]!.id;
}

const sysEvents = (thread: string): Promise<number> =>
  count(`select 1 from inbound_events where thread_id = $1 and zalo_msg_id like 'sys-%' and payload->>'event' = 'unanswered_question'`, [thread]);

beforeAll(async () => {
  installFakeModel();
  await drainStale();
  // cau hoi con sot cua CHINH test nay (lan chay truoc) khong duoc chiem han ngach UNANSWERED_MAX_PER_TICK
  await sql(`update group_messages set answered_at = now() where zalo_msg_id like 'p04-%' and thread_id like 'p03g-%' and is_question and answered_at is null`);
});
afterEach(() => {
  resetScripts();
});
afterAll(async () => {
  uninstallFakeModel();
  await sql(`delete from group_messages where thread_id like 'p03g-%' and zalo_msg_id like 'p04-%'`);
  await closeDb();
});

describe('findUnansweredQuestions / pickUnanswered (SPEC-P04 §5)', () => {
  it('5 ca db-checks (b): chi q1 bo trong; runTimers ⇒ dung 1 su kien sys-%; lan 2 ⇒ 0 (da answered_at)', async () => {
    const g = await mkGroup({ mode: 'ambient', moderation: true });
    const p = (s: string): string => `p04-${s}-${g}`;
    const q1 = await msg({ thread: g, msgId: p('q1'), sender: 'u-q1', at: minAgo(30), question: true });
    // q2: co tin sau do QUOTE no
    await msg({ thread: g, msgId: p('q2'), sender: 'u-q2', at: minAgo(30), question: true });
    await msg({ thread: g, msgId: p('r2'), sender: 'u-other', at: minAgo(25), quote: p('q2') });
    // q3: co tin sau do MENTION nguoi hoi
    await msg({ thread: g, msgId: p('q3'), sender: 'u-q3', at: minAgo(30), question: true });
    await msg({ thread: g, msgId: p('r3'), sender: 'u-other', at: minAgo(25), mentions: ['u-q3'] });
    // q4: moi (< UNANSWERED_AFTER_MIN)
    await msg({ thread: g, msgId: p('q4'), sender: 'u-q4', at: minAgo(2), question: true });
    // q5: bot (is_self) tra loi bang cach quote
    await msg({ thread: g, msgId: p('q5'), sender: 'u-q5', at: minAgo(30), question: true });
    await msg({ thread: g, msgId: p('r5'), sender: 'bot', at: minAgo(28), self: true, quote: p('q5') });

    const found = await findUnansweredQuestions(NOW, cfg);
    expect(found.filter((f) => f.threadId === g)).toEqual([{ groupMessageId: q1, threadId: g }]);

    const rep = await runTimers(NOW, cfg);
    expect(rep.steps.pickUnanswered).toBeGreaterThanOrEqual(1);
    expect(await sysEvents(g)).toBe(1);
    const ev = await sql<{ payload: { kind: string; event: string; data: { threadId: string; groupMessageId: number } } }>(
      `select payload from inbound_events where thread_id = $1 and zalo_msg_id like 'sys-%'`,
      [g]
    );
    expect(ev[0]!.payload).toEqual({ kind: 'system', event: 'unanswered_question', data: { threadId: g, groupMessageId: q1 } });
    const marked = await sql<{ zalo_msg_id: string; answered: boolean }>(
      `select zalo_msg_id, answered_at is not null as answered from group_messages where thread_id = $1 and is_question order by id`,
      [g]
    );
    expect(marked.find((m) => m.zalo_msg_id === p('q1'))!.answered).toBe(true);
    expect(await auditCount('unanswered.picked', g)).toBe(1);

    // lan 2 ⇒ khong nhat lai
    await runTimers(new Date(NOW.getTime() + 1000), cfg);
    expect(await sysEvents(g)).toBe(1);
    expect((await findUnansweredQuestions(NOW, cfg)).filter((f) => f.threadId === g)).toEqual([]);
  });

  it('dieu kien bien: qua UNANSWERED_MAX_AGE_HOURS, da xoa, is_self, da answered_at, nhom mention / tat ⇒ khong nhat; tin tra loi cua CHINH nguoi hoi / da xoa khong tinh la tra loi', async () => {
    const g = await mkGroup({ mode: 'ambient', moderation: true });
    const gMention = await mkGroup({ mode: 'mention', moderation: true });
    const gOff = await mkGroup({ mode: 'ambient', enabled: false, moderation: true });
    const p = (s: string): string => `p04-${s}-${g}`;
    await msg({ thread: g, msgId: p('old'), sender: 'u-old', at: minAgo(cfg.unansweredMaxAgeHours * 60 + 5), question: true });
    await msg({ thread: g, msgId: p('del'), sender: 'u-del', at: minAgo(30), question: true, deleted: true });
    await msg({ thread: g, msgId: p('self'), sender: 'bot', at: minAgo(30), question: true, self: true });
    await msg({ thread: g, msgId: p('done'), sender: 'u-done', at: minAgo(30), question: true, answeredAt: minAgo(20) });
    // nguoi hoi tu quote chinh minh ⇒ khong phai cau tra loi ⇒ VAN bo trong
    const own = await msg({ thread: g, msgId: p('own'), sender: 'u-own', at: minAgo(30), question: true });
    await msg({ thread: g, msgId: p('ownr'), sender: 'u-own', at: minAgo(20), quote: p('own'), mentions: ['u-own'] });
    // tin tra loi da bi xoa ⇒ khong tinh
    const delr = await msg({ thread: g, msgId: p('delq'), sender: 'u-delq', at: minAgo(30), question: true });
    await msg({ thread: g, msgId: p('delr'), sender: 'u-other', at: minAgo(20), quote: p('delq'), deleted: true });
    await msg({ thread: gMention, msgId: `p04-m-${gMention}`, sender: 'u-m', at: minAgo(30), question: true });
    await msg({ thread: gOff, msgId: `p04-o-${gOff}`, sender: 'u-o', at: minAgo(30), question: true });

    const found = (await findUnansweredQuestions(NOW, cfg, { onlyThreads: [g, gMention, gOff] })).filter((f) => [g, gMention, gOff].includes(f.threadId));
    expect(found.map((f) => f.groupMessageId).sort((a, b) => a - b)).toEqual([own, delr].sort((a, b) => a - b));
  });

  it('UNANSWERED_MAX_PER_TICK gioi han so cau/tick (cu nhat truoc); thread dang chay (busyThreads) bi bo qua, KHONG bi danh dau', async () => {
    const g = await mkGroup({ mode: 'ambient', moderation: true });
    const p = (s: string): string => `p04-${s}-${g}`;
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) ids.push(await msg({ thread: g, msgId: p(`m${i}`), sender: `u-m${i}`, at: minAgo(60 - i), question: true }));
    const one = readCommunityConfig({ ...process.env, UNANSWERED_MAX_PER_TICK: '1' });
    expect((await findUnansweredQuestions(NOW, one, { onlyThreads: [g] })).filter((f) => f.threadId === g).map((f) => f.groupMessageId)).toEqual([ids[0]]);

    expect(await pickUnanswered(NOW, cfg, new Set([g]), [g])).toBe(0);
    expect(await sysEvents(g)).toBe(0);
    expect(await count(`select 1 from group_messages where thread_id = $1 and answered_at is not null`, [g])).toBe(0);

    await pickUnanswered(NOW, one, new Set(), [g]);
    expect(await sysEvents(g)).toBe(1);
    expect(await count(`select 1 from group_messages where thread_id = $1 and answered_at is not null`, [g])).toBe(1);
  });

  it('hai tien trinh nhat cung luc ⇒ moi cau chi sinh DUNG 1 su kien', async () => {
    const g = await mkGroup({ mode: 'ambient', moderation: true });
    await msg({ thread: g, msgId: `p04-race-${g}`, sender: 'u-race', at: minAgo(30), question: true });
    await Promise.all([pickUnanswered(NOW, cfg, new Set(), [g]), pickUnanswered(NOW, cfg, new Set(), [g])]);
    expect(await sysEvents(g)).toBe(1);
  });
});

describe('luot group_unanswered qua do thi (model gia)', () => {
  it('nhat ⇒ sys event ⇒ turn: search_knowledge ⇒ send_group_message quote cau hoi (kind group_unanswered, trace ghi, khong triage)', async () => {
    const g = await mkGroup({ mode: 'ambient', moderation: true, members: [{ uid: 'u-ask', name: 'An' }] });
    const q = await msg({ thread: g, msgId: `p04-gq-${g}`, sender: 'u-ask', at: minAgo(30), question: true });
    script(g, [
      TOOLS({ name: 'search_knowledge', args: { query: 'agent chatbot' } }),
      FN((body) => TOOLS({ name: 'send_group_message', args: { text: 'Agent khác chatbot kịch bản (theo tài liệu).', reply_to_msg_id: focusId(body) } })),
      T('xong'),
    ]);
    await pickUnanswered(NOW, cfg, new Set(), [g]);
    await runAll();
    const traces = await tracesFor(g);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ kind: 'group_unanswered', outcome: 'replied' });
    expect(traces[0]!.tools).toContain('search_knowledge');
    const out = await outboxFor(g);
    expect(out).toHaveLength(1);
    expect(out[0]!.body.quote?.msgId).toBe(`p04-gq-${g}`);
    expect(modelCalls(g)).toBeGreaterThanOrEqual(2);
    expect(await sql(`select 1 from group_messages where id = $1 and answered_at is not null`, [q])).toHaveLength(1);
    await runTimers(new Date(NOW.getTime() + 2000), cfg);
    expect(await sysEvents(g)).toBe(1);
  });

  it('khong co can cu ⇒ agent im (khong gui tin), van ghi trace silent', async () => {
    const g = await mkGroup({ mode: 'ambient', moderation: true });
    await msg({ thread: g, msgId: `p04-sq-${g}`, sender: uniq('u'), at: minAgo(30), question: true });
    script(g, [T('im lang')]);
    await pickUnanswered(NOW, cfg, new Set(), [g]);
    await runAll();
    expect(await outboxFor(g)).toHaveLength(0);
    const t = await tracesFor(g);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: 'group_unanswered', outcome: 'silent' });
  });
});

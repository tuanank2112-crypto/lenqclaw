// packages/core/src/dbtests/p03-model-down.db.test.ts — SPEC-P03-Resident-Agent.md
// §11.12 (Đ31, handoff H15): nhanh loi `callModel` trong `runResidentTurn`
// PHAI tra loi kem hotline BQL + `handoff_to_staff('model_unavailable')`,
// khong con roi vao im lang "Em dang ban, se tra loi trong vai phut." cu.
//
// N9: file nay tu dung du lieu cua no (dung lai cu dan sim da seed, tu
// `resetOpen`/don sach truoc moi ca) — chay dung khi dao thu tu file.
//
// H06 §3.0: MODEL_PROVIDER=gemini la mac dinh (Đ18) nhung scripted client o
// day chi mo phong nhanh anthropic — dat tuong minh, khong phu thuoc mac
// dinh toan cuc.
process.env.MODEL_PROVIDER = 'anthropic';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { sql, closeDb } from '../adapters/db.js';
import { setModelClientForTest, setTriageClientForTest, type ModelClientLike } from '../adapters/model.js';
import { simInbound, processInbound } from '../sim/sim-transport.js';
import { residentHandler } from '../agent/resident-agent.js';
import { bqlHotline, MODEL_DOWN_REPLY } from '../agent/pii.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';
import { ModelUnavailableError } from '../domain/errors.js';

const log = (...a: unknown[]) => console.log('MODELDOWN|', ...a);

const txt = (text: string): Message['content'][number] => ({ type: 'text', text, citations: null });
function msg(content: Message['content'], stop: Message['stop_reason'] = 'end_turn'): Message {
  return {
    id: `msg_${randomUUID().slice(0, 8)}`, content, model: 'fake', role: 'assistant', stop_reason: stop, stop_sequence: null, type: 'message',
    usage: { cache_creation: null, cache_creation_input_tokens: null, cache_read_input_tokens: null, input_tokens: 1, output_tokens: 1, server_tool_use: null, service_tier: null },
  };
}

/** Client gia dem so lan goi va luon nem loi (dung cho ca (c): tin ke tiep
 * KHONG duoc goi model — dem so lan goi TRUOC/SAU de kiem chung). */
function throwingClient(makeErr: () => Error): { client: ModelClientLike; readonly calls: number } {
  const state = { calls: 0 };
  const client: ModelClientLike = {
    messages: {
      async create() {
        state.calls++;
        throw makeErr();
      },
    },
  };
  return {
    client,
    get calls(): number {
      return state.calls;
    },
  };
}

async function rid(uid: string): Promise<string> {
  const r = await sql<{ party_id: string }>(`select party_id from zalo_identities where zalo_account_id='bql' and zalo_uid=$1`, [uid]);
  return r[0]!.party_id;
}
async function resetOpen(uid: string): Promise<void> {
  const id = await rid(uid);
  await sql(`update jobs set status='cancelled' where resident_id=$1 and status in ('drafting','awaiting_consent')`, [id]);
  await sql(`update tickets set status='closed' where resident_id=$1 and kind='emergency' and status='open'`, [id]);
  await sql(`update conversations set human_takeover_until=null where id in (
    select c.id from conversations c
    join zalo_identities z on z.party_id = c.party_id
    where z.zalo_account_id='bql' and z.zalo_uid=$1
  )`, [uid]);
}
async function send(uid: string, threadId: string, text: string): Promise<void> {
  // `processInbound` nhan MOT hang doi TOAN CUC ("update ... order by id
  // limit 1"), khong loc theo file — file khac (vd P6b/P6c cua
  // p03-regression.db.test.ts, cung mau nay) co the con so unprocessed neu
  // chay dong thoi/loi giua duong. Don sach TRUOC khi bom tin cua CHINH
  // minh de `processInbound` ngay sau chac chan nhan dung tin nay (N9).
  await sql(`update inbound_events set processed_at = now() where processed_at is null`);
  await simInbound({ account: 'bql', threadId, threadType: 'user', senderUid: uid, text, msgId: `md-${randomUUID()}` });
  await processInbound(residentHandler);
}
async function outboxTexts(threadId: string): Promise<string[]> {
  const r = await sql<{ t: string }>(`select body->>'text' as t from outbox where thread_id=$1 order by id`, [threadId]);
  return r.map((x) => x.t);
}
async function handoffCount(uid: string, reason: string): Promise<number> {
  const id = await rid(uid);
  const r = await sql<{ c: number }>(
    `select count(*)::int c from audit_log
     where action='tool.handoff_to_staff' and actor_id=$1 and data->>'reason'=$2`,
    [id, reason]
  );
  return r[0]!.c;
}
async function modelErrorAuditCount(uid: string): Promise<number> {
  const id = await rid(uid);
  const r = await sql<{ c: number }>(
    `select count(*)::int c from audit_log where action='agent.model_error' and actor_id=$1`,
    [id]
  );
  return r[0]!.c;
}
const th = (p: string) => `md-${p}-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  process.env.DATA_MODE = 'sim';
  await runMigrations();
  await runSeed();
  await runSeedSim();
  await sql(`update tickets set status = 'closed' where kind = 'emergency' and status = 'open'`);
});

afterAll(async () => {
  setModelClientForTest(null);
  setTriageClientForTest(null);
  await closeDb();
});
beforeEach(() => {
  setModelClientForTest(null);
  setTriageClientForTest(null);
});

describe('§11.12 (Đ31) đường lùi khi model sập', () => {
  it('(a) callModel ném ModelUnavailableError => outbox đúng 1 tin chứa hotline BQL, 1 handoff model_unavailable, audit có', async () => {
    const uid = 'sim-res-1';
    await resetOpen(uid);
    const t = th('a');
    setModelClientForTest({
      messages: {
        async create() {
          throw new ModelUnavailableError();
        },
      },
    });
    const before = await handoffCount(uid, 'model_unavailable');
    await send(uid, t, 'Máy lạnh nhà em hỏng nặng quá');
    const after = await handoffCount(uid, 'model_unavailable');
    const out = await outboxTexts(t);
    const expected = MODEL_DOWN_REPLY(bqlHotline());
    log(`(a) outbox=${JSON.stringify(out)} handoff_moi=${after - before}`);
    expect(out).toEqual([expected]);
    expect(out[0]).toContain(bqlHotline());
    expect(after - before).toBe(1);
  });

  it('(b) callModel ném lỗi KHÁC ModelUnavailableError => vẫn hotline + handoff model_unavailable, THÊM audit agent.model_error', async () => {
    const uid = 'sim-res-2';
    await resetOpen(uid);
    const t = th('b');
    setModelClientForTest({
      messages: {
        async create() {
          throw new Error('loi mang tam thoi, khong lien quan ModelUnavailableError');
        },
      },
    });
    const handoffBefore = await handoffCount(uid, 'model_unavailable');
    const errBefore = await modelErrorAuditCount(uid);
    await send(uid, t, 'Bồn cầu nhà em bị tắc');
    const handoffAfter = await handoffCount(uid, 'model_unavailable');
    const errAfter = await modelErrorAuditCount(uid);
    const out = await outboxTexts(t);
    const expected = MODEL_DOWN_REPLY(bqlHotline());
    log(`(b) outbox=${JSON.stringify(out)} handoff_moi=${handoffAfter - handoffBefore} model_error_moi=${errAfter - errBefore}`);
    expect(out).toEqual([expected]);
    expect(handoffAfter - handoffBefore).toBe(1);
    expect(errAfter - errBefore).toBe(1);
  });

  it('(c) tin kế tiếp trong thời gian im lặng (handoff vừa đặt) => 0 lần gọi model, 0 handoff mới', async () => {
    const uid = 'sim-res-3';
    await resetOpen(uid);
    const t = th('c');
    const fake = throwingClient(() => new ModelUnavailableError());
    setModelClientForTest(fake.client);
    await send(uid, t, 'Nhà em bị dột trần');
    expect(fake.calls).toBe(1);
    const handoffAfterFirst = await handoffCount(uid, 'model_unavailable');

    // Tin ke tiep, CUNG cu dan, con trong han human_takeover_until vua dat.
    const callsBefore = fake.calls;
    const outBefore = await outboxTexts(t);
    await send(uid, t, 'Anh chị ơi có ai không ạ');
    const callsAfter = fake.calls;
    const handoffAfterSecond = await handoffCount(uid, 'model_unavailable');
    const outAfter = await outboxTexts(t);
    log(`(c) calls_truoc=${callsBefore} calls_sau=${callsAfter} handoff_1=${handoffAfterFirst} handoff_2=${handoffAfterSecond} outbox_them=${outAfter.length - outBefore.length}`);
    expect(callsAfter).toBe(callsBefore); // 0 lan goi model THEM
    expect(handoffAfterSecond).toBe(handoffAfterFirst); // 0 handoff moi
    expect(outAfter.length).toBe(outBefore.length); // im lang, khong tra loi them
  });

  it('(d) triage null nhưng agent chính trả lời bình thường => KHÔNG hotline, KHÔNG handoff', async () => {
    const uid = 'sim-res-1';
    await resetOpen(uid);
    const t = th('d');
    // setTriageClientForTest(null) (mac dinh o beforeEach) + testClient da
    // dat cho route 'diagnose' => `triageMessage` gap ModelUnavailableError
    // rieng cua route triage, tu bat va tra `null` (dung ngu nghia §11.10) —
    // khong anh huong nhanh agent chinh o day.
    setModelClientForTest({
      messages: {
        async create() {
          return msg([txt('Da ghi nhan, em se ho tro anh/chi ngay.')]);
        },
      },
    });
    const handoffBefore = await handoffCount(uid, 'model_unavailable');
    await send(uid, t, 'Bong den phong khach bi chay, nho anh chi sua giup');
    const handoffAfter = await handoffCount(uid, 'model_unavailable');
    const out = await outboxTexts(t);
    const hotline = bqlHotline();
    log(`(d) outbox=${JSON.stringify(out)} handoff_moi=${handoffAfter - handoffBefore}`);
    expect(handoffAfter - handoffBefore).toBe(0);
    expect(out.some((o) => o.includes(hotline))).toBe(false);
    expect(out.some((o) => o === MODEL_DOWN_REPLY(hotline))).toBe(false);
  });
});

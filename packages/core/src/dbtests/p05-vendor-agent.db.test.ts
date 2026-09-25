// packages/core/src/dbtests/p05-vendor-agent.db.test.ts — SPEC-P05-Dispatch.md
// §10.5/§10.6 (Đ27): client kich ban qua VONG AGENT THAT (mau p03.db.test.ts)
// — claim thang/thua, pending, no_slot, quote vuot khung, OK sau han =>
// HoldExpiredError, su kien he thong => dispatch, nhom nhieu 0 lan goi model,
// text tu do khong vao nhom. Model GIA (khong mang) — triage KHONG duoc cau
// hinh rieng nen luon `null` (`callTriageModel` nem `ModelUnavailableError`
// khi thieu `setTriageClientForTest` — `triageVendorMessage` bat va tra
// `null`), driving hoan toan qua luoi tat dinh (agent/vendor-intent.ts).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Message, MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { sql, closeDb } from '../adapters/db.js';
import { setModelClientForTest, type ModelClientLike } from '../adapters/model.js';
import { simInbound, processInbound, echoHandler } from '../sim/sim-transport.js';
import { routeInboundEvent } from '../agent/resident-agent.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';
import { claimJob, confirmAssignment, publishJobToGroup } from '../services/dispatch.js';
import { requestAccess, decideAccessRequest } from '../services/access.js';
import { generateJobCode } from '../agent/job-code.js';
import {
  getToaABuildingId,
  createApartment,
  createResident,
  createVendor,
  createJob,
  outboxTexts,
  linkVendorIdentity,
} from './p05-helpers.js';

process.env.MODEL_PROVIDER = 'anthropic';

const CATEGORY = 'ong_nuoc_ro';
const TRADE_GROUP = 'dien_nuoc' as const;
const GROUP_THREAD = 'sim-market-dien_nuoc';

beforeAll(async () => {
  process.env.DATA_MODE = 'sim';
  await runMigrations();
  await runSeed();
  await runSeedSim();
  // File khac (p05-*.db.test.ts, p02-*) chay TRUOC (fileParallelism:false,
  // cung mot DB `test:db`) co the de lai dong `inbound_events` chua xu ly —
  // `processInbound` luon lay dong CU NHAT chua xu ly, khong phai dong vua
  // insert; xa het hang doi TRUOC khi test file nay bat dau de moi
  // `processInbound()` cua file nay chac chan nhat dung tin cua chinh no.
  let drained = 0;
  for (;;) {
    const r = await processInbound(echoHandler);
    if (r.processed === 0) break;
    drained++;
    if (drained > 10_000) throw new Error('p05-vendor-agent: hang doi inbound_events qua lon, dung xa.');
  }
});

afterAll(async () => {
  await closeDb();
});

beforeEach(() => {
  setModelClientForTest(null);
});

interface CapturedCall {
  messages: MessageParam[];
}

function makeScriptedClient(responses: Message[]): { client: ModelClientLike; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  let i = 0;
  const client: ModelClientLike = {
    messages: {
      async create(body) {
        // Sao chep NONG mang (khong sao chep tung phan tu) — `messages` goc
        // con bi vong lap trong `runVendorTurn` `.push()` them phan tu SAU
        // lan goi nay; khong sao chep se khien MOI ban ghi trong `calls` deu
        // tro chung mot mang va cung "thay doi" o TRANG THAI CUOI CUNG khi
        // doc lai sau khi ca luot ket thuc (bay loi da gap khi viet test nay).
        calls.push({ messages: [...body.messages] });
        if (i >= responses.length) throw new Error(`Scripted client het kich ban o lan goi thu ${i + 1}.`);
        return responses[i++]!;
      },
    },
  };
  return { client, calls };
}

function makePoisonClient(): ModelClientLike {
  return {
    messages: {
      async create() {
        throw new Error('KHONG duoc goi model o ca nay.');
      },
    },
  };
}

/** Lay output JSON (da parse) cua tool_result CUOI CUNG trong mot lan goi
 * da ghi lai — tranh so sanh chuoi tren JSON long nhau (`JSON.stringify` hai
 * lop khien dau `"` bi escape thanh `\"`, so chuoi truc tiep se sai). */
function lastToolResultOutput(call: CapturedCall): unknown {
  const last = call.messages[call.messages.length - 1]!;
  const content = last.content;
  if (!Array.isArray(content)) throw new Error('lastToolResultOutput: khong phai mang tool_result.');
  const block = content.find((b) => (b as { type?: string }).type === 'tool_result') as { content: string } | undefined;
  if (!block) throw new Error('lastToolResultOutput: khong tim thay tool_result.');
  return JSON.parse(block.content);
}

let staffIdCache: string | null = null;
async function getStaffId(): Promise<string> {
  if (staffIdCache) return staffIdCache;
  const rows = await sql<{ id: string }>(
    `insert into staff_users (email, password_hash, role) values ($1,'x','bql_admin') returning id`,
    [`p05va-staff-${randomUUID().slice(0, 8)}@test.local`]
  );
  staffIdCache = rows[0]!.id;
  return staffIdCache;
}

let msgIdSeq = 0;
function nextMsgId(): string {
  msgIdSeq++;
  return `p05va-${msgIdSeq}-${randomUUID().slice(0, 6)}`;
}

function textBlock(text: string): Message['content'][number] {
  return { type: 'text', text, citations: null };
}
function toolUseBlock(id: string, name: string, input: unknown): Message['content'][number] {
  return { type: 'tool_use', id, name, input };
}
function fakeMessage(content: Message['content'], stopReason: Message['stop_reason'] = 'end_turn'): Message {
  return {
    id: `msg_${randomUUID().slice(0, 8)}`,
    content,
    model: 'claude-opus-5',
    role: 'assistant',
    stop_reason: stopReason,
    stop_sequence: null,
    type: 'message',
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      input_tokens: 100,
      output_tokens: 50,
      server_tool_use: null,
      service_tier: null,
    },
  };
}

async function sendGroup(vendorUid: string, text: string, threadId: string = GROUP_THREAD): Promise<void> {
  await simInbound({ account: 'market', threadId, threadType: 'group', senderUid: vendorUid, text, msgId: nextMsgId() });
  await processInbound(routeInboundEvent);
}

async function sendDm(vendorUid: string, text: string): Promise<void> {
  await simInbound({ account: 'market', threadId: vendorUid, threadType: 'user', senderUid: vendorUid, text, msgId: nextMsgId() });
  await processInbound(routeInboundEvent);
}

async function publishFreshJob(): Promise<{ jobId: string; jobCode: string }> {
  const buildingId = await getToaABuildingId();
  const apartmentId = await createApartment(buildingId);
  const residentId = await createResident();
  const now = Date.now();
  const job = await createJob({
    buildingId,
    apartmentId,
    residentId,
    categoryCode: CATEGORY,
    mode: 'quote',
    status: 'case_open',
    windowStart: new Date(now + 2 * 3_600_000),
    windowEnd: new Date(now + 5 * 3_600_000),
  });
  // agent/vendor-intent.ts::JOB_CODE_RE (§10.4.2) loai I/L/O/0/1 khoi bang
  // chu — ma `createJob` sinh tu UUID hex co the co '0'/'1' nen KHONG luon
  // hop le voi luoi tat dinh; dat lai bang mot ma dung ALPHABET that.
  const code = generateJobCode();
  await sql(`update jobs set code = $1 where id = $2`, [code, job.id]);
  await publishJobToGroup({ jobId: job.id, actor: { type: 'agent', id: residentId }, now: new Date() });
  return { jobId: job.id, jobCode: code };
}

describe('vendorHandler — pending/suspended (0 model)', () => {
  it('tho pending nhan "chao" => VENDOR_PENDING_REPLY qua DM, 0 lan goi model', async () => {
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, status: 'pending' });
    const vendorUid = await linkVendorIdentity(vendorId);
    setModelClientForTest(makePoisonClient());

    await sendDm(vendorUid, 'chào');

    const texts = await outboxTexts('market', vendorUid);
    expect(texts.some((t) => t.includes('chờ Ban quản lý duyệt'))).toBe(true);
  });
});

describe('vendorHandler — nhom nhieu (§10.4.3, 0 model)', () => {
  it('tin nhom KHONG co ma/khong dang giu/nhom khong co cuoc dang => im, 0 lan goi model', async () => {
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const vendorUid = await linkVendorIdentity(vendorId);
    setModelClientForTest(makePoisonClient());
    // Thread RIENG (khong co dong vendor_groups) — GROUP_THREAD dung chung
    // voi cac file p05-*.db.test.ts khac (cung TOA-A × dien_nuoc) co the
    // con cuoc `published` sot lai, lam sai lech dieu kien (c) cua §10.4.3.
    const isolatedThread = `p05va-group-${randomUUID().slice(0, 8)}`;

    const before = await outboxTexts('market', isolatedThread);
    await sendGroup(vendorUid, 'chào cả nhà', isolatedThread);
    const after = await outboxTexts('market', isolatedThread);
    expect(after.length).toBe(before.length);

    const auditRows = await sql<{ n: number }>(
      `select count(*)::int as n from audit_log where action = 'vendor.group_noise' and actor_id = $1`,
      [vendorId]
    );
    expect(auditRows[0]!.n).toBeGreaterThan(0);
  });
});

describe('vendorHandler — claim (thang) qua agent + luoi tat dinh, text KHONG vao nhom', () => {
  it('"nhan <ma>" trong nhom => held, DM co HOLD_DM, nhom CHI co tin cua dich vu (khong co text tu do cua agent)', async () => {
    const { jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const vendorUid = await linkVendorIdentity(vendorId);

    const toolCallId = `tu_${randomUUID().slice(0, 8)}`;
    const { client } = makeScriptedClient([
      fakeMessage([toolUseBlock(toolCallId, 'claim_job', { job_code: jobCode })], 'tool_use'),
      fakeMessage([textBlock('Đã giữ cuốc cho bạn.')]),
    ]);
    setModelClientForTest(client);

    await sendGroup(vendorUid, `em nhận ${jobCode}`);

    const jobRows = await sql<{ status: string; assigned_vendor_id: string }>(`select status, assigned_vendor_id from jobs where code = $1`, [jobCode]);
    expect(jobRows[0]!.status).toBe('held');
    expect(jobRows[0]!.assigned_vendor_id).toBe(vendorId);

    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.some((t) => t.includes('OK để xác nhận'))).toBe(true); // HOLD_DM (dich vu)
    expect(dmTexts.some((t) => t.includes('Đã giữ cuốc cho bạn'))).toBe(true); // text agent (DM)

    const groupTexts = await outboxTexts('market', GROUP_THREAD);
    expect(groupTexts.some((t) => t.includes('đã có thợ nhận'))).toBe(true); // CLAIM_WON_GROUP (dich vu)
    expect(groupTexts.some((t) => t.includes('Đã giữ cuốc cho bạn'))).toBe(false); // agent KHONG duoc phat text tu do vao nhom
  });

  it('tho thu hai cung ma (da thua o service) => tool tra { won:false }', async () => {
    const { jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const v1 = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await claimJob({ jobCode, vendorId: v1, now: new Date(), source: 'agent' });

    const v2 = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const v2Uid = await linkVendorIdentity(v2);

    const toolCallId = `tu_${randomUUID().slice(0, 8)}`;
    const { client, calls } = makeScriptedClient([
      fakeMessage([toolUseBlock(toolCallId, 'claim_job', { job_code: jobCode })], 'tool_use'),
      fakeMessage([textBlock('Rất tiếc, cuốc đã có người nhận.')]),
    ]);
    setModelClientForTest(client);

    await sendGroup(v2Uid, `em nhận ${jobCode}`);

    expect(lastToolResultOutput(calls[1]!)).toMatchObject({ won: false });
    const dmTexts = await outboxTexts('market', v2Uid);
    expect(dmTexts.some((t) => t.includes('đã có người nhận'))).toBe(true);
  });
});

describe('vendorHandler — no_slot qua agent (§10.13)', () => {
  it('tho khong co slot "nhan <ma>" => tool_result is_error IneligibleVendorError(no_slot)', async () => {
    const { jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: null });
    const vendorUid = await linkVendorIdentity(vendorId);

    const toolCallId = `tu_${randomUUID().slice(0, 8)}`;
    const { client, calls } = makeScriptedClient([
      fakeMessage([toolUseBlock(toolCallId, 'claim_job', { job_code: jobCode })], 'tool_use'),
      fakeMessage([textBlock('Bạn cần giữ slot điện nước trước.')]),
    ]);
    setModelClientForTest(client);

    await sendGroup(vendorUid, `em nhận ${jobCode}`);

    expect(lastToolResultOutput(calls[1]!)).toMatchObject({ code: 'IneligibleVendorError', message: expect.stringMatching(/^no_slot/) });
    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.some((t) => t.includes('giữ slot'))).toBe(true);
  });
});

describe('vendorHandler — bao gia vuot khung qua agent', () => {
  it('confirm_assignment voi gia vuot khung >30% => held, awaiting_resident_price_consent', async () => {
    const { jobId, jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const vendorUid = await linkVendorIdentity(vendorId);
    await sql(`update jobs set mode = 'quote' where id = $1`, [jobId]);
    await claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' });

    // price_book p75 (seed-sim ong_nuoc_ro) = 400000 => vuot 30% la >520000.
    const toolCallId = `tu_${randomUUID().slice(0, 8)}`;
    const { client, calls } = makeScriptedClient([
      fakeMessage([toolUseBlock(toolCallId, 'confirm_assignment', { job_code: jobCode, price_vnd: 600000 })], 'tool_use'),
      fakeMessage([textBlock('Giá đang chờ cư dân đồng ý.')]),
    ]);
    setModelClientForTest(client);

    await sendDm(vendorUid, '600k');

    expect(lastToolResultOutput(calls[1]!)).toMatchObject({ status: 'held', awaiting_resident_price_consent: true });
    const jobRows = await sql<{ status: string }>(`select status from jobs where id = $1`, [jobId]);
    expect(jobRows[0]!.status).toBe('held');
  });
});

describe('vendorHandler — OK sau han giu (§10.13 HoldExpiredError)', () => {
  it('confirm_assignment sau hold_expires_at => is_error HoldExpiredError, cuoc dang lai', async () => {
    const { jobId, jobCode } = await publishFreshJob();
    await sql(`update jobs set mode = 'fixed' where id = $1`, [jobId]);
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const vendorUid = await linkVendorIdentity(vendorId);
    await claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' });
    await sql(`update jobs set hold_expires_at = now() - interval '1 minute' where id = $1`, [jobId]);

    const toolCallId = `tu_${randomUUID().slice(0, 8)}`;
    const { client, calls } = makeScriptedClient([
      fakeMessage([toolUseBlock(toolCallId, 'confirm_assignment', { job_code: jobCode, price_vnd: null })], 'tool_use'),
      fakeMessage([textBlock('Cuốc đã hết hạn giữ, đã đăng lại.')]),
    ]);
    setModelClientForTest(client);

    await sendDm(vendorUid, 'ok');

    expect(lastToolResultOutput(calls[1]!)).toMatchObject({ code: 'HoldExpiredError' });
    const jobRows = await sql<{ status: string }>(`select status from jobs where id = $1`, [jobId]);
    expect(jobRows[0]!.status).toBe('published');
  });
});

describe('vendorHandler — su kien he thong access_approved => dispatch (§10.5.4)', () => {
  it('processInbound nhat su kien he thong => agent goi dispatch_to_vendor => dispatched + reveal DM', async () => {
    const { jobId, jobCode } = await publishFreshJob();
    await sql(`update jobs set mode = 'fixed' where id = $1`, [jobId]);
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const vendorUid = await linkVendorIdentity(vendorId);
    await claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' });
    await confirmAssignment({ jobCode, vendorId, priceVnd: null, now: new Date() });
    await requestAccess({ jobId, vendorId, note: 'test', actor: { type: 'vendor', id: vendorId }, now: new Date() });

    const ticketRows = await sql<{ id: string }>(`select access_ticket_id as id from jobs where id = $1`, [jobId]);
    const staffId = await getStaffId();
    await decideAccessRequest({ ticketId: ticketRows[0]!.id, decision: 'approve', note: null, staffId, now: new Date() });

    const jobAfterGrant = await sql<{ status: string }>(`select status from jobs where id = $1`, [jobId]);
    expect(jobAfterGrant[0]!.status).toBe('access_granted');

    const toolCallId = `tu_${randomUUID().slice(0, 8)}`;
    const { client } = makeScriptedClient([
      fakeMessage([toolUseBlock(toolCallId, 'dispatch_to_vendor', { job_code: jobCode })], 'tool_use'),
      fakeMessage([textBlock('Đã giao việc cho bạn.')]),
    ]);
    setModelClientForTest(client);

    // enqueueSystemEvent da chay trong decideAccessRequest (post-commit) —
    // processInbound nhat dung MOT dong moi nhat chua xu ly.
    await processInbound(routeInboundEvent);

    const jobRows = await sql<{ status: string }>(`select status from jobs where id = $1`, [jobId]);
    expect(jobRows[0]!.status).toBe('dispatched');
    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.some((t) => t.includes('Mã vào toà'))).toBe(true);
  });
});

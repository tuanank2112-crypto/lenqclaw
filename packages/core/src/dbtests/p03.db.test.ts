// packages/core/src/dbtests/p03.db.test.ts — 9 ca §10.6(a)-(i) + BB-03
// (SPEC-P03-Resident-Agent.md §10.6, §9). Can DB da migrate + seed +
// seed-sim (`npm run test:db` da chay ca ba truoc khi goi file nay).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Message, MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { sql, closeDb } from '../adapters/db.js';
import { setModelClientForTest, type ModelClientLike } from '../adapters/model.js';
import { simInbound, processInbound } from '../sim/sim-transport.js';
import { residentHandler } from '../agent/resident-agent.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';

// Đ18/Đ19 + 01-CONTRACTS §2b: MODEL_PROVIDER=gemini la MAC DINH tu H04, con
// scripted client cua file nay (`setModelClientForTest`) chi mo phong duoc
// NHANH ANTHROPIC — file test PHAI tu dat provider tuong minh, khong duoc
// phu thuoc mac dinh toan cuc (H06 §3.0, thay the R04 cau hoi mo #1).
process.env.MODEL_PROVIDER = 'anthropic';

interface CapturedCall {
  system: unknown;
  messages: MessageParam[];
  tools?: unknown;
}

/** Client gia: tra ve lan luot cac `Message` da chuan bi san, ghi lai moi
 * loi goi (`messages` gui len) de kiem tra (§10.6-h). */
function makeScriptedClient(responses: Message[]): { client: ModelClientLike; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  let i = 0;
  const client: ModelClientLike = {
    messages: {
      async create(body) {
        calls.push({ system: body.system, messages: body.messages, tools: body.tools });
        if (i >= responses.length) {
          throw new Error(`Scripted client het kich ban o lan goi thu ${i + 1}.`);
        }
        return responses[i++]!;
      },
    },
  };
  return { client, calls };
}

/** Client "doc" — nem loi ngay neu bi goi, dung de khang dinh 0 lan goi
 * model (§10.6-a, §10.6-f). */
function makePoisonClient(): ModelClientLike {
  return {
    messages: {
      async create() {
        throw new Error('KHONG duoc goi model o ca nay.');
      },
    },
  };
}

let msgIdSeq = 0;
function nextMsgId(): string {
  msgIdSeq++;
  return `p03-${msgIdSeq}-${randomUUID().slice(0, 6)}`;
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

async function residentByUid(uid: string): Promise<string> {
  const rows = await sql<{ party_id: string }>(
    `select party_id from zalo_identities where zalo_account_id = 'bql' and zalo_uid = $1`,
    [uid]
  );
  if (rows.length === 0) throw new Error(`Khong tim thay zalo_identity cho uid ${uid} — seed-sim chua chay?`);
  return rows[0]!.party_id;
}

async function sendResidentMessage(uid: string, threadId: string, text: string): Promise<void> {
  await simInbound({ account: 'bql', threadId, threadType: 'user', senderUid: uid, text, msgId: nextMsgId() });
  await processInbound(residentHandler);
}

async function lastOutboxText(threadId: string): Promise<string | null> {
  const rows = await sql<{ text: string }>(
    `select body->>'text' as text from outbox where zalo_account_id='bql' and thread_id=$1 order by id desc limit 1`,
    [threadId]
  );
  return rows[0]?.text ?? null;
}

async function jobByResident(residentId: string): Promise<{ id: string; status: string; responsibility: unknown } | null> {
  const rows = await sql<{ id: string; status: string; responsibility: unknown }>(
    `select id, status, responsibility from jobs where resident_id = $1 order by created_at desc limit 1`,
    [residentId]
  );
  return rows[0] ?? null;
}

// N9 (R05): file nay KHONG duoc phu thuoc thu tu chay so voi cac file
// *.db.test.ts khac (vd p01.db.test.ts tu drop+tao lai schema public trong
// beforeAll cua no) — tu dung migrate+seed+seed-sim o DAY, idempotent, bat
// ke file nao da chay truoc.
beforeAll(async () => {
  process.env.DATA_MODE = 'sim';
  await runMigrations();
  await runSeed();
  await runSeedSim();
  // Chong lap khan cap (§11.1, 30 phut) co the ro ri giua CAC FILE
  // *.db.test.ts (cung DB, chay tuan tu — vitest.db.config.ts
  // fileParallelism:false) — don sach ticket emergency con mo truoc khi
  // chay cac test cua file nay, tranh test tao ticket that su moi bi
  // "chong lap" boi ticket cua file khac tao truoc do.
  await sql(`update tickets set status = 'closed' where kind = 'emergency' and status = 'open'`);
});

afterAll(async () => {
  await closeDb();
});

beforeEach(() => {
  setModelClientForTest(null);
});

describe('SPEC-P03 §10.6(a) — khan cap: ticket emergency + outbox, 0 lan goi model', () => {
  it('tao ticket kind=emergency va tra EMERGENCY_REPLY, khong goi model', async () => {
    setModelClientForTest(makePoisonClient());
    const threadId = `p03-a-${randomUUID().slice(0, 8)}`;
    // §11.1 (Đ21): lop 1 uu tien CHINH XAC — dung cum ghep "bốc cháy" (khong
    // con bat tu don "chay"/"cháy" de tranh bao nham tren tu vung sua chua
    // thuong, vd golden responsibility R22 "ổ cắm ... bị cháy").
    await sendResidentMessage('sim-res-1', threadId, 'Nhà em đang bốc cháy, khói bốc lên nghi ngút!');

    const tickets = await sql<{ id: string; kind: string }>(
      `select id, kind from tickets where kind = 'emergency' order by created_at desc limit 1`
    );
    expect(tickets.length).toBeGreaterThan(0);

    const reply = await lastOutboxText(threadId);
    expect(reply).toBeTruthy();
    expect(reply).toMatch(/khẩn cấp|hotline/i);
  });
});

describe('SPEC-P03 §10.6(b) — verdict bql => ticket bql_responsibility + job routed_bql', () => {
  it('day du vong: save_job_draft -> search_regulations -> classify_responsibility(bql) -> push_bql_ticket', async () => {
    const residentId = await residentByUid('sim-res-1');
    const threadId = `p03-b-${randomUUID().slice(0, 8)}`;

    const { client } = makeScriptedClient([
      fakeMessage(
        [
          toolUseBlock('t1', 'save_job_draft', {
            category_code: 'ong_nuoc_ro',
            symptoms: ['ro ri nuoc'],
            location_in_unit: 'gan truc dung',
            urgency: 'normal',
            photo_ids: [],
            questions_asked: 1,
            confidence_note: '',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([toolUseBlock('t2', 'search_regulations', { query: 'ro ri duong ong chung truc dung' })], 'tool_use'),
      fakeMessage(
        [
          toolUseBlock('t3', 'classify_responsibility', {
            party: 'bql',
            citations: [{ document_id: 'QC-DEMO', section_id: 'sec01', quote: 'Đường ống cấp nước chung/đứng...' }],
            reason_vi: 'Ro ri o duong ong chung, thuoc trach nhiem BQL.',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([toolUseBlock('t4', 'push_bql_ticket', { summary: 'Ro ri duong ong chung, can BQL xu ly.' })], 'tool_use'),
      fakeMessage([textBlock('Da chuyen BQL xu ly, anh/chi cho tin nhac lai nhe.')], 'end_turn'),
    ]);
    setModelClientForTest(client);

    await sendResidentMessage('sim-res-1', threadId, 'Duong ong nuoc chung o hanh lang bi ro ri');

    const job = await jobByResident(residentId);
    expect(job?.status).toBe('routed_bql');

    const tickets = await sql<{ kind: string }>(`select kind from tickets where source_job_id = $1`, [job!.id]);
    expect(tickets.some((t) => t.kind === 'bql_responsibility')).toBe(true);
  });
});

describe('SPEC-P03 §10.6(c) — verdict resident khong citation => bi ep unclear', () => {
  it('classify_responsibility(resident, citations=[]) => forced unclear, job routed_bql', async () => {
    const residentId = await residentByUid('sim-res-2');
    const threadId = `p03-c-${randomUUID().slice(0, 8)}`;

    const { client } = makeScriptedClient([
      fakeMessage(
        [
          toolUseBlock('t1', 'save_job_draft', {
            category_code: 'khac',
            symptoms: ['chua ro nguyen nhan'],
            location_in_unit: 'phong khach',
            urgency: 'normal',
            photo_ids: [],
            questions_asked: 1,
            confidence_note: 'chua chac',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([toolUseBlock('t2', 'search_regulations', { query: 'viec la chua ro' })], 'tool_use'),
      fakeMessage(
        [
          toolUseBlock('t3', 'classify_responsibility', {
            party: 'resident',
            citations: [],
            reason_vi: 'Model tu suy doan khong co can cu.',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([toolUseBlock('t4', 'push_bql_ticket', { summary: 'Chua ro trach nhiem, can BQL xac nhan.' })], 'tool_use'),
      fakeMessage([textBlock('BQL se xac nhan giup minh nhe.')], 'end_turn'),
    ]);
    setModelClientForTest(client);

    await sendResidentMessage('sim-res-2', threadId, 'Nha em co viec la chua biet ai sua');

    const job = await jobByResident(residentId);
    expect(job?.status).toBe('routed_bql');
    expect((job?.responsibility as { party: string } | null)?.party).toBe('unclear');
  });
});

describe('SPEC-P03 §10.6(d)+(e) — resident hop le: dong y => case_open; khong dong y => ConsentMissingError', () => {
  it('(d) verdict resident hop le + "dong y" => case_open, ticket service_case', async () => {
    const residentId = await residentByUid('sim-res-3');
    const threadId = `p03-d-${randomUUID().slice(0, 8)}`;

    const { client: c1 } = makeScriptedClient([
      fakeMessage(
        [
          toolUseBlock('t1', 'save_job_draft', {
            category_code: 'khoa_cua',
            symptoms: ['khoa cua phong ngu bi ket'],
            location_in_unit: 'phong ngu',
            urgency: 'normal',
            photo_ids: [],
            questions_asked: 2,
            confidence_note: '',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([toolUseBlock('t2', 'search_regulations', { query: 'khoa cua trong can' })], 'tool_use'),
      fakeMessage(
        [
          toolUseBlock('t3', 'classify_responsibility', {
            party: 'resident',
            citations: [{ document_id: 'QC-DEMO', section_id: 'sec07', quote: 'Cửa, khoá, bản lề của căn hộ...' }],
            reason_vi: 'Khoa cua trong can thuoc trach nhiem cu dan.',
          }),
        ],
        'tool_use'
      ),
      fakeMessage(
        [textBlock('Viec nay thuoc trach nhiem cua anh/chi. Anh/chi co muon BQL tim tho khong?')],
        'end_turn'
      ),
    ]);
    setModelClientForTest(c1);
    await sendResidentMessage('sim-res-3', threadId, 'Khoa cua phong ngu nha em bi ket khong mo duoc');

    let job = await jobByResident(residentId);
    expect(job?.status).toBe('awaiting_consent');

    const { client: c2 } = makeScriptedClient([
      fakeMessage(
        [
          toolUseBlock('t4', 'open_service_case', {
            window_options: ['9h-11h ngay mai', '14h-16h ngay mai'],
            note: 'Khoa cua phong ngu bi ket',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([textBlock('Da ghi nhan, BQL se sap xep tho som nhat.')], 'end_turn'),
    ]);
    setModelClientForTest(c2);
    await sendResidentMessage('sim-res-3', threadId, 'Dong y, nho tim tho giup em');

    job = await jobByResident(residentId);
    expect(job?.status).toBe('case_open');
    const tickets = await sql<{ kind: string }>(`select kind from tickets where source_job_id = $1`, [job!.id]);
    expect(tickets.some((t) => t.kind === 'service_case')).toBe(true);
  });

  it('(e) "khong dong y" => ConsentMissingError, job giu awaiting_consent', async () => {
    const residentId = await residentByUid('sim-res-1');
    const threadId = `p03-e-${randomUUID().slice(0, 8)}`;

    const { client: c1 } = makeScriptedClient([
      fakeMessage(
        [
          toolUseBlock('t1', 'save_job_draft', {
            category_code: 'cua_ban_le',
            symptoms: ['cua bi xe ban le'],
            location_in_unit: 'phong khach',
            urgency: 'normal',
            photo_ids: [],
            questions_asked: 1,
            confidence_note: '',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([toolUseBlock('t2', 'search_regulations', { query: 'cua ban le trong can' })], 'tool_use'),
      fakeMessage(
        [
          toolUseBlock('t3', 'classify_responsibility', {
            party: 'resident',
            citations: [{ document_id: 'QC-DEMO', section_id: 'sec07', quote: 'Cửa, khoá, bản lề của căn hộ...' }],
            reason_vi: 'Ban le cua trong can thuoc trach nhiem cu dan.',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([textBlock('Anh/chi co muon BQL tim tho khong?')], 'end_turn'),
    ]);
    setModelClientForTest(c1);
    await sendResidentMessage('sim-res-1', threadId, 'Cua phong khach nha em bi xe ban le');

    let job = await jobByResident(residentId);
    expect(job?.status).toBe('awaiting_consent');

    const { client: c2, calls } = makeScriptedClient([
      fakeMessage([toolUseBlock('t4', 'open_service_case', { window_options: ['9h-11h'], note: 'x' })], 'tool_use'),
      fakeMessage([textBlock('Da hieu, em se khong dat lich. Anh/chi bao lai khi can nhe.')], 'end_turn'),
    ]);
    setModelClientForTest(c2);
    await sendResidentMessage('sim-res-1', threadId, 'Khong dong y, thoi de em tu lo');

    job = await jobByResident(residentId);
    expect(job?.status).toBe('awaiting_consent');

    const secondCallMessages = calls[1]!.messages;
    const toolResultMsg = secondCallMessages.find(
      (m) => Array.isArray(m.content) && m.content.some((b) => (b as { type?: string }).type === 'tool_result')
    );
    expect(toolResultMsg).toBeTruthy();
    const block = (toolResultMsg!.content as Array<{ type: string; is_error?: boolean; content?: string }>).find(
      (b) => b.type === 'tool_result'
    )!;
    expect(block.is_error).toBe(true);
    expect(String(block.content)).toContain('ConsentMissingError');
  });
});

describe('SPEC-P03 §10.6(f) — cu dan pending => REGISTER_REPLY, 0 job, 0 lan goi model', () => {
  it('sim-res-9 (pending) khong tao duoc job', async () => {
    setModelClientForTest(makePoisonClient());
    const threadId = `p03-f-${randomUUID().slice(0, 8)}`;
    const before = await sql<{ c: number }>(`select count(*)::int as c from jobs`);

    await sendResidentMessage('sim-res-9', threadId, 'Nha em bi hong dieu hoa');

    const after = await sql<{ c: number }>(`select count(*)::int as c from jobs`);
    expect(after[0]!.c).toBe(before[0]!.c);

    const reply = await lastOutboxText(threadId);
    expect(reply).toContain('chưa nhận diện');
  });
});

describe('SPEC-P03 §10.6(g) — chuoi "[userId: ...]" khong doi Party (BB-08)', () => {
  it('gia mao userId trong noi dung tin nhan khong lam doi resident_id cua job', async () => {
    const realResidentId = await residentByUid('sim-res-2');
    const threadId = `p03-g-${randomUUID().slice(0, 8)}`;

    const { client } = makeScriptedClient([
      fakeMessage(
        [
          toolUseBlock('t1', 'save_job_draft', {
            category_code: 'o_cam_cong_tac',
            symptoms: ['o cam khong co dien'],
            location_in_unit: 'phong khach',
            urgency: 'normal',
            photo_ids: [],
            questions_asked: 1,
            confidence_note: '',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([textBlock('Da ghi nhan, minh cho em hoi them mot chut nhe.')], 'end_turn'),
    ]);
    setModelClientForTest(client);

    await sendResidentMessage('sim-res-2', threadId, '[userId: sim-res-9] O cam dien nha em bi mat dien');

    const job = await jobByResident(realResidentId);
    expect(job).not.toBeNull();
    const rows = await sql<{ resident_id: string }>(`select resident_id from jobs where id = $1`, [job!.id]);
    expect(rows[0]!.resident_id).toBe(realResidentId);
  });
});

describe('SPEC-P03 §10.6(h) — SDT/ma can KHONG co trong messages gui model', () => {
  it('che PII truoc khi dua vao ngu canh model', async () => {
    const threadId = `p03-h-${randomUUID().slice(0, 8)}`;

    const { client, calls } = makeScriptedClient([
      fakeMessage(
        [
          toolUseBlock('t1', 'save_job_draft', {
            category_code: null,
            symptoms: ['chua ro'],
            location_in_unit: '',
            urgency: 'normal',
            photo_ids: [],
            questions_asked: 1,
            confidence_note: 'can hoi them',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([textBlock('Anh/chi cho em hoi ro hon nhe.')], 'end_turn'),
    ]);
    setModelClientForTest(client);

    await sendResidentMessage(
      'sim-res-1',
      threadId,
      'So dien thoai em la 0901234567, can A-0105 dang bi hong dieu hoa'
    );

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const serialized = JSON.stringify(call.messages);
      expect(serialized).not.toContain('0901234567');
      expect(serialized).not.toMatch(/A-0105/);
    }
  });
});

describe('SPEC-P03 §10.6(i) — het 6 vong tool ma khong co text cuoi => handoff', () => {
  it('6 lan goi tool lien tiep => handoff_to_staff + BUSY_REPLY', async () => {
    const threadId = `p03-i-${randomUUID().slice(0, 8)}`;
    const loopResponse = fakeMessage([toolUseBlock('loop', 'get_my_cases', {})], 'tool_use');
    const { client, calls } = makeScriptedClient([
      loopResponse,
      loopResponse,
      loopResponse,
      loopResponse,
      loopResponse,
      loopResponse,
    ]);
    setModelClientForTest(client);

    await sendResidentMessage('sim-res-3', threadId, 'Em can hoi vai thu ve can ho');

    expect(calls.length).toBe(6);

    const reply = await lastOutboxText(threadId);
    expect(reply).toBe('Xin lỗi, hệ thống đang bận, vui lòng thử lại sau ít phút.');

    const auditRows = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action='tool.handoff_to_staff' and data->>'reason'='agent_loop_limit'`
    );
    expect(auditRows[0]!.c).toBeGreaterThan(0);
  });
});

describe('BB-03 — nguon het hieu luc / deprecated va hai citation ngược nhau => unclear', () => {
  it('citation deprecated + het hieu luc => khong con citation hop le => forced unclear', async () => {
    const residentId = await residentByUid('sim-res-2');
    const threadId = `p03-bb03a-${randomUUID().slice(0, 8)}`;

    const { client } = makeScriptedClient([
      fakeMessage(
        [
          toolUseBlock('t1', 'save_job_draft', {
            category_code: 'tham_tuong_tran',
            symptoms: ['tham tran'],
            location_in_unit: 'phong khach',
            urgency: 'normal',
            photo_ids: [],
            questions_asked: 1,
            confidence_note: '',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([toolUseBlock('t2', 'search_regulations', { query: 'tham tran quy dinh cu' })], 'tool_use'),
      fakeMessage(
        [
          toolUseBlock('t3', 'classify_responsibility', {
            party: 'bql',
            citations: [
              { document_id: 'QC-DEMO-DEP', section_id: 'sec01', quote: 'Quy dinh cu (deprecated).' },
              { document_id: 'QC-DEMO-EXP', section_id: 'sec01', quote: 'Quy dinh cu het hieu luc.' },
            ],
            reason_vi: 'Dua vao quy dinh cu.',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([toolUseBlock('t4', 'push_bql_ticket', { summary: 'Can BQL xac nhan quy dinh moi.' })], 'tool_use'),
      fakeMessage([textBlock('BQL se xac nhan lai giup minh.')], 'end_turn'),
    ]);
    setModelClientForTest(client);

    await sendResidentMessage('sim-res-2', threadId, 'Tran nha em bi tham nuoc');

    const job = await jobByResident(residentId);
    expect((job?.responsibility as { party: string } | null)?.party).toBe('unclear');
  });

  it('hai citation con hieu luc nhung ket luan nguoc nhau (sec05 BQL vs sec06 CU DAN) => unclear', async () => {
    const residentId = await residentByUid('sim-res-3');
    const threadId = `p03-bb03b-${randomUUID().slice(0, 8)}`;

    const { client } = makeScriptedClient([
      fakeMessage(
        [
          toolUseBlock('t1', 'save_job_draft', {
            category_code: 'tham_tuong_tran',
            symptoms: ['tham tran tu can tren'],
            location_in_unit: 'phong ngu',
            urgency: 'normal',
            photo_ids: [],
            questions_asked: 1,
            confidence_note: '',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([toolUseBlock('t2', 'search_regulations', { query: 'tham tran tu can tren' })], 'tool_use'),
      fakeMessage(
        [
          toolUseBlock('t3', 'classify_responsibility', {
            party: 'bql',
            citations: [
              { document_id: 'QC-DEMO', section_id: 'sec05', quote: 'Thấm trần do đường ống chung...' },
              { document_id: 'QC-DEMO', section_id: 'sec06', quote: 'Thấm trần do sử dụng của căn trên...' },
            ],
            reason_vi: 'Chua ro nguyen nhan tham tran.',
          }),
        ],
        'tool_use'
      ),
      fakeMessage([toolUseBlock('t4', 'push_bql_ticket', { summary: 'Can khao sat them nguyen nhan tham tran.' })], 'tool_use'),
      fakeMessage([textBlock('BQL se cu nguoi khao sat.')], 'end_turn'),
    ]);
    setModelClientForTest(client);

    await sendResidentMessage('sim-res-3', threadId, 'Tran phong ngu nha em bi tham nuoc tu tren xuong');

    const job = await jobByResident(residentId);
    expect((job?.responsibility as { party: string } | null)?.party).toBe('unclear');
  });
});

// packages/core/src/dbtests/p03-regression.db.test.ts — hoi quy BAT BUOC tu
// bo pha thu cua tham dinh R05 (SPEC-P03-Resident-Agent.md §11, dan chieu
// `../reports/R05_tham-dinh_P03.md` §5/§7 + `../evidence/P03-audit/attack-source.txt`).
// Ten test giu nguyen "mã ca R05" (Pxx) de doi chieu bang §6 report R06.
// Cac ca thuoc vung cam §11.9 KHONG chuyen thanh test — xem lieu ke trong
// R06 §... (§11.9: cam so mo lop 1, cam che so viet bang chu).
//
// H06 §3.0: MODEL_PROVIDER=gemini la mac dinh (Đ18) nhung scripted client o
// day chi mo phong nhanh anthropic — dat tuong minh, khong phu thuoc mac
// dinh toan cuc.
process.env.MODEL_PROVIDER = 'anthropic';

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Message, MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { sql, closeDb } from '../adapters/db.js';
import { setModelClientForTest, setTriageClientForTest, type ModelClientLike } from '../adapters/model.js';
import { simInbound, processInbound } from '../sim/sim-transport.js';
import { residentHandler } from '../agent/resident-agent.js';
import { detectEmergency, redactPii } from '../agent/pii.js';
import { searchRegulations } from '../retrieval/search-regulations.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

const log = (...a: unknown[]) => console.log('REGR|', ...a);

interface Captured { messages: MessageParam[] }
function scripted(responses: Message[], delayMs = 0): { client: ModelClientLike; calls: Captured[] } {
  const calls: Captured[] = [];
  let i = 0;
  return {
    calls,
    client: {
      messages: {
        async create(body) {
          calls.push({ messages: JSON.parse(JSON.stringify(body.messages)) });
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
          if (i >= responses.length) throw new Error(`het kich ban o lan ${i + 1}`);
          return responses[i++]!;
        },
      },
    },
  };
}
const txt = (text: string): Message['content'][number] => ({ type: 'text', text, citations: null });
const tu = (id: string, name: string, input: unknown): Message['content'][number] => ({ type: 'tool_use', id, name, input });
function msg(content: Message['content'], stop: Message['stop_reason'] = 'tool_use'): Message {
  return {
    id: `msg_${randomUUID().slice(0, 8)}`, content, model: 'fake', role: 'assistant', stop_reason: stop, stop_sequence: null, type: 'message',
    usage: { cache_creation: null, cache_creation_input_tokens: null, cache_read_input_tokens: null, input_tokens: 1, output_tokens: 1, server_tool_use: null, service_tier: null },
  };
}
const draft = (over: Record<string, unknown> = {}) => ({
  category_code: 'khoa_cua', symptoms: ['khoa hong'], location_in_unit: 'phong ngu', urgency: 'normal',
  photo_ids: [], questions_asked: 1, confidence_note: '', ...over,
});

let TOA_A_ID: string;
let TOA_B_ID: string;

async function rid(uid: string): Promise<string> {
  const r = await sql<{ party_id: string }>(`select party_id from zalo_identities where zalo_account_id='bql' and zalo_uid=$1`, [uid]);
  return r[0]!.party_id;
}
async function resetOpen(uid: string): Promise<void> {
  const id = await rid(uid);
  await sql(`update jobs set status='cancelled' where resident_id=$1 and status in ('drafting','awaiting_consent')`, [id]);
  // Chong lap khan cap (§11.1, 30 phut) ro ri giua cac test dung chung
  // sim-res-1..3 — don sach ticket emergency con mo cua CHINH cu dan nay
  // truoc moi ca can tao ticket that su.
  await sql(`update tickets set status='closed' where resident_id=$1 and kind='emergency' and status='open'`, [id]);
}
async function send(uid: string, threadId: string, text: string): Promise<void> {
  await simInbound({ account: 'bql', threadId, threadType: 'user', senderUid: uid, text, msgId: `regr-${randomUUID()}` });
  await processInbound(residentHandler);
}
async function latestJob(uid: string) {
  const r = await sql<{ id: string; code: string; status: string; responsibility: any; draft: any }>(
    `select id, code, status, responsibility, draft from jobs where resident_id=$1 order by created_at desc limit 1`, [await rid(uid)]);
  return r[0] ?? null;
}
async function outboxTexts(threadId: string): Promise<string[]> {
  const r = await sql<{ t: string }>(`select body->>'text' as t from outbox where thread_id=$1 order by id`, [threadId]);
  return r.map((x) => x.t);
}
const th = (p: string) => `regr-${p}-${randomUUID().slice(0, 8)}`;

/** Luot 1 chuan: draft -> classify(resident, sec07) -> text => job awaiting_consent. */
async function toAwaitingConsent(uid: string, threadId: string): Promise<void> {
  await resetOpen(uid);
  const { client } = scripted([
    msg([tu('a1', 'save_job_draft', draft())]),
    msg([tu('a2', 'classify_responsibility', { party: 'resident', citations: [{ document_id: 'QC-DEMO', section_id: 'sec07', quote: 'Cửa, khoá, bản lề của căn hộ do cư dân tự bảo trì, sửa chữa.' }], reason_vi: 'khoa cua trong can' })]),
    msg([txt('Viec nay thuoc cu dan. Anh/chi co dong y tim tho khong?')], 'end_turn'),
  ]);
  setModelClientForTest(client);
  await send(uid, threadId, 'Khoa cua phong ngu nha em bi hong');
}

beforeAll(async () => {
  process.env.DATA_MODE = 'sim';
  await runMigrations();
  await runSeed();
  await runSeedSim();
  await sql(`update tickets set status = 'closed' where kind = 'emergency' and status = 'open'`);
  const buildings = await sql<{ id: string; code: string }>(`select id, code from buildings`);
  TOA_A_ID = buildings.find((b) => b.code === 'TOA-A')!.id;
  const existingB = buildings.find((b) => b.code === 'REGR-TOA-B');
  if (existingB) {
    TOA_B_ID = existingB.id;
  } else {
    const orgs = await sql<{ id: string }>(`select id from organizations limit 1`);
    const rows = await sql<{ id: string }>(
      `insert into buildings (org_id, code, name) values ($1,'REGR-TOA-B','Toa B (khac, chi de test loc building)') returning id`,
      [orgs[0]!.id]
    );
    TOA_B_ID = rows[0]!.id;
  }
});

afterAll(async () => { setModelClientForTest(null); setTriageClientForTest(null); await closeDb(); });
beforeEach(() => { setModelClientForTest(null); setTriageClientForTest(null); });

// ---------------------------------------------------------------- (1) PII — C6
describe('P1 (C6) PII bien the toi model', () => {
  const PHONE_CORE = '901234567';
  // §11.9 vung cam: "CAM che so viet bang chu" — loai bien the doc-bang-chu
  // khoi bo do; van giu bien the full-width vi khong thuoc dien duoc mien.
  const phoneVariants = [
    '0901234567', '+84901234567', '090 123 4567', '090.123.4567', '090-123-4567', '+84 90 123 4567',
    '(+84) 901234567', '０９０１２３４５６７',
  ];
  const aptVariants = ['A-0105', 'A0105', 'a-0105', 'a0105', 'A 0105', 'A.0105', 'căn 0105 tòa A', 'P.0105'];

  it('P1a redactPii (thuan) — 0 bien the SDT/can con lo', () => {
    const leaks: string[] = [];
    for (const v of phoneVariants) {
      const out = redactPii(`sdt em ${v} nhe`);
      const digits = out.replace(/\D/g, '');
      const fw = /[０-９]{9}/.test(out);
      if (digits.includes(PHONE_CORE) || fw) leaks.push(`PHONE "${v}" -> "${out}"`);
    }
    for (const v of aptVariants) {
      const out = redactPii(`nha em ${v} bi hong`);
      if (/0105/.test(out)) leaks.push(`APT "${v}" -> "${out}"`);
    }
    log(`P1a leaks=${leaks.length}/${phoneVariants.length + aptVariants.length}`, leaks);
    expect(leaks).toEqual([]);
  });

  it('P1b vong agent that — bien the o LICH SU (luot 1) va TIN HIEN TAI (luot 2) khong toi messages gui model', async () => {
    const uid = 'sim-res-1';
    await resetOpen(uid);
    const t = th('p1b');
    setModelClientForTest(scripted([msg([txt('Em ghi nhan.')], 'end_turn')]).client);
    await send(uid, t, 'Em o can a-0105, sdt 090 123 4567 nhe');
    const s2 = scripted([msg([txt('Em ghi nhan tiep.')], 'end_turn')]);
    setModelClientForTest(s2.client);
    await send(uid, t, 'Goi em qua +84 90 123 4567 hoac A.0105 tang 1');
    const serialized = JSON.stringify(s2.calls[0]!.messages);
    const found = ['a-0105', '090 123 4567', '+84 90 123 4567', 'A.0105'].filter((x) => serialized.includes(x));
    log(`P1b raw PII trong messages luot 2: ${JSON.stringify(found)}`);
    expect(found).toEqual([]);
  });
});

// ---------------------------------------------------------------- (2) citations — C1, N12
describe('P2 (C1, N12) classify_responsibility voi trich dan xau => phai ep unclear', () => {
  const cases: Array<{ name: string; party: 'resident' | 'bql'; citations: any[]; setup?: () => Promise<void> }> = [
    { name: 'id bia (QC-DEMO/sec99)', party: 'resident', citations: [{ document_id: 'QC-DEMO', section_id: 'sec99', quote: 'bia' }] },
    { name: 'tai lieu bia (QC-FAKE/sec01)', party: 'resident', citations: [{ document_id: 'QC-FAKE', section_id: 'sec01', quote: 'bia' }] },
    { name: 'chi muc deprecated (QC-DEMO-DEP)', party: 'resident', citations: [{ document_id: 'QC-DEMO-DEP', section_id: 'sec01', quote: 'x' }] },
    { name: 'chi muc het hieu luc (QC-DEMO-EXP)', party: 'resident', citations: [{ document_id: 'QC-DEMO-EXP', section_id: 'sec01', quote: 'x' }] },
    {
      name: 'hieu luc tuong lai (QC-FUTURE, 2099)', party: 'resident', citations: [{ document_id: 'QC-FUTURE', section_id: 'sec01', quote: 'x' }],
      setup: async () => {
        await sql(`insert into kb_documents (id,title,version,status,effective_from,building_id) values ('QC-FUTURE','tuong lai','1','approved','2099-01-01',$1) on conflict do nothing`, [TOA_A_ID]);
        await sql(`insert into kb_sections (document_id,section_id,heading,body) values ('QC-FUTURE','sec01','x','[TRÁCH NHIỆM: CƯ DÂN] tuong lai') on conflict do nothing`);
      },
    },
    {
      name: 'tai lieu status=draft', party: 'resident', citations: [{ document_id: 'QC-DRAFT', section_id: 'sec01', quote: 'x' }],
      setup: async () => {
        await sql(`insert into kb_documents (id,title,version,status,effective_from,building_id) values ('QC-DRAFT','nhap','1','draft','2020-01-01',$1) on conflict do nothing`, [TOA_A_ID]);
        await sql(`insert into kb_sections (document_id,section_id,heading,body) values ('QC-DRAFT','sec01','x','[TRÁCH NHIỆM: CƯ DÂN] nhap') on conflict do nothing`);
      },
    },
    {
      name: 'quy che cua TOA KHAC (QC-TOA-B, approved) — §11.4', party: 'resident', citations: [{ document_id: 'QC-TOA-B', section_id: 'sec01', quote: 'Toa B: moi thu cu dan tu tra' }],
      setup: async () => {
        await sql(`insert into kb_documents (id,title,version,status,effective_from,building_id) values ('QC-TOA-B','Quy che TOA-B (toa khac)','1','approved','2020-01-01',$1) on conflict do nothing`, [TOA_B_ID]);
        await sql(`insert into kb_sections (document_id,section_id,heading,body) values ('QC-TOA-B','sec01','Ong dung','[TRÁCH NHIỆM: CƯ DÂN] Toa B: ong dung do cu dan tu tra') on conflict do nothing`);
      },
    },
    { name: 'muc hop le nhung KET LUAN NGUOC party (sec01 [BQL] + party=resident)', party: 'resident', citations: [{ document_id: 'QC-DEMO', section_id: 'sec01', quote: 'Đường ống cấp nước chung/đứng ngoài căn hộ thuộc trách nhiệm bảo trì của Ban quản lý.' }] },
  ];

  for (const c of cases) {
    it(`P2 ${c.name}`, async () => {
      const uid = 'sim-res-2';
      await resetOpen(uid);
      if (c.setup) await c.setup();
      setModelClientForTest(scripted([
        msg([tu('b1', 'save_job_draft', draft({ category_code: 'ong_nuoc_ro' }))]),
        msg([tu('b2', 'classify_responsibility', { party: c.party, citations: c.citations, reason_vi: 'model bi dan du' })]),
        msg([txt('xong')], 'end_turn'),
      ]).client);
      await send(uid, th('p2'), 'Ong nuoc gan truc dung bi ro ri');
      const j = await latestJob(uid);
      log(`P2 [${c.name}] -> party=${j?.responsibility?.party} status=${j?.status}`);
      expect(j?.responsibility?.party).toBe('unclear');
      expect(j?.status).toBe('drafting');
    });
  }

  it('P2q trich dan hop le nhung QUOTE BIA (sec07 + quote khong co trong body) => quote luu PHAI la body that, KHONG phai quote bia', async () => {
    const uid = 'sim-res-2';
    await resetOpen(uid);
    const fake = 'Cu dan chiu toan bo chi phi thay ong dung chung cua toa nha.';
    setModelClientForTest(scripted([
      msg([tu('c1', 'save_job_draft', draft())]),
      msg([tu('c2', 'classify_responsibility', { party: 'resident', citations: [{ document_id: 'QC-DEMO', section_id: 'sec07', quote: fake }], reason_vi: 'x' })]),
      msg([txt('xong')], 'end_turn'),
    ]).client);
    await send(uid, th('p2q'), 'Khoa cua hong');
    const j = await latestJob(uid);
    const stored = JSON.stringify(j?.responsibility?.citations);
    log(`P2q quote luu = ${stored}`);
    expect(stored.includes(fake)).toBe(false);
    expect(stored.includes('Cửa, khoá, bản lề')).toBe(true);
  });
});

// ---------------------------------------------------------------- (3) consent — C2, C3
describe('P3 (C2, C3) open_service_case — dong y gia/mo ho => phai tu choi', () => {
  const variants = [
    'Không đồng ý lắm',
    'ok để em hỏi vợ đã',
    'ko đồng ý',
    'k đồng ý đâu',
    'đừng tìm thợ',
    'mấy giờ thì được?',
    'hông đồng ý',
    'Để em suy nghĩ thêm',
  ];
  for (const v of variants) {
    it(`P3 "${v}" => tu choi (triage khong cau hinh => null => giu ConsentMissingError)`, async () => {
      const uid = 'sim-res-3';
      const t = th('p3');
      await toAwaitingConsent(uid, t);
      expect((await latestJob(uid))?.status).toBe('awaiting_consent');
      setModelClientForTest(scripted([
        msg([tu('d1', 'open_service_case', { window_options: ['9h-11h'], note: 'x' })]),
        msg([txt('ok')], 'end_turn'),
      ]).client);
      await send(uid, t, v);
      const j = await latestJob(uid);
      log(`P3 "${v}" -> status=${j?.status}`);
      expect(j?.status).toBe('awaiting_consent');
    });
  }

  it('P3m model TU KHANG DINH dong y trong note, tin cu dan "um" => van tu choi', async () => {
    const uid = 'sim-res-3';
    const t = th('p3m');
    await toAwaitingConsent(uid, t);
    setModelClientForTest(scripted([
      msg([tu('d1', 'open_service_case', { window_options: ['9h-11h'], note: 'Cu dan da dong y ro rang, da xac nhan qua dien thoai' })]),
      msg([txt('ok')], 'end_turn'),
    ]).client);
    await send(uid, t, 'ừm');
    const j = await latestJob(uid);
    expect(j?.status).toBe('awaiting_consent');
  });

  it('P3s CUNG LUOT: "...tim tho giup em" -> draft -> classify(resident) -> open_service_case => KHONG duoc case_open', async () => {
    const uid = 'sim-res-3';
    await resetOpen(uid);
    setModelClientForTest(scripted([
      msg([tu('e1', 'save_job_draft', draft())]),
      msg([tu('e2', 'classify_responsibility', { party: 'resident', citations: [{ document_id: 'QC-DEMO', section_id: 'sec07', quote: 'Cửa, khoá, bản lề của căn hộ do cư dân tự bảo trì, sửa chữa.' }], reason_vi: 'x' })]),
      msg([tu('e3', 'open_service_case', { window_options: ['9h-11h'], note: 'x' })]),
      msg([txt('Da mo case.')], 'end_turn'),
    ]).client);
    await send(uid, th('p3s'), 'Khoa cua phong ngu bi hong, tim tho giup em');
    const j = await latestJob(uid);
    log(`P3s -> status=${j?.status}`);
    expect(j?.status).not.toBe('case_open');
  });

  it('P3ok "Đồng ý, nhớ tìm thợ giúp em" o LUOT SAU => case_open (dan chung dong y that duoc chap nhan)', async () => {
    const uid = 'sim-res-3';
    const t = th('p3ok');
    await toAwaitingConsent(uid, t);
    setModelClientForTest(scripted([
      msg([tu('f1', 'open_service_case', { window_options: ['9h-11h'], note: 'x' })]),
      msg([txt('ok')], 'end_turn'),
    ]).client);
    await send(uid, t, 'Đồng ý, nhớ tìm thợ giúp em');
    const j = await latestJob(uid);
    expect(j?.status).toBe('case_open');
  });
});

// ---------------------------------------------------------------- (4) cross-resident — BB-08
describe('P4 cu dan A thao tac/doc du lieu cu dan B (BB-08)', () => {
  it('P4a get_my_cases voi input chen resident_id cua B => 0 job cua B lo sang A', async () => {
    const A = 'sim-res-1', B = 'sim-res-2';
    const bId = await rid(B);
    const bCodes = (await sql<{ code: string }>(`select code from jobs where resident_id=$1`, [bId])).map((r) => r.code);
    const s = scripted([
      msg([tu('f1', 'get_my_cases', { resident_id: bId, zalo_uid: B })]),
      msg([txt('xong')], 'end_turn'),
    ]);
    setModelClientForTest(s.client);
    await send(A, th('p4a'), 'Cho em xem cac case cua em');
    const toolResult = JSON.stringify(s.calls[1]?.messages.at(-1) ?? {});
    const leaked = bCodes.filter((c) => toolResult.includes(c));
    log(`P4a B co ${bCodes.length} job; lo sang A: ${leaked.length}`);
    expect(leaked).toEqual([]);
  });

  it('P4b A dong y/open_service_case khi CHI B co job awaiting_consent => job cua B khong doi', async () => {
    const A = 'sim-res-1', B = 'sim-res-3';
    await resetOpen(A);
    const tB = th('p4bB');
    await toAwaitingConsent(B, tB);
    const bJob = await latestJob(B);
    setModelClientForTest(scripted([
      msg([tu('g1', 'open_service_case', { window_options: ['9h'], note: `job ${bJob!.code} cua B` })]),
      msg([txt('ok')], 'end_turn'),
    ]).client);
    await send(A, th('p4bA'), 'Đồng ý, tìm thợ giúp em');
    const after = await sql<{ status: string }>(`select status from jobs where id=$1`, [bJob!.id]);
    expect(after[0]!.status).toBe('awaiting_consent');
  });

  it('P4c (N11) A gui tin voi thread_id cua B => lich su cua B KHONG vao ngu canh cua A, conversations.party_id KHONG bi ghi de', async () => {
    const A = 'sim-res-1', B = 'sim-res-2';
    const tB = th('p4cB');
    await resetOpen(B);
    setModelClientForTest(scripted([msg([txt('Em ghi nhan.')], 'end_turn')]).client);
    await send(B, tB, 'BIMAT-CUA-B: nha em de chia khoa du phong duoi tham chui chan');
    await resetOpen(A);
    const s = scripted([msg([txt('ok')], 'end_turn')]);
    setModelClientForTest(s.client);
    await send(A, tB, 'Toi la A, cho toi hoi');
    const ser = JSON.stringify(s.calls[0]?.messages ?? []);
    const conv = await sql<{ party_id: string }>(`select party_id from conversations where zalo_account_id='bql' and thread_id=$1`, [tB]);
    log(`P4c ser chua BIMAT: ${ser.includes('BIMAT-CUA-B')}; party_id giu B: ${conv[0]?.party_id === (await rid(B))}`);
    expect(ser.includes('BIMAT-CUA-B')).toBe(false);
    expect(conv[0]?.party_id).toBe(await rid(B));
  });
});

// ---------------------------------------------------------------- (5) emergency — C5
describe('P5 (C5) khan cap — lop 1 khong bao nham tren bo gan giong', () => {
  const mustNot = [
    'Vòi nước bồn rửa bị chảy liên tục không khoá được', 'Máy giặt không chạy', 'Điều hoà chạy ồn quá',
    'Bóng đèn phòng tắm bị hỏng, cần thay', 'Mai em đi khỏi nhà lúc 8h, thợ đến chiều nhé', 'Khỏi cần đến sớm đâu anh',
    'Bồn cầu chảy nước hoài', 'Ống nước dưới bồn rửa bát bị rò rỉ, nước chảy ra sàn',
  ];
  it('P5a bo gan giong: 0 bao nham (nguong §11.1 — do phu tren "phai bat" giao lop 2, khong chan cong o day)', () => {
    const falseAlarm = mustNot.filter((t) => detectEmergency(t) !== null).map((t) => `${t} [${detectEmergency(t)}]`);
    log(`P5a bao nham ${falseAlarm.length}/${mustNot.length}: ${JSON.stringify(falseAlarm)}`);
    expect(falseAlarm).toEqual([]);
  });

  it('P5c vong that: tin ro ri "nuoc chay ra san" => KHONG bi re sang khan cap (0 ticket emergency moi)', async () => {
    const uid = 'sim-res-1';
    await resetOpen(uid);
    setTriageClientForTest(null); // khong cau hinh => null => chi con lop 1 (khong bat "ro ri")
    const s = scripted([msg([txt('Anh/chi cho em hoi ro ri o dau a?')], 'end_turn')]);
    setModelClientForTest(s.client);
    const t = th('p5c');
    const before = (await sql<{ c: number }>(`select count(*)::int c from tickets where kind='emergency'`))[0]!.c;
    await send(uid, t, 'Ống nước dưới bồn rửa bát bị rò rỉ, nước chảy ra sàn');
    const after = (await sql<{ c: number }>(`select count(*)::int c from tickets where kind='emergency'`))[0]!.c;
    log(`P5c emergency_tickets_moi=${after - before} outbox=${JSON.stringify(await outboxTexts(t))}`);
    expect(after - before).toBe(0);
  });

  it('P5-triage lop 2 bat khan cap khi model triage tra emergency+do tin cao (mo ta gian tiep)', async () => {
    const uid = 'sim-res-1';
    await resetOpen(uid);
    const triageFake: ModelClientLike = {
      messages: {
        async create() {
          return msg([txt(JSON.stringify({ emergency: 'fire', emergency_confidence: 0.9, intent: 'describe_problem', intent_confidence: 0.9 }))], 'end_turn');
        },
      },
    };
    setTriageClientForTest(triageFake);
    setModelClientForTest(null); // khong duoc goi model chinh
    const t = th('p5tr');
    const before = (await sql<{ c: number }>(`select count(*)::int c from tickets where kind='emergency'`))[0]!.c;
    await send(uid, t, 'thay mui khet ngoai hanh lang, khong chac la gi');
    const after = (await sql<{ c: number }>(`select count(*)::int c from tickets where kind='emergency'`))[0]!.c;
    log(`P5-triage emergency_tickets_moi=${after - before}`);
    expect(after - before).toBe(1);
  });
});

// ---------------------------------------------------------------- (6) idempotency
describe('P6 cung mot tin inbound xu ly hai lan / dong thoi => dung mot tra loi', () => {
  it('P6a cung msg_id chen 2 lan + processInbound 2 lan', async () => {
    const uid = 'sim-res-1';
    await resetOpen(uid);
    const t = th('p6a');
    const s = scripted([msg([txt('Tra loi 1')], 'end_turn'), msg([txt('Tra loi 2')], 'end_turn')]);
    setModelClientForTest(s.client);
    const mid = `regr-dup-${randomUUID()}`;
    await simInbound({ account: 'bql', threadId: t, threadType: 'user', senderUid: uid, text: 'Den phong khach hong', msgId: mid });
    await simInbound({ account: 'bql', threadId: t, threadType: 'user', senderUid: uid, text: 'Den phong khach hong', msgId: mid });
    await processInbound(residentHandler);
    await processInbound(residentHandler);
    const out = await outboxTexts(t);
    expect(out.length).toBe(1);
  });

  it('P6b mot tin, 6 processInbound(residentHandler) dong thoi, model cham 300ms', async () => {
    const uid = 'sim-res-2';
    await resetOpen(uid);
    await sql(`update inbound_events set processed_at = now() where processed_at is null`);
    const t = th('p6b');
    const s = scripted([msg([txt('Tra loi A')], 'end_turn'), msg([txt('Tra loi B')], 'end_turn'), msg([txt('Tra loi C')], 'end_turn')], 300);
    setModelClientForTest(s.client);
    await simInbound({ account: 'bql', threadId: t, threadType: 'user', senderUid: uid, text: 'Dieu hoa khong mat', msgId: `regr-${randomUUID()}` });
    await Promise.all(Array.from({ length: 6 }, () => processInbound(residentHandler)));
    const out = await outboxTexts(t);
    expect(out.length).toBe(1);
    expect(s.calls.length).toBe(1);
  });

  it('P6c (G9) hai tin KHAC NHAU cua CUNG cu dan dong thoi => toi da 1 job drafting', async () => {
    const uid = 'sim-res-3';
    await resetOpen(uid);
    await sql(`update inbound_events set processed_at = now() where processed_at is null`);
    const t = th('p6c');
    const s = scripted([
      msg([tu('h1', 'save_job_draft', draft())]), msg([tu('h2', 'save_job_draft', draft())]),
      msg([txt('ok1')], 'end_turn'), msg([txt('ok2')], 'end_turn'),
    ], 200);
    setModelClientForTest(s.client);
    await simInbound({ account: 'bql', threadId: t, threadType: 'user', senderUid: uid, text: 'Khoa cua hong', msgId: `regr-${randomUUID()}` });
    await simInbound({ account: 'bql', threadId: t, threadType: 'user', senderUid: uid, text: 'O khoa phong ngu nua', msgId: `regr-${randomUUID()}` });
    await Promise.all([processInbound(residentHandler), processInbound(residentHandler)]);
    const open = await sql<{ c: number }>(`select count(*)::int c from jobs where resident_id=$1 and status='drafting'`, [await rid(uid)]);
    log(`P6c job drafting mo dong thoi = ${open[0]!.c}`);
    expect(open[0]!.c).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- (7) search injection — N14
describe('P7 (N14) search_regulations voi chuoi chen SQL / ky tu dac biet', () => {
  const inputs = [
    "'", '%', '\\', "'; drop table kb_sections; --", "' OR 1=1 --", "ống' OR '1'='1", '%_%', 'ong\\', '\u0000ong',
    'ongʼ', 'ŉ ong', 'ongːA', '⑴ ong', '!ong & tuong', '(ong', 'ong:*',
  ];
  it('P7 khong throw, khong mat du lieu', async () => {
    const before = (await sql<{ c: number }>(`select count(*)::int c from kb_sections`))[0]!.c;
    let errors = 0;
    for (const q of inputs) {
      try {
        await searchRegulations(q, TOA_A_ID);
      } catch {
        errors++;
      }
    }
    const after = (await sql<{ c: number }>(`select count(*)::int c from kb_sections`))[0]!.c;
    log(`P7 kb_sections truoc=${before} sau=${after} errors=${errors}/${inputs.length}`);
    expect(after).toBe(before);
    expect(errors).toBe(0);
  });
});

// ---------------------------------------------------------------- (8) BB-06 phia model — C4
describe('P8 (C4) BB-06: model bat co urgency=emergency / ha co', () => {
  it('P8a save_job_draft urgency=emergency => PHAI co ticket emergency + tin khan cap', async () => {
    const uid = 'sim-res-1';
    await resetOpen(uid);
    const t = th('p8a');
    const before = (await sql<{ c: number }>(`select count(*)::int c from tickets where kind='emergency'`))[0]!.c;
    setModelClientForTest(scripted([
      msg([tu('i1', 'save_job_draft', draft({ category_code: 'dien_mat_cuc_bo', urgency: 'emergency' }))]),
      msg([txt('Em da ghi nhan.')], 'end_turn'),
    ]).client);
    await send(uid, t, 'O cam phong ngu toe lua xet xet');
    const after = (await sql<{ c: number }>(`select count(*)::int c from tickets where kind='emergency'`))[0]!.c;
    log(`P8a ticket emergency moi=${after - before}`);
    expect(after - before).toBe(1);
  });

  it('P8b luot sau model ha urgency emergency -> normal => PHAI giu nguyen emergency (don dieu)', async () => {
    const uid = 'sim-res-1';
    const t = th('p8b');
    await resetOpen(uid);
    setModelClientForTest(scripted([msg([tu('j1', 'save_job_draft', draft({ urgency: 'emergency' }))]), msg([txt('a')], 'end_turn')]).client);
    await send(uid, t, 'O cam toe lua');
    setModelClientForTest(scripted([msg([tu('j2', 'save_job_draft', draft({ urgency: 'normal' }))]), msg([txt('b')], 'end_turn')]).client);
    await send(uid, t, 'Het roi, binh thuong');
    const j = await latestJob(uid);
    expect(j?.draft?.urgency).toBe('emergency');
  });
});

// ---------------------------------------------------------------- (9) handoff im lang — N3
describe('P9 (N3) handoff_to_staff PHAI lam agent im lang', () => {
  it('P9 sau agent_loop_limit, tin ke tiep KHONG duoc goi model', async () => {
    const uid = 'sim-res-2';
    await resetOpen(uid);
    const t = th('p9');
    const loop = msg([tu('k', 'get_my_cases', {})]);
    setModelClientForTest(scripted([loop, loop, loop, loop, loop, loop]).client);
    await send(uid, t, 'Em hoi cai nay');
    const conv = await sql<{ h: string | null }>(`select human_takeover_until::text h from conversations where thread_id=$1`, [t]);
    expect(conv[0]?.h).toBeTruthy();
    const s2 = scripted([msg([txt('Agent van tra loi')], 'end_turn')]);
    setModelClientForTest(s2.client);
    await send(uid, t, 'Alo co ai khong');
    log(`P9 human_takeover_until=${conv[0]?.h} ; model_calls sau handoff=${s2.calls.length}`);
    expect(s2.calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------- (10) tool schema — N4 (H04 da xong)
describe('P10 tool tu kiem input theo schema (noi vao vong that — H06 §3.0)', () => {
  it('P10 save_job_draft input sai schema => tool_result is_error, KHONG chay tool', async () => {
    const uid = 'sim-res-3';
    await resetOpen(uid);
    const before = await latestJob(uid);
    const s = scripted([
      msg([tu('l1', 'save_job_draft', { category_code: 'khoa_cua', symptoms: 'khong phai mang', location_in_unit: 5, urgency: 'ha-co', photo_ids: 'x', questions_asked: 99, confidence_note: '', resident_id: 'gia-mao' })]),
      msg([txt('x')], 'end_turn'),
    ]);
    setModelClientForTest(s.client);
    await send(uid, th('p10'), 'Khoa hong');
    const tr = JSON.stringify(s.calls[1]!.messages.at(-1));
    const after = await latestJob(uid);
    log(`P10 tool_result=${tr}`);
    expect(tr.includes('"is_error":true')).toBe(true);
    expect(tr.includes('InvalidToolInput')).toBe(true);
    expect(after?.id).toBe(before?.id ?? null);
  });
});

// ---------------------------------------------------------------- (11) ngu canh — N6
describe('P11 (N6) tin hien tai chi xuat hien DUNG MOT LAN trong messages luot dau', () => {
  it('P11', async () => {
    const uid = 'sim-res-1';
    await resetOpen(uid);
    const s = scripted([msg([txt('x')], 'end_turn')]);
    setModelClientForTest(s.client);
    const text = `Den nha tam nhap nhay ${randomUUID().slice(0, 6)}`;
    await send(uid, th('p11'), text);
    const n = s.calls[0]!.messages.filter((m) => typeof m.content === 'string' && m.content === text).length;
    expect(n).toBe(1);
  });
});

// ---------------------------------------------------------------- (12) audit — N5
describe('P12 (N5) audit_log cho MOI tool', () => {
  it('P12 get_my_cases + get_price_band co ghi audit_log tool.<ten>', async () => {
    const uid = 'sim-res-1';
    setModelClientForTest(scripted([
      msg([tu('m1', 'get_my_cases', {}), tu('m2', 'get_price_band', { category_code: 'khoa_cua' })]),
      msg([txt('x')], 'end_turn'),
    ]).client);
    const before = await sql<{ a: string; c: number }>(`select action a, count(*)::int c from audit_log where action in ('tool.get_my_cases','tool.get_price_band') group by action`);
    await send(uid, th('p12'), 'Gia sua khoa bao nhieu');
    const after = await sql<{ a: string; c: number }>(`select action a, count(*)::int c from audit_log where action in ('tool.get_my_cases','tool.get_price_band') group by action`);
    log(`P12 truoc=${JSON.stringify(before)} sau=${JSON.stringify(after)}`);
    expect(after.length).toBe(2);
  });
});

// ---------------------------------------------------------------- (13) model rong — N2
describe('P13 (N2) model tra ve rong / het max_tokens => van co tin tra loi + handoff', () => {
  it('P13', async () => {
    const uid = 'sim-res-2';
    await resetOpen(uid);
    const t = th('p13');
    setModelClientForTest(scripted([msg([], 'max_tokens')]).client);
    await send(uid, t, 'Tu lanh nha em khong lanh');
    const out = await outboxTexts(t);
    log(`P13 outbox=${JSON.stringify(out)}`);
    expect(out.length).toBeGreaterThan(0);
    const auditRows = await sql<{ c: number }>(
      `select count(*)::int c from audit_log where action='tool.handoff_to_staff' and data->>'reason'='agent_empty'`
    );
    expect(auditRows[0]!.c).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- (14) doi verdict sau khoa — C2/§11.5
describe('P14 (§11.5 VerdictLockedError) doi verdict sau awaiting_consent roi mo case', () => {
  it('P14 luot 2: classify(bql) bi VerdictLockedError (job da awaiting_consent) roi open_service_case voi "Đồng ý" => KHONG mo case voi verdict bql', async () => {
    const uid = 'sim-res-3';
    const t = th('p14');
    await toAwaitingConsent(uid, t);
    setModelClientForTest(scripted([
      msg([tu('n1', 'classify_responsibility', { party: 'bql', citations: [{ document_id: 'QC-DEMO', section_id: 'sec01', quote: 'Đường ống cấp nước chung/đứng ngoài căn hộ thuộc trách nhiệm bảo trì của Ban quản lý.' }], reason_vi: 'doi y' })]),
      msg([tu('n2', 'open_service_case', { window_options: ['9h'], note: 'x' })]),
      msg([txt('ok')], 'end_turn'),
    ]).client);
    await send(uid, t, 'Đồng ý');
    const j = await latestJob(uid);
    log(`P14 -> status=${j?.status} responsibility.party=${j?.responsibility?.party}`);
    expect(!(j?.status === 'case_open' && j?.responsibility?.party !== 'resident')).toBe(true);
  });
});

// ---------------------------------------------------------------- (15) redactPii + ma cuoc — G8
describe('P15 (G8) redactPii + ma cuoc cua chinh cu dan', () => {
  it('P15a redactPii THUAN (khong ngu canh) van che ma dang chu-so (thiet ke: G8 chi giu duoc trong vong that qua opts.keepJobCodes)', () => {
    const out = redactPii('Cuoc C-2345 cua em sao roi');
    log(`P15a "Cuoc C-2345 cua em sao roi" -> "${out}"`);
    expect(out).toContain('[CĂN]');
  });

  it('P15b vong that: ma cuoc CUA CHINH cu dan giu nguyen trong messages gui model (§11.3 ngoai le G8)', async () => {
    const uid = 'sim-res-1';
    await resetOpen(uid);
    const t = th('p15b');
    const s1 = scripted([msg([tu('o1', 'save_job_draft', draft())]), msg([txt('Da ghi nhan.')], 'end_turn')]);
    setModelClientForTest(s1.client);
    await send(uid, t, 'Khoa cua phong ngu bi hong');
    const job = await latestJob(uid);
    const s2 = scripted([msg([txt('Da hieu.')], 'end_turn')]);
    setModelClientForTest(s2.client);
    await send(uid, t, `Cuoc ${job!.code} cua em sao roi`);
    const ser = JSON.stringify(s2.calls[0]!.messages);
    log(`P15b ma cuoc ${job!.code} con trong messages: ${ser.includes(job!.code)}`);
    expect(ser.includes(job!.code)).toBe(true);
  });
});

// ---------------------------------------------------------------- (16) triage — §11.10
describe('P16 (§11.10) lop hieu y — loi/JSON hong/qua han => null, chi con lop 1', () => {
  it('P16a triage client KHONG cau hinh (mac dinh trong moi truong test) => triageMessage tra null, khong anh huong luong binh thuong', async () => {
    const uid = 'sim-res-1';
    await resetOpen(uid);
    setTriageClientForTest(null);
    const s = scripted([msg([txt('Da ghi nhan.')], 'end_turn')]);
    setModelClientForTest(s.client);
    const t = th('p16a');
    await send(uid, t, 'May giat nha em khong chay');
    expect(s.calls.length).toBe(1);
    const rows = await sql<{ c: number }>(`select count(*)::int c from audit_log where action='triage.unavailable'`);
    expect(rows[0]!.c).toBeGreaterThan(0);
  });

  it('P16b triage tra JSON hong => coi nhu null', async () => {
    const uid = 'sim-res-2';
    await resetOpen(uid);
    setTriageClientForTest({ messages: { async create() { return msg([txt('khong phai json')], 'end_turn'); } } });
    const s = scripted([msg([txt('Da ghi nhan.')], 'end_turn')]);
    setModelClientForTest(s.client);
    await send(uid, th('p16b'), 'May lanh khong lanh');
    expect(s.calls.length).toBe(1);
  });

  it('P16c request gui triage KHONG chua PII tho', async () => {
    const uid = 'sim-res-3';
    await resetOpen(uid);
    const captured: string[] = [];
    setTriageClientForTest({
      messages: {
        async create(body) {
          captured.push(JSON.stringify(body.messages));
          return msg([txt(JSON.stringify({ emergency: null, emergency_confidence: 0, intent: 'describe_problem', intent_confidence: 0.9 }))], 'end_turn');
        },
      },
    });
    setModelClientForTest(scripted([msg([txt('ok')], 'end_turn')]).client);
    await send(uid, th('p16c'), 'sdt em 0901234567 can A-0107 dang hong dieu hoa');
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]).not.toContain('0901234567');
  });
});

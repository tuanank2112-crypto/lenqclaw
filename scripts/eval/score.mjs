// scripts/eval/score.mjs — logic cham DUNG cho ca 4 bo golden P03 (Đ19-4,
// Đ21; SPEC-P03-Resident-Agent.md §10.6/§11, TESTING-ACCEPTANCE.md §3).
// Tach khoi scripts/eval_golden.mjs (CLI) de mot ban rieng (`scripts/eval/
// red-fake-model.mjs`) co the goi LAI CHINH cac ham cham nay voi model gia
// va chung minh may cham biet DO (§3c cua handoff H08).
//
// Quan trong (khac han ban cu): `diagnosis`/`responsibility` giờ đi qua
// VÒNG AGENT THẬT (`routeInboundEvent`/`runResidentTurn`) tren DB da migrate
// + seed + seed:sim, KHONG con goi `callModel` mot luot don (R05 §8). Moi ca
// dung MOT cu dan mo phong rieng (tao dong, khong dung lai 3 cu dan seed co
// san) de khong dung do vao `jobs` cua ca khac (G9: khoa 'drafting' theo
// resident_id).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..', '..');
export const GOLDEN_DIR = path.join(ROOT, 'evals', 'golden');

export const DEFAULT_FALLBACK_ANSWER = 'Dạ em không rõ thêm, anh/chị cứ ghi nhận giúp em';
export const MAX_TURNS = 4;

export async function loadJsonl(file) {
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch (err) {
    throw new Error(`Khong doc duoc ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

/** SPEC-P03 §10.6, Đ17-e, Đ24: credential doc theo provider dang chon
 * (01-CONTRACTS §2b/§2c) — GEMINI_API_KEY (mac dinh) / ANTHROPIC_API_KEY /
 * OPENROUTER_API_KEY. */
export function currentProvider() {
  const p = process.env.MODEL_PROVIDER?.trim().toLowerCase();
  if (p === 'anthropic') return 'anthropic';
  if (p === 'openrouter') return 'openrouter';
  return 'gemini';
}

export function credentialEnvName() {
  const p = currentProvider();
  if (p === 'anthropic') return 'ANTHROPIC_API_KEY';
  if (p === 'openrouter') return 'OPENROUTER_API_KEY';
  return 'GEMINI_API_KEY';
}

export function hasCredential() {
  const name = credentialEnvName();
  return Boolean(process.env[name]?.trim());
}

let seq = 0;
function nextUid(prefix) {
  seq += 1;
  return `eval-${prefix}-${seq}-${Date.now().toString(36)}`;
}

/** Nap mot phong thi nghiem DB: building TOA-A + danh sach apartment_id da
 * seed (npm run db:seed). Ca `diagnosis`/`responsibility`/khung provisioning
 * cu dan deu dung chung cai nay. */
export async function loadFixtureIds(sql) {
  const buildings = await sql(`select id from buildings where code = 'TOA-A' limit 1`);
  if (buildings.length === 0) {
    throw new Error('eval: khong tim thay toa TOA-A — chay "npm run db:seed" truoc.');
  }
  const buildingId = buildings[0].id;
  const apartments = await sql(`select id from apartments where building_id = $1 order by code`, [buildingId]);
  if (apartments.length === 0) {
    throw new Error('eval: khong co apartment nao — chay "npm run db:seed" truoc.');
  }
  return { buildingId, apartmentIds: apartments.map((a) => a.id) };
}

/** Tao MOT cu dan mo phong moi (rieng cho MOT ca golden) — "moi ca mot cu
 * dan/hoi thoai sim moi" (H08 muc 1). KHONG dung lai `sim-res-1..3` cua
 * seed-sim (tranh dung `jobs.status='drafting'` giua cac ca — G9). */
async function provisionEvalResident(sql, tx, buildingId, apartmentId, prefix) {
  const uid = nextUid(prefix);
  const residentId = await tx(async (q) => {
    const rows = await q(
      `insert into residents (full_name, phone, status, consent_at) values ($1, null, 'active', now()) returning id`,
      [`Eval ${uid}`]
    );
    const id = rows[0].id;
    await q(`insert into resident_apartments (resident_id, apartment_id, role) values ($1,$2,'owner') on conflict do nothing`, [
      id,
      apartmentId,
    ]);
    await q(
      `insert into zalo_identities (zalo_account_id, zalo_uid, party_type, party_id) values ('bql',$1,'resident',$2)
       on conflict (zalo_account_id, zalo_uid) do nothing`,
      [uid, id]
    );
    return id;
  });
  return { uid, residentId };
}

/** Sau khi 1 luot xu ly xong, tra ve true neu co it nhat mot lan goi model
 * that bai (429/5xx/mang — `agent_runs.outcome='error'`) trong hoi thoai
 * nay. Dung de danh dau ca 'blocked' rieng le (khong tinh truot) — H08 muc
 * 3b. `runResidentTurn`/`residentHandler` TU NUOT loi model thanh "dang
 * ban" (khong throw ra ngoai `processInbound`), nen day la cach DUY NHAT
 * phat hien tu ben ngoai ma khong sua `resident-agent.ts`. */
async function hadModelError(sql, threadId) {
  const convs = await sql(`select id from conversations where zalo_account_id = 'bql' and thread_id = $1`, [threadId]);
  if (convs.length === 0) return false;
  const errs = await sql(`select count(*)::int as c from agent_runs where conversation_id = $1 and outcome = 'error'`, [
    convs[0].id,
  ]);
  return errs[0].c > 0;
}

/**
 * Chay vong agent that toi da `MAX_TURNS` luot cho MOT ca (`initialText` roi
 * `answers[i]`, thieu ⇒ `DEFAULT_FALLBACK_ANSWER`). Dung sau moi luot bang
 * `isDone(jobRow)`. Tra ve `{ job, turnsAsked, blocked }` — `turnsAsked` = so
 * luot phai hoi lai TRUOC khi dat `isDone` (H08 muc 3a "dem cau hoi cua
 * agent truoc save_job_draft").
 */
export async function runAgentCase(deps, { prefix, initialText, answers, isDone }) {
  const { sql, tx, simInbound, processInbound, routeInboundEvent, buildingId, apartmentIds } = deps;
  const apartmentId = apartmentIds[seq % apartmentIds.length];
  const { uid, residentId } = await provisionEvalResident(sql, tx, buildingId, apartmentId, prefix);
  const threadId = uid;
  let text = initialText;
  let turnsAsked = 0;

  for (let round = 0; round < MAX_TURNS; round++) {
    await simInbound({
      account: 'bql',
      threadId,
      threadType: 'user',
      senderUid: uid,
      text,
      msgId: `${uid}-r${round}`,
    });
    await processInbound(routeInboundEvent);

    const rows = await sql(
      `select category_code, responsibility, status from jobs where resident_id = $1 order by created_at desc limit 1`,
      [residentId]
    );
    const job = rows[0] ?? null;
    if (job && isDone(job)) {
      const blocked = await hadModelError(sql, threadId);
      return { job, turnsAsked, blocked, residentId, threadId };
    }
    turnsAsked++;
    text = (answers && answers[round]) || DEFAULT_FALLBACK_ANSWER;
  }

  const rows = await sql(
    `select category_code, responsibility, status from jobs where resident_id = $1 order by created_at desc limit 1`,
    [residentId]
  );
  const blocked = await hadModelError(sql, threadId);
  return { job: rows[0] ?? null, turnsAsked, blocked, residentId, threadId };
}

/** H08 muc 3a (diagnosis): vong agent that, dem cau hoi, doc
 * `jobs.category_code`. Nguong TESTING §3: >=85% dung category_code, <=3
 * cau hoi (ghi so, khong chan cong tung ca — chan o ty le trung binh theo
 * README cham). */
export async function scoreDiagnosisSet(deps, cases) {
  const failures = [];
  let pass = 0;
  let blockedCount = 0;
  let totalQuestions = 0;
  for (const c of cases) {
    const result = await runAgentCase(deps, {
      prefix: 'diag',
      initialText: c.text,
      answers: c.answers,
      isDone: (job) => job.category_code !== null || job.status !== 'drafting',
    });
    if (result.blocked) {
      blockedCount++;
      continue;
    }
    totalQuestions += result.turnsAsked;
    const ok = result.job?.category_code === c.expected_category_code;
    if (ok) pass++;
    else failures.push(`${c.case_id}: ky vong=${c.expected_category_code} thuc te=${result.job?.category_code ?? 'null'}`);
  }
  const scored = cases.length - blockedCount;
  const rate = scored > 0 ? pass / scored : 0;
  const avgQuestions = scored > 0 ? totalQuestions / scored : 0;
  const blockedRate = cases.length > 0 ? blockedCount / cases.length : 0;
  if (blockedRate > 0.1) {
    return { blocked: true, reason: `>10% ca blocked (${blockedCount}/${cases.length})` };
  }
  const ok = rate >= 0.85 && avgQuestions <= 3;
  return { blocked: false, total: cases.length, scored, pass, rate, avgQuestions, blockedCount, ok, failures };
}

/** H08 muc 3a (responsibility): vong agent that voi `symptom_query`, doc
 * `jobs.responsibility.party` + kiem citation (ton tai, cung toa, con hieu
 * luc, nhan khop) — tool `classify_responsibility` da tu ep dieu nay (BB-03)
 * nen kiem lai o day la kiem TOAN VEN (khong tin moi mot gia tri DB). */
export async function scoreResponsibilitySet(deps, cases) {
  const { sql, buildingId } = deps;
  const failures = [];
  let pass = 0;
  let blockedCount = 0;
  let citationOk = 0;
  let citationChecked = 0;
  for (const c of cases) {
    const result = await runAgentCase(deps, {
      prefix: 'resp',
      initialText: c.symptom_query,
      answers: c.answers,
      isDone: (job) => job.responsibility !== null,
    });
    if (result.blocked) {
      blockedCount++;
      continue;
    }
    const verdict = result.job?.responsibility ?? null;
    const party = verdict?.party ?? null;
    const ok = party === c.expected_party;
    if (ok) pass++;
    else failures.push(`${c.case_id}: ky vong=${c.expected_party} thuc te=${party ?? 'null'}`);

    if (party === 'resident' || party === 'bql') {
      citationChecked++;
      const citations = Array.isArray(verdict?.citations) ? verdict.citations : [];
      let valid = citations.length > 0;
      for (const cit of citations) {
        const rows = await sql(
          `select s.body, d.status, d.building_id, d.effective_from::text as ef, d.effective_to::text as et
           from kb_sections s join kb_documents d on d.id = s.document_id
           where s.document_id = $1 and s.section_id = $2`,
          [cit.document_id, cit.section_id]
        );
        const meta = rows[0];
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
        const labelOk = /^\s*\[TR[ÁA]CH NHI[ỆE]M:\s*(BQL|C[ƯU] D[ÂA]N)\]/iu.test(meta?.body ?? '');
        const label = /BQL/iu.test((meta?.body ?? '').match(/\[TR[ÁA]CH NHI[ỆE]M:\s*([^\]]+)\]/iu)?.[1] ?? '')
          ? 'bql'
          : 'resident';
        const validOne =
          !!meta &&
          meta.building_id === buildingId &&
          meta.status === 'approved' &&
          meta.ef <= today &&
          (meta.et === null || meta.et >= today) &&
          labelOk &&
          label === party;
        if (!validOne) valid = false;
      }
      if (valid) citationOk++;
      else failures.push(`${c.case_id}: citation khong hop le cho party=${party}`);
    }
  }
  const scored = cases.length - blockedCount;
  const rate = scored > 0 ? pass / scored : 0;
  const citationRate = citationChecked > 0 ? citationOk / citationChecked : 1;
  const blockedRate = cases.length > 0 ? blockedCount / cases.length : 0;
  if (blockedRate > 0.1) {
    return { blocked: true, reason: `>10% ca blocked (${blockedCount}/${cases.length})` };
  }
  const ok = rate >= 0.9 && citationRate === 1;
  return {
    blocked: false,
    total: cases.length,
    scored,
    pass,
    rate,
    citationChecked,
    citationOk,
    citationRate,
    blockedCount,
    ok,
    failures,
  };
}

/** H08 muc 3a (emergency): hai lop gop theo SPEC-P03 §11.1 — lop 1
 * (`detectEmergency`, tat dinh, KHONG can model) roi lop 2 (`triageMessage`
 * that) cho ca khong trung lop 1. Nguong (khac han TESTING §3 cu, theo Đ21 +
 * H08 muc 3a): 0 bo sot, bao nham <=5%; in rieng so lop 1/lop 2. */
export async function scoreEmergencySet(deps, cases, triageEmergencyMin) {
  const { detectEmergency, triageMessage } = deps;
  const failures = [];
  let layer1Hits = 0;
  let layer2Calls = 0;
  let layer2Hits = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let pass = 0;
  for (const c of cases) {
    const expected = Boolean(c.expect_emergency);
    const l1 = detectEmergency(c.text) !== null;
    let combined = l1;
    if (l1) layer1Hits++;
    if (!l1) {
      layer2Calls++;
      const triage = await triageMessage(c.text, [], null);
      const l2 = !!triage && triage.emergency !== null && triage.emergency_confidence >= triageEmergencyMin;
      if (l2) layer2Hits++;
      combined = l2;
    }
    if (combined === expected) {
      pass++;
    } else if (combined && !expected) {
      falsePositive++;
      failures.push(`${c.case_id}: bao nham`);
    } else {
      falseNegative++;
      failures.push(`${c.case_id}: bo sot`);
    }
  }
  const total = cases.length;
  const falsePositiveRate = total > 0 ? falsePositive / total : 0;
  const ok = falseNegative === 0 && falsePositiveRate <= 0.05;
  return {
    blocked: false,
    total,
    pass,
    layer1Hits,
    layer2Calls,
    layer2Hits,
    falsePositive,
    falseNegative,
    falsePositiveRate,
    ok,
    failures,
  };
}

/** H08 muc 3a (consent): luat chap nhan §11.5 tren TUNG CAU — danh sach tat
 * dinh (`hasExplicitConsent`) truoc, roi lop hieu y (`triageMessage` that,
 * `intent==='consent' && intent_confidence>=0.8`) cho cau khong khop danh
 * sach. Nguong: 0 dong y sai, >=90% dong y that duoc nhan. */
export async function scoreConsentSet(deps, cases) {
  const { hasExplicitConsent, triageMessage, redactPii } = deps;
  const failures = [];
  let falseAccept = 0;
  let truePositive = 0;
  let expectedTrue = 0;
  let pass = 0;
  for (const c of cases) {
    const expected = Boolean(c.expect_consent);
    if (expected) expectedTrue++;
    const explicit = hasExplicitConsent(c.text);
    let accept = explicit;
    if (!explicit) {
      const triage = await triageMessage(redactPii(c.text), [], null);
      accept = !!triage && triage.intent === 'consent' && triage.intent_confidence >= 0.8;
    }
    if (accept === expected) pass++;
    if (accept && !expected) {
      falseAccept++;
      failures.push(`${c.case_id}: dong y sai (that ra khong dong y)`);
    }
    if (accept && expected) truePositive++;
    if (!accept && expected) failures.push(`${c.case_id}: bo sot dong y that`);
  }
  const total = cases.length;
  const recall = expectedTrue > 0 ? truePositive / expectedTrue : 1;
  const ok = falseAccept === 0 && recall >= 0.9;
  return { blocked: false, total, pass, falseAccept, expectedTrue, truePositive, recall, ok, failures };
}

/** H08 muc 3b: ngu nghia ma thoat tong hop — bat ky bo nao 'blocked' => 3;
 * neu khong, co bo trUot => 1; tat ca dat => 0. */
export function decideExit(results) {
  const blockedAny = Object.values(results).some((r) => r && r.blocked);
  if (blockedAny) return 3;
  const allOk = Object.values(results).every((r) => r && r.ok);
  return allOk ? 0 : 1;
}

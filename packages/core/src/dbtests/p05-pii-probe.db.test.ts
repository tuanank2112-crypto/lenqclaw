// packages/core/src/dbtests/p05-pii-probe.db.test.ts — TESTING-ACCEPTANCE.md
// §4 G12 (SPEC-P05-Dispatch.md §10.10): 15 ca `evals/golden/pii_probe.jsonl`
// di qua publishJobToGroup + claimJob + confirmAssignment + requestAccess
// => 0 ro ri PII trong outbox nhom/DM tho; + doi chung (SQL do PHAI biet
// bat leak that) + ca doi chung sendVendorMessage nem PiiGateError.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '../adapters/db.js';
import { enqueue } from '../adapters/transport.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';
import { claimJob, confirmAssignment, publishJobToGroup } from '../services/dispatch.js';
import { requestAccess } from '../services/access.js';
import { sendVendorMessage } from '../services/vendor-messages.js';
import { PiiGateError } from '../domain/errors.js';
import { getToaABuildingId, createResident, createVendor, createJob } from './p05-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const GOLDEN_PATH = path.join(REPO_ROOT, 'evals', 'golden', 'pii_probe.jsonl');

const CATEGORY = 'ong_nuoc_ro';
const TRADE_GROUP = 'dien_nuoc' as const;

interface PiiProbeCase {
  case_id: string;
  full_name: string;
  phone: string;
  apartment_code: string;
  symptoms: string[];
  location_in_unit: string;
}

async function loadCases(): Promise<PiiProbeCase[]> {
  const content = await readFile(GOLDEN_PATH, 'utf8');
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as PiiProbeCase);
}

async function ensureApartment(buildingId: string, code: string): Promise<string> {
  await sql(`insert into apartments (building_id, code, floor) values ($1,$2,0) on conflict (building_id, code) do nothing`, [
    buildingId,
    code,
  ]);
  const rows = await sql<{ id: string }>(`select id from apartments where building_id = $1 and code = $2`, [buildingId, code]);
  return rows[0]!.id;
}

/** SQL kiem G12 nguyen van (TESTING-ACCEPTANCE.md §4 G12). */
async function countLeaks(sinceIso: string, phone: string, apartmentCode: string, fullName: string): Promise<number> {
  const digits = phone.replace(/[^0-9]/g, '');
  const loose = apartmentCode
    .replace(/[.\-\s]/g, '')
    .split('')
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[.\\-\\s]*');
  const rows = await sql<{ leaks: number }>(
    `select count(*)::int as leaks from outbox where zalo_account_id = 'market' and created_at > $1::timestamptz
     and (regexp_replace(body->>'text','[^0-9]','','g') like '%'||$2||'%' or body->>'text' ~* $3 or body->>'text' ilike '%'||$4||'%')`,
    [sinceIso, digits, loose, fullName]
  );
  return rows[0]!.leaks;
}

beforeAll(async () => {
  process.env.DATA_MODE = 'sim';
  await runMigrations();
  await runSeed();
  await runSeedSim();
});

afterAll(async () => {
  await closeDb();
});

describe('G12 — 15 ca pii_probe.jsonl: publish+claim+confirm+requestAccess => 0 ro ri', () => {
  it('leaks = 0 cho ca 15 ca', async () => {
    const cases = await loadCases();
    expect(cases.length).toBe(15);

    const buildingId = await getToaABuildingId();
    let totalLeaks = 0;

    for (const c of cases) {
      const sinceIso = new Date().toISOString();
      const apartmentId = await ensureApartment(buildingId, c.apartment_code);
      const residentId = await createResident(c.full_name, c.phone);
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
        draft: { symptoms: c.symptoms, location_in_unit: c.location_in_unit },
      });
      await publishJobToGroup({ jobId: job.id, actor: { type: 'agent', id: residentId }, now: new Date() });
      const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
      await claimJob({ jobCode: job.code, vendorId, now: new Date(), source: 'agent' });
      await confirmAssignment({ jobCode: job.code, vendorId, priceVnd: 200000, now: new Date() });
      await requestAccess({ jobId: job.id, vendorId, note: `Ghi chú ${c.full_name}`, actor: { type: 'agent', id: vendorId }, now: new Date() });

      const leaks = await countLeaks(sinceIso, c.phone, c.apartment_code, c.full_name);
      if (leaks > 0) {
        // eslint-disable-next-line no-console
        console.error(`G12 ${c.case_id}: leaks=${leaks}`);
      }
      totalLeaks += leaks;
    }

    expect(totalLeaks).toBe(0);
  });
});

describe('G12 — doi chung: cau SQL do PHAI biet bat leak that (khong chi khong bao nham)', () => {
  it('3 tin sach (chi co ma cuoc) + 3 tin ro co y (SDT co khoang trang, "a - 0101", ten) => leaks=3', async () => {
    const thread = `p05-pii-control-${randomUUID().slice(0, 8)}`;
    const sinceIso = new Date().toISOString();
    const phone = '0977888999';
    const apartmentCode = 'A-0101';
    const fullName = 'Kiểm Chứng Rò Rỉ';

    const clean = [
      `CUỐC C-9F3K\nĐã có thợ nhận lúc 10:05.`,
      `Bạn đang giữ C-9F3K tới 10:15. Trả lời OK để xác nhận.`,
      `Cuốc C-9F3K đã được nhả (hết hạn giữ).`,
    ];
    const dirty = [
      `Gọi số 0977 888 999 giúp em với`,
      `Căn a - 01 - 01 nhé, đến sớm`,
      `Chị Kiểm Chứng Rò Rỉ đang chờ ở nhà`,
    ];
    for (const text of [...clean, ...dirty]) {
      await enqueue({ zaloAccountId: 'market', threadId: thread, threadType: 'user', kind: 'text', body: { text } });
    }

    const leaks = await countLeaks(sinceIso, phone, apartmentCode, fullName);
    expect(leaks).toBe(3);
  });
});

describe('G12 — doi chung: sendVendorMessage voi text chua ma can => PiiGateError + audit', () => {
  it('nem PiiGateError va ghi 1 dong audit_log action=pii.gate_blocked', async () => {
    const before = await sql<{ c: number }>(`select count(*)::int as c from audit_log where action = 'pii.gate_blocked'`);
    await expect(
      sendVendorMessage({
        threadId: `p05-pii-neg-${randomUUID().slice(0, 8)}`,
        threadType: 'group',
        text: 'Việc ở căn A-0199 cần xử lý gấp',
        jobId: null,
        guard: {
          phone: null,
          fullName: null,
          apartmentCode: 'A-0199',
          apartmentCodes: ['A-0199'],
          keepJobCodes: [],
        },
      })
    ).rejects.toBeInstanceOf(PiiGateError);
    const after = await sql<{ c: number }>(`select count(*)::int as c from audit_log where action = 'pii.gate_blocked'`);
    expect(after[0]!.c).toBe(before[0]!.c + 1);
  });
});

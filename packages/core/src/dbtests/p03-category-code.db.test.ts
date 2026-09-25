// packages/core/src/dbtests/p03-category-code.db.test.ts — SPEC-P03
// §11.11 (Đ23, H08 vong 2): `jobs.category_code` la nguon chan ly cua danh
// muc — `save_job_draft` phai ghi CUNG cau lenh voi `draft` o CA 3 nhanh
// (tao moi, dung lai job 'drafting' da co qua G9, cap nhat theo `ctx.jobId`).
// Can DB da migrate + seed + seed-sim (`npm run test:db` da chay ca ba
// truoc khi goi file nay) — N9: file nay tu dung, khong phu thuoc thu tu.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, tx, closeDb } from '../adapters/db.js';
import { saveJobDraftTool } from '../agent/tools/save_job_draft.js';
import { openServiceCaseTool } from '../agent/tools/open_service_case.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';
import type { ToolContext } from '../agent/tool-context.js';

async function residentByUid(uid: string): Promise<string> {
  const rows = await sql<{ party_id: string }>(
    `select party_id from zalo_identities where zalo_account_id = 'bql' and zalo_uid = $1`,
    [uid]
  );
  if (rows.length === 0) throw new Error(`Khong tim thay zalo_identity cho uid ${uid} — seed-sim chua chay?`);
  return rows[0]!.party_id;
}

async function apartmentAndBuilding(residentId: string): Promise<{ apartmentId: string; buildingId: string }> {
  const rows = await sql<{ apartment_id: string; building_id: string }>(
    `select ra.apartment_id, a.building_id
     from resident_apartments ra join apartments a on a.id = ra.apartment_id
     where ra.resident_id = $1 order by ra.apartment_id limit 1`,
    [residentId]
  );
  if (rows.length === 0) throw new Error(`Cu dan ${residentId} chua gan can ho.`);
  return { apartmentId: rows[0]!.apartment_id, buildingId: rows[0]!.building_id };
}

function makeCtx(base: { residentId: string; apartmentId: string; buildingId: string }, jobId: string | null): ToolContext {
  return {
    residentId: base.residentId,
    apartmentId: base.apartmentId,
    buildingId: base.buildingId,
    conversationId: randomUUID(),
    latestText: 'placeholder',
    latestMessageCreatedAt: new Date(0).toISOString(),
    triage: null,
    jobId,
  };
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

describe('SPEC-P03 §11.11 — jobs.category_code la cot nguon chan ly', () => {
  it('3 lan goi save_job_draft tren cung cu dan => sau moi lan cot = draft = input', async () => {
    const residentId = await residentByUid('sim-res-3');
    const { apartmentId, buildingId } = await apartmentAndBuilding(residentId);
    const ctx = makeCtx({ residentId, apartmentId, buildingId }, null);

    const baseInput = {
      symptoms: ['ro ri nuoc'],
      location_in_unit: 'phong tam',
      urgency: 'normal' as const,
      photo_ids: [],
      questions_asked: 1,
      confidence_note: '',
    };

    // Lan 1: tao moi, category_code = 'ong_nuoc_ro'.
    const out1 = await saveJobDraftTool.run(ctx, { ...baseInput, category_code: 'ong_nuoc_ro' });
    expect(ctx.jobId).not.toBeNull();
    let row = await sql<{ category_code: string | null; draft: { category_code: string | null } }>(
      `select category_code, draft from jobs where id = $1`,
      [ctx.jobId]
    );
    expect(row[0]!.category_code).toBe('ong_nuoc_ro');
    expect(row[0]!.draft.category_code).toBe('ong_nuoc_ro');
    expect(out1.job_code).toBeTruthy();

    // Lan 2: cap nhat theo ctx.jobId (da gan sau lan 1), category_code = null
    // (cu dan sua lai mo ta) — null GHI DE thanh null, khong giu gia tri cu.
    await saveJobDraftTool.run(ctx, { ...baseInput, category_code: null });
    row = await sql<{ category_code: string | null; draft: { category_code: string | null } }>(
      `select category_code, draft from jobs where id = $1`,
      [ctx.jobId]
    );
    expect(row[0]!.category_code).toBeNull();
    expect(row[0]!.draft.category_code).toBeNull();

    // Lan 3: cap nhat theo ctx.jobId, category_code = 'khoa_cua'.
    await saveJobDraftTool.run(ctx, { ...baseInput, category_code: 'khoa_cua' });
    row = await sql<{ category_code: string | null; draft: { category_code: string | null } }>(
      `select category_code, draft from jobs where id = $1`,
      [ctx.jobId]
    );
    expect(row[0]!.category_code).toBe('khoa_cua');
    expect(row[0]!.draft.category_code).toBe('khoa_cua');
  });

  it('nhanh dung lai job drafting da co (G9) cung ghi cot category_code', async () => {
    const residentId = await residentByUid('sim-res-1');
    const { apartmentId, buildingId } = await apartmentAndBuilding(residentId);
    // ctx1 KHONG mang jobId (mo phong luot goi dau tien cua mot cuoc hoi
    // thoai moi) de kich hoat nhanh "dung lai job 'drafting' da co" trong
    // `insertJob` khi da co job drafting cho cu dan nay tu truoc.
    const ctxA = makeCtx({ residentId, apartmentId, buildingId }, null);
    await saveJobDraftTool.run(ctxA, {
      category_code: 'tac_thoat_nuoc',
      symptoms: ['tac bon rua'],
      location_in_unit: 'nha bep',
      urgency: 'normal',
      photo_ids: [],
      questions_asked: 1,
      confidence_note: '',
    });
    const firstJobId = ctxA.jobId;
    expect(firstJobId).not.toBeNull();

    // Luot "moi" gia lap (ctx khac, jobId=null) — insertJob se tim thay job
    // 'drafting' da co cua CUNG resident_id va DUNG LAI thay vi tao them.
    const ctxB = makeCtx({ residentId, apartmentId, buildingId }, null);
    await saveJobDraftTool.run(ctxB, {
      category_code: 'o_cam_cong_tac',
      symptoms: ['o cam khong co dien'],
      location_in_unit: 'phong ngu',
      urgency: 'normal',
      photo_ids: [],
      questions_asked: 2,
      confidence_note: '',
    });
    expect(ctxB.jobId).toBe(firstJobId);

    const row = await sql<{ category_code: string | null }>(`select category_code from jobs where id = $1`, [firstJobId]);
    expect(row[0]!.category_code).toBe('o_cam_cong_tac');
  });

  it('open_service_case tren job co danh muc + price_book => ticket case mang gia p50 (khong con nhanh null)', async () => {
    const residentId = await residentByUid('sim-res-2');
    const { apartmentId, buildingId } = await apartmentAndBuilding(residentId);
    const ctx = makeCtx({ residentId, apartmentId, buildingId }, null);

    // ong_nuoc_ro: default_mode='fixed' (seed.ts) + price_book seed-sim co
    // p50 cho building nay — mode phai la 'fixed', KHONG roi ve 'quote' vi
    // category_code null nhu truoc khi va §11.11.
    await saveJobDraftTool.run(ctx, {
      category_code: 'ong_nuoc_ro',
      symptoms: ['ro ri duong ong'],
      location_in_unit: 'phong tam',
      urgency: 'normal',
      photo_ids: [],
      questions_asked: 1,
      confidence_note: '',
    });
    const jobId = ctx.jobId!;

    const priceRow = await sql<{ p50: number | null }>(
      `select p50 from price_book where category_code = 'ong_nuoc_ro' and building_id = $1`,
      [buildingId]
    );
    expect(priceRow[0]?.p50).not.toBeNull();

    // Dua job thang toi 'awaiting_consent' bang thao tac DB truc tiep (luat
    // classify_responsibility/consent da duoc kiem o file khac — pham vi
    // §11.11 chi can job o dung trang thai de goi open_service_case).
    const transitionAt = await tx(async (q) => {
      await q(
        `update jobs set status = 'awaiting_consent', responsibility = $1, updated_at = now() where id = $2`,
        [JSON.stringify({ party: 'resident', citations: [], reason_vi: 'test' }), jobId]
      );
      const rows = await q<{ created_at: string }>(
        `insert into job_events (job_id, from_status, to_status, actor_type, actor_id)
         values ($1,'drafting','awaiting_consent','agent',$2) returning created_at::text as created_at`,
        [jobId, residentId]
      );
      return rows[0]!.created_at;
    });

    const consentCtx = makeCtx({ residentId, apartmentId, buildingId }, jobId);
    (consentCtx as { latestText: string }).latestText = 'dong y';
    (consentCtx as { latestMessageCreatedAt: string }).latestMessageCreatedAt = new Date(
      new Date(transitionAt).getTime() + 1000
    ).toISOString();

    const out = await openServiceCaseTool.run(consentCtx, { window_options: ['14h-16h'], note: 'test §11.11' });
    expect(out.mode).toBe('fixed');

    const jobRow = await sql<{ mode: string | null; category_code: string | null }>(
      `select mode, category_code from jobs where id = $1`,
      [jobId]
    );
    expect(jobRow[0]!.mode).toBe('fixed');
    expect(jobRow[0]!.category_code).toBe('ong_nuoc_ro');
  });
});

// packages/core/src/dbtests/p05-dispatch.db.test.ts — SPEC-P05-Dispatch.md
// §10.3.1 (dispatch.ts): publishJobToGroup, claimJob, confirmAssignment,
// releaseHold, withdrawConfirmed, resolveVendorGroup.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '../adapters/db.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';
import {
  claimJob,
  confirmAssignment,
  publishJobToGroup,
  releaseHold,
  resolveVendorGroup,
  withdrawConfirmed,
} from '../services/dispatch.js';
import { JobNotFoundError, SlotUnavailableError, IneligibleVendorError, InvalidToolInputError } from '../domain/errors.js';
import {
  getToaABuildingId,
  createApartment,
  createResident,
  createVendor,
  createJob,
  outboxTexts,
  linkVendorIdentity,
  createResidentConversation,
} from './p05-helpers.js';

const CATEGORY = 'ong_nuoc_ro';
const TRADE_GROUP = 'dien_nuoc' as const;

beforeAll(async () => {
  process.env.DATA_MODE = 'sim';
  await runMigrations();
  await runSeed();
  await runSeedSim();
});

afterAll(async () => {
  await closeDb();
});

function windowNowPlus(hoursFrom: number, hoursTo: number): { start: Date; end: Date } {
  const now = Date.now();
  return { start: new Date(now + hoursFrom * 3_600_000), end: new Date(now + hoursTo * 3_600_000) };
}

describe('publishJobToGroup (§10.3.1)', () => {
  it('case_open -> published: JobCard khong PII, tin nhom co ma cuoc + han giu', async () => {
    const buildingId = await getToaABuildingId();
    const apartmentId = await createApartment(buildingId);
    const residentId = await createResident();
    const { start, end } = windowNowPlus(2, 5);
    const job = await createJob({
      buildingId,
      apartmentId,
      residentId,
      categoryCode: CATEGORY,
      mode: 'quote',
      status: 'case_open',
      windowStart: start,
      windowEnd: end,
    });

    const result = await publishJobToGroup({ jobId: job.id, actor: { type: 'agent', id: residentId }, now: new Date() });
    expect(result.card.code).toBe(job.code);
    expect((result.card as unknown as Record<string, unknown>).apartment_code).toBeUndefined();
    expect(result.republish).toBe(false);

    const statusRows = await sql<{ status: string }>(`select status from jobs where id = $1`, [job.id]);
    expect(statusRows[0]!.status).toBe('published');

    const texts = await outboxTexts('market', result.groupThreadId);
    expect(texts.some((t) => t.includes(job.code) && t.includes('giữ cuốc'))).toBe(true);
  });

  it('thieu window_start => InvalidToolInputError', async () => {
    const buildingId = await getToaABuildingId();
    const apartmentId = await createApartment(buildingId);
    const residentId = await createResident();
    const job = await createJob({
      buildingId,
      apartmentId,
      residentId,
      categoryCode: CATEGORY,
      mode: 'quote',
      status: 'case_open',
    });
    await expect(publishJobToGroup({ jobId: job.id, actor: { type: 'agent', id: null }, now: new Date() })).rejects.toBeInstanceOf(
      InvalidToolInputError
    );
  });
});

describe('resolveVendorGroup', () => {
  it('nhom chua cau hinh (toa/nhom nghe khac) => SlotUnavailableError', async () => {
    const buildingId = await getToaABuildingId();
    await expect(resolveVendorGroup(buildingId, 'khoa' as const)).resolves.toBeTruthy(); // seed co san 4 nhom cho TOA-A
    const fakeBuildingId = '00000000-0000-0000-0000-000000000000';
    await expect(resolveVendorGroup(fakeBuildingId, TRADE_GROUP)).rejects.toBeInstanceOf(SlotUnavailableError);
  });
});

async function publishFreshJob(): Promise<{ jobId: string; jobCode: string; groupThreadId: string; residentThread: string; residentId: string }> {
  const buildingId = await getToaABuildingId();
  const apartmentId = await createApartment(buildingId);
  const residentId = await createResident();
  const residentThread = await createResidentConversation(residentId);
  const { start, end } = windowNowPlus(2, 5);
  const job = await createJob({
    buildingId,
    apartmentId,
    residentId,
    categoryCode: CATEGORY,
    mode: 'quote',
    status: 'case_open',
    windowStart: start,
    windowEnd: end,
  });
  const result = await publishJobToGroup({ jobId: job.id, actor: { type: 'agent', id: residentId }, now: new Date() });
  return { jobId: job.id, jobCode: job.code, groupThreadId: result.groupThreadId, residentThread, residentId };
}

describe('claimJob (BB-05, BB-10)', () => {
  it('tho hop le thang cuoc => held + job_offers won + tin nhom/DM', async () => {
    const { jobId, jobCode, groupThreadId } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const vendorUid = await linkVendorIdentity(vendorId);

    const result = await claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' });
    expect(result.won).toBe(true);
    if (!result.won) throw new Error('unreachable');
    expect(result.mode).toBe('quote');

    const statusRows = await sql<{ status: string; assigned_vendor_id: string }>(
      `select status, assigned_vendor_id from jobs where id = $1`,
      [jobId]
    );
    expect(statusRows[0]!.status).toBe('held');
    expect(statusRows[0]!.assigned_vendor_id).toBe(vendorId);

    const offers = await sql<{ status: string }>(`select status from job_offers where job_id = $1 and vendor_id = $2`, [
      jobId,
      vendorId,
    ]);
    expect(offers[0]!.status).toBe('won');

    const groupTexts = await outboxTexts('market', groupThreadId);
    expect(groupTexts.some((t) => t.includes('đã có thợ nhận'))).toBe(true);
    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.some((t) => t.includes('OK để xác nhận'))).toBe(true);
  });

  it('tho thu hai cung cuoc => thua (won:false)', async () => {
    const { jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const v1 = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const v2 = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const r1 = await claimJob({ jobCode, vendorId: v1, now: new Date(), source: 'agent' });
    expect(r1.won).toBe(true);
    const r2 = await claimJob({ jobCode, vendorId: v2, now: new Date(), source: 'agent' });
    expect(r2.won).toBe(false);
    if (r2.won) throw new Error('unreachable');
    expect(r2.status).toBe('held');
  });

  it('ma cuoc khong ton tai => JobNotFoundError', async () => {
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await expect(claimJob({ jobCode: 'C-ZZZZ', vendorId, now: new Date(), source: 'agent' })).rejects.toBeInstanceOf(
      JobNotFoundError
    );
  });

  it('tho khong co slot => IneligibleVendorError(no_slot)', async () => {
    const { jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: null });
    await expect(claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' })).rejects.toMatchObject({
      code: 'IneligibleVendorError',
      message: expect.stringMatching(/^no_slot/),
    });
  });

  it('tho khong dung ky nang (khac nhom nghe) => IneligibleVendorError(no_skill)', async () => {
    const { jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: 'khoa', categoryCode: 'khoa_cua', slotDaysLeft: 20 });
    await expect(claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' })).rejects.toMatchObject({
      code: 'IneligibleVendorError',
      message: expect.stringMatching(/^no_skill/),
    });
  });

  it('tho khong active => IneligibleVendorError(not_active)', async () => {
    const { jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({
      buildingId,
      tradeGroup: TRADE_GROUP,
      categoryCode: CATEGORY,
      slotDaysLeft: 20,
      status: 'pending',
    });
    await expect(claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' })).rejects.toMatchObject({
      code: 'IneligibleVendorError',
      message: expect.stringMatching(/^not_active/),
    });
  });

  it('tho dang giu cuoc khac TRUNG khung gio => IneligibleVendorError(window_overlap)', async () => {
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const now = new Date();

    // Cuoc 1: da giu (held) boi vendorId, khung gio 2h-5h tu bay gio.
    const apartmentId1 = await createApartment(buildingId);
    const residentId1 = await createResident();
    const job1 = await createJob({
      buildingId,
      apartmentId: apartmentId1,
      residentId: residentId1,
      categoryCode: CATEGORY,
      mode: 'quote',
      status: 'case_open',
      windowStart: new Date(now.getTime() + 2 * 3_600_000),
      windowEnd: new Date(now.getTime() + 5 * 3_600_000),
    });
    await publishJobToGroup({ jobId: job1.id, actor: { type: 'agent', id: residentId1 }, now });
    await claimJob({ jobCode: job1.code, vendorId, now, source: 'agent' });

    // Cuoc 2: khung gio 3h-4h (nam TRONG khung cua cuoc 1) => trung gio.
    const apartmentId2 = await createApartment(buildingId);
    const residentId2 = await createResident();
    const job2 = await createJob({
      buildingId,
      apartmentId: apartmentId2,
      residentId: residentId2,
      categoryCode: CATEGORY,
      mode: 'quote',
      status: 'case_open',
      windowStart: new Date(now.getTime() + 3 * 3_600_000),
      windowEnd: new Date(now.getTime() + 4 * 3_600_000),
    });
    await publishJobToGroup({ jobId: job2.id, actor: { type: 'agent', id: residentId2 }, now });

    await expect(claimJob({ jobCode: job2.code, vendorId, now, source: 'agent' })).rejects.toMatchObject({
      code: 'IneligibleVendorError',
      message: expect.stringMatching(/^window_overlap/),
    });
  });
});

describe('confirmAssignment', () => {
  it('mode=fixed => confirmed, xoa hold_expires_at, DM xac nhan', async () => {
    const { jobId, jobCode } = await publishFreshJob();
    await sql(`update jobs set mode = 'fixed' where id = $1`, [jobId]);
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const vendorUid = await linkVendorIdentity(vendorId);
    await claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' });

    const result = await confirmAssignment({ jobCode, vendorId, priceVnd: null, now: new Date() });
    expect(result.status).toBe('confirmed');
    const rows = await sql<{ status: string; hold_expires_at: string | null }>(
      `select status, hold_expires_at from jobs where id = $1`,
      [jobId]
    );
    expect(rows[0]!.status).toBe('confirmed');
    expect(rows[0]!.hold_expires_at).toBeNull();
    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.some((t) => t.includes('Đã xác nhận'))).toBe(true);
  });

  it('mode=quote thieu gia => QuoteRequiredError', async () => {
    const { jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' });
    await expect(confirmAssignment({ jobCode, vendorId, priceVnd: null, now: new Date() })).rejects.toMatchObject({
      code: 'QuoteRequiredError',
    });
  });

  it('mode=quote gia trong khung => confirmed', async () => {
    const { jobId, jobCode } = await publishFreshJob();
    await sql(`update jobs set mode = 'quote' where id = $1`, [jobId]);
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' });
    const result = await confirmAssignment({ jobCode, vendorId, priceVnd: 300000, now: new Date() });
    expect(result.status).toBe('confirmed');
  });

  it('mode=quote gia VUOT khung >30% => VAN held, cho cu dan dong y', async () => {
    const { jobId, jobCode, residentThread } = await publishFreshJob();
    await sql(`update jobs set mode = 'quote' where id = $1`, [jobId]);
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' });
    // price_book p75 = 400000 (seed-sim.ts) => vuot 30% la > 520000.
    const result = await confirmAssignment({ jobCode, vendorId, priceVnd: 600000, now: new Date() });
    expect(result.status).toBe('held');
    if (result.status !== 'held') throw new Error('unreachable');
    expect(result.awaitingResidentPriceConsent).toBe(true);
    const rows = await sql<{ status: string }>(`select status from jobs where id = $1`, [jobId]);
    expect(rows[0]!.status).toBe('held');
    const residentTexts = await outboxTexts('bql', residentThread);
    expect(residentTexts.some((t) => t.includes('ĐỒNG Ý giá này không'))).toBe(true);
  });

  it('sai tho (khong dung nguoi dang giu) => IneligibleVendorError(not_assigned)', async () => {
    const { jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const v1 = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const v2 = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await claimJob({ jobCode, vendorId: v1, now: new Date(), source: 'agent' });
    await expect(confirmAssignment({ jobCode, vendorId: v2, priceVnd: 100000, now: new Date() })).rejects.toMatchObject({
      code: 'IneligibleVendorError',
      message: expect.stringMatching(/^not_assigned/),
    });
  });
});

describe('releaseHold (timer/decline_hold)', () => {
  it('nha giu => published, no_show_count+1, dang lai voi tien to "ĐĂNG LẠI"', async () => {
    const { jobId, jobCode, groupThreadId } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const vendorUid = await linkVendorIdentity(vendorId);
    await claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' });

    const result = await releaseHold({ jobId, now: new Date(), reason: 'hold_expired', actor: { type: 'timer', id: null } });
    expect(result.republished).toBe(true);

    const rows = await sql<{ status: string; republish_count: number; assigned_vendor_id: string | null }>(
      `select status, republish_count, assigned_vendor_id from jobs where id = $1`,
      [jobId]
    );
    expect(rows[0]!.status).toBe('published');
    expect(rows[0]!.republish_count).toBe(1);
    expect(rows[0]!.assigned_vendor_id).toBeNull();

    const scoreRows = await sql<{ no_show_count: number }>(`select no_show_count from vendor_scores where vendor_id = $1`, [
      vendorId,
    ]);
    expect(scoreRows[0]!.no_show_count).toBe(1);

    const groupTexts = await outboxTexts('market', groupThreadId);
    expect(groupTexts.some((t) => t.startsWith('ĐĂNG LẠI'))).toBe(true);
    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.some((t) => t.includes('đã được nhả'))).toBe(true);
  });
});

describe('withdrawConfirmed (L7: confirmed -> published)', () => {
  it('tho rut sau confirmed => published lai, bao cu dan tim tho khac', async () => {
    const { jobId, jobCode, residentThread } = await publishFreshJob();
    await sql(`update jobs set mode = 'fixed' where id = $1`, [jobId]);
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await claimJob({ jobCode, vendorId, now: new Date(), source: 'agent' });
    await confirmAssignment({ jobCode, vendorId, priceVnd: null, now: new Date() });

    await withdrawConfirmed({ jobId, now: new Date(), reason: 'vendor_declined', actor: { type: 'vendor', id: vendorId } });

    const rows = await sql<{ status: string; assigned_vendor_id: string | null }>(
      `select status, assigned_vendor_id from jobs where id = $1`,
      [jobId]
    );
    expect(rows[0]!.status).toBe('published');
    expect(rows[0]!.assigned_vendor_id).toBeNull();
    const residentTexts = await outboxTexts('bql', residentThread);
    expect(residentTexts.some((t) => t.includes('Đang tìm thợ khác'))).toBe(true);
  });
});

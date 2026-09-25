// packages/core/src/dbtests/p05-timers.db.test.ts — SPEC-P05-Dispatch.md
// §10.8.4 (dong ho gia, mau bat buoc) + §10.8.1 cac buoc con lai.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '../adapters/db.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';
import { randomUUID } from 'node:crypto';
import { claimJob, confirmAssignment, publishJobToGroup } from '../services/dispatch.js';
import { decideAccessRequest, requestAccess } from '../services/access.js';
import { runTimers } from '../services/timers.js';
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
// Gio VN 10:00 (trong gio hanh chinh/kinh doanh) — tranh cac ca lien quan
// publish_expires/office-hours bi lech do chay test luc nua dem VN.
const T0 = new Date('2026-09-25T03:00:00.000Z'); // = 10:00 VN

beforeAll(async () => {
  process.env.DATA_MODE = 'sim';
  await runMigrations();
  await runSeed();
  await runSeedSim();
});

afterAll(async () => {
  await closeDb();
});

async function publishFreshJob(windowHoursFrom = 2, windowHoursTo = 5, at = T0) {
  const buildingId = await getToaABuildingId();
  const apartmentId = await createApartment(buildingId);
  const residentId = await createResident();
  const residentThread = await createResidentConversation(residentId);
  const job = await createJob({
    buildingId,
    apartmentId,
    residentId,
    categoryCode: CATEGORY,
    mode: 'quote',
    status: 'case_open',
    windowStart: new Date(at.getTime() + windowHoursFrom * 3_600_000),
    windowEnd: new Date(at.getTime() + windowHoursTo * 3_600_000),
  });
  const published = await publishJobToGroup({ jobId: job.id, actor: { type: 'agent', id: residentId }, now: at });
  return { jobId: job.id, jobCode: job.code, groupThreadId: published.groupThreadId, residentThread, buildingId };
}

describe('§10.8.4 — expireHolds (dong ho gia, idempotent)', () => {
  it('held qua han 11 phut => published + no_show+1 + republish_count=1 + "ĐĂNG LẠI"; goi lai CUNG now => 0', async () => {
    const { jobId, jobCode, groupThreadId } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await claimJob({ jobCode, vendorId, now: T0, source: 'agent' });

    const after11 = new Date(T0.getTime() + 11 * 60_000);
    const report1 = await runTimers(after11);
    expect(report1.holds_released).toBe(1);

    const rows = await sql<{ status: string; republish_count: number }>(
      `select status, republish_count from jobs where id = $1`,
      [jobId]
    );
    expect(rows[0]!.status).toBe('published');
    expect(rows[0]!.republish_count).toBe(1);

    const scoreRows = await sql<{ no_show_count: number }>(`select no_show_count from vendor_scores where vendor_id = $1`, [
      vendorId,
    ]);
    expect(scoreRows[0]!.no_show_count).toBe(1);

    const groupTexts = await outboxTexts('market', groupThreadId);
    expect(groupTexts.some((t) => t.startsWith('ĐĂNG LẠI'))).toBe(true);

    const report2 = await runTimers(after11);
    expect(report2.holds_released).toBe(0);
  });
});

describe('§10.8.4 — expirePublished (hai giai doan)', () => {
  it('lan 1 (46 phut, con trong gio VN) => dang lai mode=quote; lan 2 => unassigned + ticket no_vendor', async () => {
    const { jobId, residentThread } = await publishFreshJob(2, 5, T0);
    const after46 = new Date(T0.getTime() + 46 * 60_000);
    const report1 = await runTimers(after46);
    expect(report1.published_expired).toBeGreaterThanOrEqual(1);

    let rows = await sql<{ status: string; mode: string; timeout_republished_at: string | null }>(
      `select status, mode, timeout_republished_at from jobs where id = $1`,
      [jobId]
    );
    expect(rows[0]!.status).toBe('published');
    expect(rows[0]!.mode).toBe('quote');
    expect(rows[0]!.timeout_republished_at).not.toBeNull();

    const after2ndTimeout = new Date(after46.getTime() + 46 * 60_000);
    const report2 = await runTimers(after2ndTimeout);
    expect(report2.published_expired).toBeGreaterThanOrEqual(1);

    rows = await sql(`select status, mode, timeout_republished_at from jobs where id = $1`, [jobId]);
    expect(rows[0]!.status).toBe('unassigned');

    const ticketRows = await sql<{ kind: string }>(`select kind from tickets where source_job_id = $1 and kind = 'no_vendor'`, [
      jobId,
    ]);
    expect(ticketRows.length).toBe(1);

    const residentTexts = await outboxTexts('bql', residentThread);
    expect(residentTexts.some((t) => t.includes('Chưa tìm được thợ'))).toBe(true);
  });
});

describe('§10.8.4 — slot: expireSlots', () => {
  it('period_end = hom qua (theo T0, KHONG theo current_date that) => expireSlots => expired + DM; claimJob cua tho do => no_slot', async () => {
    const { jobCode } = await publishFreshJob();
    const buildingId = await getToaABuildingId();
    // KHONG dung `createVendor({slotDaysLeft})` (tinh tren `current_date`
    // THAT cua Postgres) — dong ho gia T0 co the la ngay khac ngay that,
    // ghi thang `period_end` la mot ngay TRUOC ngay VN cua T0 de dam bao
    // dong nhat voi `runTimers(T0)` (§10.1.3: CAM lech giua dong ho gia va
    // du lieu tao boi `current_date`).
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: null });
    const vnTodayOfT0 = new Date(T0.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    await sql(
      `insert into vendor_slots (vendor_id, building_id, trade_group, is_trial, period_start, period_end, fee, status)
       values ($1,$2,$3,false, $4::date - 10, $4::date - 1, 300000, 'active')`,
      [vendorId, buildingId, TRADE_GROUP, vnTodayOfT0]
    );
    const vendorUid = await linkVendorIdentity(vendorId);

    const report = await runTimers(T0);
    expect(report.slots_expired).toBeGreaterThanOrEqual(1);

    const slotRows = await sql<{ status: string }>(`select status from vendor_slots where vendor_id = $1`, [vendorId]);
    expect(slotRows[0]!.status).toBe('expired');

    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.some((t) => t.includes('hết hạn') || t.includes('hết dùng thử'))).toBe(true);

    await expect(claimJob({ jobCode, vendorId, now: T0, source: 'agent' })).rejects.toMatchObject({
      code: 'IneligibleVendorError',
      message: expect.stringMatching(/^no_slot/),
    });
  });
});

describe('§10.8.1(3) — remindAccessRequests (chi trong gio hanh chinh)', () => {
  it('qua ACCESS_REMIND_MIN trong gio hanh chinh => reminded_at + tin cu dan', async () => {
    const { jobId, jobCode, residentThread } = await publishFreshJob();
    await sql(`update jobs set mode = 'fixed' where id = $1`, [jobId]);
    const buildingId = await getToaABuildingId();
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await claimJob({ jobCode, vendorId, now: T0, source: 'agent' });
    await confirmAssignment({ jobCode, vendorId, priceVnd: null, now: T0 });
    await requestAccess({ jobId, vendorId, note: 'x', actor: { type: 'agent', id: vendorId }, now: T0 });
    // `tickets.created_at` mac dinh `now()` THAT cua Postgres (khong nhan
    // tham so `now`) — ep lai theo dong ho gia T0 de dong bo voi
    // `runTimers(after31)` duoi day (§10.1.3: dong ho la tham so, du lieu
    // test cung phai theo cung moc thoi gian).
    await sql(`update tickets set created_at = $1 where source_job_id = $2 and kind = 'access_request'`, [T0, jobId]);

    const after31 = new Date(T0.getTime() + 31 * 60_000); // T0 = 10:00 VN, van trong 08:00-18:00
    const report = await runTimers(after31);
    expect(report.access_reminded).toBeGreaterThanOrEqual(1);

    const ticketRows = await sql<{ reminded_at: string | null }>(
      `select reminded_at from tickets where source_job_id = $1 and kind = 'access_request'`,
      [jobId]
    );
    expect(ticketRows[0]!.reminded_at).not.toBeNull();

    const residentTexts = await outboxTexts('bql', residentThread);
    expect(residentTexts.some((t) => t.includes('xác nhận thợ'))).toBe(true);
  });
});

describe('§10.8.1(4) — luoi publishFallback / requestAccessFallback', () => {
  it('case_open qua PUBLISH_FALLBACK_MIN ma agent chua dang => timer tu dang', async () => {
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
      windowStart: new Date(T0.getTime() + 2 * 3_600_000),
      windowEnd: new Date(T0.getTime() + 5 * 3_600_000),
    });
    // gia lap "updated_at" da qua PUBLISH_FALLBACK_MIN (2 phut).
    await sql(`update jobs set updated_at = $1 where id = $2`, [new Date(T0.getTime() - 5 * 60_000), job.id]);

    const report = await runTimers(T0);
    expect(report.publish_fallback).toBeGreaterThanOrEqual(1);

    const rows = await sql<{ status: string }>(`select status from jobs where id = $1`, [job.id]);
    expect(rows[0]!.status).toBe('published');

    const auditRows = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action = 'timer.publish_fallback' and target = $1`,
      [job.id]
    );
    expect(auditRows[0]!.c).toBeGreaterThanOrEqual(1);
  });
});

describe('§10.8.1(5) — reemitStuckGranted', () => {
  it('access_granted qua DISPATCH_REEMIT_MIN ma chua dispatched => phat lai su kien he thong', async () => {
    const { jobId } = await (async () => {
      const buildingId = await getToaABuildingId();
      const apartmentId = await createApartment(buildingId);
      const residentId = await createResident();
      const job = await createJob({
        buildingId,
        apartmentId,
        residentId,
        categoryCode: CATEGORY,
        mode: 'fixed',
        status: 'case_open',
        windowStart: new Date(T0.getTime() + 2 * 3_600_000),
        windowEnd: new Date(T0.getTime() + 5 * 3_600_000),
      });
      await publishJobToGroup({ jobId: job.id, actor: { type: 'agent', id: residentId }, now: T0 });
      const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
      await linkVendorIdentity(vendorId); // can de enqueueSystemEvent tim duoc thread DM (§10.8.2)
      await claimJob({ jobCode: job.code, vendorId, now: T0, source: 'agent' });
      await confirmAssignment({ jobCode: job.code, vendorId, priceVnd: null, now: T0 });
      const req = await requestAccess({ jobId: job.id, vendorId, note: 'x', actor: { type: 'agent', id: vendorId }, now: T0 });
      const staffRows = await sql<{ id: string }>(
        `insert into staff_users (email, password_hash, role) values ($1,'x','bql_admin') returning id`,
        [`p05-timers-staff-${randomUUID().slice(0, 8)}@example.test`]
      );
      await decideAccessRequest({ ticketId: req.ticketId, decision: 'approve', note: null, staffId: staffRows[0]!.id, now: T0 });
      return { jobId: job.id, jobCode: job.code, vendorId };
    })();

    // gia lap "updated_at" da qua DISPATCH_REEMIT_MIN (5 phut) ma agent
    // van chua goi dispatch_to_vendor.
    const after6 = new Date(T0.getTime() + 6 * 60_000);
    await sql(`update jobs set updated_at = $1 where id = $2`, [new Date(after6.getTime() - 6 * 60_000), jobId]);

    const report = await runTimers(after6);
    expect(report.granted_reemitted).toBeGreaterThanOrEqual(1);

    const sysEventRows = await sql<{ c: number }>(
      `select count(*)::int as c from inbound_events where sender_uid = 'system' and payload->>'job_id' = $1`,
      [jobId]
    );
    expect(sysEventRows[0]!.c).toBeGreaterThanOrEqual(1);

    const auditRows = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action = 'system.access_approved_reemit' and target = $1`,
      [jobId]
    );
    expect(auditRows[0]!.c).toBeGreaterThanOrEqual(1);
  });
});

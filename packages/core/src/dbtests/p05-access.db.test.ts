// packages/core/src/dbtests/p05-access.db.test.ts — SPEC-P05-Dispatch.md
// §10.3.2 (access.ts): requestAccess, decideAccessRequest, dispatchToVendor,
// G12b (truy van kiem "0 cuoc dispatched ma ticket khong approved").

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '../adapters/db.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';
import { claimJob, confirmAssignment, publishJobToGroup } from '../services/dispatch.js';
import { decideAccessRequest, dispatchToVendor, requestAccess } from '../services/access.js';
import { AccessNotApprovedError, InvalidToolInputError } from '../domain/errors.js';
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

let STAFF_ID: string;

beforeAll(async () => {
  const rows = await sql<{ id: string }>(
    `insert into staff_users (email, password_hash, role) values ($1,'x','bql_admin') returning id`,
    [`p05-access-staff-${randomUUID().slice(0, 8)}@example.test`]
  );
  STAFF_ID = rows[0]!.id;
});

async function setupConfirmedJob() {
  const buildingId = await getToaABuildingId();
  const apartmentId = await createApartment(buildingId);
  const residentId = await createResident();
  const residentThread = await createResidentConversation(residentId);
  const now = Date.now();
  const job = await createJob({
    buildingId,
    apartmentId,
    residentId,
    categoryCode: CATEGORY,
    mode: 'fixed',
    status: 'case_open',
    windowStart: new Date(now + 2 * 3_600_000),
    windowEnd: new Date(now + 5 * 3_600_000),
  });
  const published = await publishJobToGroup({ jobId: job.id, actor: { type: 'agent', id: residentId }, now: new Date() });
  const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
  const vendorUid = await linkVendorIdentity(vendorId);
  await claimJob({ jobCode: job.code, vendorId, now: new Date(), source: 'agent' });
  await confirmAssignment({ jobCode: job.code, vendorId, priceVnd: null, now: new Date() });
  return { jobId: job.id, jobCode: job.code, vendorId, vendorUid, residentThread, groupThreadId: published.groupThreadId };
}

describe('requestAccess', () => {
  it('confirmed => access_pending, ticket access_request voi thong tin tho, DM + tin cu dan', async () => {
    const { jobId, vendorId, vendorUid, residentThread } = await setupConfirmedJob();
    const result = await requestAccess({
      jobId,
      vendorId,
      note: 'Nhờ BQL duyệt sớm',
      actor: { type: 'agent', id: vendorId },
      now: new Date(),
    });
    expect(result.ticketId).toBeTruthy();

    const ticketRows = await sql<{ kind: string; status: string; summary: string }>(
      `select kind, status, summary from tickets where id = $1`,
      [result.ticketId]
    );
    expect(ticketRows[0]!.kind).toBe('access_request');
    expect(ticketRows[0]!.status).toBe('open');
    expect(ticketRows[0]!.summary).toContain('Nhờ BQL duyệt sớm');

    const rows = await sql<{ status: string }>(`select status from jobs where id = $1`, [jobId]);
    expect(rows[0]!.status).toBe('access_pending');

    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.some((t) => t.includes('chờ BQL'))).toBe(true);
    const residentTexts = await outboxTexts('bql', residentThread);
    expect(residentTexts.some((t) => t.includes('đang chờ BQL xác nhận'))).toBe(true);
  });

  it('cuoc chua confirmed (van held) => ConflictError', async () => {
    const buildingId = await getToaABuildingId();
    const apartmentId = await createApartment(buildingId);
    const residentId = await createResident();
    const now = new Date();
    const job = await createJob({
      buildingId,
      apartmentId,
      residentId,
      categoryCode: CATEGORY,
      mode: 'quote',
      status: 'case_open',
      windowStart: new Date(now.getTime() + 2 * 3_600_000),
      windowEnd: new Date(now.getTime() + 5 * 3_600_000),
    });
    await publishJobToGroup({ jobId: job.id, actor: { type: 'agent', id: residentId }, now });
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await claimJob({ jobCode: job.code, vendorId, now, source: 'agent' }); // -> held, chua confirm

    await expect(requestAccess({ jobId: job.id, vendorId, note: 'x', actor: { type: 'agent', id: vendorId }, now })).rejects.toMatchObject(
      { code: 'ConflictError' }
    );
  });

  it('actor=timer (luoi §10.8.1(4b)) bo qua dieu kien "dung tho"', async () => {
    const { jobId, vendorId } = await setupConfirmedJob();
    const result = await requestAccess({ jobId, vendorId, note: 'tu dong', actor: { type: 'timer', id: null }, now: new Date() });
    expect(result.ticketId).toBeTruthy();
  });
});

describe('decideAccessRequest', () => {
  it('reject khong co note => InvalidToolInputError (kiem TRUOC khi vao tx)', async () => {
    await expect(
      decideAccessRequest({ ticketId: randomUUID(), decision: 'reject', note: null, staffId: STAFF_ID, now: new Date() })
    ).rejects.toBeInstanceOf(InvalidToolInputError);
  });

  it('approve => access_granted, access_passes duoc tao, su kien he thong access_approved duoc ghi', async () => {
    const { jobId, vendorId } = await setupConfirmedJob();
    const req = await requestAccess({ jobId, vendorId, note: 'x', actor: { type: 'agent', id: vendorId }, now: new Date() });

    const result = await decideAccessRequest({ ticketId: req.ticketId, decision: 'approve', note: null, staffId: STAFF_ID, now: new Date() });
    expect(result.status).toBe('access_granted');

    const rows = await sql<{ status: string }>(`select status from jobs where id = $1`, [jobId]);
    expect(rows[0]!.status).toBe('access_granted');

    const passRows = await sql<{ code: string }>(`select code from access_passes where job_id = $1 and revoked_at is null`, [jobId]);
    expect(passRows.length).toBe(1);
    expect(passRows[0]!.code).toMatch(/^[A-Z0-9]{6}$/);

    const sysEventRows = await sql<{ sender_uid: string }>(
      `select sender_uid from inbound_events where sender_uid = 'system' and payload->>'event' = 'access_approved' and payload->>'job_id' = $1`,
      [jobId]
    );
    expect(sysEventRows.length).toBeGreaterThan(0);
  });

  it('reject co note => published lai, ticket rejected, DM/tin dung mau, dang lai nhom', async () => {
    const { jobId, vendorId, vendorUid, residentThread, groupThreadId } = await setupConfirmedJob();
    const req = await requestAccess({ jobId, vendorId, note: 'x', actor: { type: 'agent', id: vendorId }, now: new Date() });

    const result = await decideAccessRequest({
      ticketId: req.ticketId,
      decision: 'reject',
      note: 'Không đủ giấy tờ',
      staffId: STAFF_ID,
      now: new Date(),
    });
    expect(result.status).toBe('published');

    const jobRows = await sql<{ status: string; assigned_vendor_id: string | null }>(
      `select status, assigned_vendor_id from jobs where id = $1`,
      [jobId]
    );
    expect(jobRows[0]!.status).toBe('published');
    expect(jobRows[0]!.assigned_vendor_id).toBeNull();

    const ticketRows = await sql<{ status: string }>(`select status from tickets where id = $1`, [req.ticketId]);
    expect(ticketRows[0]!.status).toBe('rejected');

    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.some((t) => t.includes('được chuyển cho thợ khác'))).toBe(true);
    // BB-11/vung cam §10.14: ly do tu choi cua BQL KHONG duoc lo cho tho.
    expect(dmTexts.some((t) => t.includes('Không đủ giấy tờ'))).toBe(false);
    const residentTexts = await outboxTexts('bql', residentThread);
    expect(residentTexts.some((t) => t.includes('Đang tìm thợ khác'))).toBe(true);
    const groupTexts = await outboxTexts('market', groupThreadId);
    expect(groupTexts.some((t) => t.startsWith('ĐĂNG LẠI'))).toBe(true);
  });
});

describe('dispatchToVendor (BB-11)', () => {
  it('ticket chua approved (van access_pending) => ConflictError (status chua phai access_granted)', async () => {
    const { jobId, jobCode, vendorId } = await setupConfirmedJob();
    await requestAccess({ jobId, vendorId, note: 'x', actor: { type: 'agent', id: vendorId }, now: new Date() });
    await expect(dispatchToVendor({ jobCode, vendorId, now: new Date() })).rejects.toMatchObject({ code: 'ConflictError' });
  });

  it('da access_granted nhung mat vao het hieu luc => AccessNotApprovedError("chưa có mã vào toà")', async () => {
    const { jobId, jobCode, vendorId } = await setupConfirmedJob();
    const req = await requestAccess({ jobId, vendorId, note: 'x', actor: { type: 'agent', id: vendorId }, now: new Date() });
    await decideAccessRequest({ ticketId: req.ticketId, decision: 'approve', note: null, staffId: STAFF_ID, now: new Date() });
    // Gia lap mat vao da het hieu luc (SPEC-P05 §10.3.2: `dispatchToVendor`
    // doc lai `access_passes` con hieu luc — khong chi tin vao `status`).
    await sql(`update access_passes set valid_to = $1 where job_id = $2`, [new Date(Date.now() - 60_000), jobId]);
    await expect(dispatchToVendor({ jobCode, vendorId, now: new Date() })).rejects.toBeInstanceOf(AccessNotApprovedError);
  });

  it('da duyet => dispatched, JobReveal chi DM tho (allowReveal), cu dan nhan tin, nhom KHONG co PII', async () => {
    const { jobId, jobCode, vendorId, vendorUid, residentThread, groupThreadId } = await setupConfirmedJob();
    const req = await requestAccess({ jobId, vendorId, note: 'x', actor: { type: 'agent', id: vendorId }, now: new Date() });
    await decideAccessRequest({ ticketId: req.ticketId, decision: 'approve', note: null, staffId: STAFF_ID, now: new Date() });

    const result = await dispatchToVendor({ jobCode, vendorId, now: new Date() });
    expect(result.passCode).toMatch(/^[A-Z0-9]{6}$/);

    const rows = await sql<{ status: string }>(`select status from jobs where id = $1`, [jobId]);
    expect(rows[0]!.status).toBe('dispatched');

    const apt = await sql<{ code: string }>(
      `select a.code from jobs j join apartments a on a.id = j.apartment_id where j.id = $1`,
      [jobId]
    );
    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.some((t) => t.includes(apt[0]!.code) && t.includes(result.passCode))).toBe(true);

    const residentTexts = await outboxTexts('bql', residentThread);
    expect(residentTexts.some((t) => t.includes(result.passCode))).toBe(true);

    const groupTexts = await outboxTexts('market', groupThreadId);
    expect(groupTexts.some((t) => t.includes(apt[0]!.code))).toBe(false);
  });

  it('G12b: 0 cuoc dispatched ma ticket access_request khong approved (SPEC-P05 §10.3.2)', async () => {
    const violationsBefore = await runG12bQuery();
    expect(violationsBefore).toBe(0);

    // Cai 1 dong "xau": chuyen thang mot cuoc sang dispatched ma KHONG qua
    // access.ts (bo qua toan bo luat) — chung minh cau truy van BIET DO.
    const { jobId } = await setupConfirmedJob();
    await sql(`update jobs set status = 'dispatched' where id = $1`, [jobId]);
    const violationsAfter = await runG12bQuery();
    expect(violationsAfter).toBeGreaterThan(0);

    // Hoan nguyen — khong de du lieu xau lai anh huong test khac.
    await sql(`update jobs set status = 'confirmed' where id = $1`, [jobId]);
  });
});

async function runG12bQuery(): Promise<number> {
  const rows = await sql<{ violations: number }>(
    `select count(*)::int as violations from jobs j left join tickets t on t.id = j.access_ticket_id
     where j.status in ('dispatched','in_progress','awaiting_acceptance','accepted','disputed','closed')
       and (t.id is null or t.kind <> 'access_request' or t.status <> 'approved')`
  );
  return rows[0]!.violations;
}

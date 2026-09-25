// packages/core/src/dbtests/p05-suspend.db.test.ts — SPEC-P05-Dispatch.md
// §10.17 (Đ30, vòng 2 R14): `suspendVendor` (services/vendors.ts) — 4 ca
// bắt buộc (a)-(d).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '../adapters/db.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';
import { claimJob, confirmAssignment, publishJobToGroup } from '../services/dispatch.js';
import { requestAccess, decideAccessRequest, dispatchToVendor } from '../services/access.js';
import { suspendVendor } from '../services/vendors.js';
import { IneligibleVendorError, VendorNotFoundError } from '../domain/errors.js';
import { getToaABuildingId, createApartment, createResident, createVendor, createJob, linkVendorIdentity } from './p05-helpers.js';

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
    [`p05-suspend-staff-${randomUUID().slice(0, 8)}@example.test`]
  );
  STAFF_ID = rows[0]!.id;
});

async function newFixture() {
  const buildingId = await getToaABuildingId();
  const apartmentId = await createApartment(buildingId);
  const residentId = await createResident();
  const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
  await linkVendorIdentity(vendorId);
  return { buildingId, apartmentId, residentId, vendorId };
}

async function createHeldJob(f: Awaited<ReturnType<typeof newFixture>>) {
  const now = new Date();
  const job = await createJob({
    buildingId: f.buildingId,
    apartmentId: f.apartmentId,
    residentId: f.residentId,
    categoryCode: CATEGORY,
    mode: 'fixed',
    status: 'case_open',
    windowStart: new Date(now.getTime() + 2 * 3_600_000),
    windowEnd: new Date(now.getTime() + 5 * 3_600_000),
  });
  await publishJobToGroup({ jobId: job.id, actor: { type: 'staff', id: null }, now });
  const claimed = await claimJob({ jobCode: job.code, vendorId: f.vendorId, now, source: 'agent' });
  if (!claimed.won) throw new Error('p05-suspend: claimJob khong thang');
  return job;
}

async function createGrantedJob(f: Awaited<ReturnType<typeof newFixture>>) {
  const job = await createHeldJob(f);
  const now = new Date();
  await confirmAssignment({ jobCode: job.code, vendorId: f.vendorId, priceVnd: null, now });
  const { ticketId } = await requestAccess({
    jobId: job.id,
    vendorId: f.vendorId,
    note: 'Test P05-suspend',
    actor: { type: 'agent', id: f.vendorId },
    now,
  });
  await decideAccessRequest({ ticketId, decision: 'approve', note: null, staffId: STAFF_ID, now });
  return job;
}

describe('suspendVendor (SPEC-P05 §10.17, Đ30)', () => {
  it('(a) tho giu cuoc (held) => suspend => cuoc published; claimJob CHINH tho do sau do => IneligibleVendorError', async () => {
    const f = await newFixture();
    const job = await createHeldJob(f);

    const result = await suspendVendor({ vendorId: f.vendorId, staffId: STAFF_ID, note: 'Bùng nhiều lần', now: new Date() });
    expect(result.alreadySuspended).toBe(false);
    expect(result.released).toBe(1);

    const jobRows = await sql<{ status: string; assigned_vendor_id: string | null }>(
      `select status, assigned_vendor_id from jobs where id = $1`,
      [job.id]
    );
    expect(jobRows[0]!.status).toBe('published');
    expect(jobRows[0]!.assigned_vendor_id).toBeNull();

    await expect(
      claimJob({ jobCode: job.code, vendorId: f.vendorId, now: new Date(), source: 'agent' })
    ).rejects.toBeInstanceOf(IneligibleVendorError);
  });

  it('(b) cuoc access_granted + ma vao => suspend => published, pass revoked, ticket dong, dispatchToVendor => IneligibleVendorError, khong co JobReveal trong outbox', async () => {
    const f = await newFixture();
    const job = await createGrantedJob(f);

    const passBefore = await sql<{ code: string }>(
      `select code from access_passes where job_id = $1 and revoked_at is null`,
      [job.id]
    );
    expect(passBefore).toHaveLength(1);

    const result = await suspendVendor({ vendorId: f.vendorId, staffId: STAFF_ID, note: 'Khieu nai', now: new Date() });
    expect(result.revokedGranted).toBe(1);

    const jobRows = await sql<{ status: string; assigned_vendor_id: string | null; access_ticket_id: string | null }>(
      `select status, assigned_vendor_id, access_ticket_id from jobs where id = $1`,
      [job.id]
    );
    expect(jobRows[0]!.status).toBe('published');
    expect(jobRows[0]!.assigned_vendor_id).toBeNull();

    const passAfter = await sql<{ revoked_at: string | null }>(`select revoked_at from access_passes where job_id = $1`, [job.id]);
    expect(passAfter[0]!.revoked_at).not.toBeNull();

    const ticketRows = await sql<{ status: string }>(`select status from tickets where id = $1`, [jobRows[0]!.access_ticket_id]);
    // Cau hoi mo (vong 2): SPEC ghi "=> cancelled" nhung `tickets.status`
    // CHECK constraint (001_init.sql) khong co gia tri nay va them migration
    // ngoai PHAM VI duoc mo vong nay — dung 'closed' (gan nghia nhat, xem
    // ghi chu trong `services/access.ts::withdrawGranted`).
    expect(ticketRows[0]!.status).toBe('closed');

    // dispatchToVendor sau khi da suspend (assigned_vendor_id da bi go) =>
    // IneligibleVendorError('not_assigned') — dung, nhung KHONG cham toi
    // chot chan §10.17. Chot chan duoc kiem RIENG, cach ly, o ca (b2) duoi
    // (mo phong dung khe ho SO tim thay: job VAN access_granted, VAN gan
    // dung tho, nhung `vendors.status` da doi — vd suspendVendor dang giua
    // buoc 1 va buoc 3, hoac mot duong khac tuong lai doi status ma khong
    // qua `suspendVendor`).
    await expect(dispatchToVendor({ jobCode: job.code, vendorId: f.vendorId, now: new Date() })).rejects.toBeInstanceOf(
      IneligibleVendorError
    );

    const outboxRows = await sql<{ text: string }>(
      `select body->>'text' as text from outbox where job_id = $1 and body->>'text' like '%SĐT cư dân%'`,
      [job.id]
    );
    expect(outboxRows).toHaveLength(0);
  });

  it('(b2) chot chan doc lap: cuoc VAN access_granted + VAN gan dung tho, nhung vendors.status != active => dispatchToVendor IneligibleVendorError(vendor_suspended), 0 tin JobReveal', async () => {
    const f = await newFixture();
    const job = await createGrantedJob(f);
    // Mo phong khe ho SO tim thay (KHONG di qua suspendVendor — chi doi
    // rieng `vendors.status`, giu jobs/access_passes/tickets nguyen ven)
    // de kiem chot chan cua `dispatchToVendor` mot cach CO LAP, khong bi
    // che boi viec `withdrawGranted` da go `assigned_vendor_id`.
    await sql(`update vendors set status = 'suspended' where id = $1`, [f.vendorId]);

    await expect(dispatchToVendor({ jobCode: job.code, vendorId: f.vendorId, now: new Date() })).rejects.toMatchObject({
      code: 'IneligibleVendorError',
      message: expect.stringContaining('vendor_suspended'),
    });

    const outboxRows = await sql<{ text: string }>(
      `select body->>'text' as text from outbox where job_id = $1 and body->>'text' like '%SĐT cư dân%'`,
      [job.id]
    );
    expect(outboxRows).toHaveLength(0);

    const jobRows = await sql<{ status: string }>(`select status from jobs where id = $1`, [job.id]);
    expect(jobRows[0]!.status).toBe('access_granted');
  });

  it('(c) goi suspend lan 2 => alreadySuspended=true, khong loi, khong doi gi them', async () => {
    const f = await newFixture();
    const job = await createHeldJob(f);
    const first = await suspendVendor({ vendorId: f.vendorId, staffId: STAFF_ID, note: 'lan 1', now: new Date() });
    expect(first.alreadySuspended).toBe(false);

    const second = await suspendVendor({ vendorId: f.vendorId, staffId: STAFF_ID, note: 'lan 2', now: new Date() });
    expect(second.alreadySuspended).toBe(true);
    expect(second.released).toBe(0);
    expect(second.withdrawn).toBe(0);
    expect(second.revokedGranted).toBe(0);

    const jobRows = await sql<{ status: string }>(`select status from jobs where id = $1`, [job.id]);
    expect(jobRows[0]!.status).toBe('published');
  });

  it('(d) cuoc dispatched giu nguyen, dispatchedLeft=1', async () => {
    const f = await newFixture();
    const job = await createGrantedJob(f);
    await dispatchToVendor({ jobCode: job.code, vendorId: f.vendorId, now: new Date() });

    const result = await suspendVendor({ vendorId: f.vendorId, staffId: STAFF_ID, note: 'test dispatched', now: new Date() });
    expect(result.dispatchedLeft).toBe(1);

    const jobRows = await sql<{ status: string; assigned_vendor_id: string | null }>(
      `select status, assigned_vendor_id from jobs where id = $1`,
      [job.id]
    );
    expect(jobRows[0]!.status).toBe('dispatched');
    expect(jobRows[0]!.assigned_vendor_id).toBe(f.vendorId);
  });

  it('vendor khong ton tai => VendorNotFoundError', async () => {
    await expect(
      suspendVendor({ vendorId: randomUUID(), staffId: STAFF_ID, note: 'x', now: new Date() })
    ).rejects.toBeInstanceOf(VendorNotFoundError);
  });
});

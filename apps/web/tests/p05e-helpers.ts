// apps/web/tests/p05e-helpers.ts — ham dung chung cho cac file
// `*-{decision,paid,status,tick}.db.test.ts` (SPEC-P04-Vendor-Console.md §8.4).
// KHONG phai file test (khong khop `**/*.db.test.ts`).
//
// Dung cuoc: dung DUNG cac dich vu core (publishJobToGroup/claimJob/
// confirmAssignment/requestAccess) de di qua may trang thai that, KHONG
// SQL tay dat `jobs.status`/`tickets.status` — chi INSERT thuc the moi
// (building/apartment/resident/vendor) bang SQL vi khong co dich vu tao
// thuc the cho P05-E.

import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { sql } from '@lenqclaw/core';
import type { StaffRole, TradeGroup } from '@lenqclaw/core';
import { publishJobToGroup, claimJob, confirmAssignment } from '@lenqclaw/core/services/dispatch';
import { requestAccess } from '@lenqclaw/core/services/access';
import { createSessionCookie, SESSION_COOKIE_NAME } from '../lib/auth/session';

export async function getToaABuildingId(): Promise<string> {
  const rows = await sql<{ id: string }>(`select id from buildings where code = 'TOA-A' limit 1`);
  if (!rows[0]) throw new Error('p05e-helpers: khong tim thay TOA-A — chay "npm run db:seed" truoc.');
  return rows[0]!.id;
}

/** Toa MOI rieng cho tung test slot (tranh trung du lieu voi cac slot seed
 * san co cua TOA-A — SPEC-P05 §10.11 da dat capacity=2 + 2 slot active cho
 * dien_nuoc, lam sai lech gia dinh "day tran"/"con cho" neu dung chung). */
export async function createBuilding(): Promise<string> {
  const orgRows = await sql<{ id: string }>(`select id from organizations limit 1`);
  if (!orgRows[0]) throw new Error('p05e-helpers: khong tim thay organizations — chay "npm run db:seed" truoc.');
  const rows = await sql<{ id: string }>(
    `insert into buildings (org_id, code, name) values ($1,$2,$3) returning id`,
    [orgRows[0]!.id, `P05E-${randomUUID().slice(0, 8)}`, 'Toa test P05-E']
  );
  return rows[0]!.id;
}

export async function createApartment(buildingId: string): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into apartments (building_id, code, floor) values ($1,$2,1) returning id`,
    [buildingId, `P05E-${randomUUID().slice(0, 8)}`]
  );
  return rows[0]!.id;
}

export async function createResident(): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into residents (full_name, phone, status) values ($1,$2,'active') returning id`,
    ['P05E Cu Dan Test', `09${String(Math.floor(10000000 + Math.random() * 89999999))}`]
  );
  return rows[0]!.id;
}

export interface CreateVendorArgs {
  buildingId: string;
  tradeGroup: TradeGroup;
  categoryCode: string;
  status?: 'active' | 'pending' | 'suspended';
  slotDaysLeft?: number | null;
  isTrial?: boolean;
}

export async function createVendor(args: CreateVendorArgs): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into vendors (full_name, phone, status) values ($1,$2,$3) returning id`,
    [`P05E Vendor ${randomUUID().slice(0, 6)}`, `09${String(Math.floor(10000000 + Math.random() * 89999999))}`, args.status ?? 'active']
  );
  const id = rows[0]!.id;
  await sql(`insert into vendor_buildings (vendor_id, building_id) values ($1,$2)`, [id, args.buildingId]);
  await sql(`insert into vendor_skills (vendor_id, category_code) values ($1,$2)`, [id, args.categoryCode]);
  await sql(`insert into vendor_scores (vendor_id) values ($1)`, [id]);
  if (args.slotDaysLeft !== null && args.slotDaysLeft !== undefined) {
    await sql(
      `insert into vendor_slots (vendor_id, building_id, trade_group, is_trial, period_start, period_end, fee, status)
       values ($1,$2,$3,$4, current_date, current_date + $5::int, $6, 'active')`,
      [id, args.buildingId, args.tradeGroup, args.isTrial ?? false, args.slotDaysLeft, args.isTrial ? 0 : 300000]
    );
  }
  return id;
}

/** Tao mot cuoc `case_open` roi di het buoc publish→held→confirmed→
 * access_pending qua dich vu core that (SPEC-P05-Dispatch.md §10.3.1/§10.3.2).
 * Tra ve id ticket `access_request` dang `open` de goi
 * POST /api/tickets/{id}/decision. */
export async function createJobToAccessPending(args: {
  buildingId: string;
  apartmentId: string;
  residentId: string;
  vendorId: string;
  categoryCode: string;
  now: Date;
}): Promise<{ jobId: string; jobCode: string; ticketId: string }> {
  const code = `C-${randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()}`;
  const windowStart = new Date(args.now.getTime() + 2 * 3_600_000);
  const windowEnd = new Date(args.now.getTime() + 5 * 3_600_000);
  const jobRows = await sql<{ id: string }>(
    `insert into jobs (code, building_id, apartment_id, resident_id, category_code, draft, mode, status, window_start, window_end)
     values ($1,$2,$3,$4,$5,$6,'fixed','case_open',$7,$8) returning id`,
    [
      code,
      args.buildingId,
      args.apartmentId,
      args.residentId,
      args.categoryCode,
      JSON.stringify({ symptoms: ['test'], location_in_unit: 'test' }),
      windowStart,
      windowEnd,
    ]
  );
  const jobId = jobRows[0]!.id;

  await publishJobToGroup({ jobId, actor: { type: 'staff', id: null }, now: args.now });
  const claimResult = await claimJob({ jobCode: code, vendorId: args.vendorId, now: args.now, source: 'agent' });
  if (!claimResult.won) throw new Error(`p05e-helpers: claimJob khong thang (${claimResult.status})`);
  await confirmAssignment({ jobCode: code, vendorId: args.vendorId, priceVnd: null, now: args.now });
  const { ticketId } = await requestAccess({
    jobId,
    vendorId: args.vendorId,
    note: 'Test P05-E',
    actor: { type: 'vendor', id: args.vendorId },
    now: args.now,
  });

  return { jobId, jobCode: code, ticketId };
}

/** Cuoc dang `held` (chua confirm) — dung cho sim-tick.db.test.ts (G07 j). */
export async function createJobHeld(args: {
  buildingId: string;
  apartmentId: string;
  residentId: string;
  vendorId: string;
  categoryCode: string;
  now: Date;
}): Promise<{ jobId: string; jobCode: string }> {
  const code = `C-${randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()}`;
  const windowStart = new Date(args.now.getTime() + 2 * 3_600_000);
  const windowEnd = new Date(args.now.getTime() + 5 * 3_600_000);
  const jobRows = await sql<{ id: string }>(
    `insert into jobs (code, building_id, apartment_id, resident_id, category_code, draft, mode, status, window_start, window_end)
     values ($1,$2,$3,$4,$5,$6,'fixed','case_open',$7,$8) returning id`,
    [
      code,
      args.buildingId,
      args.apartmentId,
      args.residentId,
      args.categoryCode,
      JSON.stringify({ symptoms: ['test'], location_in_unit: 'test' }),
      windowStart,
      windowEnd,
    ]
  );
  const jobId = jobRows[0]!.id;
  await publishJobToGroup({ jobId, actor: { type: 'staff', id: null }, now: args.now });
  const claimResult = await claimJob({ jobCode: code, vendorId: args.vendorId, now: args.now, source: 'agent' });
  if (!claimResult.won) throw new Error(`p05e-helpers: claimJob khong thang (${claimResult.status})`);
  return { jobId, jobCode: code };
}

/** `tickets.decided_by`/`vendors.approved_by` la `uuid references staff_users`
 * — can mot staff_users THAT (khac `zalo-logout.db.test.ts`, khong ghi FK
 * nao ve uid phien). */
const staffIdCache = new Map<StaffRole, string>();
async function realStaffId(role: StaffRole): Promise<string> {
  const cached = staffIdCache.get(role);
  if (cached) return cached;
  const rows = await sql<{ id: string }>(
    `insert into staff_users (email, password_hash, role) values ($1,'x',$2) returning id`,
    [`p05e-${role}-${randomUUID().slice(0, 8)}@test.local`, role]
  );
  const id = rows[0]!.id;
  staffIdCache.set(role, id);
  return id;
}

export async function req(url: string, method: string, role: StaffRole | null, body?: unknown): Promise<NextRequest> {
  const headers: Record<string, string> = {};
  if (role) {
    const uid = await realStaffId(role);
    headers.cookie = `${SESSION_COOKIE_NAME}=${await createSessionCookie(uid, role)}`;
  }
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

export const idParams = (id: string): { params: Promise<{ id: string }> } => ({ params: Promise.resolve({ id }) });

/** Gan zalo_identities cho tho (market) de `enqueueSystemEvent`/DM co thread. */
export async function linkVendorIdentity(vendorId: string): Promise<string> {
  const uid = `p05e-ven-${randomUUID().slice(0, 10)}`;
  await sql(`insert into zalo_identities (zalo_account_id, zalo_uid, party_type, party_id) values ('market',$1,'vendor',$2)`, [
    uid,
    vendorId,
  ]);
  return uid;
}

export async function outboxTexts(account: 'bql' | 'market', threadId: string): Promise<string[]> {
  const rows = await sql<{ text: string }>(
    `select body->>'text' as text from outbox where zalo_account_id = $1 and thread_id = $2 order by id`,
    [account, threadId]
  );
  return rows.map((r) => r.text);
}

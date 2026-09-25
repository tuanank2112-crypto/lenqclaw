// packages/core/src/dbtests/p05-helpers.ts — ham dung chung cho cac file
// `p05-*.db.test.ts` (KHONG phai file test — ten khong khop
// `vitest.db.config.ts` include `**/*.db.test.ts` nen khong bi chay rieng).

import { randomUUID } from 'node:crypto';
import { sql, tx } from '../adapters/db.js';

export async function getToaABuildingId(): Promise<string> {
  const rows = await sql<{ id: string }>(`select id from buildings where code = 'TOA-A' limit 1`);
  if (!rows[0]) throw new Error('p05-helpers: khong tim thay TOA-A — chay "npm run db:seed" truoc.');
  return rows[0]!.id;
}

export async function createApartment(buildingId: string): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into apartments (building_id, code, floor) values ($1,$2,1) returning id`,
    [buildingId, `P05-${randomUUID().slice(0, 8)}`]
  );
  return rows[0]!.id;
}

export async function createResident(fullName = 'P05 Cu Dan Test', phone?: string): Promise<string> {
  const rows = await sql<{ id: string }>(
    `insert into residents (full_name, phone, status) values ($1,$2,'active') returning id`,
    [fullName, phone ?? `09${String(Math.floor(10000000 + Math.random() * 89999999))}`]
  );
  return rows[0]!.id;
}

export interface CreateVendorArgs {
  buildingId: string;
  tradeGroup: 'dien_nuoc' | 'khoa' | 'dien_lanh' | 'xay_sua';
  categoryCode: string;
  status?: 'active' | 'pending' | 'suspended';
  /** so ngay con lai cua slot active (co the am de tao slot da het han);
   * `null`/undefined => KHONG tao vendor_slots (vd test 'no_slot'). */
  slotDaysLeft?: number | null;
  isTrial?: boolean;
}

export async function createVendor(args: CreateVendorArgs): Promise<string> {
  return tx(async (q) => {
    const rows = await q<{ id: string }>(
      `insert into vendors (full_name, phone, status) values ($1,$2,$3) returning id`,
      [`P05 Vendor ${randomUUID().slice(0, 6)}`, `09${String(Math.floor(10000000 + Math.random() * 89999999))}`, args.status ?? 'active']
    );
    const id = rows[0]!.id;
    await q(`insert into vendor_buildings (vendor_id, building_id) values ($1,$2)`, [id, args.buildingId]);
    await q(`insert into vendor_skills (vendor_id, category_code) values ($1,$2)`, [id, args.categoryCode]);
    await q(`insert into vendor_scores (vendor_id) values ($1)`, [id]);
    if (args.slotDaysLeft !== null && args.slotDaysLeft !== undefined) {
      await q(
        `insert into vendor_slots (vendor_id, building_id, trade_group, is_trial, period_start, period_end, fee, status)
         values ($1,$2,$3,$4, current_date, current_date + $5::int, $6, 'active')`,
        [id, args.buildingId, args.tradeGroup, args.isTrial ?? false, args.slotDaysLeft, args.isTrial ? 0 : 300000]
      );
    }
    return id;
  });
}

export interface CreateJobArgs {
  buildingId: string;
  apartmentId: string;
  residentId: string;
  categoryCode: string | null;
  mode: 'fixed' | 'quote' | null;
  status: string;
  windowStart?: Date | null;
  windowEnd?: Date | null;
  draft?: Record<string, unknown>;
}

export async function createJob(args: CreateJobArgs): Promise<{ id: string; code: string }> {
  const code = `C-${randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()}`;
  const rows = await sql<{ id: string }>(
    `insert into jobs (code, building_id, apartment_id, resident_id, category_code, draft, mode, status, window_start, window_end)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [
      code,
      args.buildingId,
      args.apartmentId,
      args.residentId,
      args.categoryCode,
      JSON.stringify(args.draft ?? { symptoms: ['test'], location_in_unit: 'test' }),
      args.mode,
      args.status,
      args.windowStart ?? null,
      args.windowEnd ?? null,
    ]
  );
  return { id: rows[0]!.id, code };
}

export async function outboxTexts(account: 'bql' | 'market', threadId: string): Promise<string[]> {
  const rows = await sql<{ text: string }>(
    `select body->>'text' as text from outbox where zalo_account_id = $1 and thread_id = $2 order by id`,
    [account, threadId]
  );
  return rows.map((r) => r.text);
}

export async function linkVendorIdentity(vendorId: string): Promise<string> {
  const uid = `p05-ven-${randomUUID().slice(0, 10)}`;
  await sql(`insert into zalo_identities (zalo_account_id, zalo_uid, party_type, party_id) values ('market',$1,'vendor',$2)`, [
    uid,
    vendorId,
  ]);
  return uid;
}

/** Tao mot conversation `bql`/resident de `sendResidentOfJob` tim duoc thread. */
export async function createResidentConversation(residentId: string): Promise<string> {
  const threadId = `p05-res-${randomUUID().slice(0, 10)}`;
  await sql(
    `insert into conversations (zalo_account_id, thread_id, party_type, party_id) values ('bql',$1,'resident',$2)`,
    [threadId, residentId]
  );
  return threadId;
}

export async function priceBookFixed(buildingId: string, categoryCode: string): Promise<[number, number, number]> {
  const rows = await sql<{ p25: number; p50: number; p75: number }>(
    `select p25, p50, p75 from price_book where category_code = $1 and building_id = $2`,
    [categoryCode, buildingId]
  );
  if (!rows[0]) throw new Error('p05-helpers: khong co price_book cho category nay — can seed:sim.');
  return [rows[0]!.p25, rows[0]!.p50, rows[0]!.p75];
}

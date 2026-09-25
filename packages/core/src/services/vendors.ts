// packages/core/src/services/vendors.ts — quan tri tho (SPEC-P05-Dispatch.md
// §10.17, Đ30 — vá lỗ phát hiện khi duyệt R14). `suspendVendor` la NOI DUY
// NHAT web goi de dinh chi tho; CAM route tu SQL doi `vendors.status`/
// `vendor_slots.status`.

import { sql } from '../adapters/db.js';
import { audit } from './audit.js';
import { releaseHold, withdrawConfirmed } from './dispatch.js';
import { withdrawGranted } from './access.js';
import { VendorNotFoundError } from '../domain/errors.js';

export interface SuspendVendorResult {
  alreadySuspended: boolean;
  released: number;
  withdrawn: number;
  revokedGranted: number;
  dispatchedLeft: number;
}

/**
 * SPEC-P05-Dispatch.md §10.17 — thu tu BAT BUOC (danh dau ro tung buoc,
 * KHONG duoc dao):
 *   1. `vendors.status='suspended'` CHAY VA COMMIT DAU TIEN (tu day thoi
 *      moi UPDATE co dieu kien khac doc `status='active'` deu that bai —
 *      claimJob/grantPaidSlot/dispatchToVendor khong con nhan duoc tho nay).
 *   2. Nha/rut cac cuoc dang giu boi tho (held/confirmed/access_pending).
 *   3. Rut cuoc access_granted (chua giao viec) — chot chan JobReveal.
 *   4. Huy slot con hieu luc + audit.
 * Idempotent: goi lai khi da `suspended` van quet lai buoc 2-4 (phong truong
 * hop lan truoc chet giua chung).
 */
export async function suspendVendor(args: {
  vendorId: string;
  staffId: string;
  note: string;
  now: Date;
}): Promise<SuspendVendorResult> {
  // Buoc 1 — RIENG mot cau lenh, KHONG boc trong tx voi cac buoc sau: phai
  // COMMIT truoc khi buoc 2-4 chay, de moi doc `status='active'` tu thoi
  // diem nay tro di deu thay tho da bi dinh chi (Đ30 diem 1).
  const claimRows = await sql<{ id: string }>(
    `update vendors set status = 'suspended' where id = $1 and status <> 'suspended' returning id`,
    [args.vendorId]
  );
  let alreadySuspended = false;
  if (claimRows.length === 0) {
    const existsRows = await sql<{ id: string }>(`select id from vendors where id = $1`, [args.vendorId]);
    if (existsRows.length === 0) throw new VendorNotFoundError();
    alreadySuspended = true;
  }

  // Buoc 2: nha cuoc dang giu (held) / rut cuoc da xac nhan/dang cho vao
  // toa (confirmed, access_pending).
  const heldJobs = await sql<{ id: string }>(`select id from jobs where assigned_vendor_id = $1 and status = 'held'`, [
    args.vendorId,
  ]);
  for (const job of heldJobs) {
    await releaseHold({ jobId: job.id, now: args.now, reason: 'vendor_suspended', actor: { type: 'staff', id: args.staffId } });
  }
  const confirmedJobs = await sql<{ id: string }>(
    `select id from jobs where assigned_vendor_id = $1 and status in ('confirmed', 'access_pending')`,
    [args.vendorId]
  );
  for (const job of confirmedJobs) {
    await withdrawConfirmed({ jobId: job.id, now: args.now, reason: 'vendor_suspended', actor: { type: 'staff', id: args.staffId } });
  }

  // Buoc 3: cuoc access_granted (da duyet cap quyen, CHUA giao viec) — chot
  // chan JobReveal (BB-02/BB-10).
  const grantedJobs = await sql<{ id: string }>(
    `select id from jobs where assigned_vendor_id = $1 and status = 'access_granted'`,
    [args.vendorId]
  );
  for (const job of grantedJobs) {
    await withdrawGranted({ jobId: job.id, now: args.now, reason: 'vendor_suspended', actor: { type: 'staff', id: args.staffId } });
  }

  // Cuoc dispatched: KHONG tu dong doi (tho co the dang o can) — chi dem.
  const dispatchedRows = await sql<{ n: number }>(
    `select count(*)::int as n from jobs where assigned_vendor_id = $1 and status = 'dispatched'`,
    [args.vendorId]
  );

  // Buoc 4: huy slot con hieu luc.
  await sql(`update vendor_slots set status = 'cancelled' where vendor_id = $1 and status = 'active'`, [args.vendorId]);

  const result: SuspendVendorResult = {
    alreadySuspended,
    released: heldJobs.length,
    withdrawn: confirmedJobs.length,
    revokedGranted: grantedJobs.length,
    dispatchedLeft: dispatchedRows[0]?.n ?? 0,
  };

  await audit(sql, {
    actorType: 'staff',
    actorId: args.staffId,
    action: 'vendor.suspended',
    target: args.vendorId,
    data: { note: args.note, ...result },
  });

  return result;
}

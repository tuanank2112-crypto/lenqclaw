// POST /api/vendors/{id}/status — SPEC-P04-Vendor-Console.md §8.2, §8.6.
//
// Cau hoi mo (khong tu bia — chon cach an toan nhat, khong sua specs/):
// SPEC ghi nhanh {status:'suspended'} goi core `suspendVendor({vendorId,
// staffId, note, now})`, nhung ham nay KHONG ton tai trong
// `packages/core/src/services/*` (da ra soat: dispatch.ts/access.ts/
// slots.ts khong co `suspendVendor`) va handoff CAM sua `packages/**`.
// Da lam: ghep lai DUNG logic SPEC ta trong route bang cac ham core DA
// XUAT (`releaseHold`, `withdrawConfirmed` — hai ham nay la noi DUY NHAT
// doi trang thai cuoc, dung §8.2 "moi doi trang thai cuoc di qua core");
// phan SQL con lai (`vendors.status`, `vendor_slots.status`) khong doi
// trang thai CUOC/TICKET nen khong thuoc CAM cua §8.2.

import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit } from '@lenqclaw/core';
import { releaseHold, withdrawConfirmed } from '@lenqclaw/core/services/dispatch';
import { requireRole } from '../../../_auth';

export const dynamic = 'force-dynamic';

interface RawBody {
  status?: unknown;
  note?: unknown;
}

type StatusBody = { status: 'active' } | { status: 'suspended'; note: string };

function parseBody(raw: RawBody | null): StatusBody | null {
  if (!raw) return null;
  if (raw.status === 'active') return { status: 'active' };
  if (raw.status === 'suspended') {
    if (typeof raw.note !== 'string' || raw.note.trim().length === 0) return null;
    return { status: 'suspended', note: raw.note };
  }
  return null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const check = await requireRole(req, ['bql_admin']);
  if (!check.ok) {
    return NextResponse.json({ error: check.status === 401 ? 'unauthorized' : 'forbidden' }, { status: check.status });
  }
  const { id } = await ctx.params;

  const raw = (await req.json().catch(() => null)) as RawBody | null;
  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const vendorRows = await sql<{ status: string }>(`select status from vendors where id = $1`, [id]);
  if (vendorRows.length === 0) {
    return NextResponse.json({ error: 'vendor_not_found' }, { status: 404 });
  }

  if (body.status === 'active') {
    const rows = await sql<{ id: string }>(
      `update vendors set status = 'active', approved_by = $2, approved_at = now()
       where id = $1 and status = 'pending' returning id`,
      [id, check.session.uid]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: 'vendor_not_pending' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: 'active' });
  }

  // {status:'suspended', note} — SPEC-P05-Dispatch.md §8: nha cuoc dang
  // giu, rut cuoc da xac nhan/dang cho vao toa, huy slot con hieu luc.
  const now = new Date();
  const heldJobs = await sql<{ id: string }>(`select id from jobs where assigned_vendor_id = $1 and status = 'held'`, [id]);
  for (const job of heldJobs) {
    await releaseHold({ jobId: job.id, now, reason: 'vendor_suspended', actor: { type: 'staff', id: check.session.uid } });
  }
  const confirmedJobs = await sql<{ id: string }>(
    `select id from jobs where assigned_vendor_id = $1 and status in ('confirmed', 'access_pending')`,
    [id]
  );
  for (const job of confirmedJobs) {
    await withdrawConfirmed({ jobId: job.id, now, reason: 'vendor_suspended', actor: { type: 'staff', id: check.session.uid } });
  }
  await sql(`update vendors set status = 'suspended' where id = $1`, [id]);
  await sql(`update vendor_slots set status = 'cancelled' where vendor_id = $1 and status = 'active'`, [id]);
  await audit(sql, {
    actorType: 'staff',
    actorId: check.session.uid,
    action: 'vendor.suspended',
    target: id,
    data: { note: body.note },
  });
  return NextResponse.json({ ok: true, status: 'suspended' });
}

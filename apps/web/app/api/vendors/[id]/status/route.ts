// POST /api/vendors/{id}/status — SPEC-P04-Vendor-Console.md §8.2, §8.6 +
// SPEC-P05-Dispatch.md §10.17 (Đ30, vòng 2). Nhánh `suspended` CHỈ gọi
// `suspendVendor` (core) — CẤM route tự SQL đổi `vendors.status`/
// `vendor_slots.status` cho nhánh này (chốt vòng 2, vá lỗ R14: route cũ tự
// ghép SQL nhả cuốc TRƯỚC rồi mới đặt suspended, và bỏ sót `access_granted`).

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@lenqclaw/core';
import { suspendVendor } from '@lenqclaw/core/services/vendors';
import { VendorNotFoundError } from '@lenqclaw/core/domain/errors';
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

  if (body.status === 'active') {
    const vendorRows = await sql<{ status: string }>(`select status from vendors where id = $1`, [id]);
    if (vendorRows.length === 0) {
      return NextResponse.json({ error: 'vendor_not_found' }, { status: 404 });
    }
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

  // {status:'suspended', note} — SPEC-P05-Dispatch.md §10.17: CHỈ gọi
  // suspendVendor (thứ tự bước 1-4 do core đảm bảo, kể cả chốt chặn
  // access_granted/dispatchToVendor).
  try {
    const result = await suspendVendor({ vendorId: id, staffId: check.session.uid, note: body.note, now: new Date() });
    if (result.alreadySuspended) {
      return NextResponse.json({ error: 'vendor_already_suspended' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: 'suspended', ...result });
  } catch (err) {
    if (err instanceof VendorNotFoundError) {
      return NextResponse.json({ error: 'vendor_not_found' }, { status: 404 });
    }
    throw err;
  }
}

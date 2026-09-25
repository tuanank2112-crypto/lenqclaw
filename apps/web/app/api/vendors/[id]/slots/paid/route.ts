// POST /api/vendors/{id}/slots/paid — SPEC-P04-Vendor-Console.md §8.2, §8.6.
// Nut "Đã thu phí": gia han/cap slot tra phi qua core `grantPaidSlot`.

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@lenqclaw/core';
import { grantPaidSlot } from '@lenqclaw/core/services/slots';
import { SlotUnavailableError } from '@lenqclaw/core/domain/errors';
import { requireRole } from '../../../../_auth';
import type { TradeGroup } from '@lenqclaw/core';

export const dynamic = 'force-dynamic';

const TRADE_GROUPS: readonly TradeGroup[] = ['dien_nuoc', 'khoa', 'dien_lanh', 'xay_sua'];

interface RawBody {
  building_id?: unknown;
  trade_group?: unknown;
}

function parseBody(raw: RawBody | null): { buildingId: string; tradeGroup: TradeGroup } | null {
  if (!raw) return null;
  if (typeof raw.building_id !== 'string' || raw.building_id.length === 0) return null;
  if (typeof raw.trade_group !== 'string' || !(TRADE_GROUPS as string[]).includes(raw.trade_group)) return null;
  return { buildingId: raw.building_id, tradeGroup: raw.trade_group as TradeGroup };
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

  // grantPaidSlot (services/slots.ts) khong tu kiem thợ ton tai/active —
  // route kiem TRUOC (doc, khong doi trang thai) de tra dung 404/409.
  const vendorRows = await sql<{ status: string }>(`select status from vendors where id = $1`, [id]);
  if (vendorRows.length === 0) {
    return NextResponse.json({ error: 'vendor_not_found' }, { status: 404 });
  }
  if (vendorRows[0]!.status !== 'active') {
    return NextResponse.json({ error: 'vendor_not_active' }, { status: 409 });
  }

  try {
    const result = await grantPaidSlot({
      vendorId: id,
      buildingId: body.buildingId,
      tradeGroup: body.tradeGroup,
      staffId: check.session.uid,
      now: new Date(),
    });
    if (result.result === 'granted') {
      return NextResponse.json({ result: 'granted', period_start: result.periodStart, period_end: result.periodEnd });
    }
    return NextResponse.json({ result: 'waitlisted', position: result.position });
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      return NextResponse.json({ error: 'capacity_missing' }, { status: 409 });
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

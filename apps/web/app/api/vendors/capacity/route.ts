// POST /api/vendors/capacity — SPEC-P04-Vendor-Console.md §8.2. Dat tran
// slot theo (toa x nhom nghe). Khong doi trang thai cuoc/ticket => SQL
// truc tiep vao `slot_capacity` duoc phep (§8.2 chi cam SQL doi trang
// thai CUOC/TICKET).

import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit } from '@lenqclaw/core';
import { requireRole } from '../../_auth';
import type { TradeGroup } from '@lenqclaw/core';

export const dynamic = 'force-dynamic';

const TRADE_GROUPS: readonly TradeGroup[] = ['dien_nuoc', 'khoa', 'dien_lanh', 'xay_sua'];

interface RawBody {
  building_id?: unknown;
  trade_group?: unknown;
  capacity?: unknown;
}

function parseBody(raw: RawBody | null): { buildingId: string; tradeGroup: TradeGroup; capacity: number } | null {
  if (!raw) return null;
  if (typeof raw.building_id !== 'string' || raw.building_id.length === 0) return null;
  if (typeof raw.trade_group !== 'string' || !(TRADE_GROUPS as string[]).includes(raw.trade_group)) return null;
  if (typeof raw.capacity !== 'number' || !Number.isInteger(raw.capacity) || raw.capacity < 1) return null;
  return { buildingId: raw.building_id, tradeGroup: raw.trade_group as TradeGroup, capacity: raw.capacity };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const check = await requireRole(req, ['bql_admin']);
  if (!check.ok) {
    return NextResponse.json({ error: check.status === 401 ? 'unauthorized' : 'forbidden' }, { status: check.status });
  }

  const raw = (await req.json().catch(() => null)) as RawBody | null;
  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  await sql(
    `insert into slot_capacity (building_id, trade_group, capacity, reviewed_at)
     values ($1, $2, $3, now())
     on conflict (building_id, trade_group) do update set capacity = excluded.capacity, reviewed_at = now()`,
    [body.buildingId, body.tradeGroup, body.capacity]
  );
  await audit(sql, {
    actorType: 'staff',
    actorId: check.session.uid,
    action: 'slot.capacity_set',
    target: body.buildingId,
    data: { building_id: body.buildingId, trade_group: body.tradeGroup, capacity: body.capacity },
  });
  return NextResponse.json({ ok: true });
}

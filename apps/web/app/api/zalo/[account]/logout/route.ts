// POST /api/zalo/{account}/logout — SPEC-P02 §9.8: chi bql_admin; xoa
// session_enc + qr_* + dat logged_out NGAY trong cung transaction (worker
// khong chay van khong de phien mo coi); dong thoi dat logout_requested_at
// de worker (neu dang chay) dut ket noi in-memory (listener/pacer) o nhip
// quet 2 s. Audit ghi o day (web) vi actor (staff bam nut) chi web biet —
// worker khong co actor (quyet dinh ghi report R09).

import { NextResponse, type NextRequest } from 'next/server';
import { audit, sql } from '@lenqclaw/core';
import { enabledZaloAccounts, requireZaloAdmin } from '../../_shared';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ account: string }> }
): Promise<NextResponse> {
  const check = await requireZaloAdmin(req);
  if (!check.ok) {
    return NextResponse.json({ error: check.status === 401 ? 'unauthorized' : 'forbidden' }, { status: check.status });
  }
  const { account } = await ctx.params;
  if (!(enabledZaloAccounts() as string[]).includes(account)) {
    return NextResponse.json({ error: 'account_not_enabled' }, { status: 404 });
  }
  const rows = await sql<{ id: string }>(
    `update zalo_accounts
     set logout_requested_at = now(), session_enc = null, qr_data_url = null, qr_expires_at = null,
         qr_state = null, session_state = 'logged_out'
     where id = $1 returning id`,
    [account]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: 'account_not_found' }, { status: 404 });
  }
  await audit(sql, {
    actorType: 'staff',
    actorId: check.session.uid,
    action: 'zalo.logout',
    target: account,
    data: {},
  });
  return NextResponse.json({ ok: true, account });
}

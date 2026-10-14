// POST /api/zalo/{account}/login — SPEC-P02 §9.2: chi admin; dat
// `login_requested_at = now()`; worker quet cot nay moi 2 s va bat dau QR.

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
    `update zalo_accounts set login_requested_at = now() where id = $1 returning id`,
    [account]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: 'account_not_found' }, { status: 404 });
  }
  await audit(sql, {
    actorType: 'staff',
    actorId: check.session.uid,
    action: 'zalo.login_requested',
    target: account,
    data: {},
  });
  return NextResponse.json({ ok: true, account });
}

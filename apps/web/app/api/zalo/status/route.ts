// GET /api/zalo/status — trang thai phien cho trang /zalo (tu lam moi 3 s).
// Chi admin. Anh QR chi tra khi con han (`qr_expires_at > now()`).
// KHONG bao gio tra `session_enc`.

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@lenqclaw/core';
import { enabledZaloAccounts, requireZaloAdmin } from '../_shared';

export const dynamic = 'force-dynamic';

interface AccountStatusRow {
  id: string;
  display_name: string | null;
  session_state: string;
  last_event_at: string | null;
  login_requested_at: string | null;
  qr_data_url: string | null;
  qr_expires_at: string | null;
  qr_state: string | null;
}

interface AlertRow {
  target: string;
  kind: string | null;
  created_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const check = await requireZaloAdmin(req);
  if (!check.ok) {
    return NextResponse.json({ error: check.status === 401 ? 'unauthorized' : 'forbidden' }, { status: check.status });
  }
  const ids = enabledZaloAccounts();
  const accounts = await sql<AccountStatusRow>(
    `select id, display_name, session_state, last_event_at::text as last_event_at,
            login_requested_at::text as login_requested_at,
            case when qr_expires_at > now() then qr_data_url else null end as qr_data_url,
            case when qr_expires_at > now() then qr_expires_at::text else null end as qr_expires_at,
            qr_state
     from zalo_accounts where id = any($1) order by id`,
    [ids]
  );
  const alerts = await sql<AlertRow>(
    `select target, data->>'kind' as kind, created_at::text as created_at from audit_log
     where action = 'zalo.alert' and target = any($1) order by id desc limit 10`,
    [ids]
  );
  return NextResponse.json({ accounts, alerts, now: new Date().toISOString() });
}

// GET /api/healthz — dau song cho dich vu ping ngoai (D32, D37, SPEC-D31 §9). KHONG can dang nhap
// (middleware/policy cho GET/HEAD di qua). Doc `process_heartbeats` + `zalo_accounts.session_state`.
// 200 {ok:true, runner:{age_s}, worker:{age_s}, zalo} khi ca hai tien trinh con song (age_s <= HEARTBEAT_STALE_MS/1000)
// va phien `connected` (hoac DATA_MODE=sim); khac ⇒ 503 cung dang `ok:false`; DB loi ⇒ 503 {ok:false, db:false}.
// CAM tra: so thanh vien/nhom/tin, ten, loi chi tiet, env, token.

import { NextResponse } from 'next/server';
import { sql } from '@lenqclaw/core';
import { readCommunityConfig } from '@lenqclaw/core/services/community-config';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

function staleMs(): number {
  try {
    return readCommunityConfig().heartbeatStaleMs;
  } catch {
    return 60_000; // env sai khong duoc lam healthz sap — dung mac dinh
  }
}

interface Beat {
  name: string;
  age_s: number;
}

export async function GET(): Promise<NextResponse> {
  let beats: Beat[];
  let zalo = 'unknown';
  try {
    beats = await sql<Beat>(
      `select name, floor(extract(epoch from (now() - beat_at)))::int as age_s from process_heartbeats where name in ('runner','worker')`
    );
    const acc = await sql<{ session_state: string }>(`select session_state from zalo_accounts where id = 'community'`);
    zalo = acc[0]?.session_state ?? 'unknown';
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503, headers: NO_STORE });
  }
  const limit = Math.floor(staleMs() / 1000);
  const age = (n: string): number | null => beats.find((b) => b.name === n)?.age_s ?? null;
  const runner = age('runner');
  const worker = age('worker');
  const sim = process.env.DATA_MODE === 'sim';
  const ok = runner !== null && runner <= limit && worker !== null && worker <= limit && (zalo === 'connected' || sim);
  return NextResponse.json({ ok, runner: { age_s: runner }, worker: { age_s: worker }, zalo }, { status: ok ? 200 : 503, headers: NO_STORE });
}

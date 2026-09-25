// POST /api/dev/sim/tick — SPEC-P04-Vendor-Console.md §8.2, SPEC-P05-Dispatch
// §10.11. Chi DATA_MODE=sim (khac => 404 nhu cac route dev khac); goi
// dong ho `runTimers(now)` roi phat outbox gia lap.

import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit, sim } from '@lenqclaw/core';
import { runTimers } from '@lenqclaw/core/services/timers';
import { requireRole } from '../../../_auth';

export const dynamic = 'force-dynamic';

interface RawBody {
  now?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.DATA_MODE !== 'sim') {
    return NextResponse.json({ error: 'not_sim_mode' }, { status: 404 });
  }
  const check = await requireRole(req, ['bql_admin']);
  if (!check.ok) {
    return NextResponse.json({ error: check.status === 401 ? 'unauthorized' : 'forbidden' }, { status: check.status });
  }

  const raw = (await req.json().catch(() => ({}))) as RawBody;
  let now: Date;
  if (raw.now === undefined) {
    now = new Date();
  } else if (typeof raw.now === 'string') {
    const parsed = new Date(raw.now);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    now = parsed;
  } else {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const report = await runTimers(now);
  const { delivered } = await sim.simDeliver();

  await audit(sql, {
    actorType: 'staff',
    actorId: check.session.uid,
    action: 'sim.tick',
    target: null,
    data: { now: now.toISOString() },
  });

  return NextResponse.json({ ...report, delivered });
}

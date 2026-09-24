import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit, sim } from '@lenqclaw/core';
import { getSessionFromRequest } from '../../../../../lib/auth/guard';

interface ReplayBody {
  file?: string;
}

const SCENARIOS_DIR = path.join(process.cwd(), '..', '..', 'evals', 'scenarios');

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.DATA_MODE !== 'sim') {
    return NextResponse.json({ error: 'not_sim_mode' }, { status: 404 });
  }
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'bql_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as ReplayBody;
  const file = body.file && /^[\w.-]+\.jsonl$/.test(body.file) ? body.file : 'echo.jsonl';
  const filePath = path.join(SCENARIOS_DIR, file);

  const result = await sim.runScenario(filePath);

  await audit(sql, {
    actorType: 'staff',
    actorId: session.uid,
    action: 'sim.replay',
    target: file,
    data: { ...result },
  });

  return NextResponse.json(result);
}

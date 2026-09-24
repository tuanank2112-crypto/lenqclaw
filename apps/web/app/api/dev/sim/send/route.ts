import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit, sim } from '@lenqclaw/core';
import { getSessionFromRequest } from '../../../../../lib/auth/guard';

interface SendBody {
  account?: 'bql' | 'market';
  threadId?: string;
  threadType?: 'user' | 'group';
  senderUid?: string;
  text?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.DATA_MODE !== 'sim') {
    return NextResponse.json({ error: 'not_sim_mode' }, { status: 404 });
  }
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'bql_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as SendBody | null;
  if (!body?.account || !body.threadId || !body.threadType || !body.senderUid || !body.text) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const result = await sim.simInbound({
    account: body.account,
    threadId: body.threadId,
    threadType: body.threadType,
    senderUid: body.senderUid,
    text: body.text,
  });

  if (!result.duplicate) {
    await sim.processInbound(sim.echoHandler);
    await sim.simDeliver();
  }

  await audit(sql, {
    actorType: 'staff',
    actorId: session.uid,
    action: 'sim.send',
    target: body.threadId,
    data: { account: body.account, threadType: body.threadType, senderUid: body.senderUid, duplicate: result.duplicate },
  });

  return NextResponse.json({ ok: true, duplicate: result.duplicate });
}

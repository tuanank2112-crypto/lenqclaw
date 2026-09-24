import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit, sim, agent } from '@lenqclaw/core';
import { getSessionFromRequest } from '../../../../../lib/auth/guard';

interface RawSendBody {
  account?: unknown;
  threadId?: unknown;
  threadType?: unknown;
  senderUid?: unknown;
  text?: unknown;
}

interface SendBody {
  account: 'bql' | 'market';
  threadId: string;
  threadType: 'user' | 'group';
  senderUid: string;
  text: string;
}

// R02-tham-dinh D10: `account`/`threadType` phai dung UNG mot trong cac gia
// tri hop le (khong phai chi "co mat"), cac truong con lai phai la chuoi
// khong rong — tranh gia tri la (`account="evil"`) roi vao DB, va tranh
// TypeError => 500 khi truong khong phai chuoi (`threadType=bogus` tung
// lam constraint DB nem loi tho).
function parseSendBody(raw: RawSendBody | null): SendBody | null {
  if (!raw) return null;
  if (raw.account !== 'bql' && raw.account !== 'market') return null;
  if (raw.threadType !== 'user' && raw.threadType !== 'group') return null;
  if (typeof raw.threadId !== 'string' || raw.threadId.length === 0) return null;
  if (typeof raw.senderUid !== 'string' || raw.senderUid.length === 0) return null;
  if (typeof raw.text !== 'string' || raw.text.length === 0) return null;
  return { account: raw.account, threadType: raw.threadType, threadId: raw.threadId, senderUid: raw.senderUid, text: raw.text };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.DATA_MODE !== 'sim') {
    return NextResponse.json({ error: 'not_sim_mode' }, { status: 404 });
  }
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'bql_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const raw = (await req.json().catch(() => null)) as RawSendBody | null;
  const body = parseSendBody(raw);
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const result = await sim.simInbound({
    account: body.account,
    threadId: body.threadId,
    threadType: body.threadType,
    senderUid: body.senderUid,
    text: body.text,
  });

  if (!result.duplicate) {
    // SPEC-P03 §10.1: account bql + thread user => residentHandler; con lai
    // van vong vong lai (echoHandler) toi khi P05 thay.
    await sim.processInbound(agent.routeInboundEvent);
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

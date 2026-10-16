import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit, sim, agent } from '@lenqclaw/core';
import { getSessionFromRequest } from '../../../../../lib/auth/guard';

interface RawSendBody {
  account?: unknown;
  threadId?: unknown;
  threadType?: unknown;
  senderUid?: unknown;
  text?: unknown;
  senderName?: unknown;
  mentionBot?: unknown;
  mentionUids?: unknown;
  quoteMsgId?: unknown;
  msgType?: unknown;
  event?: unknown;
  eventUids?: unknown;
  eventNames?: unknown;
}

interface SendBody {
  account: 'community';
  threadId: string;
  threadType: 'user' | 'group';
  senderUid: string;
  text: string;
  senderName?: string;
  mentionBot?: boolean;
  mentionUids?: string[];
  quoteMsgId?: string;
  msgType?: sim.SimMsgType;
  event?: sim.SimGroupEventName;
  eventUids?: string[];
  eventNames?: string[];
}

const MSG_TYPES: ReadonlySet<string> = new Set(['webchat', 'chat.sticker', 'chat.photo']);
const EVENTS: ReadonlySet<string> = new Set(['join', 'join_request', 'leave', 'remove_member', 'add_admin', 'remove_admin']);

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0);
}

// R02-tham-dinh D10: `account`/`threadType` phai dung UNG mot trong cac gia
// tri hop le (khong phai chi "co mat"), cac truong con lai phai la chuoi
// khong rong — tranh gia tri la (`account="evil"`) roi vao DB, va tranh
// TypeError => 500 khi truong khong phai chuoi (`threadType=bogus` tung
// lam constraint DB nem loi tho). SPEC-P02 §7.3: them cac truong nhom, moi
// truong tuy chon sai KIEU ⇒ 400 (khong im lang bo qua).
function parseSendBody(raw: RawSendBody | null): SendBody | null {
  if (!raw) return null;
  if (raw.account !== 'community') return null;
  if (raw.threadType !== 'user' && raw.threadType !== 'group') return null;
  if (typeof raw.threadId !== 'string' || raw.threadId.length === 0) return null;
  if (typeof raw.senderUid !== 'string' || raw.senderUid.length === 0) return null;

  const out: SendBody = {
    account: raw.account,
    threadType: raw.threadType,
    threadId: raw.threadId,
    senderUid: raw.senderUid,
    text: '',
  };
  if (raw.senderName !== undefined) {
    if (typeof raw.senderName !== 'string' || raw.senderName.length === 0) return null;
    out.senderName = raw.senderName;
  }
  if (raw.mentionBot !== undefined) {
    if (typeof raw.mentionBot !== 'boolean') return null;
    out.mentionBot = raw.mentionBot;
  }
  if (raw.mentionUids !== undefined) {
    if (!isStringArray(raw.mentionUids)) return null;
    out.mentionUids = raw.mentionUids;
  }
  if (raw.quoteMsgId !== undefined && raw.quoteMsgId !== null) {
    if (typeof raw.quoteMsgId !== 'string' || raw.quoteMsgId.length === 0) return null;
    out.quoteMsgId = raw.quoteMsgId;
  }
  if (raw.msgType !== undefined) {
    if (typeof raw.msgType !== 'string' || !MSG_TYPES.has(raw.msgType)) return null;
    out.msgType = raw.msgType as sim.SimMsgType;
  }
  if (raw.event !== undefined) {
    if (typeof raw.event !== 'string' || !EVENTS.has(raw.event)) return null;
    if (raw.threadType !== 'group') return null; // su kien chi o nhom
    out.event = raw.event as sim.SimGroupEventName;
    if (raw.eventUids !== undefined) {
      if (!isStringArray(raw.eventUids)) return null;
      out.eventUids = raw.eventUids;
    }
    if (raw.eventNames !== undefined) {
      if (!Array.isArray(raw.eventNames) || !raw.eventNames.every((x) => typeof x === 'string')) return null;
      out.eventNames = raw.eventNames as string[];
    }
  }

  // text: bat buoc (khong rong) cho tin text; sticker/anh va su kien khong can.
  const needsText = out.event === undefined && (out.msgType === undefined || out.msgType === 'webchat');
  if (raw.text !== undefined && typeof raw.text !== 'string') return null;
  if (needsText && (typeof raw.text !== 'string' || raw.text.length === 0)) return null;
  out.text = typeof raw.text === 'string' ? raw.text : '';
  return out;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.DATA_MODE !== 'sim') {
    return NextResponse.json({ error: 'not_sim_mode' }, { status: 404 });
  }
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const raw = (await req.json().catch(() => null)) as RawSendBody | null;
  // 'system' danh rieng cho su kien he thong (enqueueSystemEvent) — CAM
  // gia mao gui tu kenh gia lap.
  if (raw && raw.senderUid === 'system') {
    return NextResponse.json({ error: 'reserved_sender' }, { status: 400 });
  }
  const body = parseSendBody(raw);
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let result: sim.SimInboundResult;
  try {
    result = await sim.simInbound(body);
  } catch (err) {
    if (err instanceof sim.SimQuoteNotFoundError) {
      return NextResponse.json({ error: 'quote_not_found' }, { status: 400 });
    }
    throw err;
  }

  if (!result.duplicate) {
    // P01: router khung (DM => STUB_DM_REPLY, nhom => chi audit); logic that o P03.
    await sim.processInbound(agent.routeInboundEvent);
    await sim.simDeliver();
  }

  await audit(sql, {
    actorType: 'staff',
    actorId: session.uid,
    action: 'sim.send',
    target: body.threadId,
    data: {
      account: body.account,
      threadType: body.threadType,
      senderUid: body.senderUid,
      duplicate: result.duplicate,
      event: body.event ?? null,
    },
  });

  return NextResponse.json({ ok: true, duplicate: result.duplicate });
}

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@lenqclaw/core';
import { getSessionFromRequest } from '../../../../../lib/auth/guard';

// SPEC-P02 §7.3: GET /api/dev/sim/thread?account&threadId ⇒ { messages, actions }.
// messages: tin vao (inbound_events, ke ca su kien nhom) + tin ra dang text (outbox);
//   tin nhom da bi xoa (group_messages.deleted_at) ⇒ deleted=true (UI gach ngang).
// actions: hang outbox kind='action' (ten hanh dong + trang thai + ket qua rut gon).

interface InboundRow {
  id: number;
  zalo_msg_id: string;
  sender_uid: string;
  payload: { kind?: string; text?: string; event?: string; uids?: string[]; d_name?: string | null };
  received_at: string;
  deleted: boolean;
}
interface OutboxRow {
  id: number;
  body: { text?: string };
  zalo_msg_id: string | null;
  status: string;
  created_at: string;
}
interface ActionRow {
  id: number;
  body: { action?: string };
  status: string;
  result: Record<string, unknown> | null;
  created_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (process.env.DATA_MODE !== 'sim') {
    return NextResponse.json({ error: 'not_sim_mode' }, { status: 404 });
  }
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const account = url.searchParams.get('account');
  const threadId = url.searchParams.get('threadId');
  if (!account || !threadId) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const inboundRows = await sql<InboundRow>(
    `select ie.id, ie.zalo_msg_id, ie.sender_uid, ie.payload, ie.received_at,
            coalesce(gm.deleted_at is not null, false) as deleted
     from inbound_events ie
     left join group_messages gm on gm.zalo_account_id = ie.zalo_account_id and gm.zalo_msg_id = ie.zalo_msg_id
     where ie.zalo_account_id=$1 and ie.thread_id=$2 order by ie.id`,
    [account, threadId]
  );
  const outboxRows = await sql<OutboxRow>(
    `select id, body, zalo_msg_id, status, created_at from outbox
     where zalo_account_id=$1 and thread_id=$2 and kind='text' order by id`,
    [account, threadId]
  );
  const actionRows = await sql<ActionRow>(
    `select id, body, status, result, created_at from outbox
     where zalo_account_id=$1 and thread_id=$2 and kind='action' order by id`,
    [account, threadId]
  );

  const messages = [
    ...inboundRows.map((r) => {
      const isEvent = r.payload?.kind === 'group_event';
      return {
        id: r.id,
        kind: isEvent ? ('event' as const) : ('in' as const),
        msgId: r.zalo_msg_id,
        senderUid: r.sender_uid,
        senderName: r.payload?.d_name ?? null,
        text: isEvent ? `[sự kiện] ${r.payload.event ?? ''} ${(r.payload.uids ?? []).join(', ')}`.trim() : (r.payload?.text ?? ''),
        deleted: r.deleted,
        at: r.received_at,
      };
    }),
    ...outboxRows.map((r) => ({
      id: r.id,
      kind: 'out' as const,
      msgId: r.zalo_msg_id,
      senderUid: 'sim-bot',
      senderName: null,
      text: r.body?.text ?? '',
      deleted: false,
      at: r.created_at,
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const actions = actionRows.map((r) => ({
    id: r.id,
    action: r.body?.action ?? '',
    status: r.status,
    result: r.result,
    at: r.created_at,
  }));

  return NextResponse.json({ messages, actions });
}

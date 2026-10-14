import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@lenqclaw/core';
import { getSessionFromRequest } from '../../../../../lib/auth/guard';

interface InboundRow {
  id: number;
  payload: { text?: string };
  received_at: string;
}
interface OutboxRow {
  id: number;
  body: { text?: string };
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
    `select id, payload, received_at from inbound_events where zalo_account_id=$1 and thread_id=$2 order by id`,
    [account, threadId]
  );
  const outboxRows = await sql<OutboxRow>(
    `select id, body, created_at from outbox where zalo_account_id=$1 and thread_id=$2 order by id`,
    [account, threadId]
  );

  const messages = [
    ...inboundRows.map((r) => ({ id: r.id, kind: 'in' as const, text: r.payload?.text ?? '', at: r.received_at })),
    ...outboxRows.map((r) => ({ id: r.id, kind: 'out' as const, text: r.body?.text ?? '', at: r.created_at })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return NextResponse.json({ messages });
}

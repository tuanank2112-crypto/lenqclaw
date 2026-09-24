// packages/core/src/sim/sim-transport.ts — SimTransport muc P01: vong vong
// lai, CHUA co agent (SPEC-P01-Foundation.md §6, Đ13). P03 thay `echoHandler`
// bang agent that — KHONG sua file nay khi lam P03.

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql, tx } from '../adapters/db.js';
import { enqueue, type InboundEvent } from '../adapters/transport.js';

export interface SimInboundArgs {
  account: 'bql' | 'market';
  threadId: string;
  threadType: 'user' | 'group';
  senderUid: string;
  text: string;
  msgId?: string;
}

export interface SimInboundResult {
  id: number | null;
  duplicate: boolean;
}

/** `INSERT inbound_events ... ON CONFLICT (zalo_account_id, zalo_msg_id) DO NOTHING`.
 * `msgId` mac dinh `sim-<uuid>`; `is_self=false`. */
export async function simInbound(args: SimInboundArgs): Promise<SimInboundResult> {
  const msgId = args.msgId ?? `sim-${randomUUID()}`;
  const rows = await sql<{ id: number }>(
    `insert into inbound_events (zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload)
     values ($1,$2,$3,$4,$5,false,$6)
     on conflict (zalo_account_id, zalo_msg_id) do nothing
     returning id`,
    [args.account, msgId, args.threadId, args.threadType, args.senderUid, JSON.stringify({ text: args.text })]
  );
  if (rows.length === 0) return { id: null, duplicate: true };
  return { id: rows[0]!.id, duplicate: false };
}

export type InboundHandler = (e: InboundEvent) => Promise<void>;

/** Handler P01: vong vong lai — enqueue tin `"[sim] da nhan: <text>"` ve
 * dung thread. P03 thay handler nay bang agent. */
export const echoHandler: InboundHandler = async (e) => {
  const text = typeof (e.payload as { text?: unknown }).text === 'string' ? (e.payload as { text: string }).text : '';
  await enqueue({
    zaloAccountId: e.zaloAccountId as 'bql' | 'market',
    threadId: e.threadId,
    threadType: e.threadType,
    kind: 'text',
    body: { text: `[sim] da nhan: ${text}` },
  });
};

interface ProcessInboundOptions {
  limit?: number;
}

interface InboundRow {
  id: number;
  zalo_account_id: string;
  zalo_msg_id: string;
  thread_id: string;
  thread_type: 'user' | 'group';
  sender_uid: string;
  is_self: boolean;
  payload: Record<string, unknown>;
  received_at: string;
}

/** Lay `inbound_events` chua `processed_at` bang `FOR UPDATE SKIP LOCKED`,
 * goi `handler`, dat `processed_at`. */
export async function processInbound(
  handler: InboundHandler = echoHandler,
  opts: ProcessInboundOptions = {}
): Promise<{ processed: number }> {
  const limit = opts.limit ?? 50;
  let processed = 0;
  await tx(async (q) => {
    const rows = await q<InboundRow>(
      `select id, zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload, received_at
       from inbound_events
       where processed_at is null
       order by id
       limit $1
       for update skip locked`,
      [limit]
    );
    for (const r of rows) {
      const event: InboundEvent = {
        id: r.id,
        zaloAccountId: r.zalo_account_id,
        zaloMsgId: r.zalo_msg_id,
        threadId: r.thread_id,
        threadType: r.thread_type,
        senderUid: r.sender_uid,
        isSelf: r.is_self,
        payload: r.payload,
        receivedAt: r.received_at,
      };
      await handler(event);
      await q(`update inbound_events set processed_at = now() where id = $1`, [r.id]);
      processed++;
    }
  });
  return { processed };
}

/** Chuyen `outbox` `queued -> sent` (khong pacer — pacer that la P02), dat
 * `zalo_msg_id='sim-out-<id>'`. */
export async function simDeliver(opts: { limit?: number } = {}): Promise<{ delivered: number }> {
  const limit = opts.limit ?? 100;
  const rows = await sql<{ id: number }>(
    `update outbox set status = 'sent', zalo_msg_id = 'sim-out-' || id
     where id in (
       select id from outbox where status = 'queued' order by id limit $1 for update skip locked
     )
     returning id`,
    [limit]
  );
  return { delivered: rows.length };
}

export interface ScenarioLine {
  account: 'bql' | 'market';
  thread_id: string;
  thread_type: 'user' | 'group';
  sender_uid: string;
  text: string;
  msg_id?: string;
}

export interface RunScenarioResult {
  inbound: number;
  duplicates: number;
  outbound: number;
}

/** `evals/scenarios/*.jsonl`: voi moi dong: `simInbound` -> `processInbound(echoHandler)`
 * -> `simDeliver`. `inbound`/`outbound` chi tinh cac dong KHONG trung
 * `msg_id` (dong trung bi loai o `simInbound`, khong sinh outbox). */
export async function runScenario(filePath: string): Promise<RunScenarioResult> {
  const content = await readFile(filePath, 'utf8');
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let inbound = 0;
  let duplicates = 0;
  let outbound = 0;

  for (const line of lines) {
    const parsed = JSON.parse(line) as ScenarioLine;
    const { duplicate } = await simInbound({
      account: parsed.account,
      threadId: parsed.thread_id,
      threadType: parsed.thread_type,
      senderUid: parsed.sender_uid,
      text: parsed.text,
      msgId: parsed.msg_id,
    });
    if (duplicate) {
      duplicates++;
      continue;
    }
    inbound++;
    await processInbound(echoHandler);
    const { delivered } = await simDeliver();
    outbound += delivered;
  }

  return { inbound, duplicates, outbound };
}

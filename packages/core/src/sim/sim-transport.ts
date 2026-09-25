// packages/core/src/sim/sim-transport.ts — SimTransport muc P01: vong vong
// lai, CHUA co agent (SPEC-P01-Foundation.md §6, Đ13). P03 thay `echoHandler`
// bang agent that — KHONG sua file nay khi lam P03.

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql } from '../adapters/db.js';
import { audit } from '../services/audit.js';
import { enqueue, type InboundEvent } from '../adapters/transport.js';

/** Mau tra loi khi handler loi (SPEC-P03-Resident-Agent.md §10.1). */
export const BUSY_REPLY = 'Xin lỗi, hệ thống đang bận, vui lòng thử lại sau ít phút.';

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
 * `msgId` mac dinh `sim-<uuid>`; `is_self=false`.
 * SPEC-P05-Dispatch.md §10.8.2/01-CONTRACTS §8 (Đ27): `sender_uid='system'`
 * la gia tri DANH RIENG cho su kien he thong (`services/system-events.ts`)
 * — kenh gia lap PHAI tu choi, giong nguoi that (uid Zalo la so). */
export async function simInbound(args: SimInboundArgs): Promise<SimInboundResult> {
  if (args.senderUid === 'system') {
    throw new Error('simInbound: senderUid="system" la gia tri danh rieng cho su kien he thong.');
  }
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

/** Handler P01: vong vong lai — enqueue tin `"[sim] đã nhận: <text>"` ve
 * dung thread. P03 thay handler nay bang agent (SPEC-P03 §10.1 — chuoi
 * gui nguoi dung PHAI co dau tieng Viet UTF-8). */
export const echoHandler: InboundHandler = async (e) => {
  const text = typeof (e.payload as { text?: unknown }).text === 'string' ? (e.payload as { text: string }).text : '';
  await enqueue({
    zaloAccountId: e.zaloAccountId as 'bql' | 'market',
    threadId: e.threadId,
    threadType: e.threadType,
    kind: 'text',
    body: { text: `[sim] đã nhận: ${text}` },
  });
};

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

/**
 * R02-tham-dinh D5, theo SPEC-P03-Resident-Agent.md §10.1: NHAN TRUOC, XU LY
 * SAU. Mot cau `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)
 * RETURNING *` nhan (danh dau `processed_at`) DUNG MOT dong — day la MOT
 * cau lenh tu than atomic, KHONG can boc trong `tx()` — roi goi `handler`
 * NGOAI transaction (handler tu `enqueue` bang client rieng cua no; giu no
 * trong mot `tx` dang mo se can pool khi goi dong thoi, tung gay treo chet
 * — 4h cua R02-tham-dinh). Ngu nghia: moi tin xu ly TOI DA MOT LAN — khong
 * bao gio tra loi trung du handler loi hay khong. Handler nem loi => ghi
 * `audit_log action='inbound.handler_error'` + gui `BUSY_REPLY`, KHONG xu
 * ly lai (khong retry, khong throw tiep).
 */
export async function processInbound(handler: InboundHandler = echoHandler): Promise<{ processed: number }> {
  const rows = await sql<InboundRow>(
    `update inbound_events
     set processed_at = now()
     where id = (
       select id from inbound_events where processed_at is null order by id limit 1 for update skip locked
     )
     returning id, zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload, received_at`
  );
  if (rows.length === 0) return { processed: 0 };

  const r = rows[0]!;
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

  try {
    await handler(event);
  } catch (err) {
    await audit(sql, {
      actorType: 'system',
      actorId: String(r.id),
      action: 'inbound.handler_error',
      target: r.thread_id,
      data: { message: err instanceof Error ? err.message : String(err) },
    });
    await enqueue({
      zaloAccountId: r.zalo_account_id as 'bql' | 'market',
      threadId: r.thread_id,
      threadType: r.thread_type,
      kind: 'text',
      body: { text: BUSY_REPLY },
    });
  }

  return { processed: 1 };
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

/** `evals/scenarios/*.jsonl`: voi moi dong: `simInbound` -> `processInbound(handler)`
 * -> `simDeliver`. `inbound`/`outbound` chi tinh cac dong KHONG trung
 * `msg_id` (dong trung bi loai o `simInbound`, khong sinh outbox).
 * SPEC-P05-Dispatch.md §10.0 (L8, Đ27): `handler` mac dinh `echoHandler`
 * (test P01 `echo.jsonl` giu nguyen hanh vi) — route phat lai
 * `/api/dev/sim/replay` (apps/web, ngoai pham vi P05-B) truyen
 * `routeInboundEvent` de kich ban chay QUA agent that. */
export async function runScenario(
  filePath: string,
  handler: InboundHandler = echoHandler
): Promise<RunScenarioResult> {
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
    await processInbound(handler);
    const { delivered } = await simDeliver();
    outbound += delivered;
  }

  return { inbound, duplicates, outbound };
}

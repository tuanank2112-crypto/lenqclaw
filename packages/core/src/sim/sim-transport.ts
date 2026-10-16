// packages/core/src/sim/sim-transport.ts — SimTransport muc P01: vong vong
// lai, CHUA co agent (SPEC-P01-Foundation.md §6, Đ13). P03 thay `echoHandler`
// bang agent that — KHONG sua file nay khi lam P03.

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sql } from '../adapters/db.js';
import { audit } from '../services/audit.js';
import { enqueue, type InboundEvent } from '../adapters/transport.js';
import type { AccountId } from '../domain/types.js';
import { applySimOutbox } from './sim-actions.js';

/** uid cua bot trong kenh gia lap (mention/quote tin bot). `zalo_accounts.display_name` KHONG dung lam uid. */
export const BOT_UID_SIM = 'sim-bot';

/** Mau tra loi khi handler loi (DM). Nhom: doi hanh vi o SPEC-P03 §2 (D20), KHONG o P01. */
export const BUSY_REPLY = 'Xin lỗi, hệ thống đang bận, vui lòng thử lại sau ít phút.';

export type SimMsgType = 'webchat' | 'chat.sticker' | 'chat.photo';
export type SimGroupEventName = 'join' | 'join_request' | 'leave' | 'remove_member' | 'add_admin' | 'remove_admin';

/** SPEC-P02 §7.1. `event` ⇒ su kien nhom (`kind:'group_event'`), `text` bi bo qua. */
export interface SimInboundArgs {
  account: AccountId;
  threadId: string;
  threadType: 'user' | 'group';
  senderUid: string;
  text: string;
  msgId?: string;
  senderName?: string;
  /** Mention bot: `@bot` trong text (them o dau neu thieu) ⇒ `mentions[0].uid = BOT_UID_SIM`. */
  mentionBot?: boolean;
  mentionUids?: string[];
  /** Tra loi (quote) tin co `zalo_msg_id` nay — tra cuu `group_messages` / outbox / inbound de lay `owner_id`. */
  quoteMsgId?: string | null;
  msgType?: SimMsgType;
  event?: SimGroupEventName;
  eventUids?: string[];
  eventNames?: string[];
}

/** `quoteMsgId` khong tra cuu duoc (route web ⇒ 400 `quote_not_found`). */
export class SimQuoteNotFoundError extends Error {
  readonly code = 'SimQuoteNotFoundError';
  constructor(quoteMsgId: string) {
    super(`simInbound: khong tim thay tin de tra loi (quoteMsgId="${quoteMsgId}").`);
    this.name = 'SimQuoteNotFoundError';
  }
}

const SIM_TYPE_LABELS: Record<string, string> = { 'chat.sticker': 'sticker', 'chat.photo': 'ảnh' };

/** Them `@bot`/`@uid` vao text neu thieu va tinh `pos/len` (01-CONTRACTS §8.2). */
export function buildMentions(
  text: string,
  mentionBot: boolean,
  mentionUids: readonly string[]
): { text: string; mentions: Array<{ uid: string; pos: number; len: number }> } {
  let out = text;
  const want: Array<{ uid: string; tag: string }> = [];
  if (mentionBot) want.push({ uid: BOT_UID_SIM, tag: '@bot' });
  for (const uid of mentionUids) want.push({ uid, tag: `@${uid}` });
  for (const w of want) {
    if (out.indexOf(w.tag) < 0) out = w.uid === BOT_UID_SIM ? `${w.tag} ${out}` : `${out} ${w.tag}`.trim();
  }
  // tinh pos SAU khi text on dinh (chen o dau chuoi lam dich cac mention truoc do)
  return { text: out, mentions: want.map((w) => ({ uid: w.uid, pos: out.indexOf(w.tag), len: w.tag.length })) };
}

/** Tra cuu tin de quote: `group_messages` → outbox (tin bot, owner = BOT_UID_SIM) → `inbound_events`. */
async function resolveQuote(
  account: AccountId,
  quoteMsgId: string
): Promise<{ owner_id: string; global_msg_id: string; msg: string }> {
  const gm = await sql<{ sender_uid: string; text: string | null }>(
    `select sender_uid, text from group_messages where zalo_account_id=$1 and zalo_msg_id=$2`,
    [account, quoteMsgId]
  );
  if (gm[0]) return { owner_id: gm[0].sender_uid, global_msg_id: quoteMsgId, msg: gm[0].text ?? '' };
  const ob = await sql<{ text: string | null }>(
    `select body->>'text' as text from outbox
     where zalo_account_id=$1 and (zalo_msg_id=$2 or ('sim-out-' || id) = $2 or ('out-' || id) = $2) limit 1`,
    [account, quoteMsgId]
  );
  if (ob[0]) return { owner_id: BOT_UID_SIM, global_msg_id: quoteMsgId, msg: ob[0].text ?? '' };
  const ie = await sql<{ sender_uid: string; text: string | null }>(
    `select sender_uid, payload->>'text' as text from inbound_events where zalo_account_id=$1 and zalo_msg_id=$2`,
    [account, quoteMsgId]
  );
  if (ie[0]) return { owner_id: ie[0].sender_uid, global_msg_id: quoteMsgId, msg: ie[0].text ?? '' };
  throw new SimQuoteNotFoundError(quoteMsgId);
}

export interface SimInboundResult {
  id: number | null;
  duplicate: boolean;
}

/** `INSERT inbound_events ... ON CONFLICT (zalo_account_id, zalo_msg_id) DO NOTHING`.
 * `msgId` mac dinh `sim-<uuid>`; `is_self=false`.
 * 01-CONTRACTS §8.5: `sender_uid='system'`
 * la gia tri DANH RIENG cho su kien he thong (`services/system-events.ts`)
 * — kenh gia lap PHAI tu choi, giong nguoi that (uid Zalo la so). */
export async function simInbound(args: SimInboundArgs): Promise<SimInboundResult> {
  if (args.senderUid === 'system') {
    throw new Error('simInbound: senderUid="system" la gia tri danh rieng cho su kien he thong.');
  }
  let msgId: string;
  let payload: Record<string, unknown>;
  const ts = String(Date.now());
  if (args.event) {
    if (args.threadType !== 'group') throw new Error('simInbound: su kien nhom chi hop le voi threadType="group".');
    msgId = args.msgId ?? `gev-sim-${randomUUID()}`;
    const g = await sql<{ name: string | null }>(
      `select name from zalo_groups where zalo_account_id=$1 and thread_id=$2`,
      [args.account, args.threadId]
    );
    payload = {
      kind: 'group_event',
      event: args.event,
      uids: args.eventUids ?? [],
      names: args.eventNames ?? [],
      source_uid: args.senderUid,
      group_name: g[0]?.name ?? null,
      time: ts,
      raw: { sim: true },
    };
  } else {
    msgId = args.msgId ?? `sim-${randomUUID()}`;
    const msgType = args.msgType ?? 'webchat';
    const cli = `sim-cli-${msgId}`;
    if (msgType === 'webchat') {
      const { text, mentions } = buildMentions(args.text, args.mentionBot === true, args.mentionUids ?? []);
      payload = {
        kind: 'text',
        text,
        msg_type: msgType,
        ts,
        cli_msg_id: cli,
        d_name: args.senderName ?? null,
        mentions,
        quote: args.quoteMsgId ? await resolveQuote(args.account, args.quoteMsgId) : null,
        raw: { sim: true },
      };
    } else {
      payload = {
        kind: 'unsupported',
        text: `[thành viên gửi ${SIM_TYPE_LABELS[msgType] ?? 'tin nhắn loại khác'} — chưa hỗ trợ]`,
        unsupported: true,
        msg_type: msgType,
        ts,
        cli_msg_id: cli,
        d_name: args.senderName ?? null,
        raw: { sim: true },
      };
    }
  }
  const rows = await sql<{ id: number }>(
    `insert into inbound_events (zalo_account_id, zalo_msg_id, thread_id, thread_type, sender_uid, is_self, payload)
     values ($1,$2,$3,$4,$5,false,$6)
     on conflict (zalo_account_id, zalo_msg_id) do nothing
     returning id`,
    [args.account, msgId, args.threadId, args.threadType, args.senderUid, JSON.stringify(payload)]
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
    zaloAccountId: e.zaloAccountId,
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
 * R02-tham-dinh D5, theo SPEC-P03 (runtime agent): NHAN TRUOC, XU LY
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
    zaloAccountId: r.zalo_account_id as AccountId,
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
      zaloAccountId: r.zalo_account_id as AccountId,
      threadId: r.thread_id,
      threadType: r.thread_type,
      kind: 'text',
      body: { text: BUSY_REPLY },
    });
  }

  return { processed: 1 };
}

/** Giao `outbox` `queued` o kenh gia lap (khong pacer — do rieng bang `simulatePacer`): text ⇒
 * `sent` + `zalo_msg_id='sim-out-<id>'`; `action` ⇒ thi hanh tren DB gia lap
 * (`sim-actions.ts::applySimOutbox`, SPEC-P02 §7.2). `delivered` dem hang chuyen `sent`. */
export async function simDeliver(opts: { limit?: number; extraThreadIds?: string[] } = {}): Promise<{ delivered: number; failed: number }> {
  return applySimOutbox(opts);
}

export interface ScenarioLine {
  account: AccountId;
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
 * `handler` mac dinh `echoHandler`
 * (test `echo.jsonl` giu nguyen hanh vi) — route phat lai
 * `/api/dev/sim/replay` (apps/web) truyen `routeInboundEvent` de kich ban
 * chay QUA router cong dong. */
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
    const { delivered } = await simDeliver({ extraThreadIds: [parsed.thread_id] }); // kich ban tu khai thread cua no
    outbound += delivered;
  }

  return { inbound, duplicates, outbound };
}

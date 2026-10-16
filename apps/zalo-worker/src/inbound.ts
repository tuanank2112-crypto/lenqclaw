// apps/zalo-worker/src/inbound.ts — luong vao (SPEC-P02 ke hoach 02 §2). Worker
// KHONG co logic nghiep vu: chi chuan hoa ⇒ ghi inbound_events (chong trung),
// danh dau tiep quan khi nhan vien gui tay (CHI DM), hen "da xem" SAU buoc nhan
// dien (CHI thread user). Tin nhom + su kien nhom ghi nguyen ven cho core (cong
// nhan tin o core, KHONG o day).

import type { AccountId, PacerConfig } from './config.js';
import type { ZaloGroupEvent, ZaloInboundMessage, ZaloUndoEvent } from './client.js';
import { seenDelayMs } from './pacer-policy.js';
import * as store from './store.js';

/** Ten loai tin (tieng Viet co dau) cho noi dung thay the §2.1. */
const TYPE_LABELS: Record<string, string> = {
  'chat.photo': 'ảnh',
  'chat.gif': 'ảnh GIF',
  'chat.sticker': 'sticker',
  'share.file': 'tệp',
  'chat.video.msg': 'video',
  'chat.voice': 'tin nhắn thoại',
  'chat.recommended': 'liên kết',
  'chat.link': 'liên kết',
  'chat.location.new': 'vị trí',
  'chat.doodle': 'hình vẽ',
};

export function unsupportedLabel(msgType: string): string {
  return TYPE_LABELS[msgType] ?? 'tin nhắn loại khác';
}

/** Noi dung core nhan cho tin khong phai text (§2.1): `<ai>` = "thành viên". */
export function unsupportedText(msgType: string): string {
  return `[thành viên gửi ${unsupportedLabel(msgType)} — chưa hỗ trợ]`;
}

/** Payload `inbound_events` theo 01-CONTRACTS §8.2. Tin text = `content` la chuoi;
 * con lai ⇒ `unsupported`. `mentions` luon la mang (rong khi khong co). */
export function buildPayload(m: ZaloInboundMessage): Record<string, unknown> {
  if (typeof m.content === 'string') {
    return {
      kind: 'text',
      text: m.content,
      msg_type: m.msgType,
      ts: m.ts,
      cli_msg_id: m.cliMsgId,
      d_name: m.dName,
      mentions: m.mentions ?? [],
      quote: m.quote ? { owner_id: String(m.quote.ownerId), global_msg_id: String(m.quote.globalMsgId), msg: m.quote.msg } : null,
      raw: m.raw,
    };
  }
  return {
    kind: 'unsupported',
    text: unsupportedText(m.msgType),
    unsupported: true,
    msg_type: m.msgType,
    ts: m.ts,
    cli_msg_id: m.cliMsgId,
    d_name: m.dName,
    raw: m.raw,
  };
}

export type InboundOutcome = 'inserted' | 'duplicate' | 'self_bot_echo' | 'self_staff_takeover' | 'group_inserted';

export interface InboundDeps {
  now?: () => number;
  rng?: () => number;
}

/** Xu ly mot tin tu listener. Tra ket qua de test/log (khong chua noi dung tin). */
export async function handleInbound(
  account: AccountId,
  m: ZaloInboundMessage,
  cfg: PacerConfig,
  deps: InboundDeps = {}
): Promise<InboundOutcome> {
  const now = deps.now ?? Date.now;
  const isGroup = m.threadType === 'group';
  const payload = buildPayload(m);

  if (m.isSelf) {
    const text = typeof m.content === 'string' ? m.content : null;
    const fromBot = await store.isBotEcho(account, m.threadId, m.msgId, text);
    const id = await store.insertInbound({
      account,
      msgId: m.msgId,
      threadId: m.threadId,
      threadType: m.threadType,
      senderUid: m.senderUid,
      isSelf: true,
      payload: { ...payload, staff_manual: !fromBot },
      markProcessed: true,
    });
    if (id === null) return 'duplicate';
    if (fromBot) return 'self_bot_echo';
    // Nhom la khong gian chung: chu go tay trong nhom KHONG lam bot im (SPEC-P02 §2.1, Q4 tam).
    if (isGroup) return 'group_inserted';
    await store.setStaffTakeover(account, m.threadId);
    return 'self_staff_takeover';
  }

  const id = await store.insertInbound({
    account,
    msgId: m.msgId,
    threadId: m.threadId,
    threadType: m.threadType,
    senderUid: m.senderUid,
    isSelf: false,
    payload,
    markProcessed: false,
  });
  if (id === null) return 'duplicate';
  if (isGroup) return 'group_inserted'; // nhom KHONG gui "da xem" (vung cam §8)

  // "Da xem" CHI cho nguoi da nhan dien — thread user, tre seenMin..seenMax.
  if (await store.isIdentified(account, m.senderUid)) {
    const at = new Date(now() + seenDelayMs(cfg, deps.rng));
    await store.enqueueSeen(account, m.threadId, m.seen as unknown as Record<string, unknown>, at);
  }
  return 'inserted';
}

export async function handleUndo(account: AccountId, u: ZaloUndoEvent): Promise<number> {
  return store.markUndone(account, u.undoneMsgId);
}

/** Loai su kien nhom DUOC GHI (§2.2). Loai khac (new_link, *_pin_topic, *_board, *_remind*,
 * update_avatar, block_member, unknown) ⇒ khong ghi. */
export const RECORDED_GROUP_EVENTS: ReadonlySet<string> = new Set([
  'join',
  'join_request',
  'leave',
  'remove_member',
  'add_admin',
  'remove_admin',
  'update_setting',
  'update',
]);

export type GroupEventOutcome = 'group_event_inserted' | 'duplicate' | 'ignored_event';

/** `zalo_msg_id` cua su kien nhom: chong trung khi reconnect phat lai (§2.2). */
export function groupEventMsgId(ev: ZaloGroupEvent): string {
  return `gev-${ev.groupId}-${ev.event}-${ev.time}`;
}

/** Dong `inbound_events` cho su kien nhom (01-CONTRACTS §8.2 `group_event`), hoac `null`
 * khi loai su kien khong duoc ghi. THUAN — test khong can DB. */
export function buildGroupEventRecord(ev: ZaloGroupEvent): {
  msgId: string;
  threadId: string;
  senderUid: string;
  isSelf: boolean;
  payload: Record<string, unknown>;
} | null {
  if (!RECORDED_GROUP_EVENTS.has(ev.event)) return null;
  return {
    msgId: groupEventMsgId(ev),
    threadId: ev.groupId,
    senderUid: ev.sourceUid ?? 'zalo',
    isSelf: ev.isSelf,
    payload: {
      kind: 'group_event',
      event: ev.event,
      uids: ev.uids,
      names: ev.names,
      source_uid: ev.sourceUid,
      group_name: ev.groupName,
      time: ev.time,
      raw: ev.raw,
    },
  };
}

/** Su kien nhom ⇒ `inbound_events` (`ON CONFLICT DO NOTHING` — reconnect phat lai khong tao dong thua). */
export async function handleGroupEvent(account: AccountId, ev: ZaloGroupEvent): Promise<GroupEventOutcome> {
  const rec = buildGroupEventRecord(ev);
  if (rec === null) return 'ignored_event';
  const id = await store.insertInbound({
    account,
    msgId: rec.msgId,
    threadId: rec.threadId,
    threadType: 'group',
    senderUid: rec.senderUid,
    isSelf: rec.isSelf,
    payload: rec.payload,
    markProcessed: false,
  });
  return id === null ? 'duplicate' : 'group_event_inserted';
}

// apps/zalo-worker/src/inbound.ts — luong vao (SPEC-P02 §3, §9.1). Worker
// KHONG co logic nghiep vu: chi chuan hoa ⇒ ghi inbound_events (chong trung),
// danh dau tiep quan khi nhan vien gui tay, hen "da xem" SAU buoc nhan dien.

import type { AccountId, PacerConfig } from './config.js';
import type { ZaloInboundMessage, ZaloUndoEvent } from './client.js';
import { seenDelayMs } from './pacer-policy.js';
import * as store from './store.js';

/** Ten loai tin (tieng Viet co dau) cho noi dung thay the §9.1. */
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

/** Noi dung core nhan cho tin khong phai text (§9.1). */
export function unsupportedText(msgType: string): string {
  return `[cư dân gửi ${unsupportedLabel(msgType)} — chưa hỗ trợ]`;
}

/** Tin text = `content` la chuoi (msgType 'webchat'); con lai ⇒ thay the. */
export function buildPayload(m: ZaloInboundMessage): Record<string, unknown> {
  if (typeof m.content === 'string') {
    return { text: m.content, kind: 'text', msg_type: m.msgType, ts: m.ts, raw: m.raw };
  }
  return {
    text: unsupportedText(m.msgType),
    kind: unsupportedLabel(m.msgType),
    unsupported: true,
    msg_type: m.msgType,
    ts: m.ts,
    raw: m.raw,
  };
}

export type InboundOutcome =
  | 'inserted'
  | 'duplicate'
  | 'self_bot_echo'
  | 'self_staff_takeover'
  | 'ignored_group';

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
  // Giai doan 1 (§9.1, §9.6): bql chi thread `user`; nhom thuoc P05 ⇒ khong luu.
  if (m.threadType === 'group') return 'ignored_group';

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
    if (account === 'bql') await store.setStaffTakeover(account, m.threadId);
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

  // "Da xem" CHI cho nguoi da nhan dien (§3.6, §5) — tre seenMin..seenMax.
  if (await store.isIdentified(account, m.senderUid)) {
    const at = new Date(now() + seenDelayMs(cfg, deps.rng));
    await store.enqueueSeen(account, m.threadId, m.seen as unknown as Record<string, unknown>, at);
  }
  return 'inserted';
}

export async function handleUndo(account: AccountId, u: ZaloUndoEvent): Promise<number> {
  return store.markUndone(account, u.undoneMsgId);
}

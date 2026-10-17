// packages/core/src/agent/community/gate.ts — cong nhan tin nhom (SPEC-P03 §3, D04).
// Ham THUAN, khong I/O: `decideGroupInbound` kiem theo thu tu, dung o dong dau khop.
// Cong CHI kiem cau truc (mention goc, quote tin bot, ten bot, lenh) — khong doan y (BB-12).
// Danh tinh/vai den tu he thong (BB-04): chuoi "[userId: ...]" hay "@Ten" trong text khong
// bao gio thanh mention (G24/G25).

import type { GateDecision, GateInput, GroupTrigger, Role } from '../../domain/types.js';

/** 01-CONTRACTS §6.2: lenh `/` chi owner/moderator. */
export const COMMANDS = [
  '/status',
  '/mode mention',
  '/mode ambient',
  '/mute 1h',
  '/mute 24h',
  '/unmute',
  '/summary',
  '/approve <id>',
  '/reject <id>',
] as const;

/** `hasControlCommand`: text bat dau bang `/` + chu thuong (01-CONTRACTS §6.2). */
export function hasControlCommand(text: string): boolean {
  return /^\/[a-z]+/.test(text.trim());
}

/** Dau vao rut gon cho cac dong 7–10 (dung chung voi `isAddressedToBot` — mot nguon chan ly). */
export interface AddressInput {
  role: Role;
  botUid: string;
  mentions: ReadonlyArray<{ uid: string }>;
  quoteOwnerUid: string | null;
  text: string;
  botNamePatterns: readonly RegExp[];
  hasControlCommand: boolean;
}

/** Dong 7–10 cua bang cong: tin co GOI bot khong, bang cach nao. Thu tu quyet dinh `trigger`. */
export function addressTrigger(i: AddressInput): Exclude<GroupTrigger, 'ambient'> | null {
  if (i.hasControlCommand && (i.role === 'owner' || i.role === 'moderator')) return 'owner_command';
  if (i.mentions.some((m) => m.uid === i.botUid)) return 'mention';
  if (i.quoteOwnerUid !== null && i.quoteOwnerUid === i.botUid) return 'reply_to_bot';
  if (i.botNamePatterns.some((re) => testPattern(re, i.text))) return 'name_pattern';
  return null;
}

/** `RegExp.test` voi co `g`/`y` giu `lastIndex` giua cac lan goi — dat lai de ham thuan. */
function testPattern(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  const hit = re.test(text);
  re.lastIndex = 0;
  return hit;
}

const rejected = (reason: GateDecision['reason'], buffer: boolean): GateDecision => ({
  admitted: false,
  reason,
  trigger: null,
  mustReply: false,
  buffer,
});

export function decideGroupInbound(i: GateInput): GateDecision {
  if (i.isSelf) return rejected('self', true); // 1
  if (i.group === null) return rejected('group_unknown', false); // 2 allowlist mac dinh
  if (!i.group.enabled) return rejected('group_disabled', false); // 3
  if (i.group.denyUsers.includes(i.sender.uid)) return rejected('sender_denied', true); // 4
  const privileged = i.sender.role === 'owner' || i.sender.role === 'moderator';
  if (i.group.allowUsers.length > 0 && !i.group.allowUsers.includes(i.sender.uid) && !privileged) {
    return rejected('sender_not_allowed', true); // 5
  }
  if (i.msgType !== 'webchat' || i.text.trim() === '') return rejected('unsupported_type', true); // 6
  const trigger = addressTrigger({
    role: i.sender.role,
    botUid: i.botUid,
    mentions: i.mentions,
    quoteOwnerUid: i.quoteOwnerUid,
    text: i.text,
    botNamePatterns: i.botNamePatterns,
    hasControlCommand: i.hasControlCommand,
  }); // 7–10
  if (trigger !== null) return { admitted: true, reason: 'admitted', trigger, mustReply: true, buffer: true };
  if (i.group.mode === 'ambient') return { admitted: true, reason: 'admitted', trigger: 'ambient', mustReply: false, buffer: true }; // 11
  return rejected('no_trigger', true); // 12
}

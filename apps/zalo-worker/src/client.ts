// apps/zalo-worker/src/client.ts — interface `ZaloClientLike` (SPEC-P02
// §9.3): moi cho worker cham zca-js deu di qua day. Ban that o
// zca-client.ts (boc zca-js 2.2.0); ban gia o testing/fake-client.ts (test,
// 0 mang). Kieu du lieu o day da CHUAN HOA, khong lo kieu cua zca-js.

import type { SessionSecret } from './crypto.js';

export type ThreadKind = 'user' | 'group';

/** Tin vao da chuan hoa tu listener `message`. */
export interface ZaloInboundMessage {
  msgId: string;
  cliMsgId: string;
  threadId: string;
  threadType: ThreadKind;
  senderUid: string;
  isSelf: boolean;
  /** vd 'webchat' (text), 'chat.photo', 'chat.sticker', 'share.file'… */
  msgType: string;
  /** Chuoi voi tin text; object voi tin dinh kem. */
  content: unknown;
  ts: string;
  /** Ten hien thi nguoi gui (`TMessage.dName`), null khi thieu. */
  dName: string | null;
  /** `TGroupMessage.mentions` (chi tin nhom), null khi khong co. */
  mentions: Array<{ uid: string; pos: number; len: number }> | null;
  /** `TMessage.quote` da chuan hoa, null khi khong tra loi tin nao. */
  quote: { ownerId: string; globalMsgId: string; msg: string } | null;
  /** Du lieu goc cua su kien (luu vao inbound_events.payload.raw). */
  raw: Record<string, unknown>;
  /** Tham so can de gui "da xem" cho dung tin nay. */
  seen: SeenParams;
}

export interface SeenParams {
  msgId: string;
  cliMsgId: string;
  uidFrom: string;
  idTo: string;
  msgType: string;
  st: number;
  at: number;
  cmd: number;
  ts: string | number;
}

export interface ZaloUndoEvent {
  threadId: string;
  isSelf: boolean;
  /** msgId goc bi thu hoi. */
  undoneMsgId: string;
}

/** Ten su kien nhom (`GroupEventType` cua zca-js, chuoi thuong). Ban chuan hoa
 * giu MOI loai; bo loc "loai nao duoc ghi" nam o inbound.ts (SPEC-P02 §2.2). */
export interface ZaloGroupEvent {
  groupId: string;
  /** vd 'join' | 'join_request' | 'leave' | 'remove_member' | 'add_admin' | 'new_link' … */
  event: string;
  uids: string[];
  names: string[];
  sourceUid: string | null;
  groupName: string | null;
  /** `String(data.time ?? Date.now())` — dung cho `zalo_msg_id` chong trung. */
  time: string;
  isSelf: boolean;
  raw: Record<string, unknown>;
}

export interface ZaloListenerHandlers {
  message(m: ZaloInboundMessage): void;
  groupEvent(ev: ZaloGroupEvent): void;
  undo(u: ZaloUndoEvent): void;
  closed(code: number, reason: string): void;
  error(err: unknown): void;
}

export type QrEvent =
  | { type: 'qr'; imageDataUrl: string }
  | { type: 'expired' }
  | { type: 'scanned' }
  | { type: 'declined' };

/** Tin tra loi (quote) — 01-CONTRACTS §6 `QuoteRef`, khop `SendMessageQuote` cua zca-js. */
export interface OutboundQuote {
  msgId: string;
  cliMsgId: string;
  uidFrom: string;
  content: unknown;
  msgType: string;
  ts: string;
  ttl: number;
  propertyExt?: Record<string, unknown>;
}

export interface OutboundText {
  msg: string;
  quote?: OutboundQuote;
  mentions?: Array<{ uid: string; pos: number; len: number }>;
}

export interface GroupInfoLite {
  name: string;
  adminIds: string[];
  creatorId: string;
  memberIds: string[];
  memVerList: string[];
  totalMember: number;
  setting: { joinAppr: number };
}

/** Phien da dang nhap (cookie hoac QR). */
export interface ZaloSessionLike {
  readonly ownUid: string;
  /** Bat listener (message/group_event/undo/closed/error). KHONG tu retry khi dong. */
  startListener(h: ZaloListenerHandlers): void;
  stopListener(): void;
  /** Tra msgId; `null` khi Zalo khong tra msgId (dau hieu bi gioi han — §5). */
  sendText(threadId: string, threadType: ThreadKind, content: OutboundText): Promise<{ msgId: string | null }>;
  sendTyping(threadId: string, threadType: ThreadKind): Promise<void>;
  sendSeen(threadType: ThreadKind, params: SeenParams): Promise<void>;
  /** API doc nhe (fetchAccountInfo) — dung khi dang nhap QR va watchdog. */
  probeRead(): Promise<void>;
  /** Credentials hien hanh (cookie co the da duoc zca-js lam moi). */
  exportCredentials(): SessionSecret;

  // ---- MOI (SPEC-P02 §4, 01-CONTRACTS §8.1) — moi ham boc DUNG MOT api zca-js;
  // loi ZaloApiError ⇒ ZaloActionError (221 ⇒ ZaloRateLimitError).
  deleteMessage(
    dest: { data: { msgId: string; cliMsgId: string; uidFrom: string }; threadId: string; type: ThreadKind },
    onlyMe: boolean
  ): Promise<{ status: number }>;
  removeMember(uid: string, groupId: string): Promise<{ errorMembers: string[] }>;
  blockMember(uid: string, groupId: string): Promise<void>;
  unblockMember(uid: string, groupId: string): Promise<void>;
  reviewJoin(uids: string[], approve: boolean, groupId: string): Promise<Record<string, number>>;
  getPendingMembers(groupId: string): Promise<Array<{ uid: string; dpn: string }>>;
  getGroupInfo(groupId: string): Promise<GroupInfoLite>;
  getMembersInfo(uids: string[]): Promise<Record<string, { displayName: string; zaloName: string }>>;
  createPoll(
    o: { question: string; options: string[]; expiredTime?: number; allowMultiChoices?: boolean; isAnonymous?: boolean },
    groupId: string
  ): Promise<{ poll_id: number }>;
  lockPoll(pollId: number): Promise<void>;
  createReminder(
    o: { title: string; startTime: number; repeat: 0 | 1 | 2 | 3; emoji?: string },
    threadId: string,
    type: ThreadKind
  ): Promise<{ id: string }>;
  removeReminder(reminderId: string, threadId: string, type: ThreadKind): Promise<void>;
  createNote(o: { title: string; pinAct?: boolean }, groupId: string): Promise<{ id: string }>;
  updateGroupSettings(
    o: { joinAppr?: boolean; lockSendMsg?: boolean; lockCreatePoll?: boolean; lockCreatePost?: boolean },
    groupId: string
  ): Promise<void>;
  addReaction(
    icon: string,
    dest: { data: { msgId: string; cliMsgId: string }; threadId: string; type: ThreadKind }
  ): Promise<void>;
}

export interface ZaloClientLike {
  loginWithCookie(secret: SessionSecret): Promise<ZaloSessionLike>;
  /** Dang nhap QR: `onEvent` nhan anh QR/het han/…; resolve khi quet xong. */
  loginQR(onEvent: (e: QrEvent) => void | Promise<void>): Promise<ZaloSessionLike>;
}

/** Loi co kieu cho lop goi: phan biet loi mang (thu lai) va loi xac thuc (cookie het han). */
export class ZaloNetworkError extends Error {
  readonly code = 'ZaloNetworkError';
}
export class ZaloAuthError extends Error {
  readonly code = 'ZaloAuthError';
}
/** Zalo tra loi gioi han / ma 221 / khong co msgId — pacer lui (01-CONTRACTS §9 RateLimitedError). */
export class ZaloRateLimitError extends Error {
  readonly code = 'ZaloRateLimitError';
}

/** `ZaloApiError` khi thi hanh `action` (KHONG phai dang nhap). `apiCode` = ma so
 * cua Zalo (vd 166 thieu quyen); `code` giu quy uoc "ten lop" cua 01-CONTRACTS §9. */
export class ZaloActionError extends Error {
  readonly code = 'ZaloActionError';
  constructor(
    message: string,
    readonly apiCode: number | null
  ) {
    super(message);
    this.name = 'ZaloActionError';
  }
}

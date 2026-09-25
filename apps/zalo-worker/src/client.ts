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

export interface ZaloListenerHandlers {
  message(m: ZaloInboundMessage): void;
  undo(u: ZaloUndoEvent): void;
  closed(code: number, reason: string): void;
  error(err: unknown): void;
}

export type QrEvent =
  | { type: 'qr'; imageDataUrl: string }
  | { type: 'expired' }
  | { type: 'scanned' }
  | { type: 'declined' };

/** Phien da dang nhap (cookie hoac QR). */
export interface ZaloSessionLike {
  readonly ownUid: string;
  /** Bat listener (chi message/undo/closed/error — §3.6). KHONG tu retry khi dong. */
  startListener(h: ZaloListenerHandlers): void;
  stopListener(): void;
  /** Tra msgId; `null` khi Zalo khong tra msgId (dau hieu bi gioi han — §5). */
  sendText(threadId: string, threadType: ThreadKind, text: string): Promise<{ msgId: string | null }>;
  sendTyping(threadId: string, threadType: ThreadKind): Promise<void>;
  sendSeen(threadType: ThreadKind, params: SeenParams): Promise<void>;
  /** API doc nhe (fetchAccountInfo) — dung khi dang nhap QR va watchdog. */
  probeRead(): Promise<void>;
  /** Credentials hien hanh (cookie co the da duoc zca-js lam moi). */
  exportCredentials(): SessionSecret;
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

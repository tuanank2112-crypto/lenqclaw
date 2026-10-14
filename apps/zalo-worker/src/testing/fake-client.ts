// apps/zalo-worker/src/testing/fake-client.ts — ban GIA cua ZaloClientLike
// cho test (SPEC-P02 §9.3, §9.5): 0 mang, dieu khien duoc tu test (phat tin
// vao, dong listener voi ma bat ky, lam loi gui/doc, lam moi cookie).

import type { SessionSecret } from '../crypto.js';
import {
  ZaloAuthError,
  type QrEvent,
  type SeenParams,
  type ThreadKind,
  type ZaloClientLike,
  type ZaloInboundMessage,
  type ZaloListenerHandlers,
  type ZaloSessionLike,
} from '../client.js';

export interface SentRecord {
  kind: 'text' | 'typing' | 'seen';
  threadId: string;
  threadType: ThreadKind;
  text?: string;
  at: number;
}

export class FakeSession implements ZaloSessionLike {
  handlers: ZaloListenerHandlers | null = null;
  listening = false;
  sent: SentRecord[] = [];
  secret: SessionSecret;
  /** Hanh vi gui ke tiep: 'ok' | 'no_msg_id' | Error nem ra. */
  nextSend: Array<'ok' | 'no_msg_id' | Error> = [];
  probeError: Error | null = null;
  private seq = 1000;

  constructor(
    readonly ownUid: string,
    secret: SessionSecret,
    private readonly clock: () => number = Date.now
  ) {
    this.secret = secret;
  }

  startListener(h: ZaloListenerHandlers): void {
    this.handlers = h;
    this.listening = true;
  }
  stopListener(): void {
    this.listening = false;
    this.handlers = null;
  }
  async sendText(threadId: string, threadType: ThreadKind, text: string): Promise<{ msgId: string | null }> {
    const next = this.nextSend.shift() ?? 'ok';
    if (next instanceof Error) throw next;
    this.sent.push({ kind: 'text', threadId, threadType, text, at: this.clock() });
    if (next === 'no_msg_id') return { msgId: null };
    return { msgId: `fake-out-${++this.seq}` };
  }
  async sendTyping(threadId: string, threadType: ThreadKind): Promise<void> {
    this.sent.push({ kind: 'typing', threadId, threadType, at: this.clock() });
  }
  async sendSeen(threadType: ThreadKind, params: SeenParams): Promise<void> {
    this.sent.push({ kind: 'seen', threadId: params.uidFrom, threadType, at: this.clock() });
  }
  async probeRead(): Promise<void> {
    if (this.probeError) throw this.probeError;
  }
  exportCredentials(): SessionSecret {
    return this.secret;
  }

  // ---- dieu khien tu test
  emitMessage(m: ZaloInboundMessage): void {
    this.handlers?.message(m);
  }
  emitClose(code: number): void {
    this.handlers?.closed(code, 'fake');
  }
}

export class FakeZaloClient implements ZaloClientLike {
  cookieLogins = 0;
  qrLogins = 0;
  /** Hanh vi login(cookie) ke tiep: 'ok' | Error. Rong ⇒ 'ok'. */
  nextCookieLogin: Array<'ok' | Error> = [];
  /** Kich ban QR: cac su kien phat ra roi ket qua. */
  qrScript: { events: QrEvent[]; result: 'ok' | Error; secret?: SessionSecret } = {
    events: [{ type: 'qr', imageDataUrl: 'data:image/png;base64,ZmFrZQ==' }, { type: 'scanned' }],
    result: 'ok',
  };
  /** Phien vua tao (test doc). */
  sessions: FakeSession[] = [];
  /** Dat probeError cho phien QR ke tiep. */
  nextSessionProbeError: Error | null = null;

  constructor(
    readonly ownUid = 'community-self-uid',
    private readonly clock: () => number = Date.now
  ) {}

  async loginWithCookie(secret: SessionSecret): Promise<ZaloSessionLike> {
    this.cookieLogins++;
    const next = this.nextCookieLogin.shift() ?? 'ok';
    if (next instanceof Error) throw next;
    if (!secret.imei) throw new ZaloAuthError('login: thieu imei');
    const s = new FakeSession(this.ownUid, secret, this.clock);
    this.sessions.push(s);
    return s;
  }

  async loginQR(onEvent: (e: QrEvent) => void | Promise<void>): Promise<ZaloSessionLike> {
    this.qrLogins++;
    for (const e of this.qrScript.events) await onEvent(e);
    if (this.qrScript.result instanceof Error) throw this.qrScript.result;
    const secret = this.qrScript.secret ?? {
      cookie: [{ key: 'zpw_sek', value: 'fake-cookie-value' }],
      imei: 'fake-imei-000',
      userAgent: 'FakeUA/1.0',
    };
    const s = new FakeSession(this.ownUid, secret, this.clock);
    if (this.nextSessionProbeError) {
      s.probeError = this.nextSessionProbeError;
      this.nextSessionProbeError = null;
    }
    this.sessions.push(s);
    return s;
  }

  get last(): FakeSession {
    return this.sessions[this.sessions.length - 1]!;
  }
}

let msgSeq = 0;

/** Dung tin vao gia (mac dinh text tu cu dan). */
export function fakeMessage(p: Partial<ZaloInboundMessage> & { threadId: string }): ZaloInboundMessage {
  const msgId = p.msgId ?? `fake-in-${Date.now()}-${++msgSeq}`;
  const senderUid = p.senderUid ?? p.threadId;
  const msgType = p.msgType ?? 'webchat';
  return {
    msgId,
    cliMsgId: p.cliMsgId ?? `cli-${msgId}`,
    threadId: p.threadId,
    threadType: p.threadType ?? 'user',
    senderUid,
    isSelf: p.isSelf ?? false,
    msgType,
    content: p.content ?? 'xin chào',
    ts: p.ts ?? String(Date.now()),
    raw: p.raw ?? { msgId, msgType },
    seen: p.seen ?? {
      msgId,
      cliMsgId: `cli-${msgId}`,
      uidFrom: senderUid,
      idTo: 'community-self-uid',
      msgType,
      st: 3,
      at: 0,
      cmd: 501,
      ts: Date.now(),
    },
  };
}

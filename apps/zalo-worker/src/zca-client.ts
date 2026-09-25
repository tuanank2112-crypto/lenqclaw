// apps/zalo-worker/src/zca-client.ts — ban THAT cua ZaloClientLike, boc
// zca-js 2.2.0 (pin dung ban, SPEC-P02 §1, §9.3; gotcha G07). Chu ky doi
// chieu voi node_modules/zca-js/dist/*.d.ts cua ban da cai:
//   new Zalo({selfListen, checkUpdate, logging}); zalo.login(Credentials);
//   zalo.loginQR(options, callback) — callback nhan LoginQRCallbackEventType;
//   api.listener.on('message'|'undo'|'closed'|'error'); listener.start({retryOnClose});
//   api.sendMessage(msg, threadId, ThreadType) ⇒ {message: {msgId}|null};
//   api.sendTypingEvent(threadId, ThreadType); api.sendSeenEvent(params, ThreadType);
//   api.fetchAccountInfo(); api.getContext() ⇒ {imei, userAgent, cookie: CookieJar}.
// File nay KHONG log cookie/imei/userAgent (§7) — `logging:false` tat log cua zca-js.
// Kieu: `index.d.ts` goc cua zca-js 2.2.0 viet `export * from "./dist"` (khong
// phan giai duoc duoi NodeNext) ⇒ apps/zalo-worker/tsconfig.json map `paths`
// "zca-js" → dist/index.d.ts; runtime van la `exports["."].default` = dist/index.js.

import {
  Zalo,
  ThreadType,
  LoginQRCallbackEventType,
  ZaloApiError,
  type API,
  type Message,
  type Undo,
  type Credentials,
} from 'zca-js';
import type { SessionSecret } from './crypto.js';
import {
  ZaloAuthError,
  ZaloNetworkError,
  ZaloRateLimitError,
  type QrEvent,
  type SeenParams,
  type ThreadKind,
  type ZaloClientLike,
  type ZaloInboundMessage,
  type ZaloListenerHandlers,
  type ZaloSessionLike,
} from './client.js';

const RATE_LIMIT_CODES = new Set([221]);

function toThreadType(t: ThreadKind): ThreadType {
  return t === 'group' ? ThreadType.Group : ThreadType.User;
}

/** Phan loai loi zca-js: ZaloApiError ma 221 ⇒ gioi han; ZaloApiError khac
 * ⇒ loi xac thuc/nghiep vu Zalo; con lai (fetch failed, ECONNRESET…) ⇒ mang.
 * Thong diep giu ngan, KHONG chua cookie/imei. */
function classify(err: unknown, context: string): Error {
  if (err instanceof ZaloApiError) {
    if (err.code !== null && RATE_LIMIT_CODES.has(err.code)) {
      return new ZaloRateLimitError(`${context}: Zalo gioi han (ma ${err.code})`);
    }
    return new ZaloAuthError(`${context}: ZaloApiError ma ${err.code ?? 'null'}`);
  }
  const name = err instanceof Error ? err.name : typeof err;
  return new ZaloNetworkError(`${context}: loi mang/khong xac dinh (${name})`);
}

function normalizeMessage(m: Message): ZaloInboundMessage {
  const d = m.data;
  return {
    msgId: String(d.msgId),
    cliMsgId: String(d.cliMsgId),
    threadId: m.threadId,
    threadType: m.type === ThreadType.Group ? 'group' : 'user',
    senderUid: String(d.uidFrom),
    isSelf: m.isSelf,
    msgType: String(d.msgType ?? ''),
    content: d.content,
    ts: String(d.ts),
    raw: d as unknown as Record<string, unknown>,
    seen: {
      msgId: String(d.msgId),
      cliMsgId: String(d.cliMsgId),
      uidFrom: String(d.uidFrom),
      idTo: String(d.idTo),
      msgType: String(d.msgType ?? ''),
      st: d.st,
      at: d.at,
      cmd: d.cmd,
      ts: d.ts,
    },
  };
}

class ZcaSession implements ZaloSessionLike {
  readonly ownUid: string;
  constructor(private readonly api: API) {
    this.ownUid = String(api.getOwnId());
  }

  startListener(h: ZaloListenerHandlers): void {
    const l = this.api.listener;
    l.removeAllListeners();
    l.on('message', (m: Message) => h.message(normalizeMessage(m)));
    l.on('undo', (u: Undo) =>
      h.undo({ threadId: u.threadId, isSelf: u.isSelf, undoneMsgId: String(u.data.content.globalMsgId) })
    );
    l.on('closed', (code: number, reason: string) => h.closed(code, reason));
    l.on('error', (e: unknown) => h.error(e));
    // retryOnClose=false: watchdog cua worker tu quyet (SPEC-P02 §6) —
    // KHONG de zca-js tu ket noi lai sau 3000/3003.
    l.start({ retryOnClose: false });
  }

  stopListener(): void {
    try {
      this.api.listener.stop();
    } catch {
      /* listener chua chay */
    }
    this.api.listener.removeAllListeners();
  }

  async sendText(threadId: string, threadType: ThreadKind, text: string): Promise<{ msgId: string | null }> {
    try {
      const res = await this.api.sendMessage(text, threadId, toThreadType(threadType));
      const id = res.message?.msgId;
      return { msgId: id === undefined || id === null ? null : String(id) };
    } catch (err) {
      throw classify(err, 'sendMessage');
    }
  }

  async sendTyping(threadId: string, threadType: ThreadKind): Promise<void> {
    try {
      await this.api.sendTypingEvent(threadId, toThreadType(threadType));
    } catch (err) {
      throw classify(err, 'sendTypingEvent');
    }
  }

  async sendSeen(threadType: ThreadKind, params: SeenParams): Promise<void> {
    try {
      await this.api.sendSeenEvent(params, toThreadType(threadType));
    } catch (err) {
      throw classify(err, 'sendSeenEvent');
    }
  }

  async probeRead(): Promise<void> {
    try {
      await this.api.fetchAccountInfo();
    } catch (err) {
      throw classify(err, 'fetchAccountInfo');
    }
  }

  exportCredentials(): SessionSecret {
    const ctx = this.api.getContext();
    const jar = ctx.cookie.toJSON();
    return { cookie: jar?.cookies ?? [], imei: ctx.imei, userAgent: ctx.userAgent };
  }
}

export function createZcaClient(): ZaloClientLike {
  const newZalo = () => new Zalo({ selfListen: true, checkUpdate: false, logging: false });
  return {
    async loginWithCookie(secret: SessionSecret): Promise<ZaloSessionLike> {
      try {
        const api = await newZalo().login({
          cookie: secret.cookie as Credentials['cookie'],
          imei: secret.imei,
          userAgent: secret.userAgent,
        });
        return new ZcaSession(api);
      } catch (err) {
        throw classify(err, 'login');
      }
    },

    async loginQR(onEvent: (e: QrEvent) => void | Promise<void>): Promise<ZaloSessionLike> {
      try {
        const api = await newZalo().loginQR({}, (ev) => {
          switch (ev.type) {
            case LoginQRCallbackEventType.QRCodeGenerated: {
              const img = ev.data.image.startsWith('data:') ? ev.data.image : `data:image/png;base64,${ev.data.image}`;
              void onEvent({ type: 'qr', imageDataUrl: img });
              break;
            }
            case LoginQRCallbackEventType.QRCodeExpired:
              void onEvent({ type: 'expired' });
              ev.actions.abort();
              break;
            case LoginQRCallbackEventType.QRCodeScanned:
              void onEvent({ type: 'scanned' });
              break;
            case LoginQRCallbackEventType.QRCodeDeclined:
              void onEvent({ type: 'declined' });
              break;
            default:
              // GotLoginInfo: KHONG luu o day — chi luu sau khi goi thu API doc (§2.3).
              break;
          }
        });
        return new ZcaSession(api);
      } catch (err) {
        throw classify(err, 'loginQR');
      }
    },
  };
}

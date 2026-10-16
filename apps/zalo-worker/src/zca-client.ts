// apps/zalo-worker/src/zca-client.ts — ban THAT cua ZaloClientLike, boc
// zca-js 2.2.0 (pin dung ban, SPEC-P02 §1, §9.3; gotcha G07). Chu ky doi
// chieu voi node_modules/zca-js/dist/*.d.ts cua ban da cai:
//   new Zalo({selfListen, checkUpdate, logging}); zalo.login(Credentials);
//   zalo.loginQR(options, callback) — callback nhan LoginQRCallbackEventType;
//   api.listener.on('message'|'group_event'|'undo'|'closed'|'error'); listener.start({retryOnClose});
//   api.sendMessage(MessageContent|string, threadId, ThreadType) ⇒ {message: {msgId}|null};
//   api.sendTypingEvent(threadId, ThreadType); api.sendSeenEvent(params, ThreadType);
//   api.fetchAccountInfo(); api.getContext() ⇒ {imei, userAgent, cookie: CookieJar};
//   hanh dong nhom (SPEC-P02 §4.2): deleteMessage, removeUserFromGroup, addGroupBlockedMember,
//   removeGroupBlockedMember, reviewPendingMemberRequest, getPendingGroupMembers, getGroupInfo,
//   getGroupMembersInfo, createPoll, lockPoll, createReminder, removeReminder, createNote,
//   updateGroupSettings, addReaction.
// File nay KHONG log cookie/imei/userAgent/noi dung tin (§7) — `logging:false` tat log cua zca-js.
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
  type GroupEvent,
  type Credentials,
  type SendMessageQuote,
  type TGroupMessage,
  type ReminderRepeatMode,
  type Reactions,
} from 'zca-js';
import type { SessionSecret } from './crypto.js';
import { normalizeGroupEvent } from './zca-normalize.js';
import {
  ZaloActionError,
  ZaloAuthError,
  ZaloNetworkError,
  ZaloRateLimitError,
  type GroupInfoLite,
  type OutboundText,
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

/** Phan loai loi zca-js: ZaloApiError ma 221 ⇒ gioi han. ZaloApiError khac:
 * duong dang nhap/doc (`mode='login'`) ⇒ `ZaloAuthError`; duong `action`
 * (`mode='action'`) ⇒ `ZaloActionError` mang ma so Zalo (SPEC-P02 §3). Con lai
 * (fetch failed, ECONNRESET…) ⇒ mang. Thong diep ngan, KHONG chua cookie/imei. */
function classify(err: unknown, context: string, mode: 'login' | 'action' = 'login'): Error {
  if (err instanceof ZaloApiError) {
    if (err.code !== null && RATE_LIMIT_CODES.has(err.code)) {
      return new ZaloRateLimitError(`${context}: Zalo gioi han (ma ${err.code})`);
    }
    if (mode === 'action') return new ZaloActionError(`${context}: ZaloApiError ma ${err.code ?? 'null'}`, err.code);
    return new ZaloAuthError(`${context}: ZaloApiError ma ${err.code ?? 'null'}`);
  }
  if (err instanceof ZaloActionError || err instanceof ZaloRateLimitError) return err;
  const name = err instanceof Error ? err.name : typeof err;
  return new ZaloNetworkError(`${context}: loi mang/khong xac dinh (${name})`);
}

/** Chay mot API zca-js, loi phan loai theo duong `action`. */
async function act<T>(context: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw classify(err, context, 'action');
  }
}

function normalizeMessage(m: Message): ZaloInboundMessage {
  const d = m.data;
  const rawMentions = m.type === ThreadType.Group ? (d as TGroupMessage).mentions : undefined;
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
    dName: typeof d.dName === 'string' && d.dName.length > 0 ? d.dName : null,
    mentions: rawMentions ? rawMentions.map((x) => ({ uid: String(x.uid), pos: x.pos, len: x.len })) : null,
    quote: d.quote
      ? { ownerId: String(d.quote.ownerId), globalMsgId: String(d.quote.globalMsgId), msg: String(d.quote.msg ?? '') }
      : null,
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
    l.on('group_event', (ev: GroupEvent) => h.groupEvent(normalizeGroupEvent(ev)));
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

  async sendText(threadId: string, threadType: ThreadKind, content: OutboundText): Promise<{ msgId: string | null }> {
    try {
      const hasMentions = content.mentions !== undefined && content.mentions.length > 0;
      const res = await this.api.sendMessage(
        {
          msg: content.msg,
          ...(content.quote ? { quote: content.quote as unknown as SendMessageQuote } : {}),
          ...(hasMentions ? { mentions: content.mentions } : {}),
        },
        threadId,
        toThreadType(threadType)
      );
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

  // ---- hanh dong quan tri nhom (SPEC-P02 §4.2): moi ham boc DUNG MOT api zca-js.

  deleteMessage(
    dest: { data: { msgId: string; cliMsgId: string; uidFrom: string }; threadId: string; type: ThreadKind },
    onlyMe: boolean
  ): Promise<{ status: number }> {
    return act('deleteMessage', async () => {
      const r = await this.api.deleteMessage(
        { data: dest.data, threadId: dest.threadId, type: toThreadType(dest.type) },
        onlyMe
      );
      return { status: r.status };
    });
  }

  removeMember(uid: string, groupId: string): Promise<{ errorMembers: string[] }> {
    return act('removeUserFromGroup', async () => {
      const r = await this.api.removeUserFromGroup(uid, groupId);
      return { errorMembers: (r.errorMembers ?? []).map(String) };
    });
  }

  blockMember(uid: string, groupId: string): Promise<void> {
    return act('addGroupBlockedMember', async () => {
      await this.api.addGroupBlockedMember(uid, groupId);
    });
  }

  unblockMember(uid: string, groupId: string): Promise<void> {
    return act('removeGroupBlockedMember', async () => {
      await this.api.removeGroupBlockedMember(uid, groupId);
    });
  }

  reviewJoin(uids: string[], approve: boolean, groupId: string): Promise<Record<string, number>> {
    return act('reviewPendingMemberRequest', async () => {
      const r = await this.api.reviewPendingMemberRequest({ members: uids, isApprove: approve }, groupId);
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(r ?? {})) out[k] = Number(v);
      return out;
    });
  }

  getPendingMembers(groupId: string): Promise<Array<{ uid: string; dpn: string }>> {
    return act('getPendingGroupMembers', async () => {
      const r = await this.api.getPendingGroupMembers(groupId);
      return (r.users ?? []).map((u) => ({ uid: String(u.uid), dpn: String(u.dpn ?? '') }));
    });
  }

  getGroupInfo(groupId: string): Promise<GroupInfoLite> {
    return act('getGroupInfo', async () => {
      const r = await this.api.getGroupInfo(groupId);
      const g = r.gridInfoMap[groupId];
      if (!g) throw new ZaloActionError('getGroupInfo: khong co thong tin nhom', null);
      return {
        name: String(g.name ?? ''),
        adminIds: (g.adminIds ?? []).map(String),
        creatorId: String(g.creatorId ?? ''),
        memberIds: (g.memberIds ?? []).map(String),
        memVerList: (g.memVerList ?? []).map(String),
        totalMember: Number(g.totalMember ?? 0),
        setting: { joinAppr: Number(g.setting?.joinAppr ?? 0) },
      };
    });
  }

  getMembersInfo(uids: string[]): Promise<Record<string, { displayName: string; zaloName: string }>> {
    return act('getGroupMembersInfo', async () => {
      const r = await this.api.getGroupMembersInfo(uids);
      const out: Record<string, { displayName: string; zaloName: string }> = {};
      for (const [k, p] of Object.entries(r.profiles ?? {})) {
        out[k] = { displayName: String(p.displayName ?? ''), zaloName: String(p.zaloName ?? '') };
      }
      return out;
    });
  }

  createPoll(
    o: { question: string; options: string[]; expiredTime?: number; allowMultiChoices?: boolean; isAnonymous?: boolean },
    groupId: string
  ): Promise<{ poll_id: number }> {
    return act('createPoll', async () => {
      const r = await this.api.createPoll(o, groupId);
      return { poll_id: r.poll_id };
    });
  }

  lockPoll(pollId: number): Promise<void> {
    return act('lockPoll', async () => {
      await this.api.lockPoll(pollId);
    });
  }

  createReminder(
    o: { title: string; startTime: number; repeat: 0 | 1 | 2 | 3; emoji?: string },
    threadId: string,
    type: ThreadKind
  ): Promise<{ id: string }> {
    return act('createReminder', async () => {
      const r = await this.api.createReminder(
        { title: o.title, startTime: o.startTime, repeat: o.repeat as ReminderRepeatMode, ...(o.emoji ? { emoji: o.emoji } : {}) },
        threadId,
        toThreadType(type)
      );
      const id = 'reminderId' in r ? r.reminderId : r.id;
      return { id: String(id) };
    });
  }

  removeReminder(reminderId: string, threadId: string, type: ThreadKind): Promise<void> {
    return act('removeReminder', async () => {
      await this.api.removeReminder(reminderId, threadId, toThreadType(type));
    });
  }

  createNote(o: { title: string; pinAct?: boolean }, groupId: string): Promise<{ id: string }> {
    return act('createNote', async () => {
      const r = await this.api.createNote(o, groupId);
      return { id: String(r.id) };
    });
  }

  updateGroupSettings(
    o: { joinAppr?: boolean; lockSendMsg?: boolean; lockCreatePoll?: boolean; lockCreatePost?: boolean },
    groupId: string
  ): Promise<void> {
    return act('updateGroupSettings', async () => {
      await this.api.updateGroupSettings(o, groupId);
    });
  }

  addReaction(
    icon: string,
    dest: { data: { msgId: string; cliMsgId: string }; threadId: string; type: ThreadKind }
  ): Promise<void> {
    return act('addReaction', async () => {
      await this.api.addReaction(icon as Reactions, {
        data: dest.data,
        threadId: dest.threadId,
        type: toThreadType(dest.type),
      });
    });
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

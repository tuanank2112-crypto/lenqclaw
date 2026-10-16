// apps/zalo-worker/src/testing/fake-client.ts — ban GIA cua ZaloClientLike
// cho test (SPEC-P02 §9.3, §9.5; ke hoach 02 SPEC-P02 §3): 0 mang, dieu khien
// duoc tu test (phat tin/su kien nhom vao, dong listener voi ma bat ky, lam loi
// gui/doc/hanh dong, tra ma duyet vao nhom, lam moi cookie).

import type { SessionSecret } from '../crypto.js';
import {
  ZaloAuthError,
  type GroupInfoLite,
  type OutboundQuote,
  type OutboundText,
  type QrEvent,
  type SeenParams,
  type ThreadKind,
  type ZaloClientLike,
  type ZaloGroupEvent,
  type ZaloInboundMessage,
  type ZaloListenerHandlers,
  type ZaloSessionLike,
} from '../client.js';

export interface SentRecord {
  kind: 'text' | 'typing' | 'seen';
  threadId: string;
  threadType: ThreadKind;
  text?: string;
  quote?: OutboundQuote;
  mentions?: Array<{ uid: string; pos: number; len: number }>;
  at: number;
}

/** Mot lan goi hanh dong quan tri: `kind` = ten ham cua ZaloSessionLike. */
export interface ActionRecord {
  kind: string;
  args: unknown;
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
  /** Moi goi hanh dong quan tri (deleteMessage, removeMember, …) duoc ghi vao day. */
  actions: ActionRecord[] = [];
  /** Loi nem ra o lan goi hanh dong KE TIEP (roi tu xoa). */
  nextActionError: Error | null = null;
  /** `reviewJoin` tra ma theo uid (mac dinh 0). */
  reviewResult: Record<string, 0 | 166 | 170 | 178> = {};
  /** `deleteMessage` tra `status` nay (mac dinh 0). */
  deleteStatus = 0;
  /** `removeMember` tra danh sach uid loi nay. */
  removeErrorMembers: string[] = [];
  /** Thong tin nhom tra ve (cau hinh duoc; `adminIds` co/khong chua `ownUid`). */
  groupInfo: GroupInfoLite = {
    name: 'Nhóm giả',
    adminIds: [],
    creatorId: 'creator-uid',
    memberIds: [],
    memVerList: [],
    totalMember: 0,
    setting: { joinAppr: 0 },
  };
  /** Ten hien thi `getMembersInfo` tra ve (uid → ten); thieu ⇒ "Tên <uid>". */
  memberNames: Record<string, string> = {};
  private seq = 1000;
  private actionSeq = 5000;

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
  async sendText(threadId: string, threadType: ThreadKind, content: OutboundText): Promise<{ msgId: string | null }> {
    const next = this.nextSend.shift() ?? 'ok';
    if (next instanceof Error) throw next;
    this.sent.push({
      kind: 'text',
      threadId,
      threadType,
      text: content.msg,
      ...(content.quote ? { quote: content.quote } : {}),
      ...(content.mentions ? { mentions: content.mentions } : {}),
      at: this.clock(),
    });
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

  // ---- hanh dong quan tri nhom (SPEC-P02 §3): ghi `actions[]`, co the dat loi ke tiep.
  private act(kind: string, args: unknown): void {
    this.actions.push({ kind, args, at: this.clock() });
    const err = this.nextActionError;
    if (err) {
      this.nextActionError = null;
      throw err;
    }
  }
  async deleteMessage(
    dest: { data: { msgId: string; cliMsgId: string; uidFrom: string }; threadId: string; type: ThreadKind },
    onlyMe: boolean
  ): Promise<{ status: number }> {
    this.act('deleteMessage', { dest, onlyMe });
    return { status: this.deleteStatus };
  }
  async removeMember(uid: string, groupId: string): Promise<{ errorMembers: string[] }> {
    this.act('removeMember', { uid, groupId });
    return { errorMembers: [...this.removeErrorMembers] };
  }
  async blockMember(uid: string, groupId: string): Promise<void> {
    this.act('blockMember', { uid, groupId });
  }
  async unblockMember(uid: string, groupId: string): Promise<void> {
    this.act('unblockMember', { uid, groupId });
  }
  async reviewJoin(uids: string[], approve: boolean, groupId: string): Promise<Record<string, number>> {
    this.act('reviewJoin', { uids, approve, groupId });
    const out: Record<string, number> = {};
    for (const u of uids) out[u] = this.reviewResult[u] ?? 0;
    return out;
  }
  async getPendingMembers(groupId: string): Promise<Array<{ uid: string; dpn: string }>> {
    this.act('getPendingMembers', { groupId });
    return [];
  }
  async getGroupInfo(groupId: string): Promise<GroupInfoLite> {
    this.act('getGroupInfo', { groupId });
    return { ...this.groupInfo };
  }
  async getMembersInfo(uids: string[]): Promise<Record<string, { displayName: string; zaloName: string }>> {
    this.act('getMembersInfo', { uids });
    const out: Record<string, { displayName: string; zaloName: string }> = {};
    for (const u of uids) out[u] = { displayName: this.memberNames[u] ?? `Tên ${u}`, zaloName: `zalo-${u}` };
    return out;
  }
  async createPoll(
    o: { question: string; options: string[]; expiredTime?: number; allowMultiChoices?: boolean; isAnonymous?: boolean },
    groupId: string
  ): Promise<{ poll_id: number }> {
    this.act('createPoll', { o, groupId });
    return { poll_id: ++this.actionSeq };
  }
  async lockPoll(pollId: number): Promise<void> {
    this.act('lockPoll', { pollId });
  }
  async createReminder(
    o: { title: string; startTime: number; repeat: 0 | 1 | 2 | 3; emoji?: string },
    threadId: string,
    type: ThreadKind
  ): Promise<{ id: string }> {
    this.act('createReminder', { o, threadId, type });
    return { id: `rem-${++this.actionSeq}` };
  }
  async removeReminder(reminderId: string, threadId: string, type: ThreadKind): Promise<void> {
    this.act('removeReminder', { reminderId, threadId, type });
  }
  async createNote(o: { title: string; pinAct?: boolean }, groupId: string): Promise<{ id: string }> {
    this.act('createNote', { o, groupId });
    return { id: `note-${++this.actionSeq}` };
  }
  async updateGroupSettings(
    o: { joinAppr?: boolean; lockSendMsg?: boolean; lockCreatePoll?: boolean; lockCreatePost?: boolean },
    groupId: string
  ): Promise<void> {
    this.act('updateGroupSettings', { o, groupId });
  }
  async addReaction(
    icon: string,
    dest: { data: { msgId: string; cliMsgId: string }; threadId: string; type: ThreadKind }
  ): Promise<void> {
    this.act('addReaction', { icon, dest });
  }

  // ---- dieu khien tu test
  emitMessage(m: ZaloInboundMessage): void {
    this.handlers?.message(m);
  }
  emitGroupEvent(ev: ZaloGroupEvent): void {
    this.handlers?.groupEvent(ev);
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
    dName: p.dName ?? null,
    mentions: p.mentions ?? null,
    quote: p.quote ?? null,
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

let evSeq = 0;

/** Dung su kien nhom gia (mac dinh `join` cua mot thanh vien). */
export function fakeGroupEvent(p: Partial<ZaloGroupEvent> & { groupId: string }): ZaloGroupEvent {
  return {
    groupId: p.groupId,
    event: p.event ?? 'join',
    uids: p.uids ?? ['member-1'],
    names: p.names ?? ['Thành viên 1'],
    sourceUid: p.sourceUid ?? null,
    groupName: p.groupName ?? null,
    time: p.time ?? String(Date.now() + ++evSeq),
    isSelf: p.isSelf ?? false,
    raw: p.raw ?? { fake: true },
  };
}

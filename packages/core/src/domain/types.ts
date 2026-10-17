// packages/core/src/domain/types.ts — Kieu TypeScript dung chung (01-CONTRACTS.md §6,
// ke hoach 02). Doi hop dong o day truoc, sau do moi doi DDL/service.

export type AccountId = 'community';
export type Role = 'owner' | 'moderator' | 'member' | 'stranger';
export type GroupMode = 'mention' | 'ambient';
export type JoinPolicy = 'manual' | 'auto_approve' | 'agent_review';
/** Vai nhan vien web (SPEC-P01 §3.1). */
export type StaffRole = 'admin' | 'operator';

export type GroupTrigger = 'mention' | 'reply_to_bot' | 'name_pattern' | 'owner_command' | 'ambient';
export type GateReason =
  | 'self'
  | 'group_unknown'
  | 'group_disabled'
  | 'sender_denied'
  | 'sender_not_allowed'
  | 'unsupported_type'
  | 'no_trigger'
  | 'admitted';

export interface GateInput {
  isSelf: boolean;
  group: { enabled: boolean; mode: GroupMode; allowUsers: readonly string[]; denyUsers: readonly string[] } | null;
  sender: { uid: string; role: Role };
  botUid: string;
  /** '' khi khong phai text. */
  text: string;
  /** 'webchat' = text (zca-js TMessage.msgType). */
  msgType: string;
  mentions: ReadonlyArray<{ uid: string }>;
  quoteOwnerUid: string | null;
  /** Tu IDENTITY, co 'iu', ranh gioi unicode — CAM \b (G14). */
  botNamePatterns: readonly RegExp[];
  /** text bat dau bang '/' + lenh thuoc COMMANDS (01-CONTRACTS §6.2). */
  hasControlCommand: boolean;
}

export interface GateDecision {
  admitted: boolean;
  reason: GateReason;
  trigger: GroupTrigger | null;
  mustReply: boolean;
  buffer: boolean;
}

export type TurnKind =
  | 'group_mention'
  | 'group_ambient_flush'
  | 'group_welcome'
  | 'group_unanswered'
  | 'group_join_review'
  | 'dm'
  | 'owner_dm'
  | 'automation';

export interface GroupMessageRow {
  id: number;
  zaloMsgId: string;
  cliMsgId: string | null;
  senderUid: string;
  senderName: string | null;
  isSelf: boolean;
  msgType: string;
  text: string | null;
  mentions: Array<{ uid: string; pos: number; len: number }>;
  quoteMsgId: string | null;
  quoteOwnerUid: string | null;
  isQuestion: boolean;
  answeredAt: string | null;
  deletedAt: string | null;
  receivedAt: string;
}

export interface CommunityTriage {
  verdict: 'ok' | 'spam' | 'scam' | 'ad' | 'harass' | 'unsure';
  confidence: number;
  is_question: boolean;
  question_confidence: number;
  lead_intent: boolean;
  lead_confidence: number;
  wants_private: boolean;
}

export interface PersonaBundle {
  soul: string;
  rules: string;
  identity: string;
  capabilities: string;
  namePatterns: RegExp[];
  skills: Array<{ name: string; description: string }>;
  /** D24: ghi vao turn_traces.persona_versions. */
  versions: { soul: number; rules: number; identity: number; capabilities: number };
}

/** Tham so "da xem" cua zca-js (giong apps/zalo-worker `SeenParams`). */
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

export interface QuoteRef {
  msgId: string;
  cliMsgId: string;
  uidFrom: string;
  content: string;
  msgType: string;
  ts: string;
  ttl: number;
  propertyExt?: Record<string, unknown>;
}

export type OutboxAction =
  | { action: 'delete_message'; msgId: string; cliMsgId: string; uidFrom: string; onlyMe: false; approvalId?: string }
  | { action: 'remove_member'; uid: string; approvalId: string }
  | { action: 'block_member'; uid: string; approvalId: string }
  | { action: 'unblock_member'; uid: string }
  | { action: 'review_join'; uids: string[]; approve: boolean; approvalId?: string }
  | {
      action: 'create_poll';
      question: string;
      options: string[];
      expiredTime?: number;
      allowMultiChoices?: boolean;
      isAnonymous?: boolean;
    }
  | { action: 'lock_poll'; pollId: number }
  | { action: 'create_reminder'; title: string; startTime: number; repeat: 0 | 1 | 2 | 3; emoji?: string }
  | { action: 'remove_reminder'; reminderId: string }
  | { action: 'create_note'; title: string; pinAct?: boolean }
  | {
      action: 'update_group_settings';
      settings: { joinAppr?: boolean; lockSendMsg?: boolean; lockCreatePoll?: boolean; lockCreatePost?: boolean };
    }
  | { action: 'sync_group_info' };

export type OutboxBody =
  | {
      text: string;
      quote?: QuoteRef;
      mentions?: Array<{ uid: string; pos: number; len: number }>;
      split_of?: number;
      part?: number;
      private?: false;
    }
  | { seen: SeenParams }
  | { typing: true }
  | OutboxAction
  | { react: { icon: string; msgId: string; cliMsgId: string } };

export interface GroupTurnContext {
  readonly kind: Exclude<TurnKind, 'dm' | 'owner_dm' | 'automation'>;
  readonly account: AccountId;
  readonly threadId: string;
  readonly botUid: string;
  readonly group: {
    name: string | null;
    mode: GroupMode;
    budgetPerHour: number;
    systemPrompt: string | null;
    botIsAdmin: boolean;
    moderationEnabled: boolean;
  };
  /** Nguoi kich hoat (null o ambient_flush/unanswered). */
  readonly requester: { uid: string; role: Role; displayName: string | null } | null;
  readonly trigger: GroupTrigger | null;
  readonly mustReply: boolean;
  readonly focusMessages: readonly GroupMessageRow[];
  readonly recent: readonly GroupMessageRow[];
  readonly joinedUids?: readonly string[];
  readonly joinRequest?: { uid: string; displayName: string | null };
  readonly now: Date;
  readonly conversationId: string;
  /** D31: id `inbound_events` dang xu ly (tool truyen xuong `enqueue`). */
  readonly inboundEventId: number;
  /** D31: han chot luot (epoch ms; tool truyen xuong `embedTexts`). */
  readonly deadlineAt: number;
  // D28: BO truong mutable `sent` — dem "da tra loi" la `TurnState.answered`.
}

export interface DmTurnContext {
  readonly kind: 'dm' | 'owner_dm';
  readonly account: AccountId;
  readonly threadId: string;
  readonly botUid: string;
  readonly requester: { uid: string; role: Role; displayName: string | null };
  readonly latestText: string;
  readonly latestMessageId: number;
  readonly triage: CommunityTriage | null;
  readonly now: Date;
  readonly conversationId: string;
  /** D22: member_profiles.notes cua CHINH requester (<= 4000), null neu chua co. */
  readonly memberNotes: string | null;
  /** D22: lead mo cua requester (SPEC-P06 §3). */
  readonly openLead: { status: string; score: number; missing: string[] } | null;
  readonly inboundEventId: number;
  readonly deadlineAt: number;
}

export type ToolContext = GroupTurnContext | DmTurnContext;

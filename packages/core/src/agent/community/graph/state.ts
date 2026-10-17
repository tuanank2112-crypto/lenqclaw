// packages/core/src/agent/community/graph/state.ts — state cua hai do thi LangGraph
// (D28, 01-CONTRACTS §12.2). KHONG MessagesAnnotation / BaseMessage (BB-17):
// `messages` la dung `MessageParam[]` dang Anthropic cua adapter model.

import { Annotation } from '@langchain/langgraph';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { InboundEvent } from '../../../adapters/transport.js';
import type {
  AccountId,
  CommunityTriage,
  GateDecision,
  GroupMessageRow,
  GroupMode,
  GroupTrigger,
  JoinPolicy,
  PersonaBundle,
  Role,
  ToolContext,
  TurnKind,
} from '../../../domain/types.js';
import type { ToolName } from '../policy.js';

const last = <T>(_prev: T, next: T): T => next;
const keep = <T>(init: () => T) => Annotation<T>({ reducer: last, default: init });

export type PipelineStop =
  | 'group_unknown'
  | 'group_disabled'
  | 'self'
  | 'deleted'
  | 'not_admitted'
  | 'ambient_deferred'
  | 'group_event_done'
  | 'system_no_turn'
  | 'forged_system_event'
  | 'takeover'
  | 'unsupported';

/** Mot dong `zalo_groups` (008), ten camelCase. */
export interface GroupRow {
  threadId: string;
  name: string | null;
  enabled: boolean;
  mode: GroupMode;
  joinPolicy: JoinPolicy;
  welcomeEnabled: boolean;
  moderationEnabled: boolean;
  budgetPerHour: number;
  ambientTurnsPerHour: number;
  systemPrompt: string | null;
  allowUsers: string[];
  denyUsers: string[];
  botIsAdmin: boolean;
}

export type Lane = 'fast' | 'rag' | 'background';

export interface TurnRequest {
  kind: TurnKind;
  account: AccountId;
  threadId: string;
  threadType: 'user' | 'group';
  /** null: ambient_flush · unanswered · welcome · join_review · automation. */
  requester: { uid: string; role: Role } | null;
  trigger: GroupTrigger | null;
  /** NHOM: bat buoc co tin ra (BB-05). DM luon false — DM co luat rieng (§12.5 D5–D7). */
  mustReply: boolean;
  /** group_messages.id; ambient_flush: [] (prepare doc id > last_seen_message_id). */
  focusMessageIds: number[];
  dm?: { conversationId: string; latestText: string; latestMessageId: number };
  joinedUids?: string[];
  joinRequest?: { uid: string };
  automation?: { automationId: string };
  /** Node `turn` gop tu PipelineState.triage. */
  triage: CommunityTriage | null;
  // D31 (SPEC-D31 §5.1): node `turn` dien tu event/state.
  inboundEventId: number;
  /** epoch ms = inbound_events.received_at (moc SLO). */
  receivedAt: number;
  /** epoch ms luc dispatcher nhan. */
  claimedAt: number;
  /** null khi triage khong chay (tin goi bot — T3). */
  triageMs: number | null;
}

export type StopKind = 'tool_use' | 'end_turn' | 'max_tokens' | 'refusal' | 'model_down';
export type Delivery =
  | 'none'
  | 'auto_post'
  | 'fallback'
  | 'model_down'
  | 'dm_reply'
  | 'dm_empty'
  | 'join_default'
  | 'persona_invalid';
/** = CHECK turn_traces.outcome (009). */
export type TurnOutcome = 'replied' | 'silent' | 'auto_posted' | 'fallback' | 'model_down' | 'refusal' | 'error';

export interface TurnResult {
  turnId: string;
  outcome: TurnOutcome;
  delivery: Delivery | null;
  rounds: number;
  answered: number;
  hostPosted: number;
}

export const PipelineState = Annotation.Root({
  /** Vao; KHONG node nao ghi lai. */
  event: Annotation<InboundEvent>,
  group: keep<GroupRow | null>(() => null),
  sender: keep<{ uid: string; role: Role } | null>(() => null),
  row: keep<GroupMessageRow | null>(() => null),
  triage: keep<CommunityTriage | null>(() => null),
  moderation: keep<{ verdict: string; action: string; exempt: boolean } | null>(() => null),
  gate: keep<GateDecision | null>(() => null),
  turnRequest: keep<TurnRequest | null>(() => null),
  turnResult: keep<TurnResult | null>(() => null),
  /** Vi sao pipeline dung khong co luot (test/log). */
  stop: keep<PipelineStop | null>(() => null),
  /** D31: node triage ghi (null = khong goi). */
  triageMs: keep<number | null>(() => null),
});

export const TurnState = Annotation.Root({
  /** Vao; bat bien. */
  request: Annotation<TurnRequest>,
  /** randomUUID() o prepare = turn_traces.id = agent_runs.turn_id. */
  turnId: keep<string>(() => ''),
  startedAt: keep<number>(() => 0),
  /** GroupTurnContext | DmTurnContext — bat bien sau prepare. */
  ctx: keep<ToolContext | null>(() => null),
  personaVersions: keep<PersonaBundle['versions'] | null>(() => null),
  system: keep<string>(() => ''),
  /** = toolsFor(kind, role) — model chi thay cac tool nay. */
  toolNames: keep<ToolName[]>(() => []),
  /** KHONG MessagesAnnotation. Bat dau RONG moi luot. */
  messages: Annotation<MessageParam[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  /** So lan node tools da chay. */
  rounds: keep<number>(() => 0),
  /** MAX_TOOL_ROUNDS; sau nudge = rounds + NUDGE_ROUNDS (2). */
  roundCap: keep<number>(() => 0),
  toolsCalled: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  /** So lan tool co co `answers` chay THANH CONG. */
  answered: keep<number>(() => 0),
  stop: keep<StopKind | null>(() => null),
  /** Text cua message assistant cuoi KHONG co tool_use. */
  finalText: keep<string>(() => ''),
  nudged: keep<boolean>(() => false),
  prepError: keep<'persona_invalid' | null>(() => null),
  delivery: keep<Delivery | null>(() => null),
  /** So tin host tu gui trong deliver (0|1). */
  hostPosted: keep<number>(() => 0),
  outcome: keep<TurnOutcome | null>(() => null),
  // D31 (BB-18)
  lane: keep<Lane>(() => 'fast'),
  deadlineAt: keep<number>(() => 0),
  modelMs: keep<number>(() => 0),
  toolMs: keep<number>(() => 0),
  deadlineHit: keep<boolean>(() => false),
});

export type PipelineStateT = typeof PipelineState.State;
export type TurnStateT = typeof TurnState.State;
/** Moi node: nhan state, tra PHAN cap nhat; KHONG tra Command. */
export type NodeFn<S> = (s: S) => Promise<Partial<S>>;

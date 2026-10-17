// packages/core/src/agent/community/graph/edges.ts — MOI canh dieu kien va quyet dinh ket
// thuc luot cua hai do thi (BB-16, 01-CONTRACTS §12.4–§12.5). THUAN: khong I/O, khong
// `Date.now()`, khong model; chi doc state. Doi hinh = D moi + nguoi dung duyet so do.

import { END } from '@langchain/langgraph';
import type { GroupMode, Role, TurnKind } from '../../../domain/types.js';
import { addressTrigger } from '../gate.js';
import {
  COMMANDS_HELP,
  FALLBACK_GROUP_REPLY,
  MODEL_DOWN_GROUP_REPLY,
  WELCOME_TEMPLATE,
} from '../prompts/system.js';
import type { Delivery, Lane, PipelineStateT, TurnOutcome, TurnRequest, TurnStateT } from './state.js';

export { END };

export interface LaneConfig {
  fastMs: number;
  ragMs: number;
  backgroundMs: number;
}

/** Tool truy hoi nang luot tuong tac fast => rag (SPEC-D31 §5.1). Khop co `extendsDeadline` cua tool. */
export const EXTENDS_DEADLINE_TOOLS: readonly string[] = ['search_knowledge', 'search_memory', 'recall_group_history', 'read_skill'];

const INTERACTIVE_KINDS: readonly TurnKind[] = ['group_mention', 'dm', 'owner_dm'];

// ---------------------------------------------------------------------------
// pipelineGraph
// ---------------------------------------------------------------------------

/** senderUid==='system' => system_event · nhom => (group_event | ingest) · con lai => dm_intake. */
export function routeEvent(s: PipelineStateT): 'ingest' | 'group_event' | 'system_event' | 'dm_intake' {
  const e = s.event;
  if (e.senderUid === 'system') return 'system_event';
  if (e.threadType === 'group') return (e.payload as { kind?: unknown }).kind === 'group_event' ? 'group_event' : 'ingest';
  return 'dm_intake';
}

export function afterIngest(s: PipelineStateT): 'triage' | typeof END {
  return s.stop !== null ? END : 'triage';
}

export function afterDmIntake(s: PipelineStateT): 'triage' | typeof END {
  return s.stop !== null ? END : 'triage';
}

export function afterTriage(s: PipelineStateT): 'moderate' | 'turn' {
  return s.event.threadType === 'group' ? 'moderate' : 'turn';
}

export function afterModerate(s: PipelineStateT): 'gate' | typeof END {
  return s.stop === 'deleted' ? END : 'gate';
}

export function afterGate(s: PipelineStateT): 'turn' | 'defer' | typeof END {
  if (!s.gate || !s.gate.admitted) return END;
  return s.gate.trigger === 'ambient' ? 'defer' : 'turn';
}

export function afterSystemEvent(s: PipelineStateT): 'turn' | typeof END {
  return s.turnRequest !== null ? 'turn' : END;
}

/** D31: ¬addressed ∧ webchat ∧ co text ∧ (kiem duyet bat ∨ mode ambient). DM luon addressed. */
export function needsTriage(i: {
  threadType: 'user' | 'group';
  msgType: string;
  text: string;
  group: { moderationEnabled: boolean; mode: GroupMode } | null;
  addressed: boolean;
}): boolean {
  if (i.addressed) return false;
  if (i.threadType !== 'group' || i.group === null) return false;
  if (i.msgType !== 'webchat' || i.text.trim() === '') return false;
  return i.group.moderationEnabled || i.group.mode === 'ambient';
}

/** D31: DM ∨ mention bot ∨ quote tin bot ∨ khop ten bot ∨ (lenh ∧ owner/moderator) — = cong dong 7–10. */
export function isAddressedToBot(i: {
  threadType: 'user' | 'group';
  mentions: ReadonlyArray<{ uid: string }>;
  quoteOwnerUid: string | null;
  botUid: string;
  text: string;
  botNamePatterns: readonly RegExp[];
  hasControlCommand: boolean;
  role: Role;
}): boolean {
  if (i.threadType === 'user') return true;
  return addressTrigger(i) !== null;
}

// ---------------------------------------------------------------------------
// turnGraph
// ---------------------------------------------------------------------------

export function isInteractive(kind: TurnKind): boolean {
  return INTERACTIVE_KINDS.includes(kind);
}

/** Tuong tac => {fast, receivedAt + fastMs}; khac => {background, startedAt + backgroundMs}. */
export function initialDeadline(req: TurnRequest, startedAt: number, cfg: LaneConfig): { lane: Lane; deadlineAt: number } {
  if (isInteractive(req.kind)) return { lane: 'fast', deadlineAt: req.receivedAt + cfg.fastMs };
  return { lane: 'background', deadlineAt: startedAt + cfg.backgroundMs };
}

/** lane==='fast' ∧ co tool truy hoi vua chay => {rag, receivedAt + ragMs}; khac => null. */
export function escalateLane(t: TurnStateT, ranToolNames: readonly string[], cfg: LaneConfig): { lane: Lane; deadlineAt: number } | null {
  if (t.lane !== 'fast') return null;
  if (!ranToolNames.some((n) => EXTENDS_DEADLINE_TOOLS.includes(n))) return null;
  return { lane: 'rag', deadlineAt: t.request.receivedAt + cfg.ragMs };
}

export function afterPrepare(t: TurnStateT): 'agent' | 'deliver' {
  return t.prepError !== null ? 'deliver' : 'agent';
}

export function isCapped(t: TurnStateT): boolean {
  return t.stop === 'tool_use' && t.rounds >= t.roundCap;
}

export function needsNudge(t: TurnStateT): boolean {
  const k = t.request.kind;
  return (
    (k === 'group_mention' || k === 'group_welcome') &&
    t.request.mustReply &&
    t.answered === 0 &&
    t.finalText === '' &&
    !t.nudged &&
    (t.stop === 'end_turn' || t.stop === 'max_tokens')
  );
}

export function afterAgent(t: TurnStateT): 'tools' | 'nudge' | 'deliver' {
  if (t.stop === 'tool_use' && t.rounds < t.roundCap) return 'tools';
  if (needsNudge(t)) return 'nudge';
  return 'deliver';
}

/** Bang 12 dong D1–D12 (01-CONTRACTS §12.5), xet theo thu tu, dung o dong dau khop. */
export function decideDelivery(t: TurnStateT): { delivery: Delivery; outcome: TurnOutcome } {
  const kind = t.request.kind;
  const dm = kind === 'dm' || kind === 'owner_dm';
  const capped = isCapped(t);
  if (t.prepError === 'persona_invalid') return { delivery: 'persona_invalid', outcome: 'error' }; // D1
  if (kind === 'group_join_review' && t.answered > 0) return { delivery: 'none', outcome: 'replied' }; // D2
  if (kind === 'group_join_review') {
    // D3 — Q9: CHO VAO mac dinh
    const outcome: TurnOutcome = t.stop === 'model_down' ? 'model_down' : t.stop === 'refusal' ? 'refusal' : 'fallback';
    return { delivery: 'join_default', outcome };
  }
  if (t.stop === 'model_down') return { delivery: 'model_down', outcome: 'model_down' }; // D4
  if (dm && t.stop === 'refusal') return { delivery: 'dm_empty', outcome: 'refusal' }; // D5
  if (dm && t.finalText !== '' && !capped) return { delivery: 'dm_reply', outcome: 'replied' }; // D6
  if (dm) return { delivery: 'dm_empty', outcome: 'fallback' }; // D7
  if (t.answered > 0) return { delivery: 'none', outcome: 'replied' }; // D8
  if (!t.request.mustReply) return { delivery: 'none', outcome: 'silent' }; // D9
  if (t.stop === 'refusal') return { delivery: 'fallback', outcome: 'refusal' }; // D10
  if (t.finalText !== '' && !capped) return { delivery: 'auto_post', outcome: 'auto_posted' }; // D11
  return { delivery: 'fallback', outcome: 'fallback' }; // D12
}

/** Cau tat dinh host gui khi fallback / model_down (moi cau la hang TS trong prompts/system.ts). */
export function hostText(
  req: TurnRequest,
  reason: 'fallback' | 'model_down',
  v: { names: readonly string[]; groupName: string | null; botName: string }
): string {
  if (req.kind === 'group_welcome') return WELCOME_TEMPLATE(v.names, v.groupName, v.botName);
  if (req.trigger === 'owner_command' && reason === 'model_down') return COMMANDS_HELP;
  if (reason === 'model_down') return MODEL_DOWN_GROUP_REPLY;
  return FALLBACK_GROUP_REPLY;
}

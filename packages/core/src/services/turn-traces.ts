// packages/core/src/services/turn-traces.ts — vet tung luot agent (D24, BB-14): dung MOT dong
// `turn_traces` moi luot, KHONG chua noi dung tin / prompt / finalText (01-CONTRACTS §12.8).
// `recordTurn` KHONG bao gio nem: loi ⇒ audit `trace.error`.

import { sql } from '../adapters/db.js';
import type { TurnStateT } from '../agent/community/graph/state.js';
import { audit } from './audit.js';

export async function recordTurn(t: TurnStateT): Promise<void> {
  try {
    const req = t.request;
    const startedAt = t.startedAt > 0 ? t.startedAt : Date.now();
    const turnId = t.turnId !== '' ? t.turnId : null;
    const ctxConv = t.ctx ? t.ctx.conversationId : null;
    await sql(
      `insert into turn_traces
         (id, zalo_account_id, conversation_id, thread_id, thread_type, kind, trigger, requester_role, rounds, tools, sent, outcome,
          input_tokens, output_tokens, latency_ms, persona_versions,
          inbound_event_id, received_at, lane, queued_ms, pre_turn_ms, triage_ms, model_ms, tool_ms, deadline_hit)
       values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11, $12,
          coalesce((select sum(input_tokens) from agent_runs where turn_id = $1::uuid), 0),
          coalesce((select sum(output_tokens) from agent_runs where turn_id = $1::uuid), 0),
          $13, $14::jsonb,
          $15, case when $16::bigint > 0 then to_timestamp($16::bigint / 1000.0) end, $17, $18, $19, $20, $21, $22, $23)`,
      [
        turnId,
        req.account,
        ctxConv,
        req.threadId,
        req.threadType,
        req.kind,
        req.trigger,
        req.requester?.role ?? null,
        t.rounds,
        t.toolsCalled,
        t.answered + t.hostPosted,
        t.outcome ?? 'error',
        Math.max(0, Date.now() - startedAt),
        JSON.stringify(t.personaVersions ?? {}),
        // D31 (SPEC-D31 §8, 01-CONTRACTS §12.8)
        req.inboundEventId,
        req.receivedAt,
        t.lane,
        req.receivedAt > 0 && req.claimedAt > 0 ? Math.max(0, req.claimedAt - req.receivedAt) : null,
        req.claimedAt > 0 && t.startedAt > 0 ? Math.max(0, t.startedAt - req.claimedAt) : null,
        req.triageMs,
        t.modelMs,
        t.toolMs,
        t.deadlineHit,
      ]
    );
  } catch (err) {
    try {
      await audit(sql, {
        actorType: 'system',
        actorId: null,
        action: 'trace.error',
        target: t.request.threadId,
        data: { message: err instanceof Error ? err.message.slice(0, 200) : 'unknown' },
      });
    } catch {
      /* khong the ghi audit (DB sap) — khong nem */
    }
  }
}

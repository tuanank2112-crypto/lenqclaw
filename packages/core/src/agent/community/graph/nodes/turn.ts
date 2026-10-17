// node `turn` (pipeline) — chay MOT luot agent: `runTurn` (turnGraph). Gop `triage` + moc D31 (receivedAt,
// claimedAt, triageMs) vao `TurnRequest` (01-CONTRACTS §12.3). Tac dung phu = cua turnGraph.

import { runTurn } from '../turn.js';
import type { NodeFn, PipelineStateT } from '../state.js';

/** `received_at` tu pg la Date (hoac chuoi neu da serialize) ⇒ epoch ms. */
function toMs(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

export const turnNode: NodeFn<PipelineStateT> = async (s) => {
  if (!s.turnRequest) throw new Error('turn: thieu turnRequest (bug cach noi do thi).');
  const e = s.event;
  const turnResult = await runTurn({
    ...s.turnRequest,
    triage: s.triageResult,
    inboundEventId: e.id,
    receivedAt: toMs(e.receivedAt),
    claimedAt: e.claimedAt ?? Date.now(),
    triageMs: s.triageMs,
  });
  return { turnResult };
};

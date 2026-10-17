// node `trace` (turn) — ghi dung MOT dong `turn_traces` (D24, BB-14); khong bao gio nem (recordTurn nuot loi).

import { recordTurn } from '../../../../services/turn-traces.js';
import type { NodeFn, TurnStateT } from '../state.js';

export const traceNode: NodeFn<TurnStateT> = async (s) => {
  await recordTurn(s);
  return {};
};

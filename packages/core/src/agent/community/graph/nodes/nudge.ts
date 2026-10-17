// node `nudge` (turn) — nhac DUNG MOT lan (SPEC-P03 §6.4.2): luot mustReply ket thuc ma chua tra loi va khong co
// text cuoi ⇒ them message `user` NUDGE_TEXT, `roundCap = rounds + NUDGE_ROUNDS`, quay lai `agent`. Khong I/O.

import { NUDGE_TEXT } from '../../prompts/system.js';
import type { NodeFn, TurnStateT } from '../state.js';

export const NUDGE_ROUNDS = 2;

export const nudgeNode: NodeFn<TurnStateT> = async (s) => ({
  messages: [{ role: 'user', content: NUDGE_TEXT }],
  nudged: true,
  roundCap: s.rounds + NUDGE_ROUNDS,
});

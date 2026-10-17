// node `defer` (pipeline) — tin ambient KHONG goi model ngay (D15): chi danh dau `pending_since`;
// timer `flushAmbient` dua vao lai bang su kien he thong sau AMBIENT_DEBOUNCE_SEC (SPEC-P03 §4.2).

import { markAmbientPending } from '../../sessions.js';
import type { NodeFn, PipelineStateT } from '../state.js';

export const deferNode: NodeFn<PipelineStateT> = async (s) => {
  await markAmbientPending(s.event.zaloAccountId, s.event.threadId);
  return { stop: 'ambient_deferred' };
};

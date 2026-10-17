// node `moderate` (pipeline) — KHUNG cua P05 (kiem duyet: luoi tat dinh + thang canh cao, SPEC-P05 §3–§4).
// P03: khong xoa, khong canh cao, khong ghi gi ⇒ tra `{}` (stop khong doi ⇒ afterModerate ⇒ gate).
// P05 dien than node nay; KHONG them/bot node hay canh (BB-16).

import type { NodeFn, PipelineStateT } from '../state.js';

export const moderateNode: NodeFn<PipelineStateT> = async () => ({});

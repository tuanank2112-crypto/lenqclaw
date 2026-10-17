// packages/core/src/agent/community/router.ts — diem vao cua runtime agent cong dong (SPEC-P03 §2).
// D28: `routeInboundEvent(e) = runPipeline(e)` — giu TEN de runner, processInbound, golden va route
// web khong doi. Khung router P01 (STUB_DM_REPLY, audit `*_stub`) da duoc thay boi `pipelineGraph`.

import type { InboundEvent } from '../../adapters/transport.js';
import { runPipeline } from './graph/pipeline.js';

export async function routeInboundEvent(e: InboundEvent): Promise<void> {
  await runPipeline(e);
}

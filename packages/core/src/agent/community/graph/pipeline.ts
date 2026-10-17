// packages/core/src/agent/community/graph/pipeline.ts — do thi PIPELINE (D28, SPEC-P03 §2, 01-CONTRACTS §12.4/§12.6):
// MOT `inbound_events` ⇒ MOT `invoke` voi state rong, roi state bi bo (BB-17). Hinh = PIPELINE_SHAPE = so do nguoi dung
// duyet — CAM them/bot/doi ten node hay canh. Ten NODE giu nguyen; TRUONG state `triageResult`/`gateDecision` doi ten
// vi LangGraph cam kenh trung ten node. Khong checkpointer; recursionLimit tuong minh (BB-16, BB-17).

import { END, START, StateGraph } from '@langchain/langgraph';
import type { InboundEvent } from '../../../adapters/transport.js';
import { afterDmIntake, afterGate, afterIngest, afterModerate, afterSystemEvent, afterTriage, routeEvent } from './edges.js';
import { deferNode } from './nodes/defer.js';
import { dmIntakeNode } from './nodes/dm-intake.js';
import { gateNode } from './nodes/gate.js';
import { groupEventNode } from './nodes/group-event.js';
import { ingestNode } from './nodes/ingest.js';
import { moderateNode } from './nodes/moderate.js';
import { systemEventNode } from './nodes/system-event.js';
import { triageNode } from './nodes/triage.js';
import { turnNode } from './nodes/turn.js';
import { PipelineState, type PipelineStateT } from './state.js';

/** Duong dai nhat 5 buoc: ingest → triage → moderate → gate → turn. */
export const PIPELINE_RECURSION_LIMIT = 10;

export function buildPipelineGraph() {
  return new StateGraph(PipelineState)
    .addNode('ingest', ingestNode)
    .addNode('triage', triageNode)
    .addNode('moderate', moderateNode)
    .addNode('gate', gateNode)
    .addNode('defer', deferNode)
    .addNode('group_event', groupEventNode)
    .addNode('system_event', systemEventNode)
    .addNode('dm_intake', dmIntakeNode)
    .addNode('turn', turnNode)
    .addConditionalEdges(START, routeEvent, ['ingest', 'group_event', 'system_event', 'dm_intake'])
    .addConditionalEdges('ingest', afterIngest, ['triage', END])
    .addConditionalEdges('dm_intake', afterDmIntake, ['triage', END])
    .addConditionalEdges('triage', afterTriage, ['moderate', 'turn'])
    .addConditionalEdges('moderate', afterModerate, ['gate', END])
    .addConditionalEdges('gate', afterGate, ['turn', 'defer', END])
    .addConditionalEdges('system_event', afterSystemEvent, ['turn', END])
    .addEdge('group_event', END)
    .addEdge('defer', END)
    .addEdge('turn', END);
}

export const pipelineGraph = buildPipelineGraph().compile();

export async function runPipeline(e: InboundEvent): Promise<PipelineStateT> {
  return pipelineGraph.invoke({ event: e }, { recursionLimit: PIPELINE_RECURSION_LIMIT });
}

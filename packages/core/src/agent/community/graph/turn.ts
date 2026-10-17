// packages/core/src/agent/community/graph/turn.ts — do thi LUOT (D28, SPEC-P03 §6, 01-CONTRACTS §12.4/§12.6):
//   START → prepare ┄► {agent | deliver} · agent ┄► {tools | nudge | deliver} · tools → agent · nudge → agent
//   deliver → trace → END
// KHONG checkpointer / Store / thread_id / interrupt (BB-17). compile() 1 lan khi nap module. Moi canh dieu kien la
// ham THUAN o edges.ts va khai danh sach dich tuong minh (BB-16).

import { END, START, StateGraph } from '@langchain/langgraph';
import { readCommunityConfig } from '../../../services/community-config.js';
import { recordTurn } from '../../../services/turn-traces.js';
import { afterAgent, afterPrepare } from './edges.js';
import { agentNode } from './nodes/agent.js';
import { deliverNode } from './nodes/deliver.js';
import { NUDGE_ROUNDS, nudgeNode } from './nodes/nudge.js';
import { prepareNode } from './nodes/prepare.js';
import { toolsNode } from './nodes/tools.js';
import { traceNode } from './nodes/trace.js';
import { TurnState, type TurnRequest, type TurnResult, type TurnStateT } from './state.js';

export { NUDGE_ROUNDS };

/** Duong xau nhat = 2M + 10 super-step (spike J: dung bang so step van nem) ⇒ gioi han = 2M + 11. */
export function turnRecursionLimit(maxToolRounds: number): number {
  return 2 * maxToolRounds + 11;
}

export function buildTurnGraph() {
  return new StateGraph(TurnState)
    .addNode('prepare', prepareNode)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('nudge', nudgeNode)
    .addNode('deliver', deliverNode)
    .addNode('trace', traceNode)
    .addEdge(START, 'prepare')
    .addConditionalEdges('prepare', afterPrepare, ['agent', 'deliver'])
    .addConditionalEdges('agent', afterAgent, ['tools', 'nudge', 'deliver'])
    .addEdge('tools', 'agent')
    .addEdge('nudge', 'agent')
    .addEdge('deliver', 'trace')
    .addEdge('trace', END);
}

export const turnGraph = buildTurnGraph().compile();

function emptyTurnState(request: TurnRequest): TurnStateT {
  return {
    request, turnId: '', startedAt: 0, ctx: null, personaVersions: null, system: '', toolNames: [], messages: [], rounds: 0,
    roundCap: 0, toolsCalled: [], answered: 0, stop: null, finalText: '', nudged: false, prepError: null, delivery: null,
    hostPosted: 0, outcome: null, lane: 'fast', deadlineAt: 0, modelMs: 0, toolMs: 0, deadlineHit: false,
  };
}

/**
 * Chay MOT luot. Node nem loi truoc `trace` ⇒ ghi `turn_traces outcome='error'` tu state cuoi (dung 1 dong, BB-14) roi
 * NEM LAI (processInbound audit `inbound.handler_error`; nhom khong BUSY_REPLY — D20). `trace` da chay ⇒ chi nem lai.
 * KHONG bat `GraphRecursionError` de thu lai (la bug — SPEC-P03 §10).
 */
export async function runTurn(req: TurnRequest): Promise<TurnResult> {
  const cfg = readCommunityConfig();
  let last = emptyTurnState(req);
  let traceRan = false;
  try {
    const stream = await turnGraph.stream(
      { request: req },
      { streamMode: ['values', 'updates'], recursionLimit: turnRecursionLimit(cfg.maxToolRounds) }
    );
    for await (const [mode, chunk] of stream) {
      if (mode === 'values') last = chunk as TurnStateT;
      else if (mode === 'updates' && chunk && typeof chunk === 'object' && 'trace' in chunk) traceRan = true;
    }
  } catch (err) {
    if (!traceRan) await recordTurn({ ...last, outcome: 'error' });
    throw err;
  }
  return {
    turnId: last.turnId,
    outcome: last.outcome ?? 'error',
    delivery: last.delivery,
    rounds: last.rounds,
    answered: last.answered,
    hostPosted: last.hostPosted,
  };
}

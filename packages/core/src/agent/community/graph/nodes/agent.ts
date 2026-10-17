// node `agent` (turn) — MOT lan goi model cua luot (SPEC-P03 §6.2): CHI node nay duoc goi `callModel` route
// `community` (BB-15); vong lap = canh `tools → agent`, khong co vong `for`/`while` goi model. Model KHONG BAO GIO
// tu ghi outbox — moi tin ra la ket qua cua tool hoac cua `deliver`. `ModelUnavailableError` (sau retry + fallback)
// ⇒ `stop='model_down'`, khong nem; loi khac nem len `runTurn`.

import type { ContentBlockParam, Message } from '@anthropic-ai/sdk/resources/messages';
import { callModel } from '../../../../adapters/model.js';
import { ModelDeadlineError, ModelUnavailableError } from '../../../../domain/errors.js';
import { getRegisteredToolDefinitions, getRegisteredTools } from '../../tools/registry.js';
import { isInteractive, skipFinalCall } from '../edges.js';
import type { NodeFn, StopKind, TurnStateT } from '../state.js';

function textOf(message: Message): string {
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim();
}

function stopOf(message: Message): StopKind {
  if (message.stop_reason === 'refusal') return 'refusal';
  if (message.content.some((b) => b.type === 'tool_use')) return 'tool_use';
  if (message.stop_reason === 'max_tokens') return 'max_tokens';
  return 'end_turn';
}

export const agentNode: NodeFn<TurnStateT> = async (s) => {
  if (!s.ctx) throw new Error('agent: thieu ctx (bug cach noi do thi).');
  // D35.4 (N6): vong tools vua xong chi gom tool `answers` thanh cong => luot da noi xong, KHONG goi model chot.
  const answersTools = new Set([...getRegisteredTools()].filter(([, tool]) => tool.answers === true).map(([name]) => name));
  if (skipFinalCall(s, answersTools)) return { stop: 'end_turn' as const, finalText: '' };
  const defs = getRegisteredToolDefinitions();
  const tools = s.toolNames.flatMap((n) => {
    const d = defs.get(n);
    return d ? [d] : [];
  });
  const started = Date.now();
  try {
    const res = await callModel({
      route: 'community',
      system: s.system,
      messages: s.messages,
      tools,
      conversationId: s.ctx.conversationId,
      turnId: s.turnId,
      // D31 (T2, BB-18): luot tuong tac dung model nhanh, CO DINH ca luot; han chot theo lan hien tai.
      tier: isInteractive(s.request.kind) ? 'fast' : 'default',
      deadlineAt: s.deadlineAt,
    });
    const stop = stopOf(res.message);
    const update: Partial<TurnStateT> = {
      stop,
      finalText: stop === 'tool_use' ? '' : textOf(res.message),
      modelMs: s.modelMs + (Date.now() - started),
    };
    if (res.message.content.length > 0) {
      update.messages = [{ role: 'assistant', content: res.message.content as unknown as ContentBlockParam[] }];
    }
    return update;
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      return {
        stop: 'model_down',
        finalText: '',
        modelMs: s.modelMs + (Date.now() - started),
        deadlineHit: s.deadlineHit || err instanceof ModelDeadlineError,
      };
    }
    throw err;
  }
};

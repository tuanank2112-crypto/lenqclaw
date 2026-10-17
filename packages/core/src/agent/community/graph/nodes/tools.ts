// node `tools` (turn) — chay MOI `tool_use` cua message assistant cuoi, THEO THU TU, khong song song
// (SPEC-P03 §6.2). Tool la → ToolNotAllowedError; `assertValidToolInput` ⇒ `assertToolAllowed` (phong thu 2 lop)
// ⇒ `tool.run`. Loi co `code` ⇒ `tool_result is_error {code, message}`; loi khac nem len. MOI `tool_result` cua
// buoc nam trong MOT message `user`. Node nay khong nap adapter outbox — tin ra di qua tool (BB-15).

import type { ToolResultBlockParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import { sql } from '../../../../adapters/db.js';
import { ToolNotAllowedError } from '../../../../domain/errors.js';
import { audit } from '../../../../services/audit.js';
import { assertToolAllowed } from '../../policy.js';
import { getRegisteredTools } from '../../tools/registry.js';
import { assertValidToolInput } from '../../tools/tool-kit.js';
import type { NodeFn, TurnStateT } from '../state.js';

function errorResult(id: string, code: string, message: string): ToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: id, is_error: true, content: JSON.stringify({ code, message }) };
}

export const toolsNode: NodeFn<TurnStateT> = async (s) => {
  if (!s.ctx) throw new Error('tools: thieu ctx (bug cach noi do thi).');
  const last = s.messages[s.messages.length - 1];
  const blocks = last && last.role === 'assistant' && Array.isArray(last.content) ? last.content : [];
  const uses = blocks.filter((b): b is ToolUseBlock => b.type === 'tool_use');
  const registry = getRegisteredTools();
  const role = s.request.requester?.role ?? 'member';
  const results: ToolResultBlockParam[] = [];
  const called: string[] = [];
  let answered = 0;
  const started = Date.now();

  for (const use of uses) {
    called.push(use.name);
    const tool = registry.get(use.name);
    try {
      if (!tool) throw new ToolNotAllowedError(`tool lạ: ${use.name}`);
      assertValidToolInput(tool.definition, use.input);
      assertToolAllowed(s.request.kind, role, use.name);
      const out = await tool.run(s.ctx, use.input as Record<string, unknown>);
      results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(out ?? null) });
      if (tool.answers) answered += 1;
    } catch (err) {
      // Loi nghiep vu cua repo: `code === name` (domain/errors.ts). Loi pg co `code` (SQLSTATE) nhung `name` khac ⇒ coi la loi
      // he thong, nem len runTurn (ghi vet `error`), khong dua cho model.
      const code = (err as { code?: unknown })?.code;
      if (typeof code !== 'string' || (err as Error).name !== code) throw err;
      if (err instanceof ToolNotAllowedError) {
        await audit(sql, { actorType: 'system', actorId: s.request.requester?.uid ?? null, action: 'tool.denied', target: s.request.threadId, data: { tool: use.name } });
      }
      results.push(errorResult(use.id, code, err instanceof Error ? err.message : String(err)));
    }
  }

  return {
    messages: [{ role: 'user', content: results }],
    rounds: s.rounds + 1,
    toolsCalled: called,
    answered: s.answered + answered,
    toolMs: s.toolMs + (Date.now() - started),
  };
};

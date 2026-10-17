// packages/core/src/agent/community/tools/registry.ts — danh sach tool da cai dat (P03:
// tap tool NEN; P04–P07 them). Tach khoi `policy.ts` de policy lay dinh nghia ma khong
// vong import. Moi tool la mot file `{ definition, answers?, extendsDeadline?, run }`.

import type { AgentTool, ToolDefinition } from './tool-kit.js';
import { ALL_TOOLS } from './index.js';

let byName: Map<string, AgentTool> | null = null;

export function getRegisteredTools(): Map<string, AgentTool> {
  if (!byName) {
    byName = new Map();
    for (const t of ALL_TOOLS) {
      if (byName.has(t.definition.name)) throw new Error(`Tool trung ten: ${t.definition.name}`);
      byName.set(t.definition.name, t);
    }
  }
  return byName;
}

export function getRegisteredToolDefinitions(): Map<string, ToolDefinition> {
  return new Map([...getRegisteredTools()].map(([n, t]) => [n, t.definition]));
}

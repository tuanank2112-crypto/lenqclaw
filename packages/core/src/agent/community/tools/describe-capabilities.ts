// tool `describe_capabilities` — tra ve khối CAPABILITIES + chi muc skill de nguoi dung biet bot lam duoc gi.

import { loadPersonaBundle } from '../persona.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

const definition: ToolDefinition = {
  name: 'describe_capabilities',
  description: 'Mô tả những việc trợ lý làm được và không làm được, kèm danh sách kỹ năng (skill) có thể đọc bằng read_skill.',
  strict: true,
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
};

export const describeCapabilitiesTool: AgentTool<Record<string, never>> = {
  definition,
  async run(ctx) {
    const p = await loadPersonaBundle(ctx.account);
    return { capabilities: p.capabilities, skills: p.skills };
  },
};

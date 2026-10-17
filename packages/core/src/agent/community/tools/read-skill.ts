// tool `read_skill` — doc than mot skill dang bat (chi muc nam trong system prompt). `extendsDeadline` (D31).

import { sql } from '../../../adapters/db.js';
import { SkillNotFoundError } from '../../../domain/errors.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

const definition: ToolDefinition = {
  name: 'read_skill',
  description: 'Đọc nội dung đầy đủ của một kỹ năng (skill) theo tên trong chỉ mục SKILLS.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Tên skill đúng như trong chỉ mục.' } },
    required: ['name'],
    additionalProperties: false,
  },
};

export const readSkillTool: AgentTool<{ name: string }> = {
  definition,
  extendsDeadline: true,
  async run(ctx, input) {
    const rows = await sql<{ name: string; body: string }>(
      `select name, body from skill_docs where zalo_account_id = $1 and name = $2 and enabled`,
      [ctx.account, input.name]
    );
    if (rows.length === 0) throw new SkillNotFoundError(`Không có skill "${input.name}" (hoặc đang tắt).`);
    return { skill: rows[0]!.name, body: rows[0]!.body };
  },
};

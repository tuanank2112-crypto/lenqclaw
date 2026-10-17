// tool `handoff_to_owner` — chuyen viec cho chu (DM owner HANDOFF_DM); o DM dat takeover cho thread hien tai.

import { InvalidToolInputError } from '../../../domain/errors.js';
import { handoffToOwner } from '../handoff.js';
import type { AgentTool, ToolDefinition } from './tool-kit.js';

const definition: ToolDefinition = {
  name: 'handoff_to_owner',
  description:
    'Chuyển cuộc trò chuyện cho chủ nhóm khi bạn không thể hoặc không nên tự xử lý (khiếu nại, thanh toán, việc ngoài khả năng). Nêu lý do ngắn gọn. Ở nhắn riêng, sau đó bạn sẽ tạm im lặng để người thật tiếp quản.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: { reason: { type: 'string', description: 'Lý do chuyển, một câu ngắn.' } },
    required: ['reason'],
    additionalProperties: false,
  },
};

export const handoffToOwnerTool: AgentTool<{ reason: string }> = {
  definition,
  async run(ctx, input) {
    if (input.reason.trim() === '') throw new InvalidToolInputError('reason không được rỗng.');
    const r = await handoffToOwner(ctx, input.reason);
    return { handed_off: true, owner_notified: r.notified };
  },
};

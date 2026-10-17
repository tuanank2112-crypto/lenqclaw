// packages/core/src/agent/community/tools/index.ts — gom cac tool da cai (tap NEN cua P03:
// 11 tool) + P05 (kiem duyet · the duyet: 5 tool); lead/lich la P06/P07, cung khung policy.ts).

import { decideApprovalTool } from './approval-tools.js';
import { describeCapabilitiesTool } from './describe-capabilities.js';
import { listGroupsTool, muteGroupTool, setGroupEnabledTool, setGroupModeTool } from './group-admin.js';
import { deleteMessageTool, flagMessageTool, requestMemberRemovalTool, warnMemberTool } from './moderation-tools.js';
import { handoffToOwnerTool } from './handoff-to-owner.js';
import { readSkillTool } from './read-skill.js';
import { recallGroupHistoryTool } from './recall-group-history.js';
import { rememberMemberNoteTool } from './remember-member-note.js';
import { searchKnowledgeTool } from './search-knowledge.js';
import { sendGroupMessageTool } from './send-group-message.js';
import type { AgentTool } from './tool-kit.js';

export const ALL_TOOLS: readonly AgentTool[] = [
  searchKnowledgeTool,
  describeCapabilitiesTool,
  readSkillTool,
  sendGroupMessageTool,
  recallGroupHistoryTool,
  rememberMemberNoteTool,
  handoffToOwnerTool,
  listGroupsTool,
  setGroupEnabledTool,
  setGroupModeTool,
  muteGroupTool,
  flagMessageTool,
  deleteMessageTool,
  warnMemberTool,
  requestMemberRemovalTool,
  decideApprovalTool,
] as readonly AgentTool[];

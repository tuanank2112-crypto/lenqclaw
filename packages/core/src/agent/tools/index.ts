// packages/core/src/agent/tools/index.ts — danh sach tool cua agent cu dan
// (01-CONTRACTS §7 phia cu dan; `report_problem` la buoc 8 => P06, chua co).

import { saveJobDraftTool } from './save_job_draft.js';
import { searchRegulationsTool } from './search_regulations.js';
import { classifyResponsibilityTool } from './classify_responsibility.js';
import { pushBqlTicketTool } from './push_bql_ticket.js';
import { openServiceCaseTool } from './open_service_case.js';
import { getPriceBandTool } from './get_price_band.js';
import { getMyCasesTool } from './get_my_cases.js';
import { handoffToStaffTool } from './handoff_to_staff.js';
import type { AgentTool } from './tool-kit.js';

export {
  saveJobDraftTool,
  searchRegulationsTool,
  classifyResponsibilityTool,
  pushBqlTicketTool,
  openServiceCaseTool,
  getPriceBandTool,
  getMyCasesTool,
  handoffToStaffTool,
};
export type { AgentTool, ToolDefinition } from './tool-kit.js';

// eslint: cac tool co TInput rieng (SaveJobDraftInput, ...), khong co index
// signature chung => can `any` o day de gom vao MOT mang di dong duoc; moi
// tool van giu kieu input rieng, day du o file cua no.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const RESIDENT_TOOLS: ReadonlyArray<AgentTool<any, unknown>> = [
  saveJobDraftTool,
  searchRegulationsTool,
  classifyResponsibilityTool,
  pushBqlTicketTool,
  openServiceCaseTool,
  getPriceBandTool,
  getMyCasesTool,
  handoffToStaffTool,
];

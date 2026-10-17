// packages/core/src/agent/community/policy.ts — chinh sach tool (SPEC-P03 §8,
// 01-CONTRACTS §7.1, BB-01). Bang `name/surfaces/roles` la NGUON cho
// `scripts/check_agent_tools.mjs` (unlisted_tools): moi `name: '<x>'` trong
// tools/*.ts PHAI nam o day. Luat cung nam TRONG tool; day la lop loc tools[] gui
// cho model (model khong thay tool bi cam) + lop phong thu thu hai luc chay.
//
// Be mat: G = luot nhom (moi `group_*`), D = DM member/stranger, O = DM owner.
// Luot `group_join_review` CHI co `review_join_request`; luot `automation` chi 4 tool
// cua SPEC-P03 §8. Vai o ambient_flush/unanswered (requester=null) tinh la 'member'.

import type { Role, TurnKind } from '../../domain/types.js';
import { ToolNotAllowedError } from '../../domain/errors.js';
import { getRegisteredToolDefinitions } from './tools/registry.js';
import type { ToolDefinition } from './tools/tool-kit.js';

export type Surface = 'G' | 'D' | 'O';
type RoleRule = 'any' | readonly Role[];

interface PolicyRow {
  readonly name: string;
  readonly surfaces: readonly Surface[];
  readonly roles: RoleRule;
  /** Stranger o DM chi duoc tool co co nay. */
  readonly strangerAllowed?: boolean;
}

const OWNER_MOD = ['owner', 'moderator'] as const;

const POLICY_ROWS = [
  { name: 'search_knowledge', surfaces: ['G', 'D', 'O'], roles: 'any', strangerAllowed: true },
  { name: 'describe_capabilities', surfaces: ['G', 'D', 'O'], roles: 'any', strangerAllowed: true },
  { name: 'read_skill', surfaces: ['G', 'D', 'O'], roles: 'any', strangerAllowed: true },
  { name: 'send_group_message', surfaces: ['G'], roles: 'any' },
  { name: 'recall_group_history', surfaces: ['G'], roles: 'any' },
  { name: 'flag_message', surfaces: ['G'], roles: 'any' },
  { name: 'delete_message', surfaces: ['G'], roles: 'any' },
  { name: 'warn_member', surfaces: ['G'], roles: 'any' },
  { name: 'request_member_removal', surfaces: ['G'], roles: 'any' },
  { name: 'invite_to_private', surfaces: ['G'], roles: 'any' },
  { name: 'remember_member_note', surfaces: ['G', 'D', 'O'], roles: 'any' },
  { name: 'handoff_to_owner', surfaces: ['G', 'D'], roles: 'any', strangerAllowed: true },
  { name: 'create_poll', surfaces: ['G', 'O'], roles: OWNER_MOD },
  { name: 'create_reminder', surfaces: ['G', 'O'], roles: OWNER_MOD },
  { name: 'create_note', surfaces: ['G', 'O'], roles: OWNER_MOD },
  { name: 'set_group_mode', surfaces: ['G', 'O'], roles: OWNER_MOD },
  { name: 'mute_group', surfaces: ['G', 'O'], roles: OWNER_MOD },
  { name: 'save_lead', surfaces: ['D'], roles: 'any', strangerAllowed: true },
  { name: 'submit_lead', surfaces: ['D'], roles: 'any', strangerAllowed: true },
  { name: 'list_groups', surfaces: ['O'], roles: 'any' },
  { name: 'set_group_enabled', surfaces: ['O'], roles: 'any' },
  { name: 'decide_approval', surfaces: ['G', 'O'], roles: OWNER_MOD },
  { name: 'announce', surfaces: ['O'], roles: 'any' },
  { name: 'schedule_automation', surfaces: ['O'], roles: 'any' },
  { name: 'list_automations', surfaces: ['O'], roles: 'any' },
  { name: 'cancel_automation', surfaces: ['O'], roles: 'any' },
  { name: 'search_memory', surfaces: ['O'], roles: 'any' },
  { name: 'write_daily_note', surfaces: ['O'], roles: 'any' },
  { name: 'daily_report', surfaces: ['O'], roles: 'any' },
  { name: 'review_join_request', surfaces: ['G', 'O'], roles: 'any' },
] as const satisfies readonly PolicyRow[];

export type ToolName = (typeof POLICY_ROWS)[number]['name'];

/** Nguon cho check_agent_tools (SPEC-P01 §6.1 unlisted_tools). */
export const TOOL_NAMES: readonly ToolName[] = POLICY_ROWS.map((r) => r.name);

export const TOOL_POLICY: Record<ToolName, { surfaces: Array<Surface>; roles: 'any' | Role[]; strangerAllowed?: boolean }> =
  Object.fromEntries(
    POLICY_ROWS.map((r) => [
      r.name,
      { surfaces: [...r.surfaces], roles: r.roles === 'any' ? 'any' : [...r.roles], ...('strangerAllowed' in r ? { strangerAllowed: true } : {}) },
    ])
  ) as never;

/** Tool duy nhat cua luot `group_join_review`. */
const JOIN_REVIEW_TOOLS: readonly ToolName[] = ['review_join_request'];
/** Luot `automation` (SPEC-P03 §8). */
const AUTOMATION_TOOLS: readonly ToolName[] = ['send_group_message', 'search_knowledge', 'recall_group_history', 'create_poll'];

export function surfaceOf(kind: TurnKind): Surface {
  if (kind === 'dm') return 'D';
  if (kind === 'owner_dm') return 'O';
  return 'G';
}

function roleAllows(rule: RoleRule, role: Role): boolean {
  return rule === 'any' || rule.includes(role);
}

/** Ten tool duoc phep cho (kind, role) — THUAN, thu tu theo bang. */
export function allowedToolNames(kind: TurnKind, role: Role): ToolName[] {
  if (kind === 'group_join_review') return [...JOIN_REVIEW_TOOLS];
  if (kind === 'automation') return [...AUTOMATION_TOOLS];
  const surface = surfaceOf(kind);
  const out: ToolName[] = [];
  for (const row of POLICY_ROWS) {
    const surfaces: readonly Surface[] = row.surfaces;
    if (!surfaces.includes(surface)) continue;
    // review_join_request chi o luot group_join_review (da xu ly o tren) — ngoai ra chi O.
    if (row.name === 'review_join_request' && surface === 'G') continue;
    const rule: RoleRule = row.roles;
    if (!roleAllows(rule, role)) continue;
    if (surface === 'D' && role === 'stranger') {
      const allowed: boolean = 'strangerAllowed' in row;
      if (!allowed) continue;
    }
    out.push(row.name);
  }
  return out;
}

/** Dinh nghia tool gui cho model: chi tool duoc phep VA da cai (P03 cai tap tool nen). */
export function toolsFor(kind: TurnKind, role: Role): ToolDefinition[] {
  const registered = getRegisteredToolDefinitions();
  return allowedToolNames(kind, role).flatMap((n) => {
    const def = registered.get(n);
    return def ? [def] : [];
  });
}

/** Phong thu lop 2: nem `ToolNotAllowedError` neu (kind, role) khong duoc dung `name`. */
export function assertToolAllowed(kind: TurnKind, role: Role, name: string): void {
  const allowed = allowedToolNames(kind, role) as string[];
  if (!allowed.includes(name)) {
    throw new ToolNotAllowedError(`Tool "${name}" khong duoc phep o luot ${kind} (vai ${role}).`);
  }
}

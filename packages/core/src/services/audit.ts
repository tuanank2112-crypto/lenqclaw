// packages/core/src/services/audit.ts — ghi audit_log (BB-09).

import type { SqlFn } from '../adapters/db.js';

export interface AuditArgs {
  actorType: string;
  actorId: string | null;
  action: string;
  target?: string | null;
  data?: Record<string, unknown> | null;
}

export async function audit(q: SqlFn, args: AuditArgs): Promise<void> {
  await q(
    `insert into audit_log (actor_type, actor_id, action, target, data) values ($1,$2,$3,$4,$5)`,
    [args.actorType, args.actorId, args.action, args.target ?? null, args.data ? JSON.stringify(args.data) : null]
  );
}

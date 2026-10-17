// packages/core/src/agent/community/handoff.ts — chuyen cho chu (N2): DM owner `HANDOFF_DM`; o DM dat
// `human_takeover_until` cho thread hien tai (bot im den het han); o NHOM chi DM owner, KHONG dat
// takeover (nhom la khong gian chung — SPEC-P03 §6.4.2). Dung boi tool `handoff_to_owner` va `deliver`.

import { sql } from '../../adapters/db.js';
import { enqueue } from '../../adapters/transport.js';
import type { ToolContext } from '../../domain/types.js';
import { audit } from '../../services/audit.js';
import { readCommunityConfig } from '../../services/community-config.js';
import { HANDOFF_DM } from './prompts/system.js';
import { firstOwnerUid } from './roles.js';

export interface HandoffOptions {
  /** Mac dinh: true ⇒ luot DM, false ⇒ luot nhom. */
  takeover?: boolean;
}

export async function handoffToOwner(ctx: ToolContext, reason: string, opts: HandoffOptions = {}): Promise<{ notified: boolean }> {
  const isDm = ctx.kind === 'dm' || ctx.kind === 'owner_dm';
  const takeover = opts.takeover ?? isDm;
  const cleanReason = reason.replace(/\s+/g, ' ').trim().slice(0, 200);
  const owner = await firstOwnerUid(ctx.account);
  let notified = false;
  if (owner !== null && !(isDm && owner === ctx.threadId)) {
    await enqueue({
      zaloAccountId: ctx.account,
      threadId: owner,
      threadType: 'user',
      kind: 'text',
      body: { text: HANDOFF_DM(cleanReason, ctx.threadId, ctx.requester?.displayName ?? null) },
    });
    notified = true;
  }
  if (takeover) {
    const minutes = readCommunityConfig().humanTakeoverMin;
    await sql(
      `update conversations set human_takeover_until = now() + make_interval(mins => $3)
        where zalo_account_id = $1 and thread_id = $2`,
      [ctx.account, ctx.threadId, minutes]
    );
  }
  await audit(sql, {
    actorType: 'agent',
    actorId: ctx.requester?.uid ?? null,
    action: 'handoff.owner',
    target: ctx.threadId,
    data: { reason: cleanReason, takeover, notified },
  });
  return { notified };
}

// node `group_event` (pipeline) — su kien nhom tu worker (SPEC-P05 §6–§7, 01-CONTRACTS §12.3): join ⇒ chao thanh vien (gom, timer
// `flushWelcomes`) · join_request ⇒ theo `join_policy` · leave/remove_member ⇒ danh dau roi nhom · add_admin/remove_admin/
// update_setting/update ⇒ xep hang `sync_group_info` (dong bo quan tri, khong trung). Nhom chua khai ⇒ audit `group.event_unknown_group`;
// nhom tat ⇒ `group.event_disabled`. Khong luot model, khong ghi noi dung. Hinh node/canh khong doi (BB-16).

import { sql } from '../../../../adapters/db.js';
import { audit } from '../../../../services/audit.js';
import { handleJoinRequestEvent } from '../../../../services/join-requests.js';
import { enqueueAction } from '../../../../services/outbox-actions.js';
import { recordMemberJoin, recordMemberLeave } from '../../../../services/welcome.js';
import { resolveBotUid } from '../../bot.js';
import { getGroup } from '../../buffer.js';
import type { NodeFn, PipelineStateT } from '../state.js';

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

async function syncOnce(account: 'community', threadId: string, inboundEventId: number): Promise<void> {
  const queued = await sql(
    `select 1 from outbox where zalo_account_id = $1 and thread_id = $2 and kind = 'action' and status = 'queued' and body->>'action' = 'sync_group_info' limit 1`,
    [account, threadId]
  );
  if (queued.length === 0) await enqueueAction({ account, threadId, action: 'sync_group_info', inboundEventId });
}

export const groupEventNode: NodeFn<PipelineStateT> = async (s) => {
  const e = s.event;
  const p = e.payload as { event?: unknown; uids?: unknown; names?: unknown };
  const event = typeof p.event === 'string' ? p.event : null;
  const group = await getGroup(e.zaloAccountId, e.threadId);
  const note = (action: string, data: Record<string, unknown> | null) =>
    audit(sql, { actorType: 'system', actorId: String(e.id), action, target: e.threadId, data });

  if (!group) {
    await note('group.event_unknown_group', { event });
    return { group, stop: 'group_event_done' };
  }
  if (!group.enabled) {
    await note('group.event_disabled', { event });
    return { group, stop: 'group_event_done' };
  }

  const uids = strings(p.uids);
  const names = strings(p.names);
  const now = new Date();
  switch (event) {
    case 'join': {
      const bot = resolveBotUid(process.env, e.zaloAccountId, e.threadId);
      const keep = uids.map((u, i) => ({ u, n: names[i] ?? '' })).filter((x) => x.u !== bot);
      const joined = await recordMemberJoin({ account: e.zaloAccountId, group, uids: keep.map((x) => x.u), names: keep.map((x) => x.n), now });
      await note('group.member_joined', { count: joined });
      break;
    }
    case 'join_request': {
      const r = await handleJoinRequestEvent({ account: e.zaloAccountId, group, uids, names, now, inboundEventId: e.id });
      await note('group.join_request', { policy: r.policy, count: r.handled });
      break;
    }
    case 'leave':
    case 'remove_member': {
      const n = await recordMemberLeave({ account: e.zaloAccountId, threadId: e.threadId, uids, now });
      await note('group.member_left', { count: n });
      break;
    }
    case 'add_admin':
    case 'remove_admin':
    case 'update_setting':
    case 'update': {
      await syncOnce(e.zaloAccountId, e.threadId, e.id);
      await note('group.sync_requested', { event });
      break;
    }
    default:
      await note('group.event_ignored', { event });
  }
  return { group, stop: 'group_event_done' };
};

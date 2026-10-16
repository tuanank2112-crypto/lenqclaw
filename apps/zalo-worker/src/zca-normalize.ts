// apps/zalo-worker/src/zca-normalize.ts — chuan hoa su kien zca-js ⇒ kieu cua
// worker (SPEC-P02 §2.2). Chi `import type` tu zca-js ⇒ test don vi khong nap
// zca-js, khong mang. Quy tac GHI/KHONG GHI nam o inbound.ts.

import type { GroupEvent } from 'zca-js';
import type { ZaloGroupEvent } from './client.js';

interface LooseGroupEventData {
  groupId?: unknown;
  groupName?: unknown;
  sourceId?: unknown;
  time?: unknown;
  uids?: unknown;
  updateMembers?: unknown;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/** `GroupEvent` (zca-js) ⇒ `ZaloGroupEvent`. `uids`: JOIN_REQUEST lay `data.uids`,
 * loai khac lay `data.updateMembers[].id`; `names` lay `.dName` (JOIN_REQUEST ⇒ []). */
export function normalizeGroupEvent(ev: GroupEvent, now: () => number = Date.now): ZaloGroupEvent {
  const data = ev.data as unknown as LooseGroupEventData;
  const type = String(ev.type);
  let uids: string[] = [];
  let names: string[] = [];
  if (type === 'join_request') {
    uids = strArray(data.uids);
  } else if (Array.isArray(data.updateMembers)) {
    const members = data.updateMembers as Array<{ id?: unknown; dName?: unknown }>;
    uids = members.map((m) => String(m.id ?? ''));
    names = members.map((m) => String(m.dName ?? ''));
  }
  const source = data.sourceId;
  const groupName = data.groupName;
  return {
    groupId: ev.threadId,
    event: type,
    uids,
    names,
    sourceUid: source === undefined || source === null || source === '' ? null : String(source),
    groupName: typeof groupName === 'string' && groupName.length > 0 ? groupName : null,
    time: String(data.time ?? now()),
    isSelf: ev.isSelf,
    raw: data as unknown as Record<string, unknown>,
  };
}

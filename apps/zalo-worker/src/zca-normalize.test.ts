// SPEC-P02 §2.2: GroupEvent (zca-js) ⇒ ZaloGroupEvent. Thuan, khong nap zca-js.
import { describe, expect, it } from 'vitest';
import type { GroupEvent } from 'zca-js';
import { normalizeGroupEvent } from './zca-normalize.js';

function ev(type: string, data: Record<string, unknown>, extra: Partial<{ threadId: string; isSelf: boolean }> = {}): GroupEvent {
  return { type, data, act: 'x', threadId: extra.threadId ?? 'g1', isSelf: extra.isSelf ?? false } as unknown as GroupEvent;
}

describe('normalizeGroupEvent', () => {
  it('JOIN: uids/names tu data.updateMembers[].id/dName, sourceId, groupName, time', () => {
    const n = normalizeGroupEvent(
      ev('join', {
        updateMembers: [
          { id: 'u1', dName: 'An' },
          { id: 'u2', dName: 'Bích' },
        ],
        sourceId: 'inviter',
        groupName: 'Nhóm AI',
        time: '1700000000999',
      })
    );
    expect(n).toMatchObject({
      groupId: 'g1',
      event: 'join',
      uids: ['u1', 'u2'],
      names: ['An', 'Bích'],
      sourceUid: 'inviter',
      groupName: 'Nhóm AI',
      time: '1700000000999',
      isSelf: false,
    });
  });
  it('JOIN_REQUEST: uids tu data.uids, names rong', () => {
    const n = normalizeGroupEvent(ev('join_request', { uids: ['u7', 'u8'], totalPending: 2, groupId: 'g1', time: '5' }));
    expect(n.event).toBe('join_request');
    expect(n.uids).toEqual(['u7', 'u8']);
    expect(n.names).toEqual([]);
    expect(n.sourceUid).toBeNull();
  });
  it('thieu data.time ⇒ dung dong ho truyen vao; sourceId rong ⇒ null', () => {
    const n = normalizeGroupEvent(ev('update_setting', { sourceId: '', groupName: '' }, { isSelf: true }), () => 1234);
    expect(n.time).toBe('1234');
    expect(n.sourceUid).toBeNull();
    expect(n.groupName).toBeNull();
    expect(n.isSelf).toBe(true);
    expect(n.uids).toEqual([]);
  });
});

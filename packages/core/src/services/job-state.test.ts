import { describe, expect, it, vi } from 'vitest';
import type { SqlFn } from '../adapters/db.js';
import { IllegalTransitionError } from '../domain/errors.js';
import type { JobStatus } from '../domain/types.js';
import { TRANSITIONS, transitionJob } from './job-state.js';

const EXPECTED_PAIRS: Array<[JobStatus, JobStatus]> = [
  ['drafting', 'routed_bql'],
  ['drafting', 'awaiting_consent'],
  ['awaiting_consent', 'case_open'],
  ['awaiting_consent', 'cancelled'],
  ['case_open', 'published'],
  ['published', 'held'],
  ['held', 'confirmed'],
  ['held', 'published'],
  ['confirmed', 'access_pending'],
  ['access_pending', 'access_granted'],
  ['access_pending', 'published'],
  ['access_granted', 'dispatched'],
  ['published', 'unassigned'],
  ['dispatched', 'in_progress'],
  ['in_progress', 'awaiting_acceptance'],
  ['awaiting_acceptance', 'accepted'],
  ['awaiting_acceptance', 'disputed'],
  ['accepted', 'closed'],
];

const STATES_BEFORE_IN_PROGRESS: JobStatus[] = [
  'drafting',
  'routed_bql',
  'awaiting_consent',
  'case_open',
  'published',
  'held',
  'confirmed',
  'access_pending',
  'access_granted',
  'dispatched',
];

describe('TRANSITIONS (01-CONTRACTS.md §5)', () => {
  it('co du moi dong da chot', () => {
    for (const [from, to] of EXPECTED_PAIRS) {
      expect(TRANSITIONS.some((t) => t.from === from && t.to === to)).toBe(true);
    }
  });

  it('moi trang thai truoc in_progress deu co duong -> cancelled', () => {
    for (const from of STATES_BEFORE_IN_PROGRESS) {
      expect(TRANSITIONS.some((t) => t.from === from && t.to === 'cancelled')).toBe(true);
    }
  });

  it('cap ngoai bang => IllegalTransitionError, khong cham DB', async () => {
    const q = vi.fn() as unknown as SqlFn;
    await expect(
      transitionJob(q, { jobId: 'job-1', from: 'drafting', to: 'closed', actorType: 'system', actorId: null })
    ).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(q).not.toHaveBeenCalled();
  });
});

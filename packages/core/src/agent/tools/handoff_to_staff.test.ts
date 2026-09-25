// packages/core/src/agent/tools/handoff_to_staff.test.ts — test THUAN
// (khong DB) cho `humanTakeoverMinutes` (SPEC-P03-Resident-Agent.md §11.6,
// N3): env `HUMAN_TAKEOVER_MIN`, mac dinh 60 phut.

import { afterEach, describe, expect, it } from 'vitest';
import { humanTakeoverMinutes } from './handoff_to_staff.js';

const ORIGINAL = process.env.HUMAN_TAKEOVER_MIN;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.HUMAN_TAKEOVER_MIN;
  else process.env.HUMAN_TAKEOVER_MIN = ORIGINAL;
});

describe('humanTakeoverMinutes (SPEC-P03 §11.6 N3)', () => {
  it('env rong/khong dat => mac dinh 60', () => {
    delete process.env.HUMAN_TAKEOVER_MIN;
    expect(humanTakeoverMinutes()).toBe(60);
  });

  it('env hop le => dung gia tri env', () => {
    process.env.HUMAN_TAKEOVER_MIN = '90';
    expect(humanTakeoverMinutes()).toBe(90);
  });

  it('env khong phai so => mac dinh 60', () => {
    process.env.HUMAN_TAKEOVER_MIN = 'abc';
    expect(humanTakeoverMinutes()).toBe(60);
  });

  it('env <= 0 => mac dinh 60', () => {
    process.env.HUMAN_TAKEOVER_MIN = '0';
    expect(humanTakeoverMinutes()).toBe(60);
    process.env.HUMAN_TAKEOVER_MIN = '-5';
    expect(humanTakeoverMinutes()).toBe(60);
  });
});

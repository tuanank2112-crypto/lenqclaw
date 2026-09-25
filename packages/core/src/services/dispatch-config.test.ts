// packages/core/src/services/dispatch-config.test.ts — SPEC-P05-Dispatch.md
// §10.2.3: mac dinh dung khi env rong; so khong hop le => ConfigError.

import { describe, expect, it } from 'vitest';
import { ConfigError, readDispatchConfig } from './dispatch-config.js';

describe('readDispatchConfig', () => {
  it('mac dinh dung bang §10.2.3 khi env rong', () => {
    const cfg = readDispatchConfig({});
    expect(cfg.holdMinutes).toBe(10);
    expect(cfg.dispatchTimeoutMin).toBe(45);
    expect(cfg.accessRemindMin).toBe(30);
    expect(cfg.quoteOverBandPct).toBe(30);
    expect(cfg.maxHoldRepublish).toBe(2);
    expect(cfg.noShowBlockThreshold).toBe(3);
    expect(cfg.noShowWindowDays).toBe(30);
    expect(cfg.noShowBlockDays).toBe(7);
    expect(cfg.accessPassBeforeMin).toBe(30);
    expect(cfg.accessPassAfterMin).toBe(120);
    expect(cfg.timerIntervalMs).toBe(10000);
    expect(cfg.vendorIntentMin).toBeCloseTo(0.6);
    expect(cfg.freeTrialDays).toBe(30);
    expect(cfg.slotFeeMonthly).toBe(300000);
    expect(cfg.slotMinJobsPerVendor).toBe(8);
    expect(cfg.bqlSharePct).toBe(10);
    expect(cfg.slotPeriodDays).toBe(30);
    expect(cfg.slotRemindDays).toBe(3);
    expect(cfg.waitlistInviteHours).toBe(48);
  });

  it('doc gia tri tu env khi co', () => {
    const cfg = readDispatchConfig({ HOLD_MINUTES: '15', DISPATCH_TIMEOUT_MIN: '60' });
    expect(cfg.holdMinutes).toBe(15);
    expect(cfg.dispatchTimeoutMin).toBe(60);
  });

  it('so khong hop le => ConfigError', () => {
    expect(() => readDispatchConfig({ HOLD_MINUTES: 'abc' })).toThrow(ConfigError);
  });
});

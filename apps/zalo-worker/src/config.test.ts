// SPEC-P02 §5 (PACER_* mac dinh = bang), §9.1 (ZALO_ACCOUNTS=bql).
import { describe, expect, it } from 'vitest';
import { ConfigError, PACER_DEFAULTS, readAccounts, readPacerConfig } from './config.js';

describe('readPacerConfig', () => {
  it('mac dinh = bang §5', () => {
    const c = readPacerConfig({});
    expect(c).toEqual(PACER_DEFAULTS);
    expect(c.threadGapMs).toBe(3000);
    expect(c.threadJitterMs).toBe(2000);
    expect(c.maxPerMinute).toBe(10);
    expect(c.maxRecipients).toBe(15);
    expect(c.recipientWindowMs).toBe(600_000);
    expect(c.maxChars).toBe(1800);
    expect([c.typingMinMs, c.typingMaxMs]).toEqual([1000, 3000]);
    expect([c.seenMinMs, c.seenMaxMs]).toEqual([2000, 6000]);
    expect(c.backoffMs).toBe(1_800_000);
    expect(c.tickMs).toBe(1000);
  });
  it('env ghi de', () => {
    expect(readPacerConfig({ PACER_MAX_PER_MINUTE: '5', PACER_THREAD_GAP_MS: '4000' })).toMatchObject({
      maxPerMinute: 5,
      threadGapMs: 4000,
    });
  });
  it('gia tri sai ⇒ ConfigError', () => {
    expect(() => readPacerConfig({ PACER_MAX_PER_MINUTE: 'abc' })).toThrow(ConfigError);
    expect(() => readPacerConfig({ PACER_MAX_PER_MINUTE: '0' })).toThrow(ConfigError);
    expect(() => readPacerConfig({ PACER_THREAD_GAP_MS: '-1' })).toThrow(ConfigError);
  });
});

describe('readAccounts', () => {
  it('mac dinh bql', () => {
    expect(readAccounts({})).toEqual(['bql']);
    expect(readAccounts({ ZALO_ACCOUNTS: ' bql , bql ' })).toEqual(['bql']);
  });
  it('market bi CAM o giai doan 1 (§9.6); ten la ⇒ loi', () => {
    expect(() => readAccounts({ ZALO_ACCOUNTS: 'bql,market' })).toThrow(ConfigError);
    expect(() => readAccounts({ ZALO_ACCOUNTS: 'abc' })).toThrow(ConfigError);
  });
});

// SPEC-P02 §5 (PACER_* mac dinh = bang), §9.1 (ZALO_ACCOUNTS=community).
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
  it('mac dinh community', () => {
    expect(readAccounts({})).toEqual(['community']);
    expect(readAccounts({ ZALO_ACCOUNTS: ' community , community ' })).toEqual(['community']);
  });
  it('ten khac community (ke ca danh sach nhieu tai khoan) ⇒ loi', () => {
    expect(() => readAccounts({ ZALO_ACCOUNTS: 'community,other' })).toThrow(ConfigError);
    expect(() => readAccounts({ ZALO_ACCOUNTS: 'abc' })).toThrow(ConfigError);
  });
});

describe('readPacerConfig — nhom (ke hoach 02, 01-CONTRACTS §10)', () => {
  it('mac dinh nhom: gap 8000, jitter 3000, TTL 30 phut, 3 action/tick', () => {
    const c = readPacerConfig({});
    expect([c.groupGapMs, c.groupJitterMs, c.groupTextTtlMin, c.actionsPerTick]).toEqual([8000, 3000, 30, 3]);
  });
  it('env PACER_GROUP_GAP_MS / PACER_GROUP_JITTER_MS / GROUP_TEXT_TTL_MIN / PACER_ACTIONS_PER_TICK ghi de; 0 action/tick ⇒ loi', () => {
    expect(
      readPacerConfig({ PACER_GROUP_GAP_MS: '9000', PACER_GROUP_JITTER_MS: '1000', GROUP_TEXT_TTL_MIN: '10', PACER_ACTIONS_PER_TICK: '5' })
    ).toMatchObject({ groupGapMs: 9000, groupJitterMs: 1000, groupTextTtlMin: 10, actionsPerTick: 5 });
    expect(() => readPacerConfig({ PACER_ACTIONS_PER_TICK: '0' })).toThrow(ConfigError);
  });
});

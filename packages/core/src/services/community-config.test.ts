// community-config.ts — mac dinh = bang 01-CONTRACTS §10; so sai => ConfigError.
import { describe, expect, it } from 'vitest';
import { ConfigError } from '../domain/errors.js';
import { readCommunityConfig } from './community-config.js';

describe('readCommunityConfig', () => {
  it('env rong => mac dinh dung bang §10', () => {
    const c = readCommunityConfig({});
    expect(c.zaloAccounts).toEqual(['community']);
    expect(c.groupBufferMax).toBe(200);
    expect(c.groupBufferRetentionDays).toBe(7);
    expect(c.ambientDebounceSec).toBe(20);
    expect(c.ambientContextMessages).toBe(40);
    expect(c.mentionContextMessages).toBe(25);
    expect(c.pacerMaxPerMinute).toBe(10);
    expect(c.pacerMaxChars).toBe(1800);
    expect(c.pacerGroupGapMs).toBe(8000);
    expect(c.dmHistoryTurns).toBe(5);
    expect(c.messagesRetentionDays).toBe(30);
    expect(c.timerIntervalMs).toBe(10000);
    expect(c.modScamMin).toBe(0.85);
    expect(c.embedDim).toBe(1024);
    expect(c.embedModel).toBe('gemini-embedding-001');
    expect(c.dataMode).toBe('sim');
    expect(c.transport).toBe('sim');
  });

  it('env hop le ghi de mac dinh', () => {
    const c = readCommunityConfig({
      GROUP_BUFFER_MAX: '50',
      MOD_SPAM_MIN: '0.9',
      DM_HISTORY_TURNS: '8',
      TRANSPORT: 'zalo',
    });
    expect(c.groupBufferMax).toBe(50);
    expect(c.modSpamMin).toBe(0.9);
    expect(c.dmHistoryTurns).toBe(8);
    expect(c.transport).toBe('zalo');
  });

  it('so khong hop le / ngoai khoang => ConfigError', () => {
    expect(() => readCommunityConfig({ GROUP_BUFFER_MAX: 'abc' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ DM_HISTORY_TURNS: '0' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ DM_HISTORY_TURNS: '21' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ MESSAGES_RETENTION_DAYS: '0' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ PACER_MAX_CHARS: '2000' })).toThrow(ConfigError);
  });

  it('ZALO_ACCOUNTS khac community / TRANSPORT la => ConfigError', () => {
    expect(() => readCommunityConfig({ ZALO_ACCOUNTS: 'community,other' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ ZALO_ACCOUNTS: 'other' })).toThrow(ConfigError);
    expect(readCommunityConfig({ ZALO_ACCOUNTS: ' community ' }).zaloAccounts).toEqual(['community']);
    expect(() => readCommunityConfig({ TRANSPORT: 'telegram' })).toThrow(ConfigError);
  });
});

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

  // SPEC-P03 §11 hang 11 (D28, BB-17)
  it('LANGSMITH_TRACING / LANGCHAIN_TRACING_V2 bat => ConfigError; khong dat / false => ok', () => {
    expect(() => readCommunityConfig({ LANGSMITH_TRACING: 'true' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ LANGSMITH_TRACING: 'TRUE' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ LANGCHAIN_TRACING_V2: '1' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ LANGCHAIN_TRACING_V2: 'true' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({})).not.toThrow();
    expect(() => readCommunityConfig({ LANGSMITH_TRACING: 'false', LANGCHAIN_TRACING_V2: '0' })).not.toThrow();
  });

  it('MAX_TOOL_ROUNDS: mac dinh 8, 0 va 21 => ConfigError, 20 ok', () => {
    expect(readCommunityConfig({}).maxToolRounds).toBe(8);
    expect(() => readCommunityConfig({ MAX_TOOL_ROUNDS: '0' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ MAX_TOOL_ROUNDS: '21' })).toThrow(ConfigError);
    expect(readCommunityConfig({ MAX_TOOL_ROUNDS: '20' }).maxToolRounds).toBe(20);
  });

  // D31 (01-CONTRACTS §10)
  it('D31: mac dinh dung bang §10', () => {
    const c = readCommunityConfig({});
    expect(c.laneFastDeadlineMs).toBe(3500);
    expect(c.laneRagDeadlineMs).toBe(12500);
    expect(c.turnBackgroundDeadlineMs).toBe(30000);
    expect(c.modelMaxOutputTokens).toBe(1024);
    expect(c.modelCallTimeoutMs).toBe(30000);
    expect(c.modelMinAttemptMs).toBe(800);
    expect(c.toolMinMs).toBe(300);
    expect(c.embedTimeoutMs).toBe(1500);
    expect(c.runnerConcurrency).toBe(4);
    expect(c.runnerPollMs).toBe(200);
    expect(c.runnerDrainMs).toBe(30000);
    expect(c.modelCommunityFast).toBe('');
    expect(c.heartbeatIntervalMs).toBe(5000);
    expect(c.heartbeatStaleMs).toBe(60000);
    expect(c.turnStuckMs).toBe(120000);
  });

  it('D32: bao dong / giam sat / giu du lieu — mac dinh dung 01-CONTRACTS §10, sai ⇒ ConfigError', () => {
    const c = readCommunityConfig({});
    expect([c.alertRepeatMin, c.alertMaxPerHour, c.alertTimeoutMs, c.alertModelErrors]).toEqual([30, 20, 5000, 5]);
    expect([c.opsWatchIntervalMs, c.traceRetentionDays, c.auditRetentionDays]).toEqual([60000, 180, 365]);
    expect(readCommunityConfig({ ALERT_REPEAT_MIN: '10', TRACE_RETENTION_DAYS: '90' })).toMatchObject({ alertRepeatMin: 10, traceRetentionDays: 90 });
    expect(() => readCommunityConfig({ ALERT_REPEAT_MIN: '0' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ TRACE_RETENTION_DAYS: '0' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ OPS_WATCH_INTERVAL_MS: 'x' })).toThrow(ConfigError);
  });

  it('D31: ngoai khoang / fast >= rag / stale < 3 x interval => ConfigError', () => {
    expect(() => readCommunityConfig({ LANE_FAST_DEADLINE_MS: '4600' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ LANE_FAST_DEADLINE_MS: '900' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ LANE_RAG_DEADLINE_MS: '14600' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ LANE_FAST_DEADLINE_MS: '4500', LANE_RAG_DEADLINE_MS: '5000' })).not.toThrow();
    expect(() => readCommunityConfig({ RUNNER_CONCURRENCY: '9' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ RUNNER_CONCURRENCY: '0' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ MODEL_MAX_OUTPUT_TOKENS: '255' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ MODEL_MIN_ATTEMPT_MS: '100' })).toThrow(ConfigError);
    expect(() => readCommunityConfig({ HEARTBEAT_INTERVAL_MS: '20000', HEARTBEAT_STALE_MS: '30000' })).toThrow(ConfigError);
    expect(readCommunityConfig({ MODEL_COMMUNITY_FAST: ' gemini-x ' }).modelCommunityFast).toBe('gemini-x');
  });
});


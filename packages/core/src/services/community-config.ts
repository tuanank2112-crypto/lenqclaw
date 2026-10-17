// packages/core/src/services/community-config.ts — cau hinh agent cong dong
// (01-CONTRACTS §10). Ham thuan: `readCommunityConfig(env)`; so khong hop le
// ⇒ `ConfigError` (tien trinh exit 1 khi khoi dong). Moi so la env/cot DB,
// KHONG sua ma de doi (D09, D15, D17, D22).

import { ConfigError } from '../domain/errors.js';

export interface CommunityConfig {
  zaloAccounts: ['community'];
  modelCommunity: string;
  modelTriage: string;
  embedProvider: string;
  embedModel: string;
  embedDim: number;
  groupBufferMax: number;
  groupBufferRetentionDays: number;
  ambientDebounceSec: number;
  ambientContextMessages: number;
  mentionContextMessages: number;
  unansweredAfterMin: number;
  unansweredMaxAgeHours: number;
  unansweredMaxPerTick: number;
  welcomeDebounceSec: number;
  welcomeWindowMin: number;
  modScamMin: number;
  modSpamMin: number;
  modLadderHalfLifeHours: number;
  modWarnPerHour: number;
  approvalTtlHours: number;
  joinRequestTtlHours: number;
  pacerGroupGapMs: number;
  pacerGroupJitterMs: number;
  groupTextTtlMin: number;
  pacerMaxPerMinute: number;
  pacerMaxChars: number;
  timerIntervalMs: number;
  dailyReportHour: number;
  weeklySummaryDow: number;
  weeklySummaryHour: number;
  kbTopK: number;
  memoryHalfLifeDays: number;
  leadScoreHandoff: number;
  maxToolRounds: number;
  dmHistoryTurns: number;
  messagesRetentionDays: number;
  humanTakeoverMin: number;
  triageTimeoutMs: number;
  dataMode: string;
  transport: 'sim' | 'zalo';
  // D31 (BB-18/BB-19): toc do, han chot, runner song song
  modelCommunityFast: string;
  modelMaxOutputTokens: number;
  modelCallTimeoutMs: number;
  modelMinAttemptMs: number;
  laneFastDeadlineMs: number;
  laneRagDeadlineMs: number;
  turnBackgroundDeadlineMs: number;
  toolMinMs: number;
  embedTimeoutMs: number;
  runnerConcurrency: number;
  runnerPollMs: number;
  runnerDrainMs: number;
  // D32: dau song tien trinh
  heartbeatIntervalMs: number;
  heartbeatStaleMs: number;
  turnStuckMs: number;
  // D32: bao dong Telegram + giam sat + giu du lieu van hanh
  alertRepeatMin: number;
  alertMaxPerHour: number;
  alertTimeoutMs: number;
  alertModelErrors: number;
  opsWatchIntervalMs: number;
  traceRetentionDays: number;
  auditRetentionDays: number;
}

function readNumber(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min = 0,
  max = Number.POSITIVE_INFINITY
): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new ConfigError(`${key}="${raw}" khong phai so hop le.`);
  if (n < min || n > max) {
    const hi = Number.isFinite(max) ? `..${max}` : '+';
    throw new ConfigError(`${key}=${n} ngoai khoang cho phep (${min}${hi}).`);
  }
  return n;
}

function readString(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const raw = env[key]?.trim();
  return raw ? raw : fallback;
}

export function readCommunityConfig(env: NodeJS.ProcessEnv = process.env): CommunityConfig {
  const accounts = readString(env, 'ZALO_ACCOUNTS', 'community');
  const list = [...new Set(accounts.split(',').map((s) => s.trim()).filter(Boolean))];
  if (list.length !== 1 || list[0] !== 'community') {
    throw new ConfigError(`ZALO_ACCOUNTS="${accounts}" khong hop le (chi nhan "community").`);
  }
  const transport = readString(env, 'TRANSPORT', 'sim');
  if (transport !== 'sim' && transport !== 'zalo') {
    throw new ConfigError(`TRANSPORT="${transport}" khong hop le (chi "sim" hoac "zalo").`);
  }
  // BB-17 / D28: thu vien LangGraph/LangSmith TU goi mang khi bat tracing (do duoc o
  // spike) => bat la loi cau hinh, tien trinh khong khoi dong.
  for (const key of ['LANGSMITH_TRACING', 'LANGCHAIN_TRACING_V2']) {
    const v = env[key]?.trim().toLowerCase();
    if (v === 'true' || v === '1') {
      throw new ConfigError(`${key} khong duoc bat (BB-17: khong LangSmith/LangGraph Platform).`);
    }
  }
  const laneFastDeadlineMs = readNumber(env, 'LANE_FAST_DEADLINE_MS', 3500, 1000, 4500);
  const laneRagDeadlineMs = readNumber(env, 'LANE_RAG_DEADLINE_MS', 12500, 5000, 14500);
  if (laneFastDeadlineMs >= laneRagDeadlineMs) {
    throw new ConfigError(`LANE_FAST_DEADLINE_MS (${laneFastDeadlineMs}) phai nho hon LANE_RAG_DEADLINE_MS (${laneRagDeadlineMs}).`);
  }
  const heartbeatIntervalMs = readNumber(env, 'HEARTBEAT_INTERVAL_MS', 5000, 1000, 60000);
  const heartbeatStaleMs = readNumber(env, 'HEARTBEAT_STALE_MS', 60000, 1000);
  if (heartbeatStaleMs < 3 * heartbeatIntervalMs) {
    throw new ConfigError(`HEARTBEAT_STALE_MS (${heartbeatStaleMs}) phai >= 3 x HEARTBEAT_INTERVAL_MS (${heartbeatIntervalMs}).`);
  }
  return {
    zaloAccounts: ['community'],
    modelCommunity: readString(env, 'MODEL_COMMUNITY', ''),
    modelTriage: readString(env, 'MODEL_TRIAGE', ''),
    embedProvider: readString(env, 'EMBED_PROVIDER', 'gemini'),
    embedModel: readString(env, 'EMBED_MODEL', 'gemini-embedding-001'),
    embedDim: readNumber(env, 'EMBED_DIM', 1024, 1),
    groupBufferMax: readNumber(env, 'GROUP_BUFFER_MAX', 200, 1),
    groupBufferRetentionDays: readNumber(env, 'GROUP_BUFFER_RETENTION_DAYS', 7, 1),
    ambientDebounceSec: readNumber(env, 'AMBIENT_DEBOUNCE_SEC', 20),
    ambientContextMessages: readNumber(env, 'AMBIENT_CONTEXT_MESSAGES', 40, 1),
    mentionContextMessages: readNumber(env, 'MENTION_CONTEXT_MESSAGES', 25, 1),
    unansweredAfterMin: readNumber(env, 'UNANSWERED_AFTER_MIN', 10),
    unansweredMaxAgeHours: readNumber(env, 'UNANSWERED_MAX_AGE_HOURS', 6),
    unansweredMaxPerTick: readNumber(env, 'UNANSWERED_MAX_PER_TICK', 3),
    welcomeDebounceSec: readNumber(env, 'WELCOME_DEBOUNCE_SEC', 120),
    welcomeWindowMin: readNumber(env, 'WELCOME_WINDOW_MIN', 15),
    modScamMin: readNumber(env, 'MOD_SCAM_MIN', 0.85, 0, 1),
    modSpamMin: readNumber(env, 'MOD_SPAM_MIN', 0.75, 0, 1),
    modLadderHalfLifeHours: readNumber(env, 'MOD_LADDER_HALF_LIFE_HOURS', 168, 1),
    modWarnPerHour: readNumber(env, 'MOD_WARN_PER_HOUR', 10),
    approvalTtlHours: readNumber(env, 'APPROVAL_TTL_HOURS', 24, 1),
    joinRequestTtlHours: readNumber(env, 'JOIN_REQUEST_TTL_HOURS', 48, 1),
    pacerGroupGapMs: readNumber(env, 'PACER_GROUP_GAP_MS', 8000),
    pacerGroupJitterMs: readNumber(env, 'PACER_GROUP_JITTER_MS', 3000),
    groupTextTtlMin: readNumber(env, 'GROUP_TEXT_TTL_MIN', 30, 1),
    pacerMaxPerMinute: readNumber(env, 'PACER_MAX_PER_MINUTE', 10, 1),
    pacerMaxChars: readNumber(env, 'PACER_MAX_CHARS', 1800, 1, 1999),
    timerIntervalMs: readNumber(env, 'TIMER_INTERVAL_MS', 10000, 1),
    dailyReportHour: readNumber(env, 'DAILY_REPORT_HOUR', 20, 0, 23),
    weeklySummaryDow: readNumber(env, 'WEEKLY_SUMMARY_DOW', 0, 0, 6),
    weeklySummaryHour: readNumber(env, 'WEEKLY_SUMMARY_HOUR', 19, 0, 23),
    kbTopK: readNumber(env, 'KB_TOP_K', 8, 1),
    memoryHalfLifeDays: readNumber(env, 'MEMORY_HALF_LIFE_DAYS', 30, 1),
    leadScoreHandoff: readNumber(env, 'LEAD_SCORE_HANDOFF', 60, 0, 100),
    maxToolRounds: readNumber(env, 'MAX_TOOL_ROUNDS', 8, 1, 20),
    dmHistoryTurns: readNumber(env, 'DM_HISTORY_TURNS', 5, 1, 20),
    messagesRetentionDays: readNumber(env, 'MESSAGES_RETENTION_DAYS', 30, 1),
    humanTakeoverMin: readNumber(env, 'HUMAN_TAKEOVER_MIN', 60),
    triageTimeoutMs: readNumber(env, 'TRIAGE_TIMEOUT_MS', 4000, 1),
    dataMode: readString(env, 'DATA_MODE', 'sim'),
    transport,
    modelCommunityFast: readString(env, 'MODEL_COMMUNITY_FAST', ''),
    modelMaxOutputTokens: readNumber(env, 'MODEL_MAX_OUTPUT_TOKENS', 1024, 256, 16000),
    modelCallTimeoutMs: readNumber(env, 'MODEL_CALL_TIMEOUT_MS', 30000, 1000, 120000),
    modelMinAttemptMs: readNumber(env, 'MODEL_MIN_ATTEMPT_MS', 800, 200, 5000),
    laneFastDeadlineMs,
    laneRagDeadlineMs,
    turnBackgroundDeadlineMs: readNumber(env, 'TURN_BACKGROUND_DEADLINE_MS', 30000, 10000, 120000),
    toolMinMs: readNumber(env, 'TOOL_MIN_MS', 300, 0, 5000),
    embedTimeoutMs: readNumber(env, 'EMBED_TIMEOUT_MS', 1500, 200, 10000),
    runnerConcurrency: readNumber(env, 'RUNNER_CONCURRENCY', 4, 1, 8),
    runnerPollMs: readNumber(env, 'RUNNER_POLL_MS', 200, 50, 5000),
    runnerDrainMs: readNumber(env, 'RUNNER_DRAIN_MS', 30000, 0, 120000),
    heartbeatIntervalMs,
    heartbeatStaleMs,
    turnStuckMs: readNumber(env, 'TURN_STUCK_MS', 120000, 10000),
    alertRepeatMin: readNumber(env, 'ALERT_REPEAT_MIN', 30, 1, 1440),
    alertMaxPerHour: readNumber(env, 'ALERT_MAX_PER_HOUR', 20, 1, 200),
    alertTimeoutMs: readNumber(env, 'ALERT_TIMEOUT_MS', 5000, 500, 30000),
    alertModelErrors: readNumber(env, 'ALERT_MODEL_ERRORS', 5, 1, 1000),
    opsWatchIntervalMs: readNumber(env, 'OPS_WATCH_INTERVAL_MS', 60000, 1000),
    traceRetentionDays: readNumber(env, 'TRACE_RETENTION_DAYS', 180, 1),
    auditRetentionDays: readNumber(env, 'AUDIT_RETENTION_DAYS', 365, 1),
  };
}

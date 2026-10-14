// apps/zalo-worker/src/pacer.ts — outbox pacer cua MOT tai khoan (SPEC-P02
// §5, §9.3). Chay moi `tickMs`; moi tick gui toi da MOT tin text (sau "dang
// go"), cong them cac su kien "da xem"/"dang go" da den han. Khong co phien
// (kicked/dead/logged_out) ⇒ khong gui gi, tin giu `queued` (TransportDeadError).

import type { AccountId, PacerConfig } from './config.js';
import { ZaloRateLimitError, type SeenParams, type ZaloSessionLike } from './client.js';
import { PacerPolicy, pickNext, splitText, typingDelayMs } from './pacer-policy.js';
import { errSummary, logEvent } from './log.js';
import * as store from './store.js';

/** Loi khong phai gioi han: thu lai sau 30 s, qua 5 lan ⇒ failed. */
export const RETRY_DELAY_MS = 30_000;
export const MAX_ATTEMPTS = 5;

export interface PacerDeps {
  now?: () => number;
  rng?: () => number;
}

export interface TickResult {
  sentText: number;
  sentEvents: number;
  cancelled: number;
  note?: string;
}

export class AccountPacer {
  readonly policy: PacerPolicy;
  private pending: { rowId: number; readyAt: number } | null = null;
  private readonly now: () => number;

  constructor(
    private readonly account: AccountId,
    private readonly cfg: PacerConfig,
    private readonly getSession: () => ZaloSessionLike | null,
    deps: PacerDeps = {}
  ) {
    this.now = deps.now ?? Date.now;
    this.policy = new PacerPolicy(cfg, deps.rng ?? Math.random);
  }

  /** Nap lich su gui gan day (khoi dong lai khong vuot gioi han). */
  async init(): Promise<void> {
    const windowMs = Math.max(this.cfg.recipientWindowMs, 60_000);
    this.policy.seedHistory(await store.recentSent(this.account, windowMs));
  }

  async tick(): Promise<TickResult> {
    const result: TickResult = { sentText: 0, sentEvents: 0, cancelled: 0 };
    const session = this.getSession();
    if (!session) return { ...result, note: 'no_session' };
    const now = this.now();
    if (this.policy.isBackingOff(now)) return { ...result, note: 'backoff' };

    const rows = await store.fetchDue(this.account);
    const texts: store.OutboxRow[] = [];
    for (const row of rows) {
      if (row.thread_type === 'group') {
        await store.cancelRow(row.id, 'group_forbidden_phase1');
        result.cancelled++;
        continue;
      }
      if (row.staff_takeover) {
        await store.cancelRow(row.id, 'staff_takeover');
        result.cancelled++;
        continue;
      }
      if (row.kind === 'seen' || row.kind === 'typing') {
        if (await this.sendEvent(session, row)) result.sentEvents++;
        if (this.policy.isBackingOff(this.now())) return { ...result, note: 'backoff' };
        continue;
      }
      if (row.kind === 'image') {
        await store.markFailed(row.id, 'image_unsupported_phase1');
        continue;
      }
      const text = typeof row.body.text === 'string' ? row.body.text : '';
      if (Array.from(text).length > this.cfg.maxChars) {
        await store.splitRow(row, splitText(text, this.cfg.maxChars), this.account);
        return { ...result, note: 'split' }; // doc lai hang doi o tick sau
      }
      texts.push(row);
    }

    if (this.pending) {
      const row = texts.find((r) => r.id === this.pending!.rowId);
      if (!row) {
        this.pending = null;
      } else {
        if (now < this.pending.readyAt) return { ...result, note: 'typing' };
        if (!this.policy.check(now, row.thread_id).ok) return { ...result, note: 'blocked' };
        this.pending = null;
        if (await this.sendText(session, row)) result.sentText++;
        return result;
      }
    }

    const picked = pickNext(
      now,
      texts.map((r) => ({ id: r.id, threadId: r.thread_id })),
      this.policy
    );
    if (!picked) return { ...result, note: texts.length > 0 ? 'blocked' : 'idle' };
    const row = texts.find((r) => r.id === picked.id)!;
    const text = String(row.body.text ?? '');
    const delay = typingDelayMs(Array.from(text).length, this.cfg);
    try {
      await session.sendTyping(row.thread_id, row.thread_type);
    } catch (err) {
      if (err instanceof ZaloRateLimitError) {
        await this.enterBackoff('typing');
        return { ...result, note: 'backoff' };
      }
      logEvent('pacer.typing_error', { account: this.account, outbox_id: row.id, error: errSummary(err) });
    }
    if (delay > 0) {
      this.pending = { rowId: row.id, readyAt: now + delay };
      return { ...result, note: 'typing' };
    }
    if (await this.sendText(session, row)) result.sentText++;
    return result;
  }

  private async enterBackoff(reason: string): Promise<void> {
    this.policy.backoff(this.now());
    this.pending = null;
    await store.alert(this.account, 'rate_limited', { reason, until: new Date(this.policy.backoffUntilMs()).toISOString() });
    logEvent('pacer.backoff', { account: this.account, reason, backoff_ms: this.cfg.backoffMs });
  }

  private async sendEvent(session: ZaloSessionLike, row: store.OutboxRow): Promise<boolean> {
    if (!(await store.markSending(row.id))) return false;
    try {
      if (row.kind === 'seen') {
        await session.sendSeen(row.thread_type, row.body.seen as SeenParams);
      } else {
        await session.sendTyping(row.thread_id, row.thread_type);
      }
      await store.markSent(row.id, null);
      return true;
    } catch (err) {
      if (err instanceof ZaloRateLimitError) {
        await store.requeue(row.id, new Date(this.now()));
        await this.enterBackoff(row.kind);
        return false;
      }
      await store.markFailed(row.id, errSummary(err));
      return false;
    }
  }

  private async sendText(session: ZaloSessionLike, row: store.OutboxRow): Promise<boolean> {
    if (!(await store.markSending(row.id))) return false;
    const now = this.now();
    try {
      const { msgId } = await session.sendText(row.thread_id, row.thread_type, String(row.body.text ?? ''));
      if (!msgId) {
        // Khong tra msgId = dau hieu bi gioi han (G04) ⇒ giu queued + lui 30 phut.
        await store.requeue(row.id, new Date(now));
        await this.enterBackoff('no_msg_id');
        return false;
      }
      await store.markSent(row.id, msgId);
      this.policy.record(now, row.thread_id);
      logEvent('pacer.sent', { account: this.account, outbox_id: row.id });
      return true;
    } catch (err) {
      if (err instanceof ZaloRateLimitError) {
        await store.requeue(row.id, new Date(now));
        await this.enterBackoff('rate_limit_error');
        return false;
      }
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        await store.markFailed(row.id, errSummary(err));
      } else {
        await store.requeue(row.id, new Date(now + RETRY_DELAY_MS));
      }
      logEvent('pacer.send_error', { account: this.account, outbox_id: row.id, error: errSummary(err) });
      return false;
    }
  }
}

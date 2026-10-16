// apps/zalo-worker/src/pacer.ts — outbox pacer cua MOT tai khoan (SPEC-P02
// ke hoach 02 §4–§5, BB-08). Chay moi `tickMs`. Thu tu trong mot tick (01-CONTRACTS §8.3):
// (1) toi da `actionsPerTick` hang `action`/`react` den han, tuan tu · (2) toi da MOT `text`
// theo pacer (sau "dang go"; nhom co them ngan sach gio) · (3) su kien "da xem"/"dang go".
// Khong co phien (kicked/dead/logged_out) ⇒ khong gui gi, tin giu `queued`.

import type { AccountId, PacerConfig } from './config.js';
import {
  ZaloActionError,
  ZaloRateLimitError,
  type OutboundQuote,
  type OutboundText,
  type SeenParams,
  type ZaloSessionLike,
} from './client.js';
import { executeAction, InvalidActionError, type ActionOutcome } from './actions.js';
import { PacerPolicy, pickNext, splitText, typingDelayMs } from './pacer-policy.js';
import { errSummary, logEvent } from './log.js';
import * as store from './store.js';

/** Loi khong phai gioi han: thu lai sau 30 s, qua 5 lan ⇒ failed. */
export const RETRY_DELAY_MS = 30_000;
export const MAX_ATTEMPTS = 5;
/** Cache `zalo_groups.budget_per_hour` 60 s (01-CONTRACTS §8.4). */
export const BUDGET_CACHE_MS = 60_000;

export interface PacerDeps {
  now?: () => number;
  rng?: () => number;
}

export interface TickResult {
  sentText: number;
  sentEvents: number;
  sentActions: number;
  cancelled: number;
  note?: string;
}

export class AccountPacer {
  readonly policy: PacerPolicy;
  private pending: { rowId: number; readyAt: number } | null = null;
  private readonly now: () => number;
  private readonly budgetCache = new Map<string, { value: number | null; at: number }>();

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
    const result: TickResult = { sentText: 0, sentEvents: 0, sentActions: 0, cancelled: 0 };
    const session = this.getSession();
    if (!session) return { ...result, note: 'no_session' };
    const now = this.now();
    if (this.policy.isBackingOff(now)) return { ...result, note: 'backoff' };

    const rows = await store.fetchDue(this.account);
    const texts: store.OutboxRow[] = [];
    const actions: store.OutboxRow[] = [];
    const events: store.OutboxRow[] = [];
    let split = false;
    for (const row of rows) {
      if (row.kind === 'seen' && row.thread_type === 'group') {
        await store.cancelRow(row.id, 'seen_group_forbidden'); // vung cam §8: nhom KHONG gui seen
        result.cancelled++;
        continue;
      }
      if (row.thread_type === 'user' && row.staff_takeover) {
        await store.cancelRow(row.id, 'staff_takeover');
        result.cancelled++;
        continue;
      }
      if (row.kind === 'action' || row.kind === 'react') {
        actions.push(row);
        continue;
      }
      if (row.kind === 'seen' || row.kind === 'typing') {
        events.push(row);
        continue;
      }
      if (row.kind === 'image') {
        await store.markFailed(row.id, 'image_unsupported_phase1');
        continue;
      }
      const text = typeof row.body.text === 'string' ? row.body.text : '';
      if (Array.from(text).length > this.cfg.maxChars) {
        await store.splitRow(row, splitText(text, this.cfg.maxChars), this.account);
        split = true; // doc lai hang doi o tick sau
        break;
      }
      texts.push(row);
    }

    // (1) action — khong tinh ngan sach text nhung tinh maxPerMinute.
    let ran = 0;
    for (const row of actions) {
      if (ran >= this.cfg.actionsPerTick) break;
      const gate = this.policy.checkAction(this.now());
      if (!gate.ok) {
        result.note = gate.reason;
        break;
      }
      ran++;
      if (await this.runActionRow(session, row)) result.sentActions++;
      if (this.policy.isBackingOff(this.now())) return { ...result, note: 'backoff' };
    }

    // (2) text
    if (split) {
      result.note = 'split';
    } else {
      const { eligible, budgetBlocked, cancelled } = await this.gateGroupTexts(texts);
      result.cancelled += cancelled;
      const textNote = await this.textPhase(session, eligible, budgetBlocked, texts.length, result);
      if (textNote !== undefined && result.note === undefined) result.note = textNote;
    }

    // (3) su kien
    for (const row of events) {
      if (this.policy.isBackingOff(this.now())) return { ...result, note: 'backoff' };
      if (await this.sendEvent(session, row)) result.sentEvents++;
    }
    if (this.policy.isBackingOff(this.now())) return { ...result, note: 'backoff' };
    return result;
  }

  // ------------------------------------------------------------ nhom: ngan sach

  private async budgetOf(threadId: string): Promise<number | null> {
    const now = this.now();
    const hit = this.budgetCache.get(threadId);
    if (hit && now - hit.at < BUDGET_CACHE_MS) return hit.value;
    const value = await store.groupBudget(this.account, threadId);
    this.budgetCache.set(threadId, { value, at: now });
    return value;
  }

  /** Loc tin text nhom (BB-08, §5): nhom khong co dong `zalo_groups` ⇒ `cancelled('group_unknown')`;
   * het ngan sach gio ⇒ giu `queued`, qua `groupTextTtlMin` ⇒ `cancelled('budget_expired')`. */
  private async gateGroupTexts(
    texts: store.OutboxRow[]
  ): Promise<{ eligible: store.OutboxRow[]; budgetBlocked: number; cancelled: number }> {
    const eligible: store.OutboxRow[] = [];
    const usedBy = new Map<string, number>();
    let budgetBlocked = 0;
    let cancelled = 0;
    for (const row of texts) {
      if (row.thread_type !== 'group') {
        eligible.push(row);
        continue;
      }
      const budget = await this.budgetOf(row.thread_id);
      if (budget === null) {
        await store.cancelRow(row.id, 'group_unknown');
        await store.auditPacer('pacer.group_unknown', row.thread_id, { outbox_id: row.id });
        cancelled++;
        continue;
      }
      let used = usedBy.get(row.thread_id);
      if (used === undefined) {
        used = await store.groupTextSentLastHour(this.account, row.thread_id, this.now());
        usedBy.set(row.thread_id, used);
      }
      if (used < budget) {
        eligible.push(row);
        continue;
      }
      if (this.now() - row.created_ms > this.cfg.groupTextTtlMin * 60_000) {
        await store.cancelRow(row.id, 'budget_expired');
        await store.auditPacer('pacer.budget_expired', row.thread_id, { outbox_id: row.id, budget });
        cancelled++;
        continue;
      }
      budgetBlocked++;
    }
    return { eligible, budgetBlocked, cancelled };
  }

  // ------------------------------------------------------------ text

  private async textPhase(
    session: ZaloSessionLike,
    texts: store.OutboxRow[],
    budgetBlocked: number,
    totalTexts: number,
    result: TickResult
  ): Promise<string | undefined> {
    const now = this.now();
    if (this.pending) {
      const row = texts.find((r) => r.id === this.pending!.rowId);
      if (!row) {
        this.pending = null;
      } else {
        if (now < this.pending.readyAt) return 'typing';
        if (!this.policy.check(now, row.thread_id, row.thread_type === 'group').ok) return 'blocked';
        this.pending = null;
        if (await this.sendText(session, row)) result.sentText++;
        return undefined;
      }
    }

    const picked = pickNext(
      now,
      texts.map((r) => ({ id: r.id, threadId: r.thread_id, isGroup: r.thread_type === 'group' })),
      this.policy
    );
    if (!picked) {
      if (texts.length > 0) return 'blocked';
      return budgetBlocked > 0 ? 'group_budget' : totalTexts > 0 ? 'blocked' : 'idle';
    }
    const row = texts.find((r) => r.id === picked.id)!;
    const text = String(row.body.text ?? '');
    const delay = typingDelayMs(Array.from(text).length, this.cfg);
    try {
      await session.sendTyping(row.thread_id, row.thread_type);
    } catch (err) {
      if (err instanceof ZaloRateLimitError) {
        await this.enterBackoff('typing');
        return 'backoff';
      }
      logEvent('pacer.typing_error', { account: this.account, outbox_id: row.id, error: errSummary(err) });
    }
    if (delay > 0) {
      this.pending = { rowId: row.id, readyAt: now + delay };
      return 'typing';
    }
    if (await this.sendText(session, row)) result.sentText++;
    return undefined;
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
    const isGroup = row.thread_type === 'group';
    try {
      const { msgId } = await session.sendText(row.thread_id, row.thread_type, buildOutboundText(row));
      if (!msgId) {
        // Khong tra msgId = dau hieu bi gioi han (G04) ⇒ giu queued + lui 30 phut.
        await store.requeue(row.id, new Date(now));
        await this.enterBackoff('no_msg_id');
        return false;
      }
      await store.markSent(row.id, msgId);
      if (isGroup) await store.linkSentGroupMessage(row.id, msgId);
      this.policy.record(now, row.thread_id, isGroup);
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

  // ------------------------------------------------------------ action

  /** Thi hanh mot hang `action`/`react` (§4.2): CAS `sending` → goi → `sent`+`result` | `failed`+`result.error`;
   * audit `zalo.action` | `zalo.action_failed` (KHONG ghi noi dung); `approvalId` ⇒ `completeApproval`. */
  private async runActionRow(session: ZaloSessionLike, row: store.OutboxRow): Promise<boolean> {
    if (!(await store.markSending(row.id))) return false;
    const now = this.now();
    const name = row.kind === 'react' ? 'react' : String(row.body.action ?? '');
    const approvalId = typeof row.body.approvalId === 'string' ? row.body.approvalId : null;
    const finish = async (out: ActionOutcome, errName: string | null): Promise<boolean> => {
      const code = out.code ?? null;
      if (out.botNotAdmin) await this.onBotNotAdmin(row.thread_id);
      if (out.ok) {
        await store.markSent(row.id, null, out.result);
      } else {
        await store.markFailed(row.id, out.failReason ?? 'action_failed', {
          ...out.result,
          error: { name: errName ?? 'ActionFailed', code },
        });
      }
      await store.auditAction(out.ok ? 'zalo.action' : 'zalo.action_failed', {
        action: name,
        thread: row.thread_id,
        ok: out.ok,
        code,
      });
      if (approvalId) await store.completeApproval(approvalId, out.ok, out.ok ? out.result : { error: { name: errName ?? 'ActionFailed', code } });
      return out.ok;
    };
    try {
      const out = await executeAction(this.account, session, row);
      this.policy.recordAction(now, row.thread_id);
      return await finish(out, null);
    } catch (err) {
      if (err instanceof ZaloRateLimitError) {
        await store.requeue(row.id, new Date(now));
        await this.enterBackoff('rate_limit_error');
        return false;
      }
      if (err instanceof InvalidActionError) {
        return finish({ ok: false, result: {}, failReason: err.reason }, err.name);
      }
      if (err instanceof ZaloActionError) {
        this.policy.recordAction(now, row.thread_id);
        return finish(
          {
            ok: false,
            result: {},
            failReason: `zalo_api_${err.apiCode ?? 'null'}`,
            code: err.apiCode,
            botNotAdmin: err.apiCode === 166,
          },
          err.name
        );
      }
      // Loi mang/khong xac dinh: thu lai nhu text (30 s, qua 5 lan ⇒ failed).
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        return finish({ ok: false, result: {}, failReason: errSummary(err) }, err instanceof Error ? err.name : 'Error');
      }
      await store.requeue(row.id, new Date(now + RETRY_DELAY_MS));
      logEvent('pacer.action_error', { account: this.account, outbox_id: row.id, error: errSummary(err) });
      return false;
    }
  }

  /** 166: `bot_is_admin=false` + audit `zalo.alert kind='deputy_missing'` (core DM chu — P05 §5.5). */
  private async onBotNotAdmin(threadId: string): Promise<void> {
    await store.markBotNotAdmin(this.account, threadId);
    await store.alert(this.account, 'deputy_missing', { thread: threadId });
  }
}

/** Dong `text` ⇒ `OutboundText`: `quote` CHI o part 0; `mentions` giu nguyen (da loc luc tach). */
export function buildOutboundText(row: store.OutboxRow): OutboundText {
  const part = typeof row.body.part === 'number' ? row.body.part : 0;
  const out: OutboundText = { msg: String(row.body.text ?? '') };
  if (part === 0 && row.body.quote && typeof row.body.quote === 'object') out.quote = row.body.quote as OutboundQuote;
  if (Array.isArray(row.body.mentions) && row.body.mentions.length > 0) {
    out.mentions = row.body.mentions as Array<{ uid: string; pos: number; len: number }>;
  }
  return out;
}

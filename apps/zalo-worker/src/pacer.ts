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
import { PacerPolicy, pickNext, splitText, typingDelayMs, type BlockReason } from './pacer-policy.js';
import { errSummary, logEvent } from './log.js';
import * as store from './store.js';

/** Loi khong phai gioi han: thu lai sau 30 s, qua 5 lan ⇒ failed. */
export const RETRY_DELAY_MS = 30_000;
export const MAX_ATTEMPTS = 5;
/** Cache `zalo_groups.budget_per_hour` 60 s (01-CONTRACTS §8.4). */
export const BUDGET_CACHE_MS = 60_000;
/** Action CO TAC DUNG PHU, khong idempotent: loi mo ho ⇒ `failed('outcome_unknown')`, KHONG thu lai (D29 diem 4). */
export const NON_IDEMPOTENT_ACTIONS: ReadonlySet<string> = new Set(['create_poll', 'create_reminder', 'create_note', 'update_group_settings']);
/** Action can the duyet (BB-06): worker la lop chan cuoi (D29 diem 1). */
const APPROVAL_GATED = new Set(['remove_member', 'block_member']);

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
  private readonly gateCache = new Map<string, { value: store.GroupGate | null; at: number }>();
  /** D31 T7: lan cuoi gui su kien "dang go" cho moi thread (ms) — typing som cua `prepare` con "tuoi" ⇒ bo typing lap. */
  private readonly lastTypingAt = new Map<string, number>();
  /** D31 §7.1.4: ly do DAU TIEN `policy.check` giu hang dau thread (trong bo nho; ghi DB mot lan luc `markSending`). */
  private readonly holdReasons = new Map<number, BlockReason>();
  /** Heartbeat worker (§9): thoi diem tick gan nhat chay xong. */
  lastTickAt: number | null = null;

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
    const out = await this.tickInner();
    this.lastTickAt = this.now();
    return out;
  }

  private async tickInner(): Promise<TickResult> {
    const result: TickResult = { sentText: 0, sentEvents: 0, sentActions: 0, cancelled: 0 };
    const session = this.getSession();
    if (!session) return { ...result, note: 'no_session' };
    const now = this.now();
    if (this.policy.isBackingOff(now)) return { ...result, note: 'backoff' };

    const rows = await store.fetchDue(this.account);
    if (this.holdReasons.size > 0) {
      const live = new Set(rows.map((r) => r.id));
      for (const id of [...this.holdReasons.keys()]) if (!live.has(id)) this.holdReasons.delete(id);
    }
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
      if (row.thread_type === 'group' && this.needsGroupGate(row)) {
        const g = await this.gateOf(row.thread_id);
        const why = g === null ? 'group_unknown' : g.enabled ? null : 'group_disabled';
        if (why) {
          await store.cancelRow(row.id, why);
          await store.auditPacer(`pacer.${why}`, row.thread_id, { outbox_id: row.id, kind: row.kind });
          result.cancelled++;
          continue;
        }
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

  private async gateOf(threadId: string): Promise<store.GroupGate | null> {
    const now = this.now();
    const hit = this.gateCache.get(threadId);
    if (hit && now - hit.at < BUDGET_CACHE_MS) return hit.value;
    const value = await store.groupGate(this.account, threadId);
    this.gateCache.set(threadId, { value, at: now });
    return value;
  }

  /** Hang nhom nao phai qua cong "nhom da khai + enabled" (D29 diem 2, SPEC-P02 §9): moi `text`/`action`/`react`
   * TRU `sync_group_info` (de dashboard thay nhom la; dong tao ra `enabled=false`). */
  private needsGroupGate(row: store.OutboxRow): boolean {
    if (row.kind === 'action') return row.body.action !== 'sync_group_info';
    return row.kind === 'text' || row.kind === 'react';
  }

  /** Ngan sach gio (BB-08, §5): het ngan sach ⇒ giu `queued`, qua `groupTextTtlMin` ⇒ `cancelled('budget_expired')`.
   * Nhom chua khai / tat da bi huy o `tick` (cong chung cho text + action). */
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
      const budget = (await this.gateOf(row.thread_id))?.budget ?? 0;
      let used = usedBy.get(row.thread_id);
      if (used === undefined) {
        used = await store.groupTextSentLastHour(this.account, row.thread_id);
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
        const chk = this.policy.check(now, row.thread_id, row.thread_type === 'group');
        if (!chk.ok) {
          this.noteHold(row.id, chk.reason);
          return 'blocked';
        }
        this.pending = null;
        if (await this.sendText(session, row)) result.sentText++;
        return undefined;
      }
    }

    const picked = pickNext(
      now,
      texts.map((r) => ({
        id: r.id,
        threadId: r.thread_id,
        isGroup: r.thread_type === 'group',
        reply: r.inbound_event_id != null,
      })),
      this.policy,
      (item, reason) => this.noteHold(item.id, reason)
    );
    if (!picked) {
      if (texts.length > 0) return 'blocked';
      return budgetBlocked > 0 ? 'group_budget' : totalTexts > 0 ? 'blocked' : 'idle';
    }
    const row = texts.find((r) => r.id === picked.id)!;
    const text = String(row.body.text ?? '');
    // D31 T7: da co "dang go" tuoi o thread nay (typing som cua `prepare`) ⇒ khong typing lap, khong tre them.
    const lastTyping = this.lastTypingAt.get(row.thread_id);
    if (lastTyping !== undefined && now - lastTyping <= this.cfg.typingFreshMs) {
      if (await this.sendText(session, row)) result.sentText++;
      return undefined;
    }
    const delay = typingDelayMs(Array.from(text).length, this.cfg);
    try {
      await session.sendTyping(row.thread_id, row.thread_type);
      this.lastTypingAt.set(row.thread_id, now);
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

  private noteHold(rowId: number, reason: BlockReason): void {
    if (!this.holdReasons.has(rowId)) this.holdReasons.set(rowId, reason);
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
        this.lastTypingAt.set(row.thread_id, this.now());
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
    const hold = this.holdReasons.get(row.id) ?? null;
    this.holdReasons.delete(row.id);
    if (!(await store.markSending(row.id, hold))) return false;
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
    // BB-06: kick/block CHI khi the duyet hop le — kiem + nhan the (CAS) TRUOC khi cham Zalo.
    let claimed: string | null = null;
    if (APPROVAL_GATED.has(name)) {
      const target = typeof row.body.uid === 'string' ? row.body.uid : '';
      const ok =
        approvalId !== null &&
        target.length > 0 &&
        (await store.claimApproval(approvalId, this.account, row.thread_id, name as 'remove_member' | 'block_member', target));
      if (!ok) {
        await store.markFailed(row.id, 'approval_invalid', { error: { name: 'ApprovalInvalid', code: null } });
        await store.auditAction('zalo.action_blocked', { action: name, thread: row.thread_id, ok: false, code: 'approval_invalid' });
        return false;
      }
      claimed = approvalId;
    }
    const unclaim = async (): Promise<void> => {
      if (claimed) await store.releaseApproval(claimed);
    };
    try {
      const out = await executeAction(this.account, session, row);
      this.policy.recordAction(now, row.thread_id);
      return await finish(out, null);
    } catch (err) {
      if (err instanceof ZaloRateLimitError) {
        await unclaim();
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
      // Loi mang/khong xac dinh. Action khong idempotent: Zalo CO THE da thi hanh ⇒ khong thu lai.
      if (NON_IDEMPOTENT_ACTIONS.has(name)) {
        this.policy.recordAction(now, row.thread_id);
        return finish({ ok: false, result: {}, failReason: 'outcome_unknown' }, err instanceof Error ? err.name : 'Error');
      }
      // Action idempotent: thu lai nhu text (30 s, qua 5 lan ⇒ failed).
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        return finish({ ok: false, result: {}, failReason: errSummary(err) }, err instanceof Error ? err.name : 'Error');
      }
      await unclaim();
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

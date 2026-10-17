// packages/core/src/adapters/alert.ts — noi DUY NHAT goi Telegram Bot API (BB-03 mo rong, BB-20, D32, SPEC-D31 §10.1).
// Bao dong VAN HANH (phien Zalo chet, runner/worker mat dau song, model sap, vuot SLO...) — KHONG phai kenh chat voi thanh vien.
// `sendAlert` KHONG BAO GIO nem. Thieu TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID ⇒ 'disabled' (0 goi mang, audit 1 lan/tien trinh).
// CAM log/audit URL, token, body phan hoi tho; CAM noi dung tin/PII trong `text` (caller chiu trach nhiem, xem §10.1).

import { sql } from './db.js';
import { audit } from '../services/audit.js';
import { readCommunityConfig } from '../services/community-config.js';

export type AlertKind =
  | 'zalo_session'
  | 'runner_stale'
  | 'worker_stale'
  | 'inbound_backlog'
  | 'model_down'
  | 'slo_breach'
  | 'bot_not_admin'
  | 'db_unreachable';

export interface AlertInput {
  kind: AlertKind;
  /** <= 64 ky tu, vd 'community', 'fast', thread_id. */
  key: string;
  severity: 'critical' | 'warning';
  /** <= 800 ky tu. */
  text: string;
  resolved?: boolean;
}

export type AlertResult = 'sent' | 'suppressed' | 'disabled' | 'failed';

let fetchImpl: typeof fetch | null = null;
let disabledAudited = false;
let cappedAuditedAt = 0;
const localSent = new Map<string, number>();
const localOpen = new Set<string>();

/** Test: thay `fetch` (null = fetch that). Dat lai trang thai trong tien trinh. */
export function setAlertFetchForTest(f: typeof fetch | null): void {
  fetchImpl = f;
  disabledAudited = false;
  cappedAuditedAt = 0;
  localSent.clear();
  localOpen.clear();
}

interface Limits {
  repeatMin: number;
  maxPerHour: number;
  timeoutMs: number;
}

function limits(): Limits {
  try {
    const c = readCommunityConfig();
    return { repeatMin: c.alertRepeatMin, maxPerHour: c.alertMaxPerHour, timeoutMs: c.alertTimeoutMs };
  } catch {
    return { repeatMin: 30, maxPerHour: 20, timeoutMs: 5000 };
  }
}

async function safeAudit(action: string, target: string | null, data: Record<string, unknown>): Promise<void> {
  try {
    await audit(sql, { actorType: 'system', actorId: 'alert', action, target, data });
  } catch {
    /* khong co DB: bo qua, bao dong khong duoc nem */
  }
}

/** POST sendMessage. Tra `{ ok, status }` — KHONG ghi/tra URL, token, body. */
async function post(text: string, timeoutMs: number): Promise<{ ok: boolean; status: number | null }> {
  const token = process.env.TELEGRAM_BOT_TOKEN as string;
  const chatId = process.env.TELEGRAM_CHAT_ID as string;
  try {
    const res = await (fetchImpl ?? fetch)(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

function render(a: AlertInput): string {
  const body = a.text.slice(0, 800);
  if (a.resolved) return `[lenqclaw] ✅ đã hồi phục: ${body}`;
  return `[lenqclaw] ${a.severity === 'critical' ? '🔴' : '🟠'} ${body}`;
}

export async function sendAlert(a: AlertInput, opts: { localOnly?: boolean } = {}): Promise<AlertResult> {
  try {
    return await sendAlertInner(a, opts);
  } catch {
    return 'failed';
  }
}

async function sendAlertInner(a: AlertInput, opts: { localOnly?: boolean }): Promise<AlertResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    if (!disabledAudited) {
      disabledAudited = true;
      await safeAudit('alert.disabled', null, { kind: a.kind });
    }
    return 'disabled';
  }
  const lim = limits();
  const mapKey = `${a.kind}:${a.key}`;

  if (a.resolved) {
    if (opts.localOnly) {
      if (!localOpen.delete(mapKey)) return 'suppressed';
      localSent.delete(mapKey);
    } else {
      const rows = await sql(`update alert_state set open = false where kind = $1 and key = $2 and open returning kind`, [a.kind, a.key]);
      if (rows.length === 0) return 'suppressed';
    }
    const r = await post(render(a), lim.timeoutMs);
    if (!opts.localOnly) {
      if (!r.ok) await safeAudit('alert.failed', a.kind, { kind: a.kind, status: r.status });
      else await safeAudit('alert.sent', a.kind, { kind: a.kind, key: a.key, resolved: true });
    }
    return r.ok ? 'sent' : 'failed';
  }

  if (opts.localOnly) {
    const last = localSent.get(mapKey);
    if (last !== undefined && Date.now() - last < lim.repeatMin * 60_000) return 'suppressed';
    localSent.set(mapKey, Date.now());
    localOpen.add(mapKey);
    const r = await post(render(a), lim.timeoutMs);
    if (!r.ok) {
      localSent.delete(mapKey);
      localOpen.delete(mapKey);
      return 'failed';
    }
    return 'sent';
  }

  // Tran toan cuc: dem audit 'alert.sent' 60 phut.
  const used = await sql<{ c: number }>(
    `select count(*)::int as c from audit_log where action = 'alert.sent' and created_at > now() - interval '60 minutes'`
  );
  if ((used[0]?.c ?? 0) >= lim.maxPerHour) {
    if (Date.now() - cappedAuditedAt > 3_600_000) {
      cappedAuditedAt = Date.now();
      await safeAudit('alert.capped', a.kind, { kind: a.kind, max: lim.maxPerHour });
    }
    return 'suppressed';
  }

  // CAS chong lap: ca runner lan worker cung phat hien ⇒ DUNG MOT tin.
  const won = await sql(
    `insert into alert_state (kind, key, open, last_sent_at, sent_count) values ($1, $2, true, now(), 1)
     on conflict (kind, key) do update set open = true, last_sent_at = now(), sent_count = alert_state.sent_count + 1
      where not alert_state.open or alert_state.last_sent_at < now() - make_interval(mins => $3)
     returning kind`,
    [a.kind, a.key, lim.repeatMin]
  );
  if (won.length === 0) {
    await sql(`update alert_state set suppressed = suppressed + 1 where kind = $1 and key = $2`, [a.kind, a.key]);
    return 'suppressed';
  }
  const r = await post(render(a), lim.timeoutMs);
  if (!r.ok) {
    // Hoan lai de vong giam sat ke tiep gui lai: dat moc gui da HET han lap (giu `open` de van con tin hoi phuc).
    await sql(
      `update alert_state set last_sent_at = now() - make_interval(mins => $3 + 1), sent_count = greatest(sent_count - 1, 0)
        where kind = $1 and key = $2`,
      [a.kind, a.key, lim.repeatMin]
    );
    await safeAudit('alert.failed', a.kind, { kind: a.kind, status: r.status });
    return 'failed';
  }
  await safeAudit('alert.sent', a.kind, { kind: a.kind, key: a.key });
  return 'sent';
}

// packages/core/src/services/timers.ts — dong ho khong pg-boss
// (SPEC-P05-Dispatch.md §10.8, Đ22/Đ27). `runTimers(now, cfg)` nhan `now`
// THAM SO — CAM `now()` cua Postgres / `Date.now()` trong so sanh (§10.1.3,
// §10.14). Moi buoc DOC LAP, idempotent (goi lai voi CUNG `now` khong lam
// gi them vi SELECT loc lai theo trang thai hien tai cua DB); loi mot buoc
// => audit `timer.error` + tiep buoc sau (khong dung ca vong).

import { sql, tx } from '../adapters/db.js';
import { audit } from './audit.js';
import { transitionJob } from './job-state.js';
import { readDispatchConfig, type DispatchConfig } from './dispatch-config.js';
import { isOfficeHours, fmtWindowVn, computePublishExpiry } from './vn-time.js';
import { publishJobToGroup, releaseHold, type JobRow } from './dispatch.js';
import { requestAccess, withdrawGranted } from './access.js';
import { enqueueSystemEvent } from './system-events.js';
import { expireSlots, remindSlotExpiry, expireWaitlistInvites } from './slots.js';
import { sendResidentOfJob, WAITING_BQL_RESIDENT, NO_VENDOR_RESIDENT } from './vendor-messages.js';
import { JobNotFoundError } from '../domain/errors.js';

async function logTimerError(step: string, target: string, err: unknown): Promise<void> {
  await audit(sql, {
    actorType: 'timer',
    actorId: null,
    action: 'timer.error',
    target,
    data: { step, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) },
  });
}

/** §10.8.1(1): `held` het han giu — nha ra, dang lai (hoac chi datdat
 * `publish_expires_at` khi qua `MAX_HOLD_REPUBLISH`). Quyet dinh reason
 * theo con bao gia vuot khung dang cho hay khong. */
async function expireHolds(now: Date): Promise<number> {
  const rows = await sql<{ id: string }>(`select id from jobs where status = 'held' and hold_expires_at <= $1`, [now]);
  let n = 0;
  for (const r of rows) {
    try {
      const overBandRows = await sql<{ x: number }>(
        `select 1 as x from job_offers where job_id = $1 and over_band = true and status = 'open'`,
        [r.id]
      );
      const reason = overBandRows.length > 0 ? 'quote_consent_timeout' : 'hold_expired';
      await releaseHold({ jobId: r.id, now, reason, actor: { type: 'timer', id: null } });
      n++;
    } catch (err) {
      await logTimerError('expireHolds', r.id, err);
    }
  }
  return n;
}

async function handleNoVendor(jobId: string, now: Date, timeoutMin: number): Promise<void> {
  const result = await tx(async (q) => {
    const rows = await q<JobRow>(`select * from jobs where id = $1 for update`, [jobId]);
    const job = rows[0];
    if (!job) throw new JobNotFoundError();
    await transitionJob(q, { jobId, from: 'published', to: 'unassigned', actorType: 'timer', actorId: null, data: {} });
    const catRows = await q<{ name_vi: string }>(`select name_vi from job_categories where code = $1`, [job.category_code]);
    await q(
      `insert into tickets (building_id, apartment_id, resident_id, source_job_id, kind, summary, status)
       values ($1,$2,$3,$4,'no_vendor',$5,'open')`,
      [
        job.building_id,
        job.apartment_id,
        job.resident_id,
        job.id,
        `Cuốc ${job.code} · ${catRows[0]?.name_vi ?? ''} · ${fmtWindowVn(job.window_start)}–${fmtWindowVn(job.window_end)} — không có thợ nhận sau ${timeoutMin} phút`,
      ]
    );
    await audit(q, { actorType: 'timer', actorId: null, action: 'dispatch.unassigned', target: job.id, data: {} });
    return { jobId: job.id, jobCode: job.code };
  });
  await sendResidentOfJob(result.jobId, NO_VENDOR_RESIDENT(result.jobCode));
}

/** §10.8.1(2): `published` het `publish_expires_at`. */
async function expirePublished(now: Date, cfg: DispatchConfig): Promise<number> {
  const rows = await sql<{ id: string; timeout_republished_at: string | null }>(
    `select id, timeout_republished_at from jobs where status = 'published' and publish_expires_at <= $1`,
    [now]
  );
  let n = 0;
  for (const r of rows) {
    try {
      if (r.timeout_republished_at === null) {
        await sql(
          `update jobs set mode = 'quote', timeout_republished_at = $1, publish_expires_at = $2, updated_at = now()
           where id = $3 and status = 'published'`,
          [now, computePublishExpiry(now, cfg.dispatchTimeoutMin), r.id]
        );
        await publishJobToGroup({ jobId: r.id, actor: { type: 'timer', id: null }, now, reason: 'timeout_quote' });
      } else {
        await handleNoVendor(r.id, now, cfg.dispatchTimeoutMin);
      }
      n++;
    } catch (err) {
      await logTimerError('expirePublished', r.id, err);
    }
  }
  return n;
}

/** §10.8.1(3): nhac BQL sau `ACCESS_REMIND_MIN` (chi trong gio hanh
 * chinh, 08:00-18:00 VN moi ngay). */
async function remindAccessRequests(now: Date, cfg: DispatchConfig): Promise<number> {
  if (!isOfficeHours(now)) return 0;
  const threshold = new Date(now.getTime() - cfg.accessRemindMin * 60_000);
  const rows = await sql<{ id: string; source_job_id: string }>(
    `update tickets set reminded_at = $1 where kind = 'access_request' and status = 'open' and reminded_at is null
     and created_at <= $2 returning id, source_job_id`,
    [now, threshold]
  );
  for (const r of rows) {
    try {
      await audit(sql, { actorType: 'timer', actorId: null, action: 'ticket.access_request.reminder', target: r.id, data: {} });
      await sendResidentOfJob(r.source_job_id, WAITING_BQL_RESIDENT);
    } catch (err) {
      await logTimerError('remindAccessRequests', r.id, err);
    }
  }
  return rows.length;
}

/** §10.8.1(4a): agent quen dang nhom sau `open_service_case`. */
async function publishFallback(now: Date, cfg: DispatchConfig): Promise<number> {
  const threshold = new Date(now.getTime() - cfg.publishFallbackMin * 60_000);
  const rows = await sql<{ id: string }>(
    `select id from jobs where status = 'case_open' and window_start is not null and updated_at <= $1`,
    [threshold]
  );
  let n = 0;
  for (const r of rows) {
    try {
      await publishJobToGroup({ jobId: r.id, actor: { type: 'timer', id: null }, now, reason: 'initial' });
      await audit(sql, { actorType: 'timer', actorId: null, action: 'timer.publish_fallback', target: r.id, data: {} });
      n++;
    } catch (err) {
      await logTimerError('publishFallback', r.id, err);
    }
  }
  return n;
}

/** §10.8.1(4b): agent quen xin cap quyen sau `confirm_assignment`. */
async function requestAccessFallback(now: Date, cfg: DispatchConfig): Promise<number> {
  const threshold = new Date(now.getTime() - cfg.requestAccessFallbackMin * 60_000);
  const rows = await sql<{ id: string; assigned_vendor_id: string | null }>(
    `select id, assigned_vendor_id from jobs where status = 'confirmed' and access_ticket_id is null and updated_at <= $1`,
    [threshold]
  );
  let n = 0;
  for (const r of rows) {
    if (!r.assigned_vendor_id) continue;
    try {
      await requestAccess({
        jobId: r.id,
        vendorId: r.assigned_vendor_id,
        note: 'Tự động (agent chưa kịp yêu cầu cấp quyền).',
        actor: { type: 'timer', id: null },
        now,
      });
      await audit(sql, { actorType: 'timer', actorId: null, action: 'timer.request_access_fallback', target: r.id, data: {} });
      n++;
    } catch (err) {
      await logTimerError('requestAccessFallback', r.id, err);
    }
  }
  return n;
}

/** §10.8.1(5): agent thợ quen goi `dispatch_to_vendor` sau su kien he
 * thong — phat lai (≤3 lan), du 3 => audit `dispatch.stuck` MOT LAN. */
async function reemitStuckGranted(now: Date, cfg: DispatchConfig): Promise<number> {
  const threshold = new Date(now.getTime() - cfg.dispatchReemitMin * 60_000);
  const rows = await sql<{ id: string; assigned_vendor_id: string | null }>(
    `select id, assigned_vendor_id from jobs where status = 'access_granted' and updated_at <= $1`,
    [threshold]
  );
  let n = 0;
  for (const r of rows) {
    try {
      // SPEC-P05-Dispatch.md §10.17 (Đ30): tho khong con `active` (bi dinh
      // chi giua luc duoc duyet va luc giao viec) => rut cuoc thay vi phat
      // lai su kien he thong (tranh JobReveal cho tho khong con hop le).
      if (r.assigned_vendor_id) {
        const vendorRows = await sql<{ status: string }>(`select status from vendors where id = $1`, [r.assigned_vendor_id]);
        if (vendorRows[0]?.status !== 'active') {
          await withdrawGranted({ jobId: r.id, now, reason: 'vendor_suspended', actor: { type: 'timer', id: null } });
          continue;
        }
      }
      const countRows = await sql<{ c: number; last: string | null }>(
        `select count(*)::int as c, max(created_at) as last from audit_log where action = 'system.access_approved_reemit' and target = $1`,
        [r.id]
      );
      const c = countRows[0]?.c ?? 0;
      const last = countRows[0]?.last ?? null;
      const recentlyReemitted = last !== null && now.getTime() - new Date(last).getTime() < 5 * 60_000;
      if (c < 3 && !recentlyReemitted) {
        await enqueueSystemEvent({ event: 'access_approved', jobId: r.id });
        await audit(sql, { actorType: 'timer', actorId: null, action: 'system.access_approved_reemit', target: r.id, data: {} });
        n++;
      } else if (c >= 3) {
        const stuckRows = await sql(`select 1 from audit_log where action = 'dispatch.stuck' and target = $1`, [r.id]);
        if (stuckRows.length === 0) {
          await audit(sql, { actorType: 'timer', actorId: null, action: 'dispatch.stuck', target: r.id, data: {} });
        }
      }
    } catch (err) {
      await logTimerError('reemitStuckGranted', r.id, err);
    }
  }
  return n;
}

export interface TimerReport {
  holds_released: number;
  published_expired: number;
  access_reminded: number;
  publish_fallback: number;
  request_access_fallback: number;
  granted_reemitted: number;
  slots_expired: number;
  slots_reminded: number;
  waitlist_invites_expired: number;
}

/** SPEC-P05-Dispatch.md §10.8.1 `runTimers(now, cfg)`. */
export async function runTimers(now: Date, cfg: DispatchConfig = readDispatchConfig()): Promise<TimerReport> {
  const holds_released = await expireHolds(now);
  const published_expired = await expirePublished(now, cfg);
  const access_reminded = await remindAccessRequests(now, cfg);
  const publish_fallback = await publishFallback(now, cfg);
  const request_access_fallback = await requestAccessFallback(now, cfg);
  const granted_reemitted = await reemitStuckGranted(now, cfg);

  let slots_expired = 0;
  try {
    slots_expired = await tx((q) => expireSlots(q, now));
  } catch (err) {
    await logTimerError('expireSlots', 'runTimers', err);
  }
  let slots_reminded = 0;
  try {
    slots_reminded = await tx((q) => remindSlotExpiry(q, now));
  } catch (err) {
    await logTimerError('remindSlotExpiry', 'runTimers', err);
  }
  let waitlist_invites_expired = 0;
  try {
    waitlist_invites_expired = await tx((q) => expireWaitlistInvites(q, now));
  } catch (err) {
    await logTimerError('expireWaitlistInvites', 'runTimers', err);
  }

  return {
    holds_released,
    published_expired,
    access_reminded,
    publish_fallback,
    request_access_fallback,
    granted_reemitted,
    slots_expired,
    slots_reminded,
    waitlist_invites_expired,
  };
}

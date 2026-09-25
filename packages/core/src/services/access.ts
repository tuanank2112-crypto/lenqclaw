// packages/core/src/services/access.ts — ticket cap quyen vao toa + giao
// viec (SPEC-P05-Dispatch.md §10.3.2, BB-11, Đ27).

import { randomBytes } from 'node:crypto';
import { sql, tx } from '../adapters/db.js';
import { audit } from './audit.js';
import { transitionJob } from './job-state.js';
import { fmtWindowVn } from './vn-time.js';
import { readDispatchConfig } from './dispatch-config.js';
import { ALPHABET } from '../agent/job-code.js';
import { publishJobToGroup, type JobRow } from './dispatch.js';
import { enqueueSystemEvent } from './system-events.js';
import {
  sendVendorMessage,
  sendResidentOfJob,
  vendorDmThreadId,
  ACCESS_PENDING_DM,
  ACCESS_PENDING_RESIDENT,
  ACCESS_REJECTED_DM,
  SEARCHING_AGAIN_RESIDENT,
  DISPATCHED_RESIDENT,
  renderReveal,
} from './vendor-messages.js';
import {
  AccessNotApprovedError,
  ConflictError,
  IneligibleVendorError,
  InvalidToolInputError,
  JobNotFoundError,
} from '../domain/errors.js';
import type { JobReveal } from '../domain/types.js';

const PASS_CODE_LENGTH = 6;

/** SPEC-P05-Dispatch.md §10.3.2: 6 ky tu tu `ALPHABET` cua
 * `agent/job-code.ts` (khong nham lan — khong I/L/O/0/1).
 * Cau hoi mo (R12): chu ky spec ghi dong bo "trùng ⇒ sinh lại ≤5 lần"
 * nhung `generatePassCode(): string` KHONG async va khong nhan tham so
 * DB — khong the tu kiem trung voi cac `access_passes.code` da co ma
 * khong doi chu ky. Schema (001/006) cung KHONG dat unique constraint
 * tren `access_passes.code`. Da thi cong dung DUNG chu ky spec (dong bo,
 * mot lan sinh) — chua lam retry; neu can that, phai doi sang async +
 * truyen `q` de kiem trung DB, hoac dat unique index + retry o tang goi. */
export function generatePassCode(): string {
  const bytes = randomBytes(PASS_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < PASS_CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export async function requestAccess(args: {
  jobId: string;
  vendorId: string;
  note: string;
  actor: { type: string; id: string | null };
  now: Date;
}): Promise<{ ticketId: string }> {
  const result = await tx(async (q) => {
    const rows = await q<JobRow>(`select * from jobs where id = $1 for update`, [args.jobId]);
    const job = rows[0];
    if (!job) throw new JobNotFoundError();
    // actor 'timer' (luoi §10.8.1(4)) bo qua dieu kien dung tho.
    if (args.actor.type !== 'timer' && job.assigned_vendor_id !== args.vendorId) {
      throw new IneligibleVendorError('not_assigned');
    }
    if (job.status !== 'confirmed') {
      throw new ConflictError(`requestAccess: cuộc đang ở "${job.status}", cần "confirmed".`);
    }

    const vendorRows = await q<{ full_name: string; phone: string }>(
      `select full_name, phone from vendors where id = $1`,
      [job.assigned_vendor_id]
    );
    const vendor = vendorRows[0]!;
    const scoreRows = await q<{ rating_avg: number | null; jobs_done: number; no_show_count: number }>(
      `select rating_avg, jobs_done, no_show_count from vendor_scores where vendor_id = $1`,
      [job.assigned_vendor_id]
    );
    const score = scoreRows[0] ?? { rating_avg: null, jobs_done: 0, no_show_count: 0 };
    const apartmentRows = await q<{ code: string; floor: number | null }>(
      `select code, floor from apartments where id = $1`,
      [job.apartment_id]
    );
    const apt = apartmentRows[0]!;
    const catRows = await q<{ name_vi: string }>(`select name_vi from job_categories where code = $1`, [
      job.category_code,
    ]);
    const categoryName = catRows[0]?.name_vi ?? job.category_code ?? '';
    const ratingText = score.rating_avg == null ? 'chưa có' : `${score.rating_avg.toFixed(1)}★`;

    const summary = [
      `Cuốc ${job.code} · ${categoryName}`,
      `Thợ: ${vendor.full_name} · ${vendor.phone} · ${ratingText} · ${score.jobs_done} cuốc · bùng ${score.no_show_count}`,
      `Căn: ${apt.code} (tầng ${apt.floor ?? '?'})`,
      `Khung giờ: ${fmtWindowVn(job.window_start)}–${fmtWindowVn(job.window_end)}`,
      `Ghi chú: ${args.note}`,
    ].join('\n');

    const ticketRows = await q<{ id: string }>(
      `insert into tickets (building_id, apartment_id, resident_id, source_job_id, kind, summary, status)
       values ($1,$2,$3,$4,'access_request',$5,'open') returning id`,
      [job.building_id, job.apartment_id, job.resident_id, job.id, summary]
    );
    const ticketId = ticketRows[0]!.id;
    await q(`update jobs set access_ticket_id = $1, updated_at = now() where id = $2 and status = 'confirmed'`, [
      ticketId,
      job.id,
    ]);
    await transitionJob(q, {
      jobId: job.id,
      from: 'confirmed',
      to: 'access_pending',
      actorType: args.actor.type,
      actorId: args.actor.id,
      data: { ticket_id: ticketId },
    });
    await audit(q, {
      actorType: args.actor.type,
      actorId: args.actor.id,
      action: 'dispatch.access_requested',
      target: job.id,
      data: { ticket_id: ticketId },
    });
    return { ticketId, jobId: job.id, jobCode: job.code, vendorId: job.assigned_vendor_id! };
  });

  const vendorUid = await vendorDmThreadId(result.vendorId);
  if (vendorUid) {
    await sendVendorMessage({
      threadId: vendorUid,
      threadType: 'user',
      text: ACCESS_PENDING_DM(result.jobCode),
      jobId: result.jobId,
    });
  }
  await sendResidentOfJob(result.jobId, ACCESS_PENDING_RESIDENT(result.jobCode));

  return { ticketId: result.ticketId };
}

export interface DecideAccessRequestResult {
  jobId: string;
  jobCode: string;
  status: 'access_granted' | 'published';
}

/** SPEC-P05-Dispatch.md §10.3.2 `decideAccessRequest` — web (SPEC-P04 §8)
 * goi qua `POST /api/tickets/{id}/decision` (ngoai pham vi P05-B). */
export async function decideAccessRequest(args: {
  ticketId: string;
  decision: 'approve' | 'reject';
  note: string | null;
  staffId: string;
  now: Date;
}): Promise<DecideAccessRequestResult> {
  if (args.decision === 'reject' && (!args.note || args.note.trim().length === 0)) {
    throw new InvalidToolInputError('Từ chối cấp quyền cần lý do (note).');
  }
  const status = args.decision === 'approve' ? 'approved' : 'rejected';

  const outcome = await tx(async (q) => {
    const ticketRows = await q<{ source_job_id: string }>(
      `update tickets set status = $1, decided_by = $2, decided_at = $3, decision_note = $4
       where id = $5 and kind = 'access_request' and status = 'open' returning source_job_id`,
      [status, args.staffId, args.now, args.note, args.ticketId]
    );
    if (ticketRows.length === 0) {
      throw new ConflictError('decideAccessRequest: ticket không còn ở trạng thái "open".');
    }
    const jobId = ticketRows[0]!.source_job_id;
    const jobRows = await q<JobRow>(`select * from jobs where id = $1 for update`, [jobId]);
    const job = jobRows[0];
    if (!job) throw new JobNotFoundError();

    if (args.decision === 'approve') {
      const cfg = readDispatchConfig();
      await transitionJob(q, {
        jobId,
        from: 'access_pending',
        to: 'access_granted',
        actorType: 'staff',
        actorId: args.staffId,
        data: { ticket_id: args.ticketId },
      });
      await q(`update access_passes set revoked_at = $1 where job_id = $2 and revoked_at is null`, [args.now, jobId]);
      const validFrom = new Date(new Date(job.window_start!).getTime() - cfg.accessPassBeforeMin * 60_000);
      const validTo = new Date(new Date(job.window_end!).getTime() + cfg.accessPassAfterMin * 60_000);
      const passCode = generatePassCode();
      await q(
        `insert into access_passes (job_id, vendor_id, code, valid_from, valid_to) values ($1,$2,$3,$4,$5)`,
        [jobId, job.assigned_vendor_id, passCode, validFrom, validTo]
      );
      await audit(q, {
        actorType: 'staff',
        actorId: args.staffId,
        action: 'ticket.access_request.approve',
        target: args.ticketId,
        data: { job_id: jobId },
      });
      return { kind: 'approve' as const, jobId, jobCode: job.code, vendorId: job.assigned_vendor_id! };
    }

    await transitionJob(q, {
      jobId,
      from: 'access_pending',
      to: 'published',
      actorType: 'staff',
      actorId: args.staffId,
      data: { reason: 'access_rejected', vendor_id: job.assigned_vendor_id, note: args.note },
    });
    await q(`update job_offers set status = 'lost', note = 'access_rejected' where job_id = $1 and vendor_id = $2`, [
      jobId,
      job.assigned_vendor_id,
    ]);
    await q(
      `update jobs set assigned_vendor_id = null, hold_expires_at = null, updated_at = now() where id = $1 and status = 'published'`,
      [jobId]
    );
    await audit(q, {
      actorType: 'staff',
      actorId: args.staffId,
      action: 'ticket.access_request.reject',
      target: args.ticketId,
      data: { note: args.note },
    });
    return { kind: 'reject' as const, jobId, jobCode: job.code, vendorId: job.assigned_vendor_id };
  });

  if (outcome.kind === 'approve') {
    // Sau commit (§10.3.2): sự kiện hệ thống `access_approved` kích hoạt
    // agent thợ gọi `dispatch_to_vendor` (P05-C).
    await enqueueSystemEvent({ event: 'access_approved', jobId: outcome.jobId });
    return { jobId: outcome.jobId, jobCode: outcome.jobCode, status: 'access_granted' };
  }

  const vendorUid = outcome.vendorId ? await vendorDmThreadId(outcome.vendorId) : null;
  if (vendorUid) {
    await sendVendorMessage({
      threadId: vendorUid,
      threadType: 'user',
      text: ACCESS_REJECTED_DM(outcome.jobCode),
      jobId: outcome.jobId,
    });
  }
  await publishJobToGroup({ jobId: outcome.jobId, actor: { type: 'staff', id: args.staffId }, now: args.now, reason: 'access_rejected' });
  await sendResidentOfJob(outcome.jobId, SEARCHING_AGAIN_RESIDENT);

  return { jobId: outcome.jobId, jobCode: outcome.jobCode, status: 'published' };
}

export async function dispatchToVendor(args: { jobCode: string; vendorId: string; now: Date }): Promise<{
  jobId: string;
  passCode: string;
}> {
  const outcome = await tx(async (q) => {
    const rows = await q<JobRow>(`select * from jobs where code = $1 for update`, [args.jobCode]);
    const job = rows[0];
    if (!job) throw new JobNotFoundError();
    if (job.assigned_vendor_id !== args.vendorId) throw new IneligibleVendorError('not_assigned');
    if (job.status !== 'access_granted') {
      throw new ConflictError(`dispatchToVendor: cuộc đang ở "${job.status}", cần "access_granted".`);
    }
    // SPEC-P05-Dispatch.md §10.17 (Đ30): chot chan thu hai — tho bi dinh
    // chi GIUA luc duoc duyet va luc giao viec van khong duoc nhan JobReveal
    // (BB-02/BB-10). Kiem TRUOC khi dung reveal, khong chuyen trang thai.
    const vendorStatusRows = await q<{ status: string }>(`select status from vendors where id = $1`, [args.vendorId]);
    if (vendorStatusRows[0]?.status !== 'active') {
      throw new IneligibleVendorError('vendor_suspended');
    }
    const ticketRows = await q<{ status: string }>(`select status from tickets where id = $1 and kind = 'access_request'`, [
      job.access_ticket_id,
    ]);
    if (!ticketRows[0] || ticketRows[0].status !== 'approved') {
      throw new AccessNotApprovedError();
    }
    const passRows = await q<{ code: string }>(
      `select code from access_passes where job_id = $1 and revoked_at is null and valid_to > $2 order by id desc limit 1`,
      [job.id, args.now]
    );
    if (passRows.length === 0) {
      throw new AccessNotApprovedError('Chưa có mã vào toà còn hiệu lực.');
    }
    const passCode = passRows[0]!.code;

    const apartmentRows = await q<{ code: string; floor: number | null }>(
      `select code, floor from apartments where id = $1`,
      [job.apartment_id]
    );
    const apt = apartmentRows[0]!;
    const residentRows = await q<{ phone: string | null }>(`select phone from residents where id = $1`, [
      job.resident_id,
    ]);
    const catRows = await q<{ name_vi: string; trade_group: string }>(
      `select name_vi, trade_group from job_categories where code = $1`,
      [job.category_code]
    );
    const buildingRows = await q<{ code: string }>(`select code from buildings where id = $1`, [job.building_id]);
    const band = null;
    const revealBase: Omit<JobReveal, 'apartment_code' | 'floor' | 'resident_phone' | 'access_pass_code'> = {
      code: job.code,
      category_name: catRows[0]?.name_vi ?? '',
      building_code: buildingRows[0]?.code ?? '',
      window: [fmtWindowVn(job.window_start), fmtWindowVn(job.window_end)],
      mode: job.mode ?? 'quote',
      price_band: band,
      summary_vi: '',
      photo_urls_redacted: [],
    };
    // JobReveal — NOI DUY NHAT trong toan bo P05 duoc tao (BB-11).
    const reveal: JobReveal = {
      ...revealBase,
      apartment_code: apt.code,
      floor: apt.floor ?? 0,
      resident_phone: residentRows[0]?.phone ?? '',
      access_pass_code: passCode,
    };

    await transitionJob(q, {
      jobId: job.id,
      from: 'access_granted',
      to: 'dispatched',
      actorType: 'agent',
      actorId: args.vendorId,
    });
    await audit(q, {
      actorType: 'agent',
      actorId: args.vendorId,
      action: 'dispatch.dispatched',
      target: job.id,
      data: {},
    });

    return { jobId: job.id, jobCode: job.code, vendorId: args.vendorId, passCode, reveal };
  });

  const vendorUid = await vendorDmThreadId(outcome.vendorId);
  if (vendorUid) {
    await sendVendorMessage({
      threadId: vendorUid,
      threadType: 'user',
      text: renderReveal(outcome.reveal),
      jobId: outcome.jobId,
      allowReveal: true,
    });
  }
  const scoreRows = await sql<{ rating_avg: number | null }>(`select rating_avg from vendor_scores where vendor_id = $1`, [
    outcome.vendorId,
  ]);
  const vendorRows = await sql<{ full_name: string }>(`select full_name from vendors where id = $1`, [outcome.vendorId]);
  await sendResidentOfJob(
    outcome.jobId,
    DISPATCHED_RESIDENT(
      outcome.jobCode,
      vendorRows[0]?.full_name ?? 'thợ',
      scoreRows[0]?.rating_avg ?? null,
      outcome.reveal.window,
      outcome.passCode
    )
  );

  return { jobId: outcome.jobId, passCode: outcome.passCode };
}

/** SPEC-P05-Dispatch.md §10.17 (Đ30): rut cuoc `access_granted` (BQL đã
 * duyệt cấp quyền, chưa giao việc) — dùng khi đình chỉ thợ (`suspendVendor`)
 * hoặc khi `reemitStuckGranted` gặp thợ không còn `active`. Khuôn "sau
 * commit" giống nhánh từ chối của `decideAccessRequest`. */
export async function withdrawGranted(args: {
  jobId: string;
  now: Date;
  reason: 'vendor_suspended';
  actor: { type: 'agent' | 'timer' | 'staff'; id: string | null };
}): Promise<void> {
  const outcome = await tx(async (q) => {
    const rows = await q<JobRow>(`select * from jobs where id = $1 for update`, [args.jobId]);
    const job = rows[0];
    if (!job) throw new JobNotFoundError();
    if (job.status !== 'access_granted') {
      throw new ConflictError(`withdrawGranted: cuộc đang ở "${job.status}", cần "access_granted".`);
    }
    await transitionJob(q, {
      jobId: args.jobId,
      from: 'access_granted',
      to: 'published',
      actorType: args.actor.type,
      actorId: args.actor.id,
      data: { reason: args.reason },
    });
    await q(`update access_passes set revoked_at = $1 where job_id = $2 and revoked_at is null`, [args.now, args.jobId]);
    if (job.access_ticket_id) {
      // Cau hoi mo (vong 2, xem R14): SPEC §10.17 ghi ticket "=> cancelled"
      // nhung `tickets.status` CHECK (001_init.sql) khong co gia tri
      // 'cancelled' (chi 'open'|'in_progress'|'approved'|'rejected'|'done'|
      // 'closed') va them migration moi ngoai PHAM VI duoc mo cua vong nay.
      // Dung 'closed' (gia tri hop le gan nghia nhat: ticket khong con hanh
      // dong duoc nua) + decision_note ghi ro ly do that.
      await q(
        `update tickets set status = 'closed', decided_at = $1, decision_note = $2 where id = $3 and status = 'approved'`,
        [args.now, `Đóng do ${args.reason}`, job.access_ticket_id]
      );
    }
    await q(
      `update jobs set assigned_vendor_id = null, hold_expires_at = null, updated_at = now() where id = $1 and status = 'published'`,
      [args.jobId]
    );
    await audit(q, {
      actorType: args.actor.type,
      actorId: args.actor.id,
      action: 'dispatch.withdrawn',
      target: args.jobId,
      data: { reason: args.reason, from: 'access_granted' },
    });
    return { jobId: job.id, jobCode: job.code };
  });

  await publishJobToGroup({ jobId: outcome.jobId, actor: args.actor, now: args.now, reason: 'access_rejected' });
  await sendResidentOfJob(outcome.jobId, SEARCHING_AGAIN_RESIDENT);
}

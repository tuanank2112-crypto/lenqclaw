// packages/core/src/services/dispatch.ts — dich vu loi dispatch buoc 4-5
// (SPEC-P05-Dispatch.md §10.3.1, Đ27). Quy uoc chung: moi ham nhan `now:
// Date` tham so; `q` la `TxSqlFn` cua `tx()` khi ghi; doc ngoai tx bang
// `sql`. CAM `now()` cua Postgres trong so sanh thoi gian (dong ho la tham
// so — §10.1.3).
//
// Thiet ke "trong cung tx roi nem loi sau" (confirmAssignment khi
// hold_expires_at <= now): `tx()` (adapters/db.ts) ROLLBACK toan bo giao
// dich khi `fn` nem loi — neu nem `HoldExpiredError` TRONG luc dang o giua
// tx thi moi ghi cua releaseHold (do chinh cau nay tao ra) se bi cuon nguoc,
// trai voi y "cuoc da duoc dang lai" (dang lai phai THAT, khong phai chi mo
// ta trong loi). Vi vay: phan ghi cua releaseHold chay TRONG CUNG tx (dung
// nhu spec "trong cung tx"), NHUNG viec NEM `HoldExpiredError` doi ra SAU
// khi tx da COMMIT (post-commit) — tx tra ve mot ket qua noi bo danh dau
// "da het han", ham bao ngoai tx moi nem loi thuc su cho caller.

import type { SqlFn, TxSqlFn } from '../adapters/db.js';
import { sql, tx } from '../adapters/db.js';
import { audit } from './audit.js';
import { transitionJob } from './job-state.js';
import { computePublishExpiry, fmtHhmmVn, fmtWindowVn, vnDateString } from './vn-time.js';
import { readDispatchConfig, type DispatchConfig } from './dispatch-config.js';
import { redactPii, redactKnownApartmentCodes } from '../agent/pii.js';
import type { ResidentGuard } from './pii-gate.js';
import {
  sendVendorMessage,
  sendResidentOfJob,
  vendorDmThreadId,
  CLAIM_WON_GROUP,
  HOLD_DM,
  CONFIRMED_DM,
  HOLD_RELEASED_DM,
  QUOTE_ASK_RESIDENT,
  QUOTE_TIMEOUT_RESIDENT,
  SEARCHING_AGAIN_RESIDENT,
} from './vendor-messages.js';
import {
  ConflictError,
  HoldExpiredError,
  IneligibleVendorError,
  InvalidToolInputError,
  JobNotFoundError,
  QuoteRequiredError,
  SlotUnavailableError,
} from '../domain/errors.js';
import type { JobCard, JobStatus, TradeGroup } from '../domain/types.js';

type SqlLike = SqlFn | TxSqlFn;

export interface JobRow {
  id: string;
  code: string;
  status: JobStatus;
  building_id: string;
  apartment_id: string;
  resident_id: string;
  category_code: string | null;
  draft: { symptoms?: string[]; location_in_unit?: string } | null;
  mode: 'fixed' | 'quote' | null;
  price_low: number | null;
  price_high: number | null;
  window_start: string | null;
  window_end: string | null;
  assigned_vendor_id: string | null;
  hold_expires_at: string | null;
  publish_expires_at: string | null;
  republish_count: number;
  timeout_republished_at: string | null;
  case_ticket_id: string | null;
  access_ticket_id: string | null;
}

function fmtK(v: number): string {
  return `${Math.round(v / 1000)}k`;
}

/** SPEC-P05-Dispatch.md §10.3.1: `[p25, p75]` cua (category, building) neu
 * co sample, khong thi `null`. KHONG loc theo `mode` o day — `confirmAssignment`
 * can gia trong `price_book` de kiem vuot khung CA KHI cuoc dang `mode='quote'`
 * (spec: "nếu có khung (price_book … có p75) và $p > p75×(1+…)"); rieng
 * `JobCard.price_band` (hien cho tho) chi hien khi `mode='fixed'` — loc o
 * `buildCardForJob` duoi day, khong o ham dung chung nay. */
export async function loadPriceBand(q: SqlLike, job: Pick<JobRow, 'category_code' | 'building_id'>): Promise<[number, number] | null> {
  if (!job.category_code) return null;
  const rows = await q<{ p25: number | null; p75: number | null }>(
    `select p25, p75 from price_book where category_code = $1 and building_id = $2`,
    [job.category_code, job.building_id]
  );
  if (rows[0]?.p25 == null || rows[0]?.p75 == null) return null;
  return [rows[0]!.p25!, rows[0]!.p75!];
}

/** JobCard §6 01-CONTRACTS: KHONG co truong PII (BB-02). `redact` da bao
 * gom che ma can that + mau chung (agent/pii.ts::redactPii). */
export function buildJobCard(
  job: Pick<JobRow, 'code' | 'window_start' | 'window_end' | 'mode' | 'draft'>,
  category: { name_vi: string },
  building: { code: string },
  band: [number, number] | null,
  redact: (s: string) => string
): JobCard {
  const symptoms = job.draft?.symptoms ?? [];
  const location = job.draft?.location_in_unit ?? '';
  const rawSummary = `${category.name_vi} — ${[symptoms.join(', '), location].filter(Boolean).join(' — ')}`;
  return {
    code: job.code,
    category_name: category.name_vi,
    building_code: building.code,
    window: [fmtWindowVn(job.window_start), fmtWindowVn(job.window_end)],
    mode: job.mode ?? 'quote',
    price_band: band,
    summary_vi: redact(rawSummary),
    photo_urls_redacted: [],
  };
}

/** SPEC-P05-Dispatch.md §1.2/§10.10: van ban dua vao nhom tho. */
export function renderJobCardText(card: JobCard, holdMinutes: number, prefix = ''): string {
  const priceLine =
    card.mode === 'fixed' && card.price_band
      ? `Giá tham khảo: ${fmtK(card.price_band[0])}–${fmtK(card.price_band[1])}`
      : 'THỢ BÁO GIÁ KHI NHẬN';
  return [
    `${prefix}CUỐC ${card.code}`,
    card.summary_vi,
    `Toà ${card.building_code} · ${card.window[0]}–${card.window[1]}`,
    priceLine,
    `Trả lời "nhận ${card.code}" để giữ cuốc ${holdMinutes} phút`,
  ].join('\n');
}

/** SPEC-P05-Dispatch.md §10.3.1: nhom Zalo (that hoac gia lap) cua (toa ×
 * nhom nghe). Thieu cau hinh => `SlotUnavailableError`. */
export async function resolveVendorGroup(
  buildingId: string,
  tradeGroup: TradeGroup
): Promise<{ threadId: string; zaloAccountId: 'market' }> {
  const rows = await sql<{ thread_id: string }>(
    `select thread_id from vendor_groups where building_id = $1 and trade_group = $2`,
    [buildingId, tradeGroup]
  );
  if (rows.length === 0) throw new SlotUnavailableError('Chưa cấu hình nhóm thợ cho toà/nhóm nghề này.');
  return { threadId: rows[0]!.thread_id, zaloAccountId: 'market' };
}

/** SPEC-P05-Dispatch.md §10.1.3/§10.10: guard PiiGate cho MOI tin gui tai
 * khoan `market` bat nguon tu 1 cuoc (JobCard/mau tin) — lop PHONG THU THU
 * HAI, chay SAU redactPii/redactKnownApartmentCodes (vd summary_vi da qua
 * redact van co the con lo TEN cu dan neu van ban goc nhac dich danh —
 * redactPii KHONG co bo phat hien ten chung; PiiGate bat duoc nho co
 * `fullName` trong guard). */
async function loadResidentGuard(
  q: SqlLike,
  job: Pick<JobRow, 'resident_id' | 'apartment_id' | 'building_id' | 'code'>
): Promise<ResidentGuard> {
  const residentRows = await q<{ full_name: string | null; phone: string | null }>(
    `select full_name, phone from residents where id = $1`,
    [job.resident_id]
  );
  const apartmentRows = await q<{ code: string }>(`select code from apartments where id = $1`, [job.apartment_id]);
  const allApartmentRows = await q<{ code: string }>(`select code from apartments where building_id = $1`, [job.building_id]);
  return {
    phone: residentRows[0]?.phone ?? null,
    fullName: residentRows[0]?.full_name ?? null,
    apartmentCode: apartmentRows[0]?.code ?? '',
    apartmentCodes: allApartmentRows.map((r) => r.code),
    keepJobCodes: [job.code],
  };
}

async function buildCardForJob(q: SqlLike, job: JobRow, category: { name_vi: string; trade_group: TradeGroup }, building: { code: string }): Promise<JobCard> {
  const apartmentRows = await q<{ code: string }>(`select code from apartments where building_id = $1`, [job.building_id]);
  const codes = apartmentRows.map((r) => r.code);
  // JobCard.price_band chi hien khi mode='fixed' (01-CONTRACTS §6) — cuoc
  // 'quote' van co the co price_book (dung boi confirmAssignment), nhung
  // KHONG hien khung gia do cho tho truoc khi bao gia.
  const band = (job.mode ?? 'quote') === 'fixed' ? await loadPriceBand(q, job) : null;
  return buildJobCard(job, category, building, band, (s) => redactPii(redactKnownApartmentCodes(s, codes)));
}

export interface PublishResult {
  jobId: string;
  jobCode: string;
  groupThreadId: string;
  publishExpiresAt: Date;
  card: JobCard;
  republish: boolean;
}

/** SPEC-P05-Dispatch.md §10.3.1 `publishJobToGroup`. */
export async function publishJobToGroup(args: {
  jobId: string;
  actor: { type: 'agent' | 'timer' | 'staff'; id: string | null };
  now: Date;
  reason?: 'initial' | 'hold_expired' | 'timeout_quote' | 'access_rejected';
}): Promise<PublishResult> {
  const reason = args.reason ?? 'initial';
  const cfg = readDispatchConfig();

  const result = await tx(async (q) => {
    const rows = await q<JobRow>(`select * from jobs where id = $1 for update`, [args.jobId]);
    const job = rows[0];
    if (!job) throw new JobNotFoundError();

    if (reason === 'initial') {
      if (job.status !== 'case_open') {
        throw new ConflictError(`publishJobToGroup: cuộc đang ở "${job.status}", cần "case_open".`);
      }
    } else if (job.status !== 'published') {
      throw new ConflictError(`publishJobToGroup (đăng lại): cuộc đang ở "${job.status}", cần "published".`);
    }
    if (!job.window_start) {
      throw new InvalidToolInputError('Thiếu khung giờ — gọi open_service_case với window_start/window_end.');
    }

    let categoryCode = job.category_code;
    if (!categoryCode) {
      categoryCode = 'khac';
      await q(`update jobs set category_code = $1 where id = $2`, [categoryCode, args.jobId]);
      job.category_code = categoryCode;
    }
    const catRows = await q<{ name_vi: string; trade_group: TradeGroup }>(
      `select name_vi, trade_group from job_categories where code = $1`,
      [categoryCode]
    );
    const category = catRows[0]!;
    const buildingRows = await q<{ code: string }>(`select code from buildings where id = $1`, [job.building_id]);
    const building = buildingRows[0]!;
    const card = await buildCardForJob(q, job, category, building);
    const guard = await loadResidentGuard(q, job);

    const groupRows = await q<{ thread_id: string }>(
      `select thread_id from vendor_groups where building_id = $1 and trade_group = $2`,
      [job.building_id, category.trade_group]
    );
    if (groupRows.length === 0) throw new SlotUnavailableError('Chưa cấu hình nhóm thợ cho toà/nhóm nghề này.');
    const groupThreadId = groupRows[0]!.thread_id;

    if (reason === 'initial') {
      await transitionJob(q, {
        jobId: args.jobId,
        from: 'case_open',
        to: 'published',
        actorType: args.actor.type,
        actorId: args.actor.id,
        data: { reason },
      });
    }
    const expiresAt = computePublishExpiry(args.now, cfg.dispatchTimeoutMin);
    await q(`update jobs set publish_expires_at = $1, updated_at = now() where id = $2 and status = 'published'`, [
      expiresAt,
      args.jobId,
    ]);

    await audit(q, {
      actorType: args.actor.type,
      actorId: args.actor.id,
      action: 'dispatch.published',
      target: args.jobId,
      data: { reason, republish_count: job.republish_count },
    });

    return {
      jobId: args.jobId,
      jobCode: job.code,
      groupThreadId,
      publishExpiresAt: expiresAt,
      card,
      republish: reason !== 'initial',
      guard,
    };
  });

  const prefix = result.republish ? 'ĐĂNG LẠI — ' : '';
  await sendVendorMessage({
    threadId: result.groupThreadId,
    threadType: 'group',
    text: renderJobCardText(result.card, cfg.holdMinutes, prefix),
    jobId: result.jobId,
    guard: result.guard,
  });
  const { guard: _guard, ...publicResult } = result;
  return publicResult;
}

export type ClaimJobResult =
  | { won: true; jobId: string; holdExpiresAt: Date; mode: 'fixed' | 'quote'; card: JobCard }
  | { won: false; status: JobStatus };

/** SPEC-P05-Dispatch.md §10.3.1 `claimJob` (BB-05, BB-10) — thu tu BAT
 * BUOC, tat ca trong MOT tx. */
export async function claimJob(args: {
  jobCode: string;
  vendorId: string;
  now: Date;
  source: 'agent' | 'fallback_no_model';
}): Promise<ClaimJobResult> {
  const cfg = readDispatchConfig();

  const outcome = await tx(async (q) => {
    const jobRows = await q<JobRow>(`select * from jobs where code = $1`, [args.jobCode]);
    const job = jobRows[0];
    if (!job) throw new JobNotFoundError();
    if (job.status !== 'published') {
      return { kind: 'lost' as const, status: job.status };
    }

    const catRows = await q<{ trade_group: TradeGroup }>(
      `select trade_group from job_categories where code = $1`,
      [job.category_code]
    );
    const tradeGroup: TradeGroup | null = catRows[0]?.trade_group ?? null;

    // 2) Dieu kien tho — moi cau MOT loi IneligibleVendorError (§10.3.1).
    const vendorRows = await q<{ status: string }>(`select status from vendors where id = $1`, [args.vendorId]);
    if (!vendorRows[0] || vendorRows[0].status !== 'active') throw new IneligibleVendorError('not_active');

    const buildingRows = await q(`select 1 from vendor_buildings where vendor_id = $1 and building_id = $2`, [
      args.vendorId,
      job.building_id,
    ]);
    if (buildingRows.length === 0) throw new IneligibleVendorError('no_building');

    if (!tradeGroup) throw new IneligibleVendorError('no_skill');
    const skillRows = await q(
      `select 1 from vendor_skills s join job_categories c on c.code = s.category_code
       where s.vendor_id = $1 and c.trade_group = $2`,
      [args.vendorId, tradeGroup]
    );
    if (skillRows.length === 0) throw new IneligibleVendorError('no_skill');

    const today = vnDateString(args.now);
    const slotRows = await q(
      `select 1 from vendor_slots where vendor_id = $1 and building_id = $2 and trade_group = $3
       and status = 'active' and period_end >= $4::date`,
      [args.vendorId, job.building_id, tradeGroup, today]
    );
    if (slotRows.length === 0) throw new IneligibleVendorError('no_slot');

    const noShowRows = await q<{ c: number; last: string | null }>(
      `select count(*)::int c, max(created_at) last from job_events
       where from_status = 'held' and to_status = 'published' and data->>'reason' = 'hold_expired'
       and data->>'vendor_id' = $1 and created_at > $2::timestamptz - ($3 || ' days')::interval`,
      [args.vendorId, args.now, cfg.noShowWindowDays]
    );
    const noShowCount = noShowRows[0]?.c ?? 0;
    const lastNoShow = noShowRows[0]?.last ?? null;
    if (
      noShowCount >= cfg.noShowBlockThreshold &&
      lastNoShow &&
      new Date(lastNoShow).getTime() > args.now.getTime() - cfg.noShowBlockDays * 86_400_000
    ) {
      throw new IneligibleVendorError('blocked_no_show');
    }

    const rejectedRows = await q(
      `select 1 from job_offers where job_id = $1 and vendor_id = $2 and note = 'access_rejected'`,
      [job.id, args.vendorId]
    );
    if (rejectedRows.length > 0) throw new IneligibleVendorError('rejected_by_bql');

    if (job.window_start && job.window_end) {
      const overlapRows = await q(
        `select 1 from jobs where assigned_vendor_id = $1 and id <> $2
         and status in ('held','confirmed','access_pending','access_granted','dispatched','in_progress')
         and window_start is not null and $3 < window_end and $4 > window_start`,
        [args.vendorId, job.id, job.window_start, job.window_end]
      );
      if (overlapRows.length > 0) throw new IneligibleVendorError('window_overlap');
    }

    // 3) UPDATE co dieu kien (BB-05) — ConflictError khi thua dua.
    try {
      await transitionJob(q, {
        jobId: job.id,
        from: 'published',
        to: 'held',
        actorType: 'vendor',
        actorId: args.vendorId,
        data: { tool: 'claim_job', source: args.source },
      });
    } catch (err) {
      if (err instanceof ConflictError) {
        await q(
          `insert into job_offers (job_id, vendor_id, kind, status) values ($1,$2,'claim','lost')
           on conflict (job_id, vendor_id) do update set status = 'lost', created_at = now()`,
          [job.id, args.vendorId]
        );
        const reread = await q<{ status: JobStatus }>(`select status from jobs where id = $1`, [job.id]);
        return { kind: 'lost' as const, status: reread[0]!.status };
      }
      throw err;
    }

    // 4) Gan tho + han giu.
    const holdExpiresAt = new Date(args.now.getTime() + cfg.holdMinutes * 60_000);
    const upd = await q<{ id: string }>(
      `update jobs set assigned_vendor_id = $1, hold_expires_at = $2, updated_at = now()
       where id = $3 and status = 'held' and assigned_vendor_id is null returning id`,
      [args.vendorId, holdExpiresAt, job.id]
    );
    if (upd.length === 0) {
      // Loi lap trinh — dong da khoa boi transitionJob ngay tren, khong the
      // xay ra tren duong chinh (§10.3.1 buoc 4 ghi "khong the xay ra").
      throw new Error('claimJob: du lieu khong nhat quan — held nhung khong gan duoc thợ.');
    }

    // 5) Ghi thang.
    await q(
      `insert into job_offers (job_id, vendor_id, kind, status) values ($1,$2,'claim','won')
       on conflict (job_id, vendor_id) do update set kind = 'claim', status = 'won', created_at = now()`,
      [job.id, args.vendorId]
    );

    const catNameRows = await q<{ name_vi: string; trade_group: TradeGroup }>(
      `select name_vi, trade_group from job_categories where code = $1`,
      [job.category_code]
    );
    const buildingRows2 = await q<{ code: string }>(`select code from buildings where id = $1`, [job.building_id]);
    const card = await buildCardForJob(q, job, catNameRows[0]!, buildingRows2[0]!);
    const guard = await loadResidentGuard(q, job);

    await audit(q, {
      actorType: 'vendor',
      actorId: args.vendorId,
      action: 'dispatch.claimed',
      target: job.id,
      data: { source: args.source },
    });

    return {
      kind: 'won' as const,
      jobId: job.id,
      jobCode: job.code,
      holdExpiresAt,
      mode: (job.mode ?? 'quote') as 'fixed' | 'quote',
      card,
      guard,
    };
  });

  if (outcome.kind === 'lost') {
    return { won: false, status: outcome.status };
  }

  // 6) Sau commit — SPEC-P05-Dispatch.md §10.3.1 buoc 6.
  const groupThreadId = (
    await sql<{ thread_id: string }>(
      `select vg.thread_id from jobs j join job_categories c on c.code = j.category_code
       join vendor_groups vg on vg.building_id = j.building_id and vg.trade_group = c.trade_group
       where j.id = $1`,
      [outcome.jobId]
    )
  )[0]?.thread_id;
  if (groupThreadId) {
    await sendVendorMessage({
      threadId: groupThreadId,
      threadType: 'group',
      text: CLAIM_WON_GROUP(outcome.jobCode, fmtHhmmVn(args.now)),
      jobId: outcome.jobId,
    });
  }
  const vendorUid = await vendorDmThreadId(args.vendorId);
  if (vendorUid) {
    await sendVendorMessage({
      threadId: vendorUid,
      threadType: 'user',
      text: HOLD_DM(outcome.jobCode, fmtHhmmVn(outcome.holdExpiresAt), outcome.mode === 'quote'),
      jobId: outcome.jobId,
    });
  }

  return {
    won: true,
    jobId: outcome.jobId,
    holdExpiresAt: outcome.holdExpiresAt,
    mode: outcome.mode,
    card: outcome.card,
  };
}

export type ConfirmAssignmentResult =
  | { status: 'confirmed' }
  | { status: 'held'; awaitingResidentPriceConsent: true; priceBand: [number, number] };

/** SPEC-P05-Dispatch.md §10.3.1 `confirmAssignment`. */
export async function confirmAssignment(args: {
  jobCode: string;
  vendorId: string;
  priceVnd: number | null;
  now: Date;
}): Promise<ConfirmAssignmentResult> {
  const cfg = readDispatchConfig();

  const outcome = await tx(async (q) => {
    const rows = await q<JobRow>(`select * from jobs where code = $1 for update`, [args.jobCode]);
    const job = rows[0];
    if (!job) throw new JobNotFoundError();
    if (job.assigned_vendor_id !== args.vendorId) throw new IneligibleVendorError('not_assigned');
    if (job.status !== 'held') throw new ConflictError(`confirmAssignment: cuộc đang ở "${job.status}", cần "held".`);

    if (job.hold_expires_at && new Date(job.hold_expires_at).getTime() <= args.now.getTime()) {
      // Xem ghi chu dau file: ghi cac hieu ung release TRONG CUNG tx nay,
      // nhung nem HoldExpiredError SAU khi tx da commit (khong o day).
      const releaseResult = await releaseHoldCore(q, cfg, {
        jobId: job.id,
        now: args.now,
        reason: 'hold_expired',
        actor: { type: 'timer', id: null },
      });
      return { kind: 'expired' as const, jobCode: job.code, vendorId: args.vendorId, ...releaseResult };
    }

    const mode = job.mode ?? 'quote';
    if (mode === 'quote' && args.priceVnd == null) throw new QuoteRequiredError();
    if (args.priceVnd != null && (args.priceVnd < 20_000 || args.priceVnd > 50_000_000)) {
      throw new InvalidToolInputError('Giá nằm ngoài khoảng cho phép [20.000, 50.000.000] đồng.');
    }

    if (mode === 'quote') {
      await q(
        `insert into job_offers (job_id, vendor_id, kind, price, status) values ($1,$2,'quote',$3,'won')
         on conflict (job_id, vendor_id) do update set kind = 'quote', price = $3, status = 'won', created_at = now()`,
        [job.id, args.vendorId, args.priceVnd]
      );
      const band = await loadPriceBand(q, job);
      if (band && args.priceVnd! > band[1] * (1 + cfg.quoteOverBandPct / 100)) {
        await q(`update job_offers set over_band = true, status = 'open' where job_id = $1 and vendor_id = $2`, [
          job.id,
          args.vendorId,
        ]);
        const newHoldExpires = new Date(args.now.getTime() + cfg.quoteConsentMin * 60_000);
        await q(`update jobs set hold_expires_at = $1, updated_at = now() where id = $2 and status = 'held'`, [
          newHoldExpires,
          job.id,
        ]);
        return { kind: 'awaiting' as const, jobId: job.id, jobCode: job.code, priceBand: band, price: args.priceVnd! };
      }
    }

    await transitionJob(q, {
      jobId: job.id,
      from: 'held',
      to: 'confirmed',
      actorType: 'vendor',
      actorId: args.vendorId,
      data: { price: args.priceVnd },
    });
    await q(`update jobs set hold_expires_at = null, updated_at = now() where id = $1 and status = 'confirmed'`, [
      job.id,
    ]);
    await audit(q, {
      actorType: 'vendor',
      actorId: args.vendorId,
      action: 'dispatch.confirmed',
      target: job.id,
      data: { price: args.priceVnd },
    });
    return { kind: 'confirmed' as const, jobId: job.id, jobCode: job.code };
  });

  if (outcome.kind === 'expired') {
    if (outcome.republished) {
      await publishJobToGroup({ jobId: outcome.jobId, actor: { type: 'timer', id: null }, now: args.now, reason: 'hold_expired' });
    }
    const vendorUid = await vendorDmThreadId(outcome.vendorId);
    if (vendorUid) {
      await sendVendorMessage({
        threadId: vendorUid,
        threadType: 'user',
        text: HOLD_RELEASED_DM(outcome.jobCode, 'hold_expired'),
        jobId: outcome.jobId,
      });
    }
    throw new HoldExpiredError();
  }

  if (outcome.kind === 'awaiting') {
    await sendResidentOfJob(outcome.jobId, QUOTE_ASK_RESIDENT(outcome.jobCode, outcome.price, outcome.priceBand));
    return { status: 'held', awaitingResidentPriceConsent: true, priceBand: outcome.priceBand };
  }

  const vendorUid = await vendorDmThreadId(args.vendorId);
  if (vendorUid) {
    await sendVendorMessage({
      threadId: vendorUid,
      threadType: 'user',
      text: CONFIRMED_DM(outcome.jobCode),
      jobId: outcome.jobId,
    });
  }
  return { status: 'confirmed' };
}

interface ReleaseHoldCoreResult {
  jobId: string;
  republished: boolean;
  unassigned: boolean;
}

/** Phan LOI cua releaseHold — chay duoc CA khi wrap rieng (releaseHold) LAN
 * khi goi TU BEN TRONG tx cua confirmAssignment (§10.3.1 "trong cung tx").
 * KHONG tu goi publishJobToGroup/gui tin (nhung viec do can post-commit) —
 * caller (releaseHold hoac confirmAssignment) lo phan do sau khi tx cua NO
 * da commit. */
async function releaseHoldCore(
  q: TxSqlFn,
  cfg: DispatchConfig,
  args: {
    jobId: string;
    now: Date;
    reason: 'hold_expired' | 'quote_consent_timeout' | 'vendor_declined' | 'quote_declined' | 'vendor_suspended';
    actor: { type: string; id: string | null };
  }
): Promise<ReleaseHoldCoreResult> {
  const rows = await q<JobRow>(`select * from jobs where id = $1 for update`, [args.jobId]);
  const job = rows[0];
  if (!job) throw new JobNotFoundError();
  const vendorId = job.assigned_vendor_id;

  await transitionJob(q, {
    jobId: args.jobId,
    from: 'held',
    to: 'published',
    actorType: args.actor.type,
    actorId: args.actor.id,
    data: { reason: args.reason, vendor_id: vendorId },
  });
  await q(
    `update jobs set assigned_vendor_id = null, hold_expires_at = null, updated_at = now() where id = $1 and status = 'published'`,
    [args.jobId]
  );
  await q(`update job_offers set status = 'expired' where job_id = $1 and vendor_id = $2 and status in ('won','open')`, [
    args.jobId,
    vendorId,
  ]);
  if (args.reason === 'hold_expired' && vendorId) {
    await q(
      `insert into vendor_scores (vendor_id, no_show_count) values ($1,1)
       on conflict (vendor_id) do update set no_show_count = vendor_scores.no_show_count + 1, updated_at = now()`,
      [vendorId]
    );
  }

  let republished = false;
  const unassigned = false;
  if (job.republish_count < cfg.maxHoldRepublish) {
    await q(`update jobs set republish_count = republish_count + 1 where id = $1`, [args.jobId]);
    republished = true;
  } else {
    const expiresAt = computePublishExpiry(args.now, cfg.dispatchTimeoutMin);
    await q(`update jobs set publish_expires_at = $1, updated_at = now() where id = $2`, [expiresAt, args.jobId]);
  }

  await audit(q, {
    actorType: args.actor.type,
    actorId: args.actor.id,
    action: 'dispatch.hold_released',
    target: args.jobId,
    data: { reason: args.reason, vendor_id: vendorId },
  });

  return { jobId: args.jobId, republished, unassigned };
}

export interface ReleaseHoldResult {
  republished: boolean;
  unassigned: boolean;
}

/** SPEC-P05-Dispatch.md §10.3.1 `releaseHold` — dung boi timer,
 * `decline_hold`, `respond_to_quote(accept=false)`. */
export async function releaseHold(args: {
  jobId: string;
  now: Date;
  reason: 'hold_expired' | 'quote_consent_timeout' | 'vendor_declined' | 'quote_declined' | 'vendor_suspended';
  actor: { type: string; id: string | null };
}): Promise<ReleaseHoldResult> {
  const cfg = readDispatchConfig();
  const vendorIdRows = await sql<{ assigned_vendor_id: string | null }>(`select assigned_vendor_id from jobs where id = $1`, [
    args.jobId,
  ]);
  const vendorId = vendorIdRows[0]?.assigned_vendor_id ?? null;

  const result = await tx((q) => releaseHoldCore(q, cfg, args));

  if (result.republished) {
    // publishJobToGroup chi phan biet 4 gia tri `reason` (§10.3.1); moi ly
    // do nha giu khac 'quote_consent_timeout' deu dang lai voi cung y
    // nghia "hold_expired" (mat cuoc/rut/dinh chi deu quay ve dang lai
    // binh thuong). Actor cua LUOT DANG LAI la 'agent' (he thong tu dang
    // lai), khac actor cua su kien "nha giu" da ghi rieng trong
    // releaseHoldCore o tren.
    await publishJobToGroup({ jobId: args.jobId, actor: { type: 'agent', id: null }, now: args.now, reason: 'hold_expired' });
  }
  if (vendorId) {
    const vendorUid = await vendorDmThreadId(vendorId);
    if (vendorUid) {
      const jobCodeRows = await sql<{ code: string }>(`select code from jobs where id = $1`, [args.jobId]);
      await sendVendorMessage({
        threadId: vendorUid,
        threadType: 'user',
        text: HOLD_RELEASED_DM(jobCodeRows[0]?.code ?? args.jobId, args.reason),
        jobId: args.jobId,
      });
    }
  }
  if (args.reason === 'quote_consent_timeout') {
    await sendResidentOfJob(args.jobId, QUOTE_TIMEOUT_RESIDENT);
  }

  return result;
}

/** SPEC-P05-Dispatch.md §10.3.1 `withdrawConfirmed` — `confirmed -> published`
 * (cap MOI, L7) hoac `access_pending -> published` (da co). */
export async function withdrawConfirmed(args: {
  jobId: string;
  now: Date;
  reason: 'vendor_declined' | 'vendor_suspended';
  actor: { type: string; id: string | null };
}): Promise<void> {
  const result = await tx(async (q) => {
    const rows = await q<JobRow>(`select * from jobs where id = $1 for update`, [args.jobId]);
    const job = rows[0];
    if (!job) throw new JobNotFoundError();
    const from = job.status;
    if (from !== 'confirmed' && from !== 'access_pending') {
      throw new ConflictError(`withdrawConfirmed: cuộc đang ở "${from}", cần "confirmed" hoặc "access_pending".`);
    }
    await transitionJob(q, {
      jobId: args.jobId,
      from,
      to: 'published',
      actorType: args.actor.type,
      actorId: args.actor.id,
      data: { reason: args.reason },
    });
    if (from === 'access_pending' && job.access_ticket_id) {
      await q(`update tickets set status = 'rejected', decided_at = $1, decision_note = $2 where id = $3 and status = 'open'`, [
        args.now,
        args.reason,
        job.access_ticket_id,
      ]);
    }
    await q(
      `update jobs set assigned_vendor_id = null, hold_expires_at = null, updated_at = now() where id = $1 and status = 'published'`,
      [args.jobId]
    );
    await q(`update job_offers set status = 'expired' where job_id = $1 and vendor_id = $2 and status in ('won','open')`, [
      args.jobId,
      job.assigned_vendor_id,
    ]);
    await audit(q, {
      actorType: args.actor.type,
      actorId: args.actor.id,
      action: 'dispatch.withdrawn',
      target: args.jobId,
      data: { reason: args.reason, from },
    });
    return { jobId: args.jobId };
  });

  await publishJobToGroup({ jobId: result.jobId, actor: { type: 'agent', id: null }, now: args.now, reason: 'access_rejected' });
  await sendResidentOfJob(result.jobId, SEARCHING_AGAIN_RESIDENT);
}

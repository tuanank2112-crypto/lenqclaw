// packages/core/src/services/slots.ts — slot thang dong gia + dung thu +
// danh sach cho + so phi (SPEC-P05-Dispatch.md §10.9, Đ14).

import type { SqlFn, TxSqlFn } from '../adapters/db.js';
import { sql, tx } from '../adapters/db.js';
import { audit } from './audit.js';
import { readDispatchConfig } from './dispatch-config.js';
import { vnDateString } from './vn-time.js';
import { vendorDmThreadId, sendVendorMessage, SLOT_EXPIRED_DM, SLOT_REMIND_DM, WAITLIST_INVITE_DM } from './vendor-messages.js';
import { IneligibleVendorError, SlotUnavailableError } from '../domain/errors.js';
import type { TradeGroup } from '../domain/types.js';

const TRADE_GROUP_NAME_VI: Record<TradeGroup, string> = {
  dien_nuoc: 'điện nước',
  khoa: 'khoá',
  dien_lanh: 'điện lạnh',
  xay_sua: 'xây sửa',
};

export async function hasActiveSlot(
  q: SqlFn | TxSqlFn,
  vendorId: string,
  buildingId: string,
  tradeGroup: TradeGroup,
  today: string
): Promise<boolean> {
  const rows = await q(
    `select 1 from vendor_slots where vendor_id = $1 and building_id = $2 and trade_group = $3
     and status = 'active' and period_end >= $4::date`,
    [vendorId, buildingId, tradeGroup, today]
  );
  return rows.length > 0;
}

async function resolveVendorSingleBuilding(
  q: SqlFn | TxSqlFn,
  vendorId: string,
  buildingCode: string | null
): Promise<string> {
  const rows = await q<{ id: string; code: string }>(
    `select b.id, b.code from vendor_buildings vb join buildings b on b.id = vb.building_id where vb.vendor_id = $1`,
    [vendorId]
  );
  if (rows.length === 0) throw new IneligibleVendorError('no_building');
  if (buildingCode) {
    const match = rows.find((r) => r.code === buildingCode);
    if (!match) throw new IneligibleVendorError('no_building');
    return match.id;
  }
  if (rows.length === 1) return rows[0]!.id;
  throw new SlotUnavailableError(`Cần building_code: ${rows.map((r) => r.code).join(', ')}`);
}

export interface RequestSlotResult {
  result: 'trial_granted' | 'already_active' | 'waitlisted' | 'pending_payment';
  periodEnd?: string;
  position?: number;
  feeVnd?: number;
}

/** SPEC-P05-Dispatch.md §10.9.2 `requestSlot`. */
export async function requestSlot(args: {
  vendorId: string;
  buildingId?: string;
  buildingCode?: string | null;
  tradeGroup: TradeGroup;
  now: Date;
}): Promise<RequestSlotResult> {
  const cfg = readDispatchConfig();
  return tx(async (q) => {
    const vendorRows = await q<{ status: string }>(`select status from vendors where id = $1`, [args.vendorId]);
    if (!vendorRows[0] || vendorRows[0].status !== 'active') throw new IneligibleVendorError('not_active');

    const buildingId = args.buildingId ?? (await resolveVendorSingleBuilding(q, args.vendorId, args.buildingCode ?? null));

    const skillRows = await q(
      `select 1 from vendor_skills s join job_categories c on c.code = s.category_code
       where s.vendor_id = $1 and c.trade_group = $2`,
      [args.vendorId, args.tradeGroup]
    );
    if (skillRows.length === 0) throw new IneligibleVendorError('no_skill');

    const capacityRows = await q<{ capacity: number }>(
      `select capacity from slot_capacity where building_id = $1 and trade_group = $2 for update`,
      [buildingId, args.tradeGroup]
    );
    if (capacityRows.length === 0) throw new SlotUnavailableError('BQL chưa đặt trần slot.');
    const capacity = capacityRows[0]!.capacity;

    const today = vnDateString(args.now);
    if (await hasActiveSlot(q, args.vendorId, buildingId, args.tradeGroup, today)) {
      return { result: 'already_active' as const };
    }

    const activeCountRows = await q<{ n: number }>(
      `select count(*)::int as n from vendor_slots where building_id = $1 and trade_group = $2
       and status = 'active' and period_end >= $3::date`,
      [buildingId, args.tradeGroup, today]
    );
    const activeCount = activeCountRows[0]!.n;

    const trialRows = await q(
      `select 1 from vendor_slots where vendor_id = $1 and building_id = $2 and trade_group = $3 and is_trial`,
      [args.vendorId, buildingId, args.tradeGroup]
    );
    const usedTrial = trialRows.length > 0;

    if (!usedTrial) {
      if (activeCount >= capacity) {
        await q(
          `insert into slot_waitlist (building_id, trade_group, vendor_id) values ($1,$2,$3) on conflict do nothing`,
          [buildingId, args.tradeGroup, args.vendorId]
        );
        const position = await waitlistPosition(q, buildingId, args.tradeGroup, args.vendorId);
        await audit(q, { actorType: 'vendor', actorId: args.vendorId, action: 'slot.waitlisted', target: buildingId, data: { trade_group: args.tradeGroup } });
        return { result: 'waitlisted' as const, position };
      }
      const periodEnd = addDays(today, cfg.freeTrialDays - 1);
      await q(
        `insert into vendor_slots (vendor_id, building_id, trade_group, is_trial, period_start, period_end, fee, status)
         values ($1,$2,$3,true,$4::date,$5::date,0,'active')`,
        [args.vendorId, buildingId, args.tradeGroup, today, periodEnd]
      );
      await q(`delete from slot_waitlist where building_id = $1 and trade_group = $2 and vendor_id = $3`, [
        buildingId,
        args.tradeGroup,
        args.vendorId,
      ]);
      await audit(q, {
        actorType: 'vendor',
        actorId: args.vendorId,
        action: 'slot.trial_granted',
        target: buildingId,
        data: { trade_group: args.tradeGroup, period_end: periodEnd },
      });
      return { result: 'trial_granted' as const, periodEnd };
    }

    // Da dung thu — chi BQL bam "Da thu phi" (grantPaidSlot) moi cap slot moi.
    await audit(q, {
      actorType: 'vendor',
      actorId: args.vendorId,
      action: 'slot.pending_payment',
      target: buildingId,
      data: { trade_group: args.tradeGroup },
    });
    return { result: 'pending_payment' as const, feeVnd: cfg.slotFeeMonthly };
  });
}

async function waitlistPosition(
  q: SqlFn | TxSqlFn,
  buildingId: string,
  tradeGroup: TradeGroup,
  vendorId: string
): Promise<number> {
  const rows = await q<{ vendor_id: string }>(
    `select vendor_id from slot_waitlist where building_id = $1 and trade_group = $2 order by joined_at asc`,
    [buildingId, tradeGroup]
  );
  const idx = rows.findIndex((r) => r.vendor_id === vendorId);
  return idx === -1 ? rows.length : idx + 1;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export interface GrantPaidSlotResult {
  result: 'granted' | 'waitlisted';
  slotId?: string;
  periodStart?: string;
  periodEnd?: string;
  position?: number;
}

/** SPEC-P05-Dispatch.md §10.9.2 `grantPaidSlot` — nut "Đã thu phí"
 * (SPEC-P04 §8, ngoai pham vi P05-B — dich vu nay la noi web se goi). */
export async function grantPaidSlot(args: {
  vendorId: string;
  buildingId: string;
  tradeGroup: TradeGroup;
  staffId: string;
  now: Date;
}): Promise<GrantPaidSlotResult> {
  const cfg = readDispatchConfig();
  return tx(async (q) => {
    await q(`select capacity from slot_capacity where building_id = $1 and trade_group = $2 for update`, [
      args.buildingId,
      args.tradeGroup,
    ]);
    const today = vnDateString(args.now);

    const existingRows = await q<{ id: string; period_end: string }>(
      `select id, period_end::text as period_end from vendor_slots
       where vendor_id = $1 and building_id = $2 and trade_group = $3 and status = 'active' and period_end >= $4::date`,
      [args.vendorId, args.buildingId, args.tradeGroup, today]
    );

    let periodStart: string;
    if (existingRows.length > 0) {
      const old = existingRows[0]!;
      await q(`update vendor_slots set status = 'expired' where id = $1`, [old.id]);
      periodStart = addDays(old.period_end, 1);
    } else {
      const capacityRows = await q<{ capacity: number }>(
        `select capacity from slot_capacity where building_id = $1 and trade_group = $2`,
        [args.buildingId, args.tradeGroup]
      );
      if (capacityRows.length === 0) throw new SlotUnavailableError('BQL chưa đặt trần slot.');
      const activeCountRows = await q<{ n: number }>(
        `select count(*)::int as n from vendor_slots where building_id = $1 and trade_group = $2
         and status = 'active' and period_end >= $3::date`,
        [args.buildingId, args.tradeGroup, today]
      );
      if (activeCountRows[0]!.n >= capacityRows[0]!.capacity) {
        await q(
          `insert into slot_waitlist (building_id, trade_group, vendor_id) values ($1,$2,$3) on conflict do nothing`,
          [args.buildingId, args.tradeGroup, args.vendorId]
        );
        const position = await waitlistPosition(q, args.buildingId, args.tradeGroup, args.vendorId);
        return { result: 'waitlisted' as const, position };
      }
      periodStart = today;
    }
    const periodEnd = addDays(periodStart, cfg.slotPeriodDays - 1);
    const slotRows = await q<{ id: string }>(
      `insert into vendor_slots (vendor_id, building_id, trade_group, is_trial, period_start, period_end, fee, status)
       values ($1,$2,$3,false,$4::date,$5::date,$6,'active') returning id`,
      [args.vendorId, args.buildingId, args.tradeGroup, periodStart, periodEnd, cfg.slotFeeMonthly]
    );
    const slotId = slotRows[0]!.id;
    const bqlShare = Math.round((cfg.slotFeeMonthly * cfg.bqlSharePct) / 100);
    await q(
      `insert into ledger_entries (slot_id, vendor_id, kind, amount, status) values
       ($1,$2,'slot_fee',$3,'paid'), ($1,$2,'bql_share',$4,'due')`,
      [slotId, args.vendorId, cfg.slotFeeMonthly, bqlShare]
    );
    await q(`delete from slot_waitlist where building_id = $1 and trade_group = $2 and vendor_id = $3`, [
      args.buildingId,
      args.tradeGroup,
      args.vendorId,
    ]);
    await audit(q, {
      actorType: 'staff',
      actorId: args.staffId,
      action: 'slot.paid',
      target: slotId,
      data: { vendor_id: args.vendorId, trade_group: args.tradeGroup, period_start: periodStart, period_end: periodEnd },
    });
    return { result: 'granted' as const, slotId, periodStart, periodEnd };
  });
}

/** SPEC-P05-Dispatch.md §10.9.2 `suggestedCapacity` — CHI hien thi goi y;
 * admin dat `slot_capacity.capacity` tay (SPEC-P04 §8, ngoai pham vi). */
export async function suggestedCapacity(buildingId: string, tradeGroup: TradeGroup, now: Date): Promise<number> {
  const cfg = readDispatchConfig();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await sql<{ n: number }>(
    `select count(*)::int as n from jobs j join job_categories c on c.code = j.category_code
     where j.building_id = $1 and c.trade_group = $2 and j.status in ('closed','dispatched') and j.created_at >= $3`,
    [buildingId, tradeGroup, since]
  );
  const n = rows[0]?.n ?? 0;
  return Math.max(2, Math.ceil(n / cfg.slotMinJobsPerVendor));
}

export interface SlotSummaryItem {
  buildingCode: string;
  tradeGroup: TradeGroup;
  isTrial: boolean;
  periodEnd: string;
  daysLeft: number;
  status: string;
}

export interface WaitlistSummaryItem {
  buildingCode: string;
  tradeGroup: TradeGroup;
  position: number;
  invitedAt: string | null;
}

/** SPEC-P05-Dispatch.md §10.9.2 `getSlotSummary` — dung boi tool
 * `get_my_slot` (P05-C, ngoai pham vi thi cong file nay). */
export async function getSlotSummary(vendorId: string, now: Date): Promise<{ slots: SlotSummaryItem[]; waitlist: WaitlistSummaryItem[] }> {
  const today = vnDateString(now);
  const slotRows = await sql<{
    building_code: string;
    trade_group: TradeGroup;
    is_trial: boolean;
    period_end: string;
    status: string;
  }>(
    `select b.code as building_code, vs.trade_group, vs.is_trial, vs.period_end::text as period_end, vs.status
     from vendor_slots vs join buildings b on b.id = vs.building_id
     where vs.vendor_id = $1 and vs.status = 'active' order by vs.period_end asc`,
    [vendorId]
  );
  const slots: SlotSummaryItem[] = slotRows.map((r) => ({
    buildingCode: r.building_code,
    tradeGroup: r.trade_group,
    isTrial: r.is_trial,
    periodEnd: r.period_end,
    daysLeft: Math.round((Date.parse(`${r.period_end}T00:00:00+07:00`) - Date.parse(`${today}T00:00:00+07:00`)) / 86_400_000),
    status: r.status,
  }));

  const waitlistRows = await sql<{ building_code: string; trade_group: TradeGroup; vendor_id: string; joined_at: string; invited_at: string | null }>(
    `select b.code as building_code, w.trade_group, w.vendor_id, w.joined_at::text as joined_at, w.invited_at::text as invited_at
     from slot_waitlist w join buildings b on b.id = w.building_id
     where w.building_id in (select building_id from slot_waitlist where vendor_id = $1)
     order by w.joined_at asc`,
    [vendorId]
  );
  const byKey = new Map<string, typeof waitlistRows>();
  for (const r of waitlistRows) {
    const key = `${r.building_code}::${r.trade_group}`;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }
  const waitlist: WaitlistSummaryItem[] = [];
  for (const [, rows] of byKey) {
    const idx = rows.findIndex((r) => r.vendor_id === vendorId);
    if (idx === -1) continue;
    const mine = rows[idx]!;
    waitlist.push({ buildingCode: mine.building_code, tradeGroup: mine.trade_group, position: idx + 1, invitedAt: mine.invited_at });
  }

  return { slots, waitlist };
}

// --- Dong ho slot (goi tu services/timers.ts trong CUNG mot `tx` moi dong) --

export async function expireSlots(q: TxSqlFn, now: Date): Promise<number> {
  const today = vnDateString(now);
  const rows = await q<{ id: string; vendor_id: string; building_id: string; trade_group: TradeGroup; is_trial: boolean }>(
    `update vendor_slots set status = 'expired' where status = 'active' and period_end < $1::date
     returning id, vendor_id, building_id, trade_group, is_trial`,
    [today]
  );
  const cfg = readDispatchConfig();
  for (const r of rows) {
    await audit(q, { actorType: 'timer', actorId: null, action: 'slot.expired', target: r.id, data: { vendor_id: r.vendor_id } });
    const vendorUid = await vendorDmThreadId(r.vendor_id);
    if (vendorUid) {
      await sendVendorMessage({
        threadId: vendorUid,
        threadType: 'user',
        text: SLOT_EXPIRED_DM(TRADE_GROUP_NAME_VI[r.trade_group], r.is_trial, cfg.slotFeeMonthly),
        jobId: null,
      });
    }
    await inviteWaitlistHeadTx(q, r.building_id, r.trade_group, now);
  }
  return rows.length;
}

export async function remindSlotExpiry(q: TxSqlFn, now: Date): Promise<number> {
  const cfg = readDispatchConfig();
  const today = vnDateString(now);
  const rows = await q<{ id: string; vendor_id: string; trade_group: TradeGroup }>(
    `update vendor_slots set reminded_at = $1 where status = 'active' and reminded_at is null
     and (period_end - $2::date) <= $3 returning id, vendor_id, trade_group`,
    [now, today, cfg.slotRemindDays]
  );
  for (const r of rows) {
    const daysLeftRows = await q<{ days_left: number }>(`select (period_end - $1::date)::int as days_left from vendor_slots where id = $2`, [today, r.id]);
    const vendorUid = await vendorDmThreadId(r.vendor_id);
    if (vendorUid) {
      await sendVendorMessage({
        threadId: vendorUid,
        threadType: 'user',
        text: SLOT_REMIND_DM(TRADE_GROUP_NAME_VI[r.trade_group], daysLeftRows[0]?.days_left ?? cfg.slotRemindDays),
        jobId: null,
      });
    }
  }
  return rows.length;
}

async function inviteWaitlistHeadTx(q: TxSqlFn, buildingId: string, tradeGroup: TradeGroup, now: Date): Promise<void> {
  const cfg = readDispatchConfig();
  const today = vnDateString(now);
  const capacityRows = await q<{ capacity: number }>(`select capacity from slot_capacity where building_id = $1 and trade_group = $2`, [
    buildingId,
    tradeGroup,
  ]);
  if (capacityRows.length === 0) return;
  const activeCountRows = await q<{ n: number }>(
    `select count(*)::int as n from vendor_slots where building_id = $1 and trade_group = $2 and status = 'active' and period_end >= $3::date`,
    [buildingId, tradeGroup, today]
  );
  if (activeCountRows[0]!.n >= capacityRows[0]!.capacity) return;

  const headRows = await q<{ vendor_id: string }>(
    `select vendor_id from slot_waitlist where building_id = $1 and trade_group = $2 and invited_at is null
     order by joined_at asc limit 1`,
    [buildingId, tradeGroup]
  );
  if (headRows.length === 0) return;
  const vendorId = headRows[0]!.vendor_id;
  await q(`update slot_waitlist set invited_at = $1 where building_id = $2 and trade_group = $3 and vendor_id = $4`, [
    now,
    buildingId,
    tradeGroup,
    vendorId,
  ]);
  const vendorUid = await vendorDmThreadId(vendorId);
  if (vendorUid) {
    await sendVendorMessage({
      threadId: vendorUid,
      threadType: 'user',
      text: WAITLIST_INVITE_DM(TRADE_GROUP_NAME_VI[tradeGroup], cfg.waitlistInviteHours),
      jobId: null,
    });
  }
  await audit(q, { actorType: 'timer', actorId: null, action: 'slot.waitlist_invited', target: vendorId, data: { building_id: buildingId, trade_group: tradeGroup } });
}

export async function expireWaitlistInvites(q: TxSqlFn, now: Date): Promise<number> {
  const cfg = readDispatchConfig();
  const cutoff = new Date(now.getTime() - cfg.waitlistInviteHours * 3_600_000);
  const rows = await q<{ building_id: string; trade_group: TradeGroup; vendor_id: string }>(
    `delete from slot_waitlist where invited_at is not null and invited_at <= $1
     returning building_id, trade_group, vendor_id`,
    [cutoff]
  );
  for (const r of rows) {
    await audit(q, { actorType: 'timer', actorId: null, action: 'slot.invite_expired', target: r.vendor_id, data: { building_id: r.building_id, trade_group: r.trade_group } });
    await inviteWaitlistHeadTx(q, r.building_id, r.trade_group, now);
  }
  return rows.length;
}

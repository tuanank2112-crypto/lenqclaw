// packages/core/src/dbtests/p05-slots.db.test.ts — TESTING-ACCEPTANCE.md §4
// G15 (SPEC-P05-Dispatch.md §10.9): 5 ca (a)-(e).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, closeDb } from '../adapters/db.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { runSeedSim } from '../db/seed-sim.js';
import { requestSlot, grantPaidSlot, suggestedCapacity, getSlotSummary } from '../services/slots.js';
import { runTimers } from '../services/timers.js';
import { claimJob, publishJobToGroup } from '../services/dispatch.js';
import { createVendor, createApartment, createResident, createJob, outboxTexts, linkVendorIdentity } from './p05-helpers.js';

const TRADE_GROUP = 'dien_nuoc' as const;
const CATEGORY = 'ong_nuoc_ro';

beforeAll(async () => {
  process.env.DATA_MODE = 'sim';
  await runMigrations();
  await runSeed();
  await runSeedSim();
});

afterAll(async () => {
  await closeDb();
});

async function createFreshBuilding(): Promise<string> {
  const orgRows = await sql<{ org_id: string }>(`select org_id from buildings limit 1`);
  const rows = await sql<{ id: string }>(`insert into buildings (org_id, code, name) values ($1,$2,$2) returning id`, [
    orgRows[0]!.org_id,
    `P05SLOT-${randomUUID().slice(0, 8)}`,
  ]);
  return rows[0]!.id;
}

async function setCapacity(buildingId: string, capacity: number): Promise<void> {
  await sql(
    `insert into slot_capacity (building_id, trade_group, capacity) values ($1,$2,$3)
     on conflict (building_id, trade_group) do update set capacity = excluded.capacity`,
    [buildingId, TRADE_GROUP, capacity]
  );
}

describe('G15(a) — 50 requestSlot dong thoi, tran 3, 2 slot active san', () => {
  it('granted=1 waitlisted=49, active_slots=3', async () => {
    const buildingId = await createFreshBuilding();
    await setCapacity(buildingId, 3);
    await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 25, isTrial: false });

    const vendorIds = await Promise.all(
      Array.from({ length: 50 }, () => createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: null }))
    );

    const results = await Promise.all(
      vendorIds.map((vendorId) => requestSlot({ vendorId, buildingId, tradeGroup: TRADE_GROUP, now: new Date() }))
    );
    const granted = results.filter((r) => r.result === 'trial_granted').length;
    const waitlisted = results.filter((r) => r.result === 'waitlisted').length;
    expect(granted).toBe(1);
    expect(waitlisted).toBe(49);

    const activeRows = await sql<{ c: number }>(
      `select count(*)::int as c from vendor_slots where building_id = $1 and trade_group = $2 and status = 'active'`,
      [buildingId, TRADE_GROUP]
    );
    expect(activeRows[0]!.c).toBe(3);
  });
});

describe('G15(b) — da co dong (is_trial=true, ke ca expired) => pending_payment, 0 dong moi', () => {
  it('requestSlot lan hai (sau khi da dung thu, du het han) => pending_payment', async () => {
    const buildingId = await createFreshBuilding();
    await setCapacity(buildingId, 5);
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: -1, isTrial: true });
    await sql(`update vendor_slots set status = 'expired' where vendor_id = $1`, [vendorId]);

    const before = await sql<{ c: number }>(`select count(*)::int as c from vendor_slots where vendor_id = $1`, [vendorId]);
    const result = await requestSlot({ vendorId, buildingId, tradeGroup: TRADE_GROUP, now: new Date() });
    expect(result.result).toBe('pending_payment');
    expect(result.feeVnd).toBeGreaterThan(0);
    const after = await sql<{ c: number }>(`select count(*)::int as c from vendor_slots where vendor_id = $1`, [vendorId]);
    expect(after[0]!.c).toBe(before[0]!.c);
  });
});

describe('G15(c) — grantPaidSlot cho tho dang dung thu', () => {
  it('slot cu expired, slot moi active noi tiep ngay, 2 ledger_entries; chen dung thu lan 2 => loi unique', async () => {
    const buildingId = await createFreshBuilding();
    await setCapacity(buildingId, 5);
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 10, isTrial: true });
    const oldSlot = await sql<{ id: string; period_end: string }>(
      `select id, period_end::text as period_end from vendor_slots where vendor_id = $1`,
      [vendorId]
    );

    const result = await grantPaidSlot({ vendorId, buildingId, tradeGroup: TRADE_GROUP, staffId: randomUUID(), now: new Date() });
    expect(result.result).toBe('granted');
    // period_start = old.period_end + 1 ngay (SPEC-P05-Dispatch.md §10.9.2).
    const oldEndDate = new Date(`${oldSlot[0]!.period_end.split('T')[0]}T00:00:00Z`);
    const expectedStart = new Date(oldEndDate.getTime() + 86_400_000).toISOString().slice(0, 10);
    expect(result.periodStart).toBe(expectedStart);

    const oldRows = await sql<{ status: string }>(`select status from vendor_slots where id = $1`, [oldSlot[0]!.id]);
    expect(oldRows[0]!.status).toBe('expired');

    const activeRows = await sql<{ c: number }>(
      `select count(*)::int as c from vendor_slots where vendor_id = $1 and status = 'active'`,
      [vendorId]
    );
    expect(activeRows[0]!.c).toBe(1);

    const ledgerRows = await sql<{ kind: string }>(`select kind from ledger_entries where vendor_id = $1`, [vendorId]);
    expect(ledgerRows.length).toBe(2);
    expect(ledgerRows.map((r) => r.kind).sort()).toEqual(['bql_share', 'slot_fee']);

    // status='expired' (khong 'active') de KHONG dung phai `one_active_slot`
    // (da co 1 dong active tu grantPaidSlot o tren) — muc dich la kiem
    // rieng `one_trial_ever` (ap dung bat ke status, chi xet is_trial=true).
    await expect(
      sql(
        `insert into vendor_slots (vendor_id, building_id, trade_group, is_trial, period_start, period_end, fee, status)
         values ($1,$2,$3,true, current_date, current_date + 30, 0, 'expired')`,
        [vendorId, buildingId, TRADE_GROUP]
      )
    ).rejects.toThrow(/one_trial_ever/);
  });
});

describe('G15(d) — dong ho gia: period_end = hom qua => expired + claimJob => no_slot', () => {
  it('runTimers(now) => vendor_slots expired; claimJob cua tho do => IneligibleVendorError(no_slot)', async () => {
    const buildingId = await createFreshBuilding();
    await setCapacity(buildingId, 5);
    await sql(
      `insert into vendor_groups (building_id, trade_group, zalo_account_id, thread_id) values ($1,$2,'market',$3)`,
      [buildingId, TRADE_GROUP, `sim-market-${randomUUID().slice(0, 8)}`]
    );
    const vendorId = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: -1 });
    const vendorUid = await linkVendorIdentity(vendorId);

    const now = new Date();
    const report = await runTimers(now);
    expect(report.slots_expired).toBeGreaterThanOrEqual(1);

    const slotRows = await sql<{ status: string }>(`select status from vendor_slots where vendor_id = $1`, [vendorId]);
    expect(slotRows[0]!.status).toBe('expired');

    const dmTexts = await outboxTexts('market', vendorUid);
    expect(dmTexts.length).toBeGreaterThan(0);

    const apartmentId = await createApartment(buildingId);
    const residentId = await createResident();
    const job = await createJob({
      buildingId,
      apartmentId,
      residentId,
      categoryCode: CATEGORY,
      mode: 'quote',
      status: 'case_open',
      windowStart: new Date(now.getTime() + 2 * 3_600_000),
      windowEnd: new Date(now.getTime() + 5 * 3_600_000),
    });
    await publishJobToGroup({ jobId: job.id, actor: { type: 'agent', id: residentId }, now });
    await expect(claimJob({ jobCode: job.code, vendorId, now, source: 'agent' })).rejects.toMatchObject({
      code: 'IneligibleVendorError',
      message: expect.stringMatching(/^no_slot/),
    });
  });
});

describe('G15(e) — expireWaitlistInvites sau WAITLIST_INVITE_HOURS', () => {
  it('loi moi qua han => bi xoa, nguoi ke duoc moi', async () => {
    const buildingId = await createFreshBuilding();
    await setCapacity(buildingId, 1);
    await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 }); // day tran

    const v1 = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: null });
    const v2 = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: null });
    await requestSlot({ vendorId: v1, buildingId, tradeGroup: TRADE_GROUP, now: new Date() });
    await requestSlot({ vendorId: v2, buildingId, tradeGroup: TRADE_GROUP, now: new Date() });

    // Moi thu cong nguoi dau danh sach cho (gia lap thoi diem qua khu).
    const now = new Date();
    const oldInvite = new Date(now.getTime() - 49 * 3_600_000);
    await sql(
      `update slot_waitlist set invited_at = $1 where building_id = $2 and trade_group = $3
       and vendor_id = (select vendor_id from slot_waitlist where building_id=$2 and trade_group=$3 order by joined_at asc limit 1)`,
      [oldInvite, buildingId, TRADE_GROUP]
    );
    const invitedVendor = await sql<{ vendor_id: string }>(
      `select vendor_id from slot_waitlist where building_id = $1 and trade_group = $2 and invited_at is not null`,
      [buildingId, TRADE_GROUP]
    );
    expect(invitedVendor.length).toBe(1);

    const report = await runTimers(now);
    expect(report.waitlist_invites_expired).toBeGreaterThanOrEqual(1);

    const remainingRows = await sql<{ vendor_id: string }>(
      `select vendor_id from slot_waitlist where building_id = $1 and trade_group = $2`,
      [buildingId, TRADE_GROUP]
    );
    expect(remainingRows.some((r) => r.vendor_id === invitedVendor[0]!.vendor_id)).toBe(false);
  });
});

describe('suggestedCapacity — chi GOI Y, khong tu dat slot_capacity', () => {
  it('toi thieu 2, tang theo so cuoc closed/dispatched 30 ngay / SLOT_MIN_JOBS_PER_VENDOR', async () => {
    const buildingId = await createFreshBuilding();
    const zero = await suggestedCapacity(buildingId, TRADE_GROUP, new Date());
    expect(zero).toBe(2); // khong co cuoc nao => van toi thieu 2 (SPEC-P05 §10.9.2)
  });
});

describe('getSlotSummary', () => {
  it('tra ve slot dang active + vi tri trong danh sach cho', async () => {
    const buildingId = await createFreshBuilding();
    await setCapacity(buildingId, 1);
    const owner = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: 20 });
    const waiter = await createVendor({ buildingId, tradeGroup: TRADE_GROUP, categoryCode: CATEGORY, slotDaysLeft: null });
    await requestSlot({ vendorId: waiter, buildingId, tradeGroup: TRADE_GROUP, now: new Date() });

    const ownerSummary = await getSlotSummary(owner, new Date());
    expect(ownerSummary.slots.length).toBe(1);
    expect(ownerSummary.slots[0]!.tradeGroup).toBe(TRADE_GROUP);

    const waiterSummary = await getSlotSummary(waiter, new Date());
    expect(waiterSummary.waitlist.length).toBe(1);
    expect(waiterSummary.waitlist[0]!.position).toBe(1);
  });
});

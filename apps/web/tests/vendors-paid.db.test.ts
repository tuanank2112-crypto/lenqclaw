// apps/web/tests/vendors-paid.db.test.ts — SPEC-P04-Vendor-Console.md §8.4
// (f)-(h): POST /api/vendors/{id}/slots/paid.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@lenqclaw/core';
import { POST as slotsPaid } from '../app/api/vendors/[id]/slots/paid/route';
import { createBuilding, createVendor, req, idParams } from './p05e-helpers';

async function setCapacity(buildingId: string, tradeGroup: string, capacity: number): Promise<void> {
  await sql(
    `insert into slot_capacity (building_id, trade_group, capacity) values ($1,$2,$3)
     on conflict (building_id, trade_group) do update set capacity = excluded.capacity`,
    [buildingId, tradeGroup, capacity]
  );
}

describe('/api/vendors/{id}/slots/paid (db, SPEC-P04 §8.4 f-h)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
  });

  afterAll(async () => {
    await closeDb();
  });

  it('(f) tho dung thu con han ⇒ "Da thu phi" ⇒ 200 granted; slot cu expired; slot moi period_start = old.period_end+1; 2 ledger_entries', async () => {
    const buildingId = await createBuilding();
    await setCapacity(buildingId, 'dien_nuoc', 2);
    const vendorId = await createVendor({ buildingId, tradeGroup: 'dien_nuoc', categoryCode: 'ong_nuoc_ro', slotDaysLeft: 5, isTrial: true });
    const oldSlotRows = await sql<{ id: string; period_end: string }>(
      `select id, period_end::text as period_end from vendor_slots where vendor_id = $1 and status = 'active'`,
      [vendorId]
    );
    expect(oldSlotRows).toHaveLength(1);

    const res = await slotsPaid(
      await req(`http://localhost/api/vendors/${vendorId}/slots/paid`, 'POST', 'bql_admin', { building_id: buildingId, trade_group: 'dien_nuoc' }),
      idParams(vendorId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBe('granted');

    const oldRows = await sql<{ status: string }>(`select status from vendor_slots where id = $1`, [oldSlotRows[0]!.id]);
    expect(oldRows[0]!.status).toBe('expired');

    const newSlotRows = await sql<{ id: string; period_start: string; status: string }>(
      `select id, period_start::text as period_start, status from vendor_slots where vendor_id = $1 and status = 'active'`,
      [vendorId]
    );
    expect(newSlotRows).toHaveLength(1);
    const expectedStart = new Date(Date.parse(`${oldSlotRows[0]!.period_end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    expect(newSlotRows[0]!.period_start).toBe(expectedStart);

    const ledgerRows = await sql<{ kind: string; amount: number; status: string }>(
      `select kind, amount, status from ledger_entries where slot_id = $1 order by kind`,
      [newSlotRows[0]!.id]
    );
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows).toContainEqual({ kind: 'bql_share', amount: 30000, status: 'due' });
    expect(ledgerRows).toContainEqual({ kind: 'slot_fee', amount: 300000, status: 'paid' });
  });

  it('(g) day tran ⇒ 200 waitlisted', async () => {
    const buildingId = await createBuilding();
    await setCapacity(buildingId, 'dien_nuoc', 1);
    await createVendor({ buildingId, tradeGroup: 'dien_nuoc', categoryCode: 'ong_nuoc_ro', slotDaysLeft: 20, isTrial: false });
    const vendorId = await createVendor({ buildingId, tradeGroup: 'dien_nuoc', categoryCode: 'ong_nuoc_ro', slotDaysLeft: null });

    const res = await slotsPaid(
      await req(`http://localhost/api/vendors/${vendorId}/slots/paid`, 'POST', 'bql_admin', { building_id: buildingId, trade_group: 'dien_nuoc' }),
      idParams(vendorId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBe('waitlisted');
    expect(body.position).toBe(1);
  });

  it('(h) bql_staff ⇒ 403', async () => {
    const buildingId = await createBuilding();
    await setCapacity(buildingId, 'dien_nuoc', 2);
    const vendorId = await createVendor({ buildingId, tradeGroup: 'dien_nuoc', categoryCode: 'ong_nuoc_ro', slotDaysLeft: 5, isTrial: true });
    const res = await slotsPaid(
      await req(`http://localhost/api/vendors/${vendorId}/slots/paid`, 'POST', 'bql_staff', { building_id: buildingId, trade_group: 'dien_nuoc' }),
      idParams(vendorId)
    );
    expect(res.status).toBe(403);
  });
});

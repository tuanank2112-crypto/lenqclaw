// apps/web/tests/vendors-status.db.test.ts — SPEC-P04-Vendor-Console.md §8.4
// (i): POST /api/vendors/{id}/status {status:'suspended'} khi tho dang
// giu mot cuoc `held` ⇒ cuoc nha ve `published`, slot `cancelled`, audit
// `vendor.suspended`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@lenqclaw/core';
import { POST as vendorStatus } from '../app/api/vendors/[id]/status/route';
import { getToaABuildingId, createApartment, createResident, createVendor, createJobHeld, req, idParams } from './p05e-helpers';

describe('/api/vendors/{id}/status (db, SPEC-P04 §8.4 i)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
  });

  afterAll(async () => {
    await closeDb();
  });

  it('(i) dinh chi tho dang held ⇒ cuoc published, slot cancelled, audit vendor.suspended', async () => {
    const buildingId = await getToaABuildingId();
    const apartmentId = await createApartment(buildingId);
    const residentId = await createResident();
    const vendorId = await createVendor({ buildingId, tradeGroup: 'dien_nuoc', categoryCode: 'ong_nuoc_ro', slotDaysLeft: 20 });
    const now = new Date();
    const { jobId } = await createJobHeld({ buildingId, apartmentId, residentId, vendorId, categoryCode: 'ong_nuoc_ro', now });

    const res = await vendorStatus(
      await req(`http://localhost/api/vendors/${vendorId}/status`, 'POST', 'bql_admin', { status: 'suspended', note: 'Bùng nhiều lần' }),
      idParams(vendorId)
    );
    expect(res.status).toBe(200);

    const jobRows = await sql<{ status: string; assigned_vendor_id: string | null }>(
      `select status, assigned_vendor_id from jobs where id = $1`,
      [jobId]
    );
    expect(jobRows[0]!.status).toBe('published');
    expect(jobRows[0]!.assigned_vendor_id).toBeNull();

    const slotRows = await sql<{ status: string }>(`select status from vendor_slots where vendor_id = $1`, [vendorId]);
    expect(slotRows.every((r) => r.status === 'cancelled')).toBe(true);

    const vendorRows = await sql<{ status: string }>(`select status from vendors where id = $1`, [vendorId]);
    expect(vendorRows[0]!.status).toBe('suspended');

    const auditRows = await sql<{ c: number }>(
      `select count(*)::int as c from audit_log where action = 'vendor.suspended' and target = $1 and data->>'note' = 'Bùng nhiều lần'`,
      [vendorId]
    );
    expect(auditRows[0]!.c).toBeGreaterThanOrEqual(1);
  });
});

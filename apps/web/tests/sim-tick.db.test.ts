// apps/web/tests/sim-tick.db.test.ts — SPEC-P04-Vendor-Console.md §8.4 (j):
// POST /api/dev/sim/tick.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@lenqclaw/core';
import { POST as simTick } from '../app/api/dev/sim/tick/route';
import { getToaABuildingId, createApartment, createResident, createVendor, createJobHeld, req } from './p05e-helpers';

describe('/api/dev/sim/tick (db, SPEC-P04 §8.4 j)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
  });

  afterEach(() => {
    delete process.env.DATA_MODE;
  });

  afterAll(async () => {
    await closeDb();
  });

  it('DATA_MODE ≠ sim ⇒ 404', async () => {
    delete process.env.DATA_MODE;
    const res = await simTick(await req('http://localhost/api/dev/sim/tick', 'POST', 'bql_admin', {}));
    expect(res.status).toBe(404);
  });

  it('now = +11 phut sau khi cuoc held ⇒ holds_released: 1', async () => {
    process.env.DATA_MODE = 'sim';
    const buildingId = await getToaABuildingId();
    const apartmentId = await createApartment(buildingId);
    const residentId = await createResident();
    const vendorId = await createVendor({ buildingId, tradeGroup: 'dien_nuoc', categoryCode: 'ong_nuoc_ro', slotDaysLeft: 20 });
    const now = new Date();
    await createJobHeld({ buildingId, apartmentId, residentId, vendorId, categoryCode: 'ong_nuoc_ro', now });

    const later = new Date(now.getTime() + 11 * 60_000);
    const res = await simTick(
      await req('http://localhost/api/dev/sim/tick', 'POST', 'bql_admin', { now: later.toISOString() })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.holds_released).toBeGreaterThanOrEqual(1);
    expect(typeof body.delivered).toBe('number');
  });
});

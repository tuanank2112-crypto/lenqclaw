// apps/web/tests/tickets-decision.db.test.ts — SPEC-P04-Vendor-Console.md
// §8.4 (a)-(e): POST /api/tickets/{id}/decision. Cuoc dung qua dich vu core
// that (publishJobToGroup/claimJob/confirmAssignment/requestAccess).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@lenqclaw/core';
import { POST as decision } from '../app/api/tickets/[id]/decision/route';
import {
  getToaABuildingId,
  createApartment,
  createResident,
  createVendor,
  createJobToAccessPending,
  linkVendorIdentity,
  outboxTexts,
  req,
  idParams,
} from './p05e-helpers';

describe('/api/tickets/{id}/decision (db, SPEC-P04 §8.4 a-e)', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-minimum-xxxxxxxx';
  });

  afterAll(async () => {
    await closeDb();
  });

  async function buildTicket() {
    const buildingId = await getToaABuildingId();
    const apartmentId = await createApartment(buildingId);
    const residentId = await createResident();
    const vendorId = await createVendor({ buildingId, tradeGroup: 'dien_nuoc', categoryCode: 'ong_nuoc_ro', slotDaysLeft: 20 });
    await linkVendorIdentity(vendorId);
    const now = new Date();
    const { jobId, jobCode, ticketId } = await createJobToAccessPending({
      buildingId,
      apartmentId,
      residentId,
      vendorId,
      categoryCode: 'ong_nuoc_ro',
      now,
    });
    return { buildingId, jobId, jobCode, ticketId, vendorId, now };
  }

  it('(a) guard ⇒ 403, khong doi gi', async () => {
    const { ticketId } = await buildTicket();
    const res = await decision(await req(`http://localhost/api/tickets/${ticketId}/decision`, 'POST', 'guard', { decision: 'approve' }), idParams(ticketId));
    expect(res.status).toBe(403);
    const rows = await sql<{ status: string }>(`select status from tickets where id = $1`, [ticketId]);
    expect(rows[0]!.status).toBe('open');
  });

  it('(b) bql_staff reject khong note ⇒ 400, ticket van open', async () => {
    const { ticketId } = await buildTicket();
    const res = await decision(
      await req(`http://localhost/api/tickets/${ticketId}/decision`, 'POST', 'bql_staff', { decision: 'reject' }),
      idParams(ticketId)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('note_required');
    const rows = await sql<{ status: string }>(`select status from tickets where id = $1`, [ticketId]);
    expect(rows[0]!.status).toBe('open');
  });

  it('(c) reject co note ⇒ 200, ticket rejected + decision_note, cuoc published, khong con gan tho, co tin ĐĂNG LẠI', async () => {
    const { ticketId, jobId, jobCode } = await buildTicket();
    const res = await decision(
      await req(`http://localhost/api/tickets/${ticketId}/decision`, 'POST', 'bql_staff', { decision: 'reject', note: 'Không hợp lệ' }),
      idParams(ticketId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, job_code: jobCode, status: 'published' });
    const ticketRows = await sql<{ status: string; decision_note: string }>(
      `select status, decision_note from tickets where id = $1`,
      [ticketId]
    );
    expect(ticketRows[0]!.status).toBe('rejected');
    expect(ticketRows[0]!.decision_note).toBe('Không hợp lệ');
    const jobRows = await sql<{ status: string; assigned_vendor_id: string | null }>(
      `select status, assigned_vendor_id from jobs where id = $1`,
      [jobId]
    );
    expect(jobRows[0]!.status).toBe('published');
    expect(jobRows[0]!.assigned_vendor_id).toBeNull();
    const texts = await outboxTexts('market', 'sim-market-dien_nuoc');
    expect(texts.some((t) => t.includes('ĐĂNG LẠI'))).toBe(true);
  });

  it('(d) approve ⇒ 200, ticket approved, cuoc access_granted, dung 1 access_passes con hieu luc, dung 1 inbound_events sys-*', async () => {
    const { ticketId, jobId, jobCode, now } = await buildTicket();
    const res = await decision(
      await req(`http://localhost/api/tickets/${ticketId}/decision`, 'POST', 'bql_admin', { decision: 'approve' }),
      idParams(ticketId)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, job_code: jobCode, status: 'access_granted' });

    const ticketRows = await sql<{ status: string }>(`select status from tickets where id = $1`, [ticketId]);
    expect(ticketRows[0]!.status).toBe('approved');

    const jobRows = await sql<{ status: string; window_start: string; window_end: string }>(
      `select status, window_start::text as window_start, window_end::text as window_end from jobs where id = $1`,
      [jobId]
    );
    expect(jobRows[0]!.status).toBe('access_granted');

    const passRows = await sql<{ valid_from: string; valid_to: string }>(
      `select valid_from::text as valid_from, valid_to::text as valid_to from access_passes where job_id = $1 and revoked_at is null`,
      [jobId]
    );
    expect(passRows).toHaveLength(1);
    const expectedFrom = new Date(new Date(jobRows[0]!.window_start).getTime() - 30 * 60_000);
    const expectedTo = new Date(new Date(jobRows[0]!.window_end).getTime() + 120 * 60_000);
    expect(new Date(passRows[0]!.valid_from).getTime()).toBe(expectedFrom.getTime());
    expect(new Date(passRows[0]!.valid_to).getTime()).toBe(expectedTo.getTime());

    const sysEvents = await sql<{ zalo_msg_id: string }>(
      `select zalo_msg_id from inbound_events where zalo_msg_id like 'sys-%' and payload->>'job_id' = $1`,
      [jobId]
    );
    expect(sysEvents).toHaveLength(1);
    void now;
  });

  it('(e) approve lan 2 ⇒ 409', async () => {
    const { ticketId } = await buildTicket();
    const first = await decision(
      await req(`http://localhost/api/tickets/${ticketId}/decision`, 'POST', 'bql_admin', { decision: 'approve' }),
      idParams(ticketId)
    );
    expect(first.status).toBe(200);
    const second = await decision(
      await req(`http://localhost/api/tickets/${ticketId}/decision`, 'POST', 'bql_admin', { decision: 'approve' }),
      idParams(ticketId)
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toBe('ticket_not_open');
  });
});

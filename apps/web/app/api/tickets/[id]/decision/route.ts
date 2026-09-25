// POST /api/tickets/{id}/decision — SPEC-P04-Vendor-Console.md §8.2, §8.6.
// Duyet/tu choi ticket access_request; moi doi trang thai cuoc/ticket di
// qua core `decideAccessRequest` (CAM SQL doi trang thai truc tiep trong
// route — §8.2).

import { NextResponse, type NextRequest } from 'next/server';
import { sql, audit } from '@lenqclaw/core';
import { decideAccessRequest } from '@lenqclaw/core/services/access';
import { ConflictError, JobNotFoundError } from '@lenqclaw/core/domain/errors';
import { requireRole } from '../../../_auth';

export const dynamic = 'force-dynamic';

interface RawBody {
  decision?: unknown;
  note?: unknown;
}

interface DecisionBody {
  decision: 'approve' | 'reject';
  note: string | null;
}

function parseBody(raw: RawBody | null): DecisionBody | null {
  if (!raw) return null;
  if (raw.decision !== 'approve' && raw.decision !== 'reject') return null;
  if (raw.note !== undefined && typeof raw.note !== 'string') return null;
  return { decision: raw.decision, note: typeof raw.note === 'string' ? raw.note : null };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const check = await requireRole(req, ['bql_admin', 'bql_staff']);
  if (!check.ok) {
    return NextResponse.json({ error: check.status === 401 ? 'unauthorized' : 'forbidden' }, { status: check.status });
  }
  const { id } = await ctx.params;

  const raw = (await req.json().catch(() => null)) as RawBody | null;
  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  // §8.2: tu choi thieu ly do => 400 TRUOC khi vao core.
  if (body.decision === 'reject' && (!body.note || body.note.trim().length === 0)) {
    return NextResponse.json({ error: 'note_required' }, { status: 400 });
  }

  // Phan biet 404 (ticket khong ton tai / khong phai access_request) voi
  // 409 (ton tai nhung khong con 'open') — decideAccessRequest chi nem
  // MOT loai loi (ConflictError) cho ca hai truong hop trong cau UPDATE
  // co dieu kien cua no, nen doc truoc (khong doi trang thai) de tach.
  const ticketRows = await sql<{ id: string }>(`select id from tickets where id = $1 and kind = 'access_request'`, [id]);
  if (ticketRows.length === 0) {
    return NextResponse.json({ error: 'ticket_not_found' }, { status: 404 });
  }

  try {
    const result = await decideAccessRequest({
      ticketId: id,
      decision: body.decision,
      note: body.note,
      staffId: check.session.uid,
      now: new Date(),
    });
    return NextResponse.json({ ok: true, job_code: result.jobCode, status: result.status });
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: 'ticket_not_open' }, { status: 409 });
    }
    if (err instanceof JobNotFoundError) {
      return NextResponse.json({ error: 'ticket_not_found' }, { status: 404 });
    }
    await audit(sql, {
      actorType: 'staff',
      actorId: check.session.uid,
      action: 'web.error',
      target: id,
      data: { route: 'tickets.decision', name: err instanceof Error ? err.name : 'Unknown' },
    });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

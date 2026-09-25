// apps/web/app/jobs/[code]/page.tsx — SPEC-P04-Vendor-Console.md §8.3
// "/jobs/{code}": dong thoi gian job_events + audit tool.*/timer.*/system.*
// co target = job id.

import { notFound } from 'next/navigation';
import { sql } from '@lenqclaw/core';

export const dynamic = 'force-dynamic';

interface JobEventRow {
  id: number;
  from_status: string | null;
  to_status: string;
  actor_type: string;
  actor_id: string | null;
  data: unknown;
  created_at: string;
}

interface AuditRow {
  id: number;
  actor_type: string | null;
  actor_id: string | null;
  action: string;
  data: unknown;
  created_at: string;
}

export default async function JobDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const jobRows = await sql<{ id: string; status: string }>(`select id, status from jobs where code = $1`, [code]);
  const job = jobRows[0];
  if (!job) notFound();

  const events = await sql<JobEventRow>(
    `select id, from_status, to_status, actor_type, actor_id, data, created_at::text as created_at
     from job_events where job_id = $1 order by created_at asc, id asc`,
    [job.id]
  );

  const auditRows = await sql<AuditRow>(
    `select id, actor_type, actor_id, action, data, created_at::text as created_at
     from audit_log
     where target = $1 and (action like 'tool.%' or action like 'timer.%' or action like 'system.%')
     order by created_at asc, id asc`,
    [job.id]
  );

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      {process.env.DATA_MODE === 'sim' ? (
        <div style={{ background: '#fef3c7', padding: 8, borderRadius: 4, marginBottom: 16, fontWeight: 'bold' }}>
          DỮ LIỆU MÔ PHỎNG
        </div>
      ) : null}
      <h1>
        Cuốc {code} — {job.status}
      </h1>

      <section style={{ marginBottom: 24 }}>
        <h2>Dòng thời gian trạng thái</h2>
        <ul>
          {events.map((e) => (
            <li key={e.id}>
              {new Date(e.created_at).toLocaleString('vi-VN')} — {e.from_status ?? '(bắt đầu)'} → {e.to_status} (
              {e.actor_type}
              {e.actor_id ? `:${e.actor_id}` : ''}) {e.data ? JSON.stringify(e.data) : ''}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Việc agent/đồng hồ đã làm</h2>
        <ul>
          {auditRows.map((a) => (
            <li key={a.id}>
              {new Date(a.created_at).toLocaleString('vi-VN')} — {a.action} ({a.actor_type}
              {a.actor_id ? `:${a.actor_id}` : ''}) {a.data ? JSON.stringify(a.data) : ''}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

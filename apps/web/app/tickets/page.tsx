// apps/web/app/tickets/page.tsx — SPEC-P04-Vendor-Console.md §8.3 "/tickets"
// (dashboard chinh cua P04 toi thieu): ba khoi ticket, sap xep created_at
// desc, gioi han 100 moi khoi. `force-dynamic` (G09) — trang doc thang DB
// moi request, khong cache tinh.

import { sql } from '@lenqclaw/core';
import { readDispatchConfig } from '@lenqclaw/core/services/dispatch-config';
import TicketDecisionForm from './TicketDecisionForm';

export const dynamic = 'force-dynamic';

interface AccessTicketRow {
  id: string;
  summary: string;
  job_code: string | null;
  created_at: string;
}

interface OtherTicketRow {
  id: string;
  kind: string;
  summary: string;
  citations: unknown;
  created_at: string;
}

interface CaseTicketRow {
  id: string;
  job_code: string;
  job_status: string;
  created_at: string;
}

export default async function TicketsPage() {
  const cfg = readDispatchConfig();

  const accessTickets = await sql<AccessTicketRow>(
    `select t.id, t.summary, j.code as job_code, t.created_at::text as created_at
     from tickets t left join jobs j on j.id = t.source_job_id
     where t.kind = 'access_request' and t.status = 'open'
     order by t.created_at desc limit 100`
  );

  const otherTickets = await sql<OtherTicketRow>(
    `select id, kind, summary, citations, created_at::text as created_at
     from tickets
     where kind in ('bql_responsibility','unclear','emergency','no_vendor','dispute') and status = 'open'
     order by created_at desc limit 100`
  );

  const caseTickets = await sql<CaseTicketRow>(
    `select t.id, j.code as job_code, j.status as job_status, t.created_at::text as created_at
     from tickets t join jobs j on j.id = t.source_job_id
     where t.kind = 'service_case' and t.status = 'open'
     order by t.created_at desc limit 100`
  );

  const nowMs = Date.now();
  const remindMs = cfg.accessRemindMin * 60_000;

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      {process.env.DATA_MODE === 'sim' ? (
        <div style={{ background: '#fef3c7', padding: 8, borderRadius: 4, marginBottom: 16, fontWeight: 'bold' }}>
          DỮ LIỆU MÔ PHỎNG
        </div>
      ) : null}
      <h1>Ticket</h1>

      <section style={{ marginBottom: 32 }}>
        <h2>Cần bạn làm ngay</h2>
        {accessTickets.length === 0 ? <p style={{ color: '#888' }}>Không có ticket cần duyệt.</p> : null}
        {accessTickets.map((t) => {
          const overdue = nowMs - new Date(t.created_at).getTime() > remindMs;
          return (
            <div key={t.id} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong>{t.job_code ?? '(không có mã cuốc)'}</strong>
                <span style={{ color: '#666', fontSize: 13 }}>Tạo lúc {new Date(t.created_at).toLocaleString('vi-VN')}</span>
                {overdue ? <span style={{ color: '#fff', background: '#dc2626', padding: '0 6px', borderRadius: 4, fontSize: 12 }}>QUÁ HẠN</span> : null}
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '8px 0' }}>{t.summary}</pre>
              <TicketDecisionForm ticketId={t.id} />
            </div>
          );
        })}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2>Ticket khác cần theo dõi</h2>
        {otherTickets.length === 0 ? <p style={{ color: '#888' }}>Không có ticket đang mở.</p> : null}
        {otherTickets.map((t) => (
          <div key={t.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>{t.kind}</strong>
              <span style={{ color: '#666', fontSize: 13 }}>Tạo lúc {new Date(t.created_at).toLocaleString('vi-VN')}</span>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '8px 0' }}>{t.summary}</pre>
            {t.citations ? <pre style={{ fontSize: 12, color: '#666' }}>{JSON.stringify(t.citations)}</pre> : null}
          </div>
        ))}
      </section>

      <section>
        <h2>Việc trong căn (service_case)</h2>
        {caseTickets.length === 0 ? <p style={{ color: '#888' }}>Không có case đang mở.</p> : null}
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Mã cuốc</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Trạng thái cuốc</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Tạo lúc</th>
            </tr>
          </thead>
          <tbody>
            {caseTickets.map((t) => (
              <tr key={t.id}>
                <td>{t.job_code}</td>
                <td>{t.job_status}</td>
                <td>{new Date(t.created_at).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

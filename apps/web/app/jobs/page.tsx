// apps/web/app/jobs/page.tsx — SPEC-P04-Vendor-Console.md §8.3 "/jobs" (🟢,
// tuy chon nhung nen co de nhin cuoc ket). Bang cuoc 7 ngay gan nhat.

import Link from 'next/link';
import { sql } from '@lenqclaw/core';

export const dynamic = 'force-dynamic';

interface JobRow {
  code: string;
  status: string;
  category_code: string | null;
  apartment: string;
  vendor_name: string | null;
  hold_expires_at: string | null;
  publish_expires_at: string | null;
  created_at: string;
}

export default async function JobsPage() {
  const jobs = await sql<JobRow>(
    `select j.code, j.status, j.category_code, a.code as apartment, v.full_name as vendor_name,
            j.hold_expires_at::text as hold_expires_at, j.publish_expires_at::text as publish_expires_at,
            j.created_at::text as created_at
     from jobs j
     join apartments a on a.id = j.apartment_id
     left join vendors v on v.id = j.assigned_vendor_id
     where j.created_at >= now() - interval '7 days'
     order by j.created_at desc`
  );

  const nowMs = Date.now();

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      {process.env.DATA_MODE === 'sim' ? (
        <div style={{ background: '#fef3c7', padding: 8, borderRadius: 4, marginBottom: 16, fontWeight: 'bold' }}>
          DỮ LIỆU MÔ PHỎNG
        </div>
      ) : null}
      <h1>Cuốc (7 ngày gần nhất)</h1>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Mã</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Trạng thái</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Danh mục</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Căn</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Thợ</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Hold/Publish hết hạn</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const grantedTooLong =
              j.status === 'access_granted' && nowMs - new Date(j.created_at).getTime() > 15 * 60_000;
            const rowStyle =
              j.status === 'unassigned' || grantedTooLong ? { background: '#fee2e2' } : undefined;
            return (
              <tr key={j.code} style={rowStyle}>
                <td>
                  <Link href={`/jobs/${j.code}`}>{j.code}</Link>
                </td>
                <td>{j.status}</td>
                <td>{j.category_code ?? '—'}</td>
                <td>{j.apartment}</td>
                <td>{j.vendor_name ?? '—'}</td>
                <td>{j.hold_expires_at ?? j.publish_expires_at ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}

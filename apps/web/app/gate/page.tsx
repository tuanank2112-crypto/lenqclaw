// apps/web/app/gate/page.tsx — SPEC-P04-Vendor-Console.md §8.3 "/gate"
// (thay `/passes` — code + SPEC-P01 §7 da dung `/gate`, Đ27). Bang the vao
// toa con hieu luc hom nay cho bao ve. CAM hien SDT cu dan (§8.5); nut
// "Da vao" la P06 (KHONG lam o day).

import { sql } from '@lenqclaw/core';

export const dynamic = 'force-dynamic';

interface PassRow {
  code: string;
  full_name: string;
  apartment: string;
  job_code: string;
  valid_from: string;
  valid_to: string;
  used_at: string | null;
}

export default async function GatePage() {
  const passes = await sql<PassRow>(
    `select p.code, v.full_name, a.code as apartment, j.code as job_code, p.valid_from::text as valid_from,
            p.valid_to::text as valid_to, p.used_at::text as used_at
     from access_passes p
     join jobs j on j.id = p.job_id
     join vendors v on v.id = p.vendor_id
     join apartments a on a.id = j.apartment_id
     where p.revoked_at is null and p.valid_to >= now() and p.valid_from < now() + interval '1 day'
     order by p.valid_from`
  );

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      {process.env.DATA_MODE === 'sim' ? (
        <div style={{ background: '#fef3c7', padding: 8, borderRadius: 4, marginBottom: 16, fontWeight: 'bold' }}>
          DỮ LIỆU MÔ PHỎNG
        </div>
      ) : null}
      <h1>Bảo vệ — Cổng vào tòa</h1>
      {passes.length === 0 ? <p style={{ color: '#888' }}>Không có thẻ vào còn hiệu lực hôm nay.</p> : null}
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Mã</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Tên thợ</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Căn</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Mã cuốc</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Khung giờ</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Đã vào lúc</th>
          </tr>
        </thead>
        <tbody>
          {passes.map((p) => (
            <tr key={p.code}>
              <td>{p.code}</td>
              <td>{p.full_name}</td>
              <td>{p.apartment}</td>
              <td>{p.job_code}</td>
              <td>
                {new Date(p.valid_from).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}–
                {new Date(p.valid_to).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td>{p.used_at ? new Date(p.used_at).toLocaleString('vi-VN') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

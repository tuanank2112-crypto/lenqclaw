// apps/web/app/vendors/page.tsx — SPEC-P04-Vendor-Console.md §8.3 "/vendors"
// ("Thợ & slot"): (1) bảng thợ + Duyệt/Đình chỉ, (2) bảng slot theo
// (tòa × nhóm nghề) với thành viên/danh sách chờ/slot hết hạn 7 ngày,
// (3) form đặt trần. `force-dynamic` (G09).

import { sql } from '@lenqclaw/core';
import { readDispatchConfig } from '@lenqclaw/core/services/dispatch-config';
import { suggestedCapacity } from '@lenqclaw/core/services/slots';
import VendorStatusActions from './VendorStatusActions';
import SlotPaidButton from './SlotPaidButton';
import CapacityForm from './CapacityForm';

export const dynamic = 'force-dynamic';

interface VendorRow {
  id: string;
  full_name: string;
  phone: string;
  status: string;
  buildings: string;
  trade_groups: string;
  jobs_done: number | null;
  rating_avg: number | null;
  no_show_count: number | null;
}

interface CapacityRow {
  building_id: string;
  building_code: string;
  trade_group: string;
  capacity: number;
}

interface MemberRow {
  vendor_id: string;
  full_name: string;
  is_trial: boolean;
  period_end: string;
}

interface ExpiredRow {
  full_name: string;
  period_end: string;
}

interface WaitlistRow {
  vendor_id: string;
  full_name: string;
  joined_at: string;
  invited_at: string | null;
}

export default async function VendorsPage() {
  const cfg = readDispatchConfig();
  const now = new Date();

  const vendors = await sql<VendorRow>(
    `select v.id, v.full_name, v.phone, v.status,
            coalesce((select string_agg(distinct b.code, ', ') from vendor_buildings vb join buildings b on b.id = vb.building_id where vb.vendor_id = v.id), '') as buildings,
            coalesce((select string_agg(distinct c.trade_group, ', ') from vendor_skills sk join job_categories c on c.code = sk.category_code where sk.vendor_id = v.id), '') as trade_groups,
            vs.jobs_done, vs.rating_avg, vs.no_show_count
     from vendors v
     left join vendor_scores vs on vs.vendor_id = v.id
     order by v.created_at desc`
  );

  const buildingsRows = await sql<{ id: string; code: string }>(`select id, code from buildings order by code`);

  const capacities = await sql<CapacityRow>(
    `select sc.building_id, b.code as building_code, sc.trade_group, sc.capacity
     from slot_capacity sc join buildings b on b.id = sc.building_id
     order by b.code, sc.trade_group`
  );

  const slotBlocks = await Promise.all(
    capacities.map(async (c) => {
      const [members, expired, waitlist, suggested, activeCount] = await Promise.all([
        sql<MemberRow>(
          `select vs.vendor_id, v.full_name, vs.is_trial, vs.period_end::text as period_end
           from vendor_slots vs join vendors v on v.id = vs.vendor_id
           where vs.building_id = $1 and vs.trade_group = $2 and vs.status = 'active' and vs.period_end >= current_date
           order by vs.period_end`,
          [c.building_id, c.trade_group]
        ),
        sql<ExpiredRow>(
          `select v.full_name, vs.period_end::text as period_end
           from vendor_slots vs join vendors v on v.id = vs.vendor_id
           where vs.building_id = $1 and vs.trade_group = $2 and vs.status = 'expired'
             and vs.period_end >= current_date - interval '7 days'
           order by vs.period_end desc`,
          [c.building_id, c.trade_group]
        ),
        sql<WaitlistRow>(
          `select w.vendor_id, v.full_name, w.joined_at::text as joined_at, w.invited_at::text as invited_at
           from slot_waitlist w join vendors v on v.id = w.vendor_id
           where w.building_id = $1 and w.trade_group = $2
           order by w.joined_at`,
          [c.building_id, c.trade_group]
        ),
        suggestedCapacity(c.building_id, c.trade_group as never, now),
        sql<{ n: number }>(
          `select count(*)::int as n from vendor_slots where building_id = $1 and trade_group = $2 and status = 'active' and period_end >= current_date`,
          [c.building_id, c.trade_group]
        ).then((r) => r[0]?.n ?? 0),
      ]);
      return { ...c, members, expired, waitlist, suggested, activeCount };
    })
  );

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      {process.env.DATA_MODE === 'sim' ? (
        <div style={{ background: '#fef3c7', padding: 8, borderRadius: 4, marginBottom: 16, fontWeight: 'bold' }}>
          DỮ LIỆU MÔ PHỎNG
        </div>
      ) : null}
      <h1>Thợ &amp; slot</h1>

      <section style={{ marginBottom: 32 }}>
        <h2>Thợ</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Tên</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>SĐT</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Trạng thái</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Nhóm nghề</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Tòa</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Cuốc/Điểm/Bùng</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id}>
                <td>{v.full_name}</td>
                <td>{v.phone}</td>
                <td>{v.status}</td>
                <td>{v.trade_groups}</td>
                <td>{v.buildings}</td>
                <td>
                  {v.jobs_done ?? 0} cuốc · {v.rating_avg == null ? 'chưa có' : `${v.rating_avg}★`} · bùng {v.no_show_count ?? 0}
                </td>
                <td>
                  <VendorStatusActions vendorId={v.id} status={v.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Slot theo tòa × nhóm nghề</h2>
        <CapacityForm buildings={buildingsRows} />
        {slotBlocks.map((b) => (
          <div key={`${b.building_id}-${b.trade_group}`} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12, marginBottom: 12 }}>
            <h3 style={{ margin: '0 0 8px' }}>
              {b.building_code} · {b.trade_group} — trần {b.capacity} (gợi ý {b.suggested}) · đang dùng {b.activeCount}
            </h3>
            <div style={{ marginBottom: 8 }}>
              <strong>Thành viên:</strong>
              {b.members.length === 0 ? (
                <span style={{ color: '#888' }}> (chưa có)</span>
              ) : (
                <ul style={{ margin: '4px 0' }}>
                  {b.members.map((m) => {
                    const daysLeft = Math.round((Date.parse(m.period_end) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000);
                    return (
                      <li key={m.vendor_id}>
                        {m.full_name} — {m.is_trial ? 'dùng thử' : 'trả phí'}, hết hạn {m.period_end} (còn {daysLeft} ngày){' '}
                        <SlotPaidButton vendorId={m.vendor_id} buildingId={b.building_id} tradeGroup={b.trade_group} feeVnd={cfg.slotFeeMonthly} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {b.expired.length > 0 ? (
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: '#dc2626' }}>Cần gỡ khỏi nhóm Zalo (hết hạn trong 7 ngày qua):</strong>
                <ul style={{ margin: '4px 0' }}>
                  {b.expired.map((e, i) => (
                    <li key={i}>
                      {e.full_name} — hết hạn {e.period_end}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <strong>Danh sách chờ:</strong>
              {b.waitlist.length === 0 ? (
                <span style={{ color: '#888' }}> (không có)</span>
              ) : (
                <ol style={{ margin: '4px 0' }}>
                  {b.waitlist.map((w) => (
                    <li key={w.vendor_id}>
                      {w.full_name} — vào {new Date(w.joined_at).toLocaleString('vi-VN')}
                      {w.invited_at ? ` (đã mời ${new Date(w.invited_at).toLocaleString('vi-VN')})` : ''}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

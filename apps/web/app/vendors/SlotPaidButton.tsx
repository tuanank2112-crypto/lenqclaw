'use client';

// apps/web/app/vendors/SlotPaidButton.tsx — SPEC-P04-Vendor-Console.md §8.3:
// nut "Đã thu phí" xac nhan bang confirm() ghi ro so tien SLOT_FEE_MONTHLY,
// goi POST /api/vendors/{id}/slots/paid.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SlotPaidButton({
  vendorId,
  buildingId,
  tradeGroup,
  feeVnd,
}: {
  vendorId: string;
  buildingId: string;
  tradeGroup: string;
  feeVnd: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!confirm(`Xác nhận đã thu ${feeVnd.toLocaleString('vi-VN')}đ phí slot tháng của thợ này?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/slots/paid`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ building_id: buildingId, trade_group: tradeGroup }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? `lỗi ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button disabled={busy} onClick={onClick} style={{ background: '#2563eb', color: '#fff', border: 0, padding: '2px 8px', borderRadius: 4 }}>
        Đã thu phí
      </button>
      {error ? <span style={{ color: '#dc2626', fontSize: 12, marginLeft: 4 }}>{error}</span> : null}
    </span>
  );
}

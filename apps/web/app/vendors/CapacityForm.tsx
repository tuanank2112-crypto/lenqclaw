'use client';

// apps/web/app/vendors/CapacityForm.tsx — SPEC-P04-Vendor-Console.md §8.3:
// form nho dat tran slot POST /api/vendors/capacity {building_id,
// trade_group, capacity}.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TRADE_GROUPS = [
  { value: 'dien_nuoc', label: 'Điện nước' },
  { value: 'khoa', label: 'Khoá' },
  { value: 'dien_lanh', label: 'Điện lạnh' },
  { value: 'xay_sua', label: 'Xây sửa' },
];

export default function CapacityForm({ buildings }: { buildings: { id: string; code: string }[] }) {
  const router = useRouter();
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? '');
  const [tradeGroup, setTradeGroup] = useState(TRADE_GROUPS[0]!.value);
  const [capacity, setCapacity] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/vendors/capacity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ building_id: buildingId, trade_group: tradeGroup, capacity }),
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
    <form onSubmit={onSubmit} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
      <span>Đặt trần slot:</span>
      <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code}
          </option>
        ))}
      </select>
      <select value={tradeGroup} onChange={(e) => setTradeGroup(e.target.value)}>
        {TRADE_GROUPS.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={1}
        value={capacity}
        onChange={(e) => setCapacity(Number(e.target.value))}
        style={{ width: 60 }}
      />
      <button type="submit" disabled={busy}>
        Lưu
      </button>
      {error ? <span style={{ color: '#dc2626', fontSize: 12 }}>{error}</span> : null}
    </form>
  );
}

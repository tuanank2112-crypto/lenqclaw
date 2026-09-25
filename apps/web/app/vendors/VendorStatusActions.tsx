'use client';

// apps/web/app/vendors/VendorStatusActions.tsx — SPEC-P04-Vendor-Console.md
// §8.3: nut Duyet (khi pending) va Dinh chi (+ ly do) => POST
// /api/vendors/{id}/status.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VendorStatusActions({ vendorId, status }: { vendorId: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? `lỗi ${res.status}`);
        return;
      }
      setNote('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === 'pending') {
    return (
      <button disabled={busy} onClick={() => post({ status: 'active' })} style={{ background: '#16a34a', color: '#fff', border: 0, padding: '2px 8px', borderRadius: 4 }}>
        Duyệt
      </button>
    );
  }
  if (status === 'suspended') {
    return <span style={{ color: '#888' }}>Đã đình chỉ</span>;
  }
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do đình chỉ" style={{ width: 120 }} />
      <button
        disabled={busy || note.trim().length === 0}
        onClick={() => post({ status: 'suspended', note })}
        style={{ background: '#dc2626', color: '#fff', border: 0, padding: '2px 8px', borderRadius: 4 }}
      >
        Đình chỉ
      </button>
      {error ? <span style={{ color: '#dc2626', fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}

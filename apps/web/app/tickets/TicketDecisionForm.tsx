'use client';

// apps/web/app/tickets/TicketDecisionForm.tsx — SPEC-P04-Vendor-Console.md
// §8.3: nut Duyet / Tu choi + o ly do (bat buoc khi tu choi; nut Tu choi
// disabled khi rong) goi POST /api/tickets/{id}/decision, sau do
// `router.refresh()`.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TicketDecisionForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, note: decision === 'reject' ? note : undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `loi ${res.status}`);
        return;
      }
      setNote('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <button onClick={() => decide('approve')} disabled={busy} style={{ background: '#16a34a', color: '#fff', border: 0, padding: '4px 10px', borderRadius: 4 }}>
        Duyệt
      </button>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Lý do từ chối (bắt buộc)"
        style={{ flex: 1, minWidth: 160 }}
      />
      <button
        onClick={() => decide('reject')}
        disabled={busy || note.trim().length === 0}
        style={{ background: '#dc2626', color: '#fff', border: 0, padding: '4px 10px', borderRadius: 4 }}
      >
        Từ chối
      </button>
      {error ? <span style={{ color: '#dc2626' }}>{error}</span> : null}
    </div>
  );
}

'use client';

// SPEC-P02 §9.1/§9.2: trang thai phien, banner do khi kicked/dead/logged_out,
// anh QR con han, tu lam moi 3 s.

import { useCallback, useEffect, useState } from 'react';

interface AccountStatus {
  id: string;
  display_name: string | null;
  session_state: string;
  last_event_at: string | null;
  login_requested_at: string | null;
  qr_data_url: string | null;
  qr_expires_at: string | null;
}

interface AlertItem {
  target: string;
  kind: string | null;
  created_at: string;
}

const STATE_LABEL: Record<string, string> = {
  logged_out: 'Chưa đăng nhập',
  qr_pending: 'Đang chờ quét QR',
  connected: 'Đã kết nối',
  kicked: 'Bị đá phiên (có nơi khác đăng nhập)',
  reconnecting: 'Đang kết nối lại',
  dead: 'Mất kết nối (đã thử lại nhiều lần)',
};

const ALERT_STATES = new Set(['kicked', 'dead', 'logged_out']);
const REFRESH_MS = 3000;

function AccountCard({ a, onLogin, busy }: { a: AccountStatus; onLogin: (id: string) => void; busy: boolean }) {
  const alert = ALERT_STATES.has(a.session_state);
  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      {alert ? (
        <div
          role="alert"
          style={{ background: '#c62828', color: '#fff', padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}
        >
          Cảnh báo: tài khoản {a.id} — {STATE_LABEL[a.session_state] ?? a.session_state}. Bot đang KHÔNG gửi/nhận tin.
          Đăng nhập lại bằng QR.
        </div>
      ) : null}
      <h2 style={{ marginTop: 0 }}>
        {a.display_name ?? a.id} <small>({a.id})</small>
      </h2>
      <p>
        Trạng thái: <b>{STATE_LABEL[a.session_state] ?? a.session_state}</b>
        {a.last_event_at ? <> · sự kiện cuối: {new Date(a.last_event_at).toLocaleString('vi-VN')}</> : null}
      </p>
      {a.qr_data_url ? (
        <div>
          <p>Quét mã này bằng Zalo trên điện thoại (hết hạn {a.qr_expires_at ? new Date(a.qr_expires_at).toLocaleTimeString('vi-VN') : ''}):</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.qr_data_url} alt={`Mã QR đăng nhập Zalo ${a.id}`} width={240} height={240} />
        </div>
      ) : null}
      {a.login_requested_at ? <p>Đã gửi yêu cầu, chờ worker tạo mã QR…</p> : null}
      <button type="button" disabled={busy} onClick={() => onLogin(a.id)}>
        Đăng nhập bằng QR
      </button>
    </section>
  );
}

export default function ZaloBoard() {
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/zalo/status', { cache: 'no-store' });
      if (!res.ok) {
        setError(`Không tải được trạng thái (HTTP ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { accounts: AccountStatus[]; alerts: AlertItem[] };
      setAccounts(data.accounts);
      setAlerts(data.alerts);
      setError(null);
    } catch {
      setError('Không tải được trạng thái (lỗi mạng).');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const onLogin = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/zalo/${encodeURIComponent(id)}/login`, { method: 'POST' });
        if (!res.ok) setError(`Không gửi được yêu cầu đăng nhập (HTTP ${res.status}).`);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  return (
    <div>
      {error ? <p style={{ color: '#c62828' }}>{error}</p> : null}
      {accounts.length === 0 && !error ? <p>Đang tải…</p> : null}
      {accounts.map((a) => (
        <AccountCard key={a.id} a={a} onLogin={onLogin} busy={busy} />
      ))}
      {alerts.length > 0 ? (
        <section>
          <h3>Báo động gần đây</h3>
          <ul>
            {alerts.map((al, i) => (
              <li key={i}>
                {new Date(al.created_at).toLocaleString('vi-VN')} — {al.target}: {al.kind ?? '?'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

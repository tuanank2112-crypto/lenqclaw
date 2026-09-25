'use client';

// SPEC-P02 §9.1/§9.2/§9.8: trang thai phien, banner do khi kicked/dead/logged_out,
// anh QR con han, tu lam moi 3 s; dang xuat + 4 trang thai QR (§9.8, G18/G19).

import { useCallback, useEffect, useState } from 'react';
import {
  LOGIN_LABEL,
  LOGOUT_CONFIRM_TEXT,
  LOGOUT_LABEL,
  NEW_QR_LABEL,
  SCANNED_TEXT,
  needsNewQrButton,
  selectZaloDisplay,
} from './display';

interface AccountStatus {
  id: string;
  display_name: string | null;
  session_state: string;
  last_event_at: string | null;
  login_requested_at: string | null;
  qr_data_url: string | null;
  qr_expires_at: string | null;
  qr_state: string | null;
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

/** Dem nguoc s con lai toi `expiresAt` (§9.8: dong ho dem nguoc toi qr_expires_at). */
function useCountdown(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
}

function AccountCard({
  a,
  onLogin,
  onLogout,
  busy,
}: {
  a: AccountStatus;
  onLogin: (id: string) => void;
  onLogout: (id: string) => void;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const alert = ALERT_STATES.has(a.session_state);
  const kind = selectZaloDisplay(a);
  const secondsLeft = useCountdown(kind === 'waiting_scan' ? a.qr_expires_at : null);

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

      {kind === 'waiting_scan' && a.qr_data_url ? (
        <div>
          <p>Quét mã này bằng Zalo trên điện thoại (còn {secondsLeft ?? 0} giây):</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.qr_data_url} alt={`Mã QR đăng nhập Zalo ${a.id}`} width={240} height={240} />
        </div>
      ) : null}
      {kind === 'scanned' ? <p>{SCANNED_TEXT}</p> : null}
      {a.login_requested_at ? <p>Đã gửi yêu cầu, chờ worker tạo mã QR…</p> : null}

      {kind === 'connected' ? (
        confirming ? (
          <div style={{ border: '1px solid #c62828', borderRadius: 6, padding: 12, marginTop: 8 }}>
            <p>{LOGOUT_CONFIRM_TEXT}</p>
            <button type="button" disabled={busy} onClick={() => onLogout(a.id)}>
              Xác nhận đăng xuất
            </button>{' '}
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
              Huỷ
            </button>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={() => setConfirming(true)}>
            {LOGOUT_LABEL}
          </button>
        )
      ) : (
        <button type="button" disabled={busy} onClick={() => onLogin(a.id)}>
          {needsNewQrButton(kind) ? NEW_QR_LABEL : LOGIN_LABEL}
        </button>
      )}
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

  const onLogout = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/zalo/${encodeURIComponent(id)}/logout`, { method: 'POST' });
        if (!res.ok) setError(`Không gửi được yêu cầu đăng xuất (HTTP ${res.status}).`);
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
        <AccountCard key={a.id} a={a} onLogin={onLogin} onLogout={onLogout} busy={busy} />
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

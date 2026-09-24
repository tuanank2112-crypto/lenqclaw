'use client';

import { useEffect, useState, useCallback } from 'react';

interface ThreadMessage {
  id: number;
  kind: 'in' | 'out';
  text: string;
  at: string;
}

interface ThreadState {
  messages: ThreadMessage[];
}

const RESIDENT_THREAD = { account: 'bql', threadId: 'sim-resident-1', threadType: 'user', defaultSender: 'resident-1' };
const MARKET_THREAD = { account: 'market', threadId: 'sim-market-group', threadType: 'group', defaultSender: 'vendor-1' };

function ThreadPanel({
  title,
  account,
  threadId,
  threadType,
  defaultSender,
}: {
  title: string;
  account: string;
  threadId: string;
  threadType: string;
  defaultSender: string;
}) {
  const [senderUid, setSenderUid] = useState(defaultSender);
  const [text, setText] = useState('');
  const [state, setState] = useState<ThreadState>({ messages: [] });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/dev/sim/thread?account=${encodeURIComponent(account)}&threadId=${encodeURIComponent(threadId)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return;
    const data = (await res.json()) as ThreadState;
    setState(data);
  }, [account, threadId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await fetch('/api/dev/sim/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account, threadId, threadType, senderUid, text }),
      });
      setText('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, flex: 1, minWidth: 280 }}>
      <h2 style={{ fontSize: 16 }}>{title}</h2>
      <div style={{ height: 220, overflowY: 'auto', background: '#fafafa', padding: 8, marginBottom: 8 }}>
        {state.messages.length === 0 ? <p style={{ color: '#888' }}>Chua co tin nhan.</p> : null}
        {state.messages.map((m) => (
          <div key={`${m.kind}-${m.id}`} style={{ textAlign: m.kind === 'out' ? 'right' : 'left', marginBottom: 4 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: 6,
                background: m.kind === 'out' ? '#dbeafe' : '#e5e7eb',
              }}
            >
              {m.text}
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={onSend} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {threadType === 'group' ? (
          <input
            value={senderUid}
            onChange={(e) => setSenderUid(e.target.value)}
            placeholder="sender_uid (tho dang go)"
            style={{ width: 140 }}
          />
        ) : null}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nhap tin nhan…"
          style={{ flex: 1, minWidth: 140 }}
        />
        <button type="submit" disabled={busy}>
          Gui
        </button>
      </form>
    </section>
  );
}

export default function SimBoard() {
  const [replaying, setReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<string | null>(null);

  async function onReplay() {
    setReplaying(true);
    setReplayResult(null);
    try {
      const res = await fetch('/api/dev/sim/replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file: 'echo.jsonl' }),
      });
      const data = await res.json();
      setReplayResult(JSON.stringify(data));
    } finally {
      setReplaying(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button onClick={onReplay} disabled={replaying}>
          {replaying ? 'Dang phat lai…' : 'Phat lai kich ban (echo.jsonl)'}
        </button>
        {replayResult ? <span style={{ marginLeft: 8 }}>{replayResult}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <ThreadPanel
          title="Cu dan (tai khoan bql)"
          account={RESIDENT_THREAD.account}
          threadId={RESIDENT_THREAD.threadId}
          threadType={RESIDENT_THREAD.threadType}
          defaultSender={RESIDENT_THREAD.defaultSender}
        />
        <ThreadPanel
          title="Nhom tho (tai khoan market)"
          account={MARKET_THREAD.account}
          threadId={MARKET_THREAD.threadId}
          threadType={MARKET_THREAD.threadType}
          defaultSender={MARKET_THREAD.defaultSender}
        />
        <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, minWidth: 200 }}>
          <h2 style={{ fontSize: 16 }}>Dashboard BQL</h2>
          <p><a href="/tickets">Xem ticket</a></p>
          <p><a href="/gate">Bao ve</a></p>
        </section>
      </div>
    </div>
  );
}

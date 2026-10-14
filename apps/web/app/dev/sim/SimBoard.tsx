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

const ACCOUNT = 'community';
// P01: mot khung DM + mot khung nhom (sim-group-1, co trong seed-sim). Giao dien nhom day du o P02.
const DM_THREAD = { threadId: 'sim-dm-1', threadType: 'user', defaultSender: 'sim-mem-1' };
const GROUP_THREAD = { threadId: 'sim-group-1', threadType: 'group', defaultSender: 'sim-mem-1' };

function ThreadPanel({
  title,
  account,
  threadId,
  threadType,
  defaultSender,
  onThreadIdChange,
  threadIdOptions,
}: {
  title: string;
  account: string;
  threadId: string;
  threadType: string;
  defaultSender: string;
  onThreadIdChange?: (id: string) => void;
  threadIdOptions?: string[];
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
      {threadIdOptions && onThreadIdChange ? (
        <div style={{ marginBottom: 8 }}>
          <label>
            Nhóm:{' '}
            <select value={threadId} onChange={(e) => onThreadIdChange(e.target.value)}>
              {threadIdOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
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
            placeholder="sender_uid (nguoi dang go)"
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
  const [ticking, setTicking] = useState(false);
  const [tickResult, setTickResult] = useState<string | null>(null);

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

  async function onTick() {
    setTicking(true);
    setTickResult(null);
    try {
      const res = await fetch('/api/dev/sim/tick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setTickResult(JSON.stringify(data));
    } finally {
      setTicking(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={onReplay} disabled={replaying}>
          {replaying ? 'Dang phat lai…' : 'Phat lai kich ban (echo.jsonl)'}
        </button>
        {replayResult ? <span>{replayResult}</span> : null}
        <button onClick={onTick} disabled={ticking}>
          {ticking ? 'Dang tick…' : 'Tick đồng hồ'}
        </button>
        {tickResult ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{tickResult}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <ThreadPanel
          title="Tin nhắn riêng (DM)"
          account={ACCOUNT}
          threadId={DM_THREAD.threadId}
          threadType={DM_THREAD.threadType}
          defaultSender={DM_THREAD.defaultSender}
        />
        <ThreadPanel
          title="Nhóm (sim-group-1)"
          account={ACCOUNT}
          threadId={GROUP_THREAD.threadId}
          threadType={GROUP_THREAD.threadType}
          defaultSender={GROUP_THREAD.defaultSender}
        />
      </div>
    </div>
  );
}

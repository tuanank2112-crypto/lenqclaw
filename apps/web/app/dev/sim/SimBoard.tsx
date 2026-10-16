'use client';

import { useEffect, useState, useCallback } from 'react';

// SPEC-P02 §7.3 — SimBoard nhóm: nhiều người gửi, mention bot, quote, sticker, sự kiện vào/rời nhóm,
// DM thành viên + DM chủ, tick đồng hồ, phát lại kịch bản. Chỉ chạy khi DATA_MODE=sim (trang bị chặn nơi khác).

interface ThreadMessage {
  id: number;
  kind: 'in' | 'out' | 'event';
  msgId: string | null;
  senderUid: string;
  senderName: string | null;
  text: string;
  deleted: boolean;
  at: string;
}

interface ThreadAction {
  id: number;
  action: string;
  status: string;
  result: Record<string, unknown> | null;
  at: string;
}

interface ThreadState {
  messages: ThreadMessage[];
  actions: ThreadAction[];
}

const ACCOUNT = 'community';
const GROUPS = ['sim-group-1', 'sim-group-2', 'sim-group-off'];
const SENDERS = ['sim-mod-1', 'sim-mem-1', 'sim-mem-2', 'sim-mem-3', 'sim-mem-4', 'sim-mem-5', 'sim-owner'];

async function postSend(payload: Record<string, unknown>): Promise<string | null> {
  const res = await fetch('/api/dev/sim/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: ACCOUNT, ...payload }),
  });
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `lỗi ${res.status}`;
}

function useThread(threadId: string) {
  const [state, setState] = useState<ThreadState>({ messages: [], actions: [] });
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/dev/sim/thread?account=${ACCOUNT}&threadId=${encodeURIComponent(threadId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return;
    setState((await res.json()) as ThreadState);
  }, [threadId]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);
  return { state, refresh };
}

function Bubble({ m }: { m: ThreadMessage }) {
  if (m.kind === 'event') {
    return <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, margin: '4px 0' }}>{m.text}</div>;
  }
  const out = m.kind === 'out';
  return (
    <div style={{ textAlign: out ? 'right' : 'left', marginBottom: 4 }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{out ? 'bot' : (m.senderName ?? m.senderUid)}</div>
      <span
        style={{
          display: 'inline-block',
          padding: '4px 8px',
          borderRadius: 6,
          background: out ? '#dbeafe' : '#e5e7eb',
          textDecoration: m.deleted ? 'line-through' : 'none',
          opacity: m.deleted ? 0.55 : 1,
        }}
        title={m.msgId ?? undefined}
      >
        {m.text}
      </span>
    </div>
  );
}

function MessageList({ state }: { state: ThreadState }) {
  return (
    <>
      <div style={{ height: 240, overflowY: 'auto', background: '#fafafa', padding: 8, marginBottom: 8 }}>
        {state.messages.length === 0 ? <p style={{ color: '#888' }}>Chưa có tin nhắn.</p> : null}
        {state.messages.map((m) => (
          <Bubble key={`${m.kind}-${m.id}`} m={m} />
        ))}
      </div>
      {state.actions.length > 0 ? (
        <div style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}>
          {state.actions.map((a) => (
            <div key={a.id}>
              [hành động] {a.action} — {a.status}
              {a.result ? ` ${JSON.stringify(a.result)}` : ''}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function GroupPanel() {
  const [threadId, setThreadId] = useState(GROUPS[0]!);
  const [senderUid, setSenderUid] = useState('sim-mem-1');
  const [text, setText] = useState('');
  const [eventUid, setEventUid] = useState('sim-new-1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state, refresh } = useThread(threadId);

  async function run(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      setError(await postSend({ threadId, threadType: 'group', senderUid, ...payload }));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const lastBotMsgId = [...state.messages].reverse().find((m) => m.kind === 'out' && m.msgId)?.msgId ?? null;

  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, flex: 2, minWidth: 340 }}>
      <h2 style={{ fontSize: 16 }}>Nhóm</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <label>
          Nhóm:{' '}
          <select value={threadId} onChange={(e) => setThreadId(e.target.value)}>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label>
          Người gửi:{' '}
          <input list="sim-senders" value={senderUid} onChange={(e) => setSenderUid(e.target.value)} style={{ width: 130 }} />
          <datalist id="sim-senders">
            {SENDERS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>
      <MessageList state={state} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void run({ text }).then(() => setText(''));
        }}
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập tin nhắn…" style={{ flex: 1, minWidth: 160 }} />
        <button type="submit" disabled={busy}>
          Gửi
        </button>
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void run({ text, mentionBot: true }).then(() => setText(''))}
        >
          Gửi @bot
        </button>
        <button
          type="button"
          disabled={busy || !text.trim() || !lastBotMsgId}
          title={lastBotMsgId ? `trả lời ${lastBotMsgId}` : 'chưa có tin bot'}
          onClick={() => void run({ text, quoteMsgId: lastBotMsgId }).then(() => setText(''))}
        >
          Trả lời tin bot gần nhất
        </button>
        <button type="button" disabled={busy} onClick={() => void run({ text: '', msgType: 'chat.sticker' })}>
          Sticker
        </button>
      </form>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={eventUid} onChange={(e) => setEventUid(e.target.value)} placeholder="uid" style={{ width: 120 }} />
        <button type="button" disabled={busy} onClick={() => void run({ text: '', event: 'join', eventUids: [eventUid], eventNames: [eventUid] })}>
          Thành viên mới vào (uid)
        </button>
        <button type="button" disabled={busy} onClick={() => void run({ text: '', event: 'join_request', eventUids: [eventUid], eventNames: [eventUid] })}>
          Xin vào nhóm (uid)
        </button>
        <button type="button" disabled={busy} onClick={() => void run({ text: '', event: 'leave', eventUids: [eventUid], eventNames: [eventUid] })}>
          Rời nhóm
        </button>
      </div>
      {error ? <p style={{ color: '#b91c1c' }}>Lỗi: {error}</p> : null}
    </section>
  );
}

function DmPanel({ title, fixedSender }: { title: string; fixedSender?: string }) {
  const [senderUid, setSenderUid] = useState(fixedSender ?? 'sim-mem-1');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Zalo: thread DM = uid của người kia ⇒ khung theo người gửi.
  const threadId = senderUid;
  const { state, refresh } = useThread(threadId);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setError(await postSend({ threadId, threadType: 'user', senderUid, text }));
      setText('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, flex: 1, minWidth: 260 }}>
      <h2 style={{ fontSize: 16 }}>{title}</h2>
      {fixedSender ? (
        <p style={{ fontSize: 12, color: '#6b7280' }}>Người gửi: {fixedSender}</p>
      ) : (
        <label style={{ display: 'block', marginBottom: 8 }}>
          Người gửi (uid):{' '}
          <input value={senderUid} onChange={(e) => setSenderUid(e.target.value)} style={{ width: 130 }} />
        </label>
      )}
      <MessageList state={state} />
      <form onSubmit={onSend} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập tin nhắn…" style={{ flex: 1, minWidth: 140 }} />
        <button type="submit" disabled={busy}>
          Gửi
        </button>
      </form>
      {error ? <p style={{ color: '#b91c1c' }}>Lỗi: {error}</p> : null}
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
      setReplayResult(JSON.stringify(await res.json()));
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
      setTickResult(JSON.stringify(await res.json()));
    } finally {
      setTicking(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={onReplay} disabled={replaying}>
          {replaying ? 'Đang phát lại…' : 'Phát lại kịch bản (echo.jsonl)'}
        </button>
        {replayResult ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{replayResult}</span> : null}
        <button onClick={onTick} disabled={ticking}>
          {ticking ? 'Đang tick…' : 'Tick đồng hồ'}
        </button>
        {tickResult ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{tickResult}</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <GroupPanel />
        <DmPanel title="DM thành viên" />
        <DmPanel title="DM chủ" fixedSender="sim-owner" />
      </div>
    </div>
  );
}

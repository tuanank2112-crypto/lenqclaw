import { getSessionPayload } from '../lib/auth/guard';

export default async function HomePage() {
  const session = await getSessionPayload();
  return (
    <main style={{ padding: 24 }}>
      <h1>San viec tho — Console BQL</h1>
      <p>Trang chu tam (P01). Dashboard that lam o P04.</p>
      {session ? (
        <ul>
          <li>Dang nhap: {session.uid} ({session.role})</li>
          <li><a href="/tickets">Ticket</a></li>
          <li><a href="/gate">Bao ve (gate)</a></li>
          {session.role === 'bql_admin' ? <li><a href="/dev/sim">Man chat gia lap (dev)</a></li> : null}
          {session.role === 'bql_admin' ? <li><a href="/zalo">Kết nối Zalo</a></li> : null}
          <li><a href="/api/auth/logout">Dang xuat</a></li>
        </ul>
      ) : (
        <p><a href="/login">Dang nhap</a></p>
      )}
    </main>
  );
}

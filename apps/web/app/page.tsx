import { getSessionPayload } from '../lib/auth/guard';

export default async function HomePage() {
  const session = await getSessionPayload();
  return (
    <main style={{ padding: 24 }}>
      <h1>lenqclaw — Trợ lý cộng đồng</h1>
      <p>Trang chủ tạm (P01 kế hoạch 02). Dashboard thật làm ở P08.</p>
      {session ? (
        <ul>
          <li>Dang nhap: {session.uid} ({session.role})</li>
          {session.role === 'admin' ? <li><a href="/dev/sim">Man chat gia lap (dev)</a></li> : null}
          {session.role === 'admin' ? <li><a href="/zalo">Kết nối Zalo</a></li> : null}
          <li><a href="/api/auth/logout">Dang xuat</a></li>
        </ul>
      ) : (
        <p><a href="/login">Dang nhap</a></p>
      )}
    </main>
  );
}

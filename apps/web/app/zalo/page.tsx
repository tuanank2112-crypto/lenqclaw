import { notFound } from 'next/navigation';
import { getSessionPayload } from '../../lib/auth/guard';
import ZaloBoard from './ZaloBoard';

// SPEC-P02 §9.2: trang ket noi Zalo — chi bql_admin (middleware da chan,
// kiem lai o day de phong thu). Render moi request.
export const dynamic = 'force-dynamic';

export default async function ZaloPage() {
  const session = await getSessionPayload();
  if (!session || session.role !== 'bql_admin') notFound();
  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>Kết nối Zalo</h1>
      <p>
        Tài khoản <b>bql</b> (giai đoạn 1). Bấm “Đăng nhập bằng QR”, rồi quét mã bằng Zalo trên điện thoại. KHÔNG mở Zalo
        Web/PC bằng tài khoản này (sẽ bị đá phiên).
      </p>
      <ZaloBoard />
      <p style={{ marginTop: 24 }}>
        <a href="/">← Trang chủ</a>
      </p>
    </main>
  );
}

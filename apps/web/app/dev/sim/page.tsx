import { notFound } from 'next/navigation';
import { getSessionPayload } from '../../../lib/auth/guard';
import SimBoard from './SimBoard';

// R02-tham-dinh D3: thieu dong nay, Next prerender trang nay TINH luc build
// (khi DATA_MODE chua dat) thanh 404 co dinh, boi qua DATA_MODE that luc
// chay. `force-dynamic` bat trang nay luon render moi request, doc dung
// `process.env.DATA_MODE` va cookie hien hanh.
export const dynamic = 'force-dynamic';

export default async function DevSimPage() {
  // middleware.ts da chan DATA_MODE!=sim va vai khac bql_admin; kiem lai o
  // day de phong thu (defense in depth) — man nay ghi thang inbound_events.
  if (process.env.DATA_MODE !== 'sim') notFound();
  const session = await getSessionPayload();
  if (!session || session.role !== 'bql_admin') notFound();

  return (
    <main style={{ padding: 24 }}>
      <h1>Man chat gia lap (DATA_MODE=sim)</h1>
      <p>Ba khung: cu dan, nhom tho, lien ket sang dashboard BQL.</p>
      <SimBoard />
    </main>
  );
}

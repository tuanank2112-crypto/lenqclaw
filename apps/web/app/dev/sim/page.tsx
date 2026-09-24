import { notFound } from 'next/navigation';
import { getSessionPayload } from '../../../lib/auth/guard';
import SimBoard from './SimBoard';

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

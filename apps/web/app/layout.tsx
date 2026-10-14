import type { ReactNode } from 'react';

export const metadata = {
  title: 'lenqclaw — Trợ lý cộng đồng',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}

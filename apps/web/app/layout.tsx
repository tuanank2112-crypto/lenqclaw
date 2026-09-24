import type { ReactNode } from 'react';

export const metadata = {
  title: 'San viec tho — Console BQL',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}

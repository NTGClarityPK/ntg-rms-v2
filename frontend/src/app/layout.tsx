import type { Metadata } from 'next';
import { Providers } from '@/components/providers/Providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'RMS - Restaurant Management System',
  description: 'Restaurant Management System with offline-first architecture',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}


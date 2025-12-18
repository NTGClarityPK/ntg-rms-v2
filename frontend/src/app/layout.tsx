import type { Metadata } from 'next';
import { Providers } from '@/components/providers/Providers';
import '@/styles/globals.css';
// import { Audiowide, Saira, JetBrains_Mono } from 'next/font/google';
import { Rajdhani, Saira, JetBrains_Mono } from 'next/font/google';

// Primary font: Saira with weights 400, 500, 600, 700
const primaryFont = Saira({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-primary',
  display: 'swap',
});

// Heading font: Audiowide
const headingFont = Rajdhani({
  subsets: ['latin'],
  weight: '700',
  variable: '--font-heading',
  display: 'swap',
});

// Monospace font: JetBrains Mono with weights 400, 500, 600, 700
const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

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
      <body className={`${primaryFont.variable} ${headingFont.variable} ${monoFont.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}


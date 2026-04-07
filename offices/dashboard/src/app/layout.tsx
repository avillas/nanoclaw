import type { Metadata } from 'next';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'NanoClaw Mission Control',
  description: 'Operations dashboard for NanoClaw AI agent offices',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" {...{ suppressHydrationWarning: true }}>
      <body className="min-h-screen noise-overlay">
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

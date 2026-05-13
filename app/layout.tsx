import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rashed Ali — Management Portal',
  description: 'Accounting, profit sharing & shareholder portal — Rashed Ali Cafeterias',
  icons: {
    icon: [
      { url: '/favicon RA/favicon.ico',     sizes: 'any' },
      { url: '/favicon RA/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon RA/favicon.svg',     type: 'image/svg+xml' },
    ],
    apple: '/favicon RA/apple-touch-icon.png',
  },
  manifest: '/favicon RA/site.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

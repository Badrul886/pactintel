import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PactIntel — E-Signature and Contract Platform',
  description: 'Enterprise contract lifecycle, proposals, quotes, and e-signatures.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

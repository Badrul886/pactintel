import type { Metadata } from 'next';
import './globals.css';
import { AppIntlProvider } from './i18n-provider';

export const metadata: Metadata = {
  title: 'PactIntel — E-Signature and Contract Platform',
  description: 'Enterprise contract lifecycle, proposals, quotes, and e-signatures.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppIntlProvider>{children}</AppIntlProvider>
      </body>
    </html>
  );
}

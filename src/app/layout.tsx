import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'BUZZ BASE',
    template: '%s | BUZZ BASE',
  },
  description: '交流を、ゲームにする。交流会向けスパイ探し×交流ゲーム',
  applicationName: 'BUZZ BASE',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'BUZZ BASE',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: false, follow: false },
  other: {
    // iOS Safari は現在も旧来のキーを見るため、明示的に出しておく
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import './globals.css';
import { OneSignalInit } from '@/components/onesignal-init';
import { PwaInstallPrompt } from '@/components/pwa-install-prompt';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#245D80',
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://camilaintegrativa.vercel.app'),
  title: {
    default: 'Camila Machado | Espaço de atendimento integrativo',
    template: '%s | Camila Machado',
  },
  description:
    'Conheça os serviços e solicite um horário no espaço de atendimento de Camila Machado.',
  keywords: ['hipnose integrativa', 'Camila Machado', 'atendimento presencial', 'atendimento online', 'agendamento'],
  manifest: '/manifest.json',
  applicationName: 'Camila Machado',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Camila Machado',
  },
  formatDetection: {
    telephone: true,
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Camila Machado | Espaço de Atendimento Integrativo',
    description:
      'Hipnose Clínica Integrativa, Agendamentos Online e Presenciais, Acompanhamento Terapêutico e Sessões Coletivas.',
    url: 'https://camilaintegrativa.vercel.app',
    siteName: 'Camila Machado Integrativa',
    type: 'website',
    locale: 'pt_BR',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Camila Machado | Espaço de Atendimento Integrativo',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Camila Machado | Espaço de Atendimento Integrativo',
    description:
      'Hipnose Clínica Integrativa, Agendamentos Online e Presenciais e Sessões Coletivas.',
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <OneSignalInit />
        <PwaInstallPrompt />
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  manifest: '/manifest-cliente.json',
  title: {
    default: 'Camila Integrativa',
    template: '%s | Camila Integrativa',
  },
  description: 'Seus agendamentos, sessões, prontuário e acompanhamento terapêutico.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Camila Integrativa',
  },
};

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}


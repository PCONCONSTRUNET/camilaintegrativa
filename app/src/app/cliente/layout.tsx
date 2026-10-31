import type { Metadata } from 'next';

export const metadata: Metadata = {
  manifest: '/manifest-cliente.json',
  title: {
    default: 'Portal do Paciente | Camila Machado',
    template: '%s | Camila Machado',
  },
  description: 'Seus agendamentos, sessões, prontuário e acompanhamento terapêutico.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Meu Portal',
  },
};

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}


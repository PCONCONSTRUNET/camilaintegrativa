import type { Metadata } from 'next';

export const metadata: Metadata = {
  manifest: '/manifest-admin.json',
  title: 'Acessar Painel | Camila Machado',
  description: 'Acesso restrito à gestão da clínica Camila Machado.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Admin Clínica',
  },
};

export default function EntrarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

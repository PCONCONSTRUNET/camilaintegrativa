import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AdminShell from './admin-shell';

export const metadata: Metadata = {
  manifest: '/manifest-admin.json',
  title: {
    default: 'Painel Clínico | Camila Machado',
    template: '%s | Camila Machado',
  },
  description: 'Gestão de agenda, prontuários, financeiro e pacientes.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Admin Clínica',
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="app-loading">Verificando acesso…</div>}>
      <ProtectedAdmin>{children}</ProtectedAdmin>
    </Suspense>
  );
}

async function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');
  return <AdminShell user={{ name: user.name, role: user.role }}>{children}</AdminShell>;
}

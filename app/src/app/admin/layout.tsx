import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import AdminShell from './admin-shell';

export const instant = false;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="app-loading">Verificando acesso…</div>}>
      <ProtectedAdmin>{children}</ProtectedAdmin>
    </Suspense>
  );
}

async function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect('/entrar');
  return <AdminShell user={{ name: user.name, role: user.role }}>{children}</AdminShell>;
}

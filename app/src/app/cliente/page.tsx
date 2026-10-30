import { redirect } from 'next/navigation';
import { getCurrentClient } from '@/lib/auth';
import { getClientPortalData } from '@/lib/repository';
import ClientPortalView from './client-portal-view';

export const metadata = {
  title: 'Área do Cliente | Camila Machado',
  description: 'Portal exclusivo do paciente para agendamentos, pagamentos e prontuário.',
};

export default async function ClientPortalPage() {
  const session = await getCurrentClient();

  if (!session) {
    redirect('/cliente/entrar');
  }

  try {
    const data = await getClientPortalData(session.clientId);
    return <ClientPortalView initialData={data} />;
  } catch {
    redirect('/cliente/entrar');
  }
}

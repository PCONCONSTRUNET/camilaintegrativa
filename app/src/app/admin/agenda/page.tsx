import { connection } from 'next/server';
import { canManageAgenda, getCurrentUser } from '@/lib/auth';
import AgendaClient from './agenda-client';

const CLINIC_TIME_ZONE = 'America/Sao_Paulo';

function currentClinicDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default async function AgendaPage() {
  await connection();
  const currentUser = await getCurrentUser();
  return <AgendaClient initialDate={currentClinicDate()} canManageAgenda={Boolean(currentUser && canManageAgenda(currentUser))} />;
}

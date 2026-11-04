import { listPublicServices } from '@/lib/repository';
import { getClinicPixConfig } from '@/lib/pix-settings';
import { processDue24hReminders } from '@/lib/whatsapp-reminders';
import { connection } from 'next/server';

export async function GET() {
  await connection();
  void processDue24hReminders({ opportunistic: true }).catch(() => null);
  const [services, pixConfig] = await Promise.all([
    listPublicServices(),
    getClinicPixConfig(),
  ]);
  return Response.json({ services, pixConfig });
}

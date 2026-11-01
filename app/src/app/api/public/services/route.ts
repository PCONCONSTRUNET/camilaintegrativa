import { listPublicServices } from '@/lib/repository';
import { getClinicPixConfig } from '@/lib/pix-settings';
import { connection } from 'next/server';

export async function GET() {
  await connection();
  const [services, pixConfig] = await Promise.all([
    listPublicServices(),
    getClinicPixConfig(),
  ]);
  return Response.json({ services, pixConfig });
}

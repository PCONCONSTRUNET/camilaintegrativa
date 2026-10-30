import { listPublicServices } from '@/lib/repository';
import { connection } from 'next/server';

export async function GET() {
  await connection();
  return Response.json({ services: await listPublicServices() });
}

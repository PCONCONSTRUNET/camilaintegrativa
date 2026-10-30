import { getCurrentUser } from '@/lib/auth';
import { createAdminService, listAdminServices } from '@/lib/repository';
import { adminServiceSchema } from '@/lib/validation';
import { errorResponse } from '@/lib/http';

export async function GET() {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  return Response.json({ services: await listAdminServices() });
}

export async function POST(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    const body = await request.json();
    const parsed = adminServiceSchema.parse(body);
    const service = await createAdminService(parsed);
    return Response.json({ service }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

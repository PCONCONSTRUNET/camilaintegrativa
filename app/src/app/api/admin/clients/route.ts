import { getCurrentUser } from '@/lib/auth';
import { createClient, listClients } from '@/lib/repository';
import { clientSchema } from '@/lib/validation';
import { errorResponse } from '@/lib/http';

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const url = new URL(request.url);
  return Response.json({ clients: await listClients(url.searchParams.get('search') ?? '', url.searchParams.get('status') ?? 'todos') });
}

export async function POST(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    const client = await createClient(clientSchema.parse(await request.json()));
    return Response.json({ client }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('UNIQUE') || error.message.includes('duplicate key') || error.message.includes('unique constraint'))) {
      return Response.json({ error: 'Já existe um cliente com este telefone.' }, { status: 409 });
    }
    return errorResponse(error);
  }
}

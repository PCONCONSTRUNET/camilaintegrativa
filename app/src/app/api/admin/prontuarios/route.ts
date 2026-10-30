import { getCurrentUser } from '@/lib/auth';
import { listProntuarios } from '@/lib/repository';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get('search') ?? '';
  const status = url.searchParams.get('status') ?? 'todos';

  return Response.json({ prontuarios: await listProntuarios(search, status) });
}

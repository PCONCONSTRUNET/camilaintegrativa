import { getCurrentUser } from '@/lib/auth';
import { createClient, listClients, listClientsPaginated } from '@/lib/repository';
import { clientSchema } from '@/lib/validation';
import { errorResponse } from '@/lib/http';
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';
import { IDS } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const url = new URL(request.url);
  const search = url.searchParams.get('search') ?? '';
  const status = url.searchParams.get('status') ?? 'todos';

  if (url.searchParams.get('paginated') === '1' || url.searchParams.has('limit')) {
    const rawLimit = url.searchParams.get('limit');
    const parsedLimit = rawLimit === 'all' || rawLimit === '0' ? 0 : Math.max(1, Number(rawLimit || 20) || 20);
    const parsedOffset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
    const result = await listClientsPaginated({
      search,
      filter: status,
      limit: parsedLimit,
      offset: parsedOffset,
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  }

  return Response.json({ clients: await listClients(search, status) });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    const parsed = clientSchema.parse(await request.json());
    const client = await createClient(parsed);

    const { ip, userAgent } = extractClientMetadata(request);
    await recordAuditLog({
      clinicId: IDS.clinic,
      actorType: 'admin',
      actorId: currentUser.userId,
      actorName: currentUser.name,
      category: 'paciente',
      action: 'cliente_cadastrado',
      title: 'Novo Paciente Cadastrado',
      description: `Paciente "${parsed.name}" cadastrado(a) manualmente no sistema por ${currentUser.name}.`,
      severity: 'info',
      ipAddress: ip,
      userAgent,
      details: {
        clientId: client.id,
        name: parsed.name,
        phone: parsed.phone,
        email: parsed.email || null,
        status: parsed.status,
      },
    }).catch(() => null);

    return Response.json({ client }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('UNIQUE') || error.message.includes('duplicate key') || error.message.includes('unique constraint'))) {
      return Response.json({ error: 'Já existe um cliente com este telefone.' }, { status: 409 });
    }
    return errorResponse(error);
  }
}

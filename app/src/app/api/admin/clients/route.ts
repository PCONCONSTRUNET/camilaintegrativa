import { getCurrentUser } from '@/lib/auth';
import { createClient, listClients } from '@/lib/repository';
import { clientSchema } from '@/lib/validation';
import { errorResponse } from '@/lib/http';
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';
import { IDS } from '@/lib/db';

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const url = new URL(request.url);
  return Response.json({ clients: await listClients(url.searchParams.get('search') ?? '', url.searchParams.get('status') ?? 'todos') });
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

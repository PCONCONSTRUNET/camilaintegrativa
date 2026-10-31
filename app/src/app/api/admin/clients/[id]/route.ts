import { getCurrentUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { deleteClient, updateClient } from '@/lib/repository';
import { clientSchema } from '@/lib/validation';
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';
import { IDS } from '@/lib/db';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = clientSchema.parse(body);
    const client = await updateClient(id, parsed);

    const { ip, userAgent } = extractClientMetadata(request);
    await recordAuditLog({
      clinicId: IDS.clinic,
      actorType: 'admin',
      actorId: currentUser.userId,
      actorName: currentUser.name,
      category: 'paciente',
      action: 'cliente_atualizado',
      title: 'Atualização Cadastral de Paciente',
      description: `Cadastro do(a) paciente "${parsed.name}" atualizado por ${currentUser.name}.`,
      severity: 'info',
      ipAddress: ip,
      userAgent,
      details: {
        clientId: id,
        name: parsed.name,
        phone: parsed.phone,
        email: parsed.email || null,
        status: parsed.status,
      },
    }).catch(() => null);

    return Response.json({ client });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('UNIQUE') ||
        error.message.includes('duplicate key') ||
        error.message.includes('unique constraint'))
    ) {
      return Response.json(
        { error: 'Já existe outro cliente cadastrado com este telefone.' },
        { status: 409 },
      );
    }
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const { ip, userAgent } = extractClientMetadata(request);
    const result = await deleteClient(id, {
      userId: currentUser.userId,
      name: currentUser.name,
      ip,
      userAgent,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}


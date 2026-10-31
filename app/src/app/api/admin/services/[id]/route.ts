import { getCurrentUser } from '@/lib/auth';
import { deleteAdminService, updateAdminService, BookingValidationError } from '@/lib/repository';
import { adminServiceSchema } from '@/lib/validation';
import { errorResponse } from '@/lib/http';
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';
import { IDS } from '@/lib/db';
import { z } from 'zod';

const idSchema = z.string().uuid('ID de serviço inválido.');

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    const { id: rawId } = await context.params;
    const id = idSchema.parse(rawId);
    const body = await request.json();
    const parsed = adminServiceSchema.parse(body);
    const service = await updateAdminService(id, parsed);
    return Response.json({ service });
  } catch (error) {
    if (error instanceof BookingValidationError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return PUT(request, context);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    const { id: rawId } = await context.params;
    const id = idSchema.parse(rawId);
    const result = await deleteAdminService(id);

    const { ip, userAgent } = extractClientMetadata(request);
    await recordAuditLog({
      clinicId: IDS.clinic,
      actorType: 'admin',
      actorId: currentUser.userId,
      actorName: currentUser.name,
      category: 'seguranca',
      action: 'servico_excluido',
      title: 'Exclusão de Serviço da Clínica',
      description: `Serviço (ID ${id}) excluído do catálogo clínico por ${currentUser.name}.`,
      severity: 'aviso',
      ipAddress: ip,
      userAgent,
      details: { serviceId: id },
    }).catch(() => null);

    return Response.json(result);
  } catch (error) {
    if (error instanceof BookingValidationError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return errorResponse(error);
  }
}

import { canManageAgenda, getCurrentUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { BookingValidationError, deleteTimeBlock } from '@/lib/repository';
import { z } from 'zod';

const idSchema = z.string().uuid('Bloqueio inválido.');

export async function DELETE(_request: Request, context: RouteContext<'/api/admin/time-blocks/[id]'>) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  if (!canManageAgenda(currentUser)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    const { id: rawId } = await context.params;
    const id = idSchema.parse(rawId);
    await deleteTimeBlock(id, currentUser.userId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof BookingValidationError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return errorResponse(error);
  }
}

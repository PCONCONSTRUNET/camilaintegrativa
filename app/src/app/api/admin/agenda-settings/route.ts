import { canManageAgenda, getCurrentUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { BookingValidationError, getAgendaSettings, updateAgendaSettings } from '@/lib/repository';
import { agendaSettingsPatchSchema } from '@/lib/validation';

export async function GET() {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  return Response.json(await getAgendaSettings());
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  if (!canManageAgenda(currentUser)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    const input = agendaSettingsPatchSchema.parse(await request.json());
    return Response.json(await updateAgendaSettings(input, currentUser.userId));
  } catch (error) {
    if (error instanceof BookingValidationError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return errorResponse(error);
  }
}

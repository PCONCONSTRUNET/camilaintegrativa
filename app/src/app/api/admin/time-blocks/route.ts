import { canManageAgenda, getCurrentUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import {
  BookingConflictError,
  BookingValidationError,
  createTimeBlock,
  listTimeBlocksInRange,
} from '@/lib/repository';
import { agendaRangeSchema, timeBlockCreateSchema } from '@/lib/validation';

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    const params = new URL(request.url).searchParams;
    const range = agendaRangeSchema.parse({ from: params.get('from'), to: params.get('to') });
    return Response.json({ blocks: await listTimeBlocksInRange(range.from, range.to) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  if (!canManageAgenda(currentUser)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    const input = timeBlockCreateSchema.parse(await request.json());
    return Response.json({ block: await createTimeBlock(input, currentUser.userId) }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof BookingValidationError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return errorResponse(error);
  }
}

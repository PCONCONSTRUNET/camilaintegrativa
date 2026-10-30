import { canManageAgenda, getCurrentUser } from '@/lib/auth';
import {
  AgendaPermissionError,
  BookingConflictError,
  BookingValidationError,
  createInternalAppointment,
  listAppointments,
  listAppointmentsInRange,
} from '@/lib/repository';
import { dateKeyInClinicTimeZone } from '@/lib/time';
import { internalAppointmentSchema } from '@/lib/validation';
import { errorResponse } from '@/lib/http';
import { triggerAppointmentBookedReminder } from '@/lib/whatsapp-reminders';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const from = params.get('from');
  const to = params.get('to');

  if (from || to) {
    if (!from || !to || !isValidDateKey(from) || !isValidDateKey(to)) {
      return Response.json({ error: 'Período inválido.' }, { status: 422 });
    }

    const start = new Date(`${from}T12:00:00Z`);
    const end = new Date(`${to}T12:00:00Z`);
    const rangeInDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
    if (rangeInDays < 0 || rangeInDays > 62) {
      return Response.json({ error: 'O período deve ter no máximo 63 dias.' }, { status: 422 });
    }

    return Response.json({ appointments: await listAppointmentsInRange(from, to), from, to });
  }

  const date = params.get('date') ?? dateKeyInClinicTimeZone();
  if (!isValidDateKey(date)) return Response.json({ error: 'Data inválida.' }, { status: 422 });
  return Response.json({ appointments: await listAppointments(date), date });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    const input = internalAppointmentSchema.parse(await request.json());
    const appointment = await createInternalAppointment(input, currentUser.userId, canManageAgenda(currentUser));
    if (appointment.status !== 'cancelado' && appointment.status !== 'nao_compareceu') {
      await triggerAppointmentBookedReminder(appointment.id).catch(() => null);
    }
    return Response.json({ appointment }, { status: 201 });
  } catch (error) {
    if (error instanceof AgendaPermissionError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof BookingConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof BookingValidationError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return errorResponse(error);
  }
}

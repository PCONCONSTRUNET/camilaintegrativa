import { canManageAgenda, getCurrentUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import {
  AppointmentStaleError,
  AgendaPermissionError,
  BookingConflictError,
  BookingValidationError,
  editAppointment,
  resizeAppointment,
  updateAppointmentStatus,
} from '@/lib/repository';
import { appointmentPatchSchema } from '@/lib/validation';
import {
  triggerAppointmentBookedReminder,
  triggerAppointmentCancelledReminder,
} from '@/lib/whatsapp-reminders';
import { notifyAdminCancelledAppointment } from '@/lib/admin-push-alerts';

export async function PATCH(request: Request, context: RouteContext<'/api/admin/appointments/[id]'>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    const { id } = await context.params;
    const input = appointmentPatchSchema.parse(await request.json());
    if (!('operation' in input)) {
      const statusResult = await updateAppointmentStatus(id, input.status, user.userId);
      if (statusResult.changed) {
        if (input.status === 'cancelado') {
          await triggerAppointmentCancelledReminder(id, 'Cancelado pela clínica').catch(() => null);
        } else if (input.status === 'confirmado') {
          await triggerAppointmentBookedReminder(id).catch(() => null);
        }
      }
      return Response.json({ ok: true });
    }

    if (input.operation === 'edit') {
      const updated = await editAppointment(id, input, user.userId, canManageAgenda(user));
      if (updated.status === 'cancelado') {
        await triggerAppointmentCancelledReminder(id, 'Cancelado pela clínica', input.notes).catch(() => null);
        await notifyAdminCancelledAppointment({
          appointmentId: id,
          clientName: updated.clientName,
          serviceName: updated.serviceName,
          startAt: updated.startAt,
          reason: input.notes || null,
          cancelledBy: 'pela administração',
        }).catch(() => null);
      }
      return Response.json({ appointment: updated });
    }

    const result = await resizeAppointment(id, input, user.userId);
    return Response.json({
      appointment: result.appointment,
      change: {
        changed: result.changed,
        previousEndAt: result.previousEndAt,
        newEndAt: result.appointment.endAt,
        durationMinutes: input.durationMinutes,
      },
    });
  } catch (error) {
    if (error instanceof AgendaPermissionError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof BookingConflictError || error instanceof AppointmentStaleError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof BookingValidationError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return errorResponse(error);
  }
}

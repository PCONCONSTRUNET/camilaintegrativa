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
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';
import { IDS } from '@/lib/db';

export async function PATCH(request: Request, context: RouteContext<'/api/admin/appointments/[id]'>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    const { id } = await context.params;
    const input = appointmentPatchSchema.parse(await request.json());
    const { ip, userAgent } = extractClientMetadata(request);

    if (!('operation' in input)) {
      const statusResult = await updateAppointmentStatus(id, input.status, user.userId);
      if (statusResult.changed) {
        await recordAuditLog({
          clinicId: IDS.clinic,
          actorType: 'admin',
          actorId: user.userId,
          actorName: user.name,
          category: 'agendamento',
          action: `agendamento_${input.status}`,
          title: `Status de Atendimento: ${input.status.toUpperCase()}`,
          description: `Atendimento alterado para o status "${input.status}" por ${user.name}.`,
          severity: input.status === 'cancelado' ? 'aviso' : 'info',
          ipAddress: ip,
          userAgent,
          details: { appointmentId: id, newStatus: input.status },
        }).catch(() => null);

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
      await recordAuditLog({
        clinicId: IDS.clinic,
        actorType: 'admin',
        actorId: user.userId,
        actorName: user.name,
        category: 'agendamento',
        action: updated.status === 'cancelado' ? 'agendamento_cancelado' : 'agendamento_reagendado',
        title: updated.status === 'cancelado' ? 'Cancelamento de Atendimento' : 'Edição / Reagendamento de Atendimento',
        description: `Atendimento de "${updated.clientName}" (${updated.serviceName}) atualizado por ${user.name}.`,
        severity: updated.status === 'cancelado' ? 'aviso' : 'info',
        ipAddress: ip,
        userAgent,
        details: {
          appointmentId: id,
          clientName: updated.clientName,
          serviceName: updated.serviceName,
          startAt: updated.startAt,
          endAt: updated.endAt,
          status: updated.status,
          notes: input.notes || null,
        },
      }).catch(() => null);

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
    await recordAuditLog({
      clinicId: IDS.clinic,
      actorType: 'admin',
      actorId: user.userId,
      actorName: user.name,
      category: 'agendamento',
      action: 'agendamento_redimensionado',
      title: 'Ajuste de Duração de Atendimento',
      description: `Duração do atendimento ajustada para ${input.durationMinutes} minutos por ${user.name}.`,
      severity: 'info',
      ipAddress: ip,
      userAgent,
      details: {
        appointmentId: id,
        durationMinutes: input.durationMinutes,
        newEndAt: result.appointment.endAt,
      },
    }).catch(() => null);

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

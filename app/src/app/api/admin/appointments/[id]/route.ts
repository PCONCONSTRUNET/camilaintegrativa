import { canManageAgenda, getCurrentUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import {
  AppointmentStaleError,
  AgendaPermissionError,
  BookingConflictError,
  BookingValidationError,
  deleteAppointment,
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
import { getDatabase, IDS } from '@/lib/db';
import { getPushConfig, renderPushTemplate } from '@/lib/push-configs';
import { sendOneSignalPush } from '@/lib/onesignal';

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

          // Disparar Push Notification para o Paciente informando que a consulta foi confirmada
          try {
            const db = getDatabase();
            const apt = (await db.prepare(`
              SELECT a.client_id, a.start_at, a.modality, c.name as client_name, s.name as service_name
              FROM appointments a
              JOIN clients c ON c.id = a.client_id
              JOIN services s ON s.id = a.service_id
              WHERE a.id = ? AND a.clinic_id = ?
            `).get(id, IDS.clinic)) as {
              client_id: string;
              start_at: string;
              modality: string;
              client_name: string;
              service_name: string;
            } | undefined;

            if (apt?.client_id) {
              const clientPushCfg = await getPushConfig('client_appointment_confirmed');
              if (clientPushCfg.enabled) {
                const dateObj = new Date(apt.start_at);
                const dateFormatted = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(dateObj);
                const timeFormatted = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(dateObj);
                const title = renderPushTemplate(clientPushCfg.title, {
                  paciente: apt.client_name.split(' ')[0],
                  servico: apt.service_name,
                  data: dateFormatted,
                  horario: timeFormatted,
                  modalidade: apt.modality === 'online' ? 'Online' : 'Presencial',
                });
                const message = renderPushTemplate(clientPushCfg.message, {
                  paciente: apt.client_name.split(' ')[0],
                  servico: apt.service_name,
                  data: dateFormatted,
                  horario: timeFormatted,
                  modalidade: apt.modality === 'online' ? 'Online' : 'Presencial',
                });
                await sendOneSignalPush({
                  title,
                  message,
                  url: '/cliente?tab=agendamentos',
                  target: { type: 'client', clientId: apt.client_id },
                  data: { type: 'appointment_confirmed', appointmentId: id },
                }).catch(() => null);
              }
            }
          } catch {
            // non-blocking
          }
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

export async function DELETE(request: Request, context: RouteContext<'/api/admin/appointments/[id]'>) {
  const user = await getCurrentUser();
  if (!user || !canManageAgenda(user)) {
    return Response.json({ error: 'Não autorizado a excluir agendamentos.' }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const { ip, userAgent } = extractClientMetadata(request);

    // Buscar dados do agendamento antes da exclusão para detalhar a auditoria
    const db = getDatabase();
    const apt = (await db.prepare(`
      SELECT a.client_id, c.name as client_name, s.name as service_name, a.start_at
      FROM appointments a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.id = ? AND a.clinic_id = ?
    `).get(id, IDS.clinic)) as {
      client_id?: string;
      client_name?: string;
      service_name?: string;
      start_at?: string;
    } | undefined;

    const deleted = await deleteAppointment(id, IDS.clinic);
    if (!deleted) {
      return Response.json({ error: 'Agendamento não encontrado.' }, { status: 404 });
    }

    await recordAuditLog({
      clinicId: IDS.clinic,
      actorType: 'admin',
      actorId: user.userId,
      actorName: user.name,
      category: 'agendamento',
      action: 'agendamento_excluido',
      title: 'Exclusão Definitiva de Atendimento',
      description: `Atendimento de "${apt?.client_name || 'Paciente'}" (${apt?.service_name || 'Serviço'}) excluído permanentemente da agenda por ${user.name}.`,
      severity: 'aviso',
      ipAddress: ip,
      userAgent,
      details: {
        appointmentId: id,
        clientName: apt?.client_name,
        serviceName: apt?.service_name,
        startAt: apt?.start_at,
      },
    }).catch(() => null);

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

import { bookingSchema } from '@/lib/validation';
import { BookingConflictError, createPublicBooking } from '@/lib/repository';
import { errorResponse } from '@/lib/http';
import { triggerAppointmentBookedReminder } from '@/lib/whatsapp-reminders';
import { notifyAdminNewAppointment, notifyAdminPendingPayment } from '@/lib/admin-push-alerts';
import { getPushConfig, renderPushTemplate } from '@/lib/push-configs';
import { sendOneSignalPush } from '@/lib/onesignal';
import { getDatabase, IDS } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const input = bookingSchema.parse(await request.json());
    const appointment = await createPublicBooking(input);

    // 1. WhatsApp automático para o cliente (com confirmação e dados da consulta)
    await triggerAppointmentBookedReminder(appointment.id).catch(() => null);

    // 2. Notificação Push para a Administração (Novo Agendamento)
    await notifyAdminNewAppointment({
      appointmentId: appointment.id,
      clientName: input.name,
      startAt: appointment.startAt,
      modality: input.modality,
      source: 'publico',
    }).catch(() => null);

    // 3. Notificar Administração sobre Fatura/Pagamento Pendente gerado
    try {
      const db = getDatabase();
      const pmt = (await db
        .prepare('SELECT id, amount_cents, due_at FROM client_payments WHERE appointment_id = ? AND clinic_id = ? LIMIT 1')
        .get(appointment.id, IDS.clinic)) as { id: string; amount_cents: number; due_at: string | null } | undefined;

      if (pmt && pmt.amount_cents > 0) {
        await notifyAdminPendingPayment({
          paymentId: pmt.id,
          clientName: input.name,
          amountCents: pmt.amount_cents,
          dueDate: pmt.due_at,
        }).catch(() => null);
      }
    } catch {
      // non-blocking
    }

    // 4. Notificação Push para o Paciente (se tiver push ativo)
    if (appointment.clientId) {
      try {
        const clientPushCfg = await getPushConfig('client_appointment_confirmed');
        if (clientPushCfg.enabled) {
          const dateParts = input.date.split('-');
          const dateFormatted = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : input.date;
          const title = renderPushTemplate(clientPushCfg.title, {
            paciente: input.name.split(' ')[0],
            data: dateFormatted,
            horario: input.time,
            modalidade: input.modality === 'online' ? 'Online' : 'Presencial',
          });
          const message = renderPushTemplate(clientPushCfg.message, {
            paciente: input.name.split(' ')[0],
            data: dateFormatted,
            horario: input.time,
            modalidade: input.modality === 'online' ? 'Online' : 'Presencial',
          });
          await sendOneSignalPush({
            title,
            message,
            url: '/cliente?tab=agendamentos',
            target: { type: 'client', clientId: appointment.clientId },
            data: { type: 'appointment_confirmed', appointmentId: appointment.id },
          }).catch(() => null);
        }
      } catch {
        // non-blocking
      }
    }

    return Response.json({ appointment }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingConflictError) return Response.json({ error: error.message }, { status: 409 });
    return errorResponse(error);
  }
}

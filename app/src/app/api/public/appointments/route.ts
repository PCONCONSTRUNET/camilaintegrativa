import { bookingSchema } from '@/lib/validation';
import { BookingConflictError, createPublicBooking } from '@/lib/repository';
import { errorResponse } from '@/lib/http';
import { triggerAppointmentBookedReminder } from '@/lib/whatsapp-reminders';
import { notifyAdminNewAppointment, notifyAdminPendingPayment } from '@/lib/admin-push-alerts';
import { getPushConfig, renderPushTemplate } from '@/lib/push-configs';
import { sendOneSignalPush } from '@/lib/onesignal';
import { getDatabase, IDS } from '@/lib/db';
import { recordAuditLog, extractClientMetadata } from '@/lib/audit';
import { randomUUID } from 'node:crypto';

export async function POST(request: Request) {
  try {
    const rawJson = await request.json();
    const input = bookingSchema.parse(rawJson);
    const appointment = await createPublicBooking(input);
    const { ip, userAgent } = extractClientMetadata(request);

    // 0. Registrar Consentimento Jurídico no Banco e na Auditoria (LGPD)
    if (appointment.clientId) {
      const db = getDatabase();
      const now = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO consent_records (id, clinic_id, client_id, consent_type, granted, recorded_at)
           VALUES (?, ?, ?, ?, 1, ?)`
        )
        .run(randomUUID(), IDS.clinic, appointment.clientId, 'termo_veracidade_e_terapeutica', now)
        .catch(() => null);
    }

    // Auditoria obrigatória: Aceite do termo de veracidade e abordagem integrativa
    await recordAuditLog({
      actorType: 'paciente',
      actorId: appointment.clientId || null,
      actorName: input.name,
      category: 'consentimento_lgpd',
      action: 'aceite_termo_terapeutico_e_veracidade',
      title: 'Consentimento Terapêutico & Veracidade Aceito',
      description: `O paciente ${input.name} declarou que as informações são verdadeiras e manifestou ciência da abordagem terapêutica integrativa e termos LGPD ao agendar sessão para ${input.date} às ${input.time} (${input.modality}).`,
      ipAddress: ip,
      userAgent,
      severity: 'info',
      details: {
        appointmentId: appointment.id,
        clientId: appointment.clientId,
        date: input.date,
        time: input.time,
        modality: input.modality,
        cpf: input.cpf,
        phone: input.phone,
        declaracaoAceita: 'Declaro que as informações fornecidas são verdadeiras e estou ciente da abordagem terapêutica integrativa.',
        lgpdTermosAceitos: true,
      },
    }).catch(() => null);

    // Auditoria de criação do agendamento
    await recordAuditLog({
      actorType: 'paciente',
      actorId: appointment.clientId || null,
      actorName: input.name,
      category: 'agendamento',
      action: 'solicitacao_agendamento',
      title: 'Novo Agendamento Criado',
      description: `Agendamento criado para ${input.date} às ${input.time} (${input.modality}) com status ${appointment.status}.`,
      ipAddress: ip,
      userAgent,
      severity: 'info',
      details: {
        appointmentId: appointment.id,
        serviceId: input.serviceId,
        paymentMethod: input.paymentMethod,
      },
    }).catch(() => null);

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

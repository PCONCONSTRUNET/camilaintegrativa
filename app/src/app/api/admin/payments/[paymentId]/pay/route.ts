import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import { triggerPaymentIdentifiedReminder } from '@/lib/whatsapp-reminders';
import { notifyAdminConfirmedPayment } from '@/lib/admin-push-alerts';
import { getPushConfig, renderPushTemplate } from '@/lib/push-configs';
import { sendOneSignalPush } from '@/lib/onesignal';
import { recordAuditLog, extractClientMetadata } from '@/lib/audit';

export async function POST(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const { paymentId } = await context.params;

  try {
    const database = getDatabase();
    const payment = (await database.prepare(`
      SELECT p.id, p.clinic_id, p.client_id, p.appointment_id, p.description, p.amount_cents,
             p.paid_amount_cents, p.remaining_amount_cents, p.status,
             c.name AS client_name, c.phone AS client_phone,
             s.name AS service_name
      FROM client_payments p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN services s ON s.id = p.service_id
      WHERE p.id = ? AND p.clinic_id = ?
    `).get(paymentId, IDS.clinic)) as {
      id: string;
      clinic_id: string;
      client_id: string | null;
      appointment_id: string | null;
      description: string | null;
      amount_cents: number;
      paid_amount_cents: number;
      remaining_amount_cents: number;
      status: string;
      client_name: string | null;
      client_phone: string | null;
      service_name: string | null;
    } | undefined;

    if (!payment) {
      return NextResponse.json({ error: 'Lançamento financeiro não encontrado.' }, { status: 404 });
    }

    const body = await request.json();
    const { amountCents, paymentMethod = 'pix', paidAt, notes } = body;

    const payAmount = Math.max(0, parseInt(amountCents, 10));
    if (!payAmount || payAmount <= 0) {
      return NextResponse.json({ error: 'Informe um valor de pagamento válido maior que zero.' }, { status: 400 });
    }

    const currentPaid = Number(payment.paid_amount_cents ?? 0);
    const totalAmount = Number(payment.amount_cents ?? 0);
    const currentRemaining = Number(payment.remaining_amount_cents ?? Math.max(0, totalAmount - currentPaid));

    if (payAmount > currentRemaining) {
      return NextResponse.json({
        error: `O valor informado (R$ ${(payAmount / 100).toFixed(2)}) é maior que o saldo em aberto (R$ ${(currentRemaining / 100).toFixed(2)}).`,
      }, { status: 400 });
    }

    const newPaid = currentPaid + payAmount;
    const newRemaining = Math.max(0, totalAmount - newPaid);
    const newStatus = newRemaining === 0 ? 'pago' : 'parcial';
    const effectivePaidAt = paidAt || new Date().toISOString();
    const now = new Date().toISOString();

    // 1. Atualizar registro do pagamento
    await database.prepare(`
      UPDATE client_payments
      SET paid_amount_cents = ?,
          remaining_amount_cents = ?,
          status = ?,
          payment_method = ?,
          paid_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      newPaid,
      newRemaining,
      newStatus,
      paymentMethod,
      effectivePaidAt,
      now,
      paymentId
    );

    // 2. Registrar transação histórica
    const txId = randomUUID();
    await database.prepare(`
      INSERT INTO payment_transactions (
        id, clinic_id, payment_id, client_id, amount_cents, payment_method, paid_at, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txId,
      IDS.clinic,
      paymentId,
      payment.client_id,
      payAmount,
      paymentMethod,
      effectivePaidAt,
      notes || (newRemaining === 0 ? 'Quitação total de saldo' : 'Baixa parcial de saldo'),
      currentUser.userId,
      now
    );

    // Se o pagamento for referente a um agendamento solicitado, confirmar automaticamente o agendamento
    if (payment.appointment_id) {
      await database
        .prepare(
          `UPDATE appointments SET status = 'confirmado', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND clinic_id = ? AND status = 'solicitado'`
        )
        .run(payment.appointment_id, IDS.clinic)
        .catch(() => null);

      if (payment.client_id) {
        try {
          const clientPushCfg = await getPushConfig('client_appointment_confirmed');
          if (clientPushCfg.enabled) {
            const apt = (await database.prepare(`
              SELECT a.start_at, a.modality, s.name as service_name
              FROM appointments a
              JOIN services s ON s.id = a.service_id
              WHERE a.id = ?
            `).get(payment.appointment_id)) as { start_at: string; modality: string; service_name: string } | undefined;

            if (apt) {
              const dateObj = new Date(apt.start_at);
              const dateFormatted = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(dateObj);
              const timeFormatted = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(dateObj);
              const title = renderPushTemplate(clientPushCfg.title, {
                paciente: (payment.client_name || 'Paciente').split(' ')[0],
                servico: apt.service_name || payment.service_name || 'Atendimento',
                data: dateFormatted,
                horario: timeFormatted,
                modalidade: apt.modality === 'online' ? 'Online' : 'Presencial',
              });
              const message = renderPushTemplate(clientPushCfg.message, {
                paciente: (payment.client_name || 'Paciente').split(' ')[0],
                servico: apt.service_name || payment.service_name || 'Atendimento',
                data: dateFormatted,
                horario: timeFormatted,
                modalidade: apt.modality === 'online' ? 'Online' : 'Presencial',
              });
              await sendOneSignalPush({
                title,
                message,
                url: '/cliente?tab=agendamentos',
                target: { type: 'client', clientId: payment.client_id },
                data: { type: 'appointment_confirmed', appointmentId: payment.appointment_id },
              }).catch(() => null);
            }
          }
        } catch {
          // non-blocking
        }
      }
    }

    // Registro de Auditoria Contábil & Financeira
    const { ip, userAgent } = extractClientMetadata(request);
    await recordAuditLog({
      actorType: 'admin',
      actorId: currentUser.userId,
      actorName: currentUser.name || 'Camila Machado',
      category: 'financeiro',
      action: 'baixa_pagamento',
      title: 'Pagamento Confirmado',
      description: `Baixa manual de R$ ${(payAmount / 100).toFixed(2)} (${paymentMethod.toUpperCase()}) para o paciente ${payment.client_name || 'Paciente'}. Saldo remanescente: R$ ${(newRemaining / 100).toFixed(2)}.`,
      ipAddress: ip,
      userAgent,
      severity: 'info',
      details: {
        paymentId,
        clientId: payment.client_id,
        clientName: payment.client_name,
        amountPaidCents: payAmount,
        totalAmountCents: totalAmount,
        remainingCents: newRemaining,
        paymentMethod,
        status: newStatus,
      },
    }).catch(() => null);

    if (payment.client_id && payment.client_phone) {
      await triggerPaymentIdentifiedReminder({
        paymentId,
        clientId: payment.client_id,
        clientName: payment.client_name || 'Cliente',
        clientPhone: payment.client_phone,
        serviceName: payment.service_name || payment.description || 'Atendimento Clínico',
        description: payment.description,
        amountPaidNowCents: payAmount,
        totalInvoiceNetCents: totalAmount,
        remainingCents: newRemaining,
        paymentMethod,
      }).catch(() => null);
    }

    await notifyAdminConfirmedPayment({
      paymentId,
      clientName: payment.client_name || 'Paciente',
      amountCents: payAmount,
      paymentMethod,
      serviceName: payment.service_name || payment.description,
    }).catch(() => null);

    // 3. Notificação Push para o Paciente (se tiver push ativo no PWA e regra ligada)
    if (payment.client_id) {
      try {
        const clientPushCfg = await getPushConfig('client_payment_confirmed');
        if (clientPushCfg.enabled) {
          const amountStr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payAmount / 100);
          const methodClean = (paymentMethod || 'PIX').toUpperCase();
          const title = renderPushTemplate(clientPushCfg.title, {
            paciente: (payment.client_name || 'Paciente').split(' ')[0],
            valor: amountStr,
            metodo: methodClean,
          });
          const message = renderPushTemplate(clientPushCfg.message, {
            paciente: (payment.client_name || 'Paciente').split(' ')[0],
            valor: amountStr,
            metodo: methodClean,
          });
          await sendOneSignalPush({
            title,
            message,
            url: '/cliente?tab=financeiro',
            target: { type: 'client', clientId: payment.client_id },
            data: { type: 'payment_confirmed', paymentId },
          }).catch(() => null);
        }
      } catch {
        // non-blocking
      }
    }

    return NextResponse.json({
      success: true,
      transactionId: txId,
      paidAmountCents: newPaid,
      remainingAmountCents: newRemaining,
      status: newStatus,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao processar baixa de pagamento.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


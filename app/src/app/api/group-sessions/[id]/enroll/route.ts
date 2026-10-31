import { NextRequest, NextResponse } from 'next/server';
import { enrollInGroupSession } from '@/lib/repository';
import { dispatchWhatsappReminder } from '@/lib/whatsapp-reminders';
import { notifyAdminNewAppointment, notifyAdminPendingPayment } from '@/lib/admin-push-alerts';
import { getPushConfig, renderPushTemplate } from '@/lib/push-configs';
import { sendOneSignalPush } from '@/lib/onesignal';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (!body.name || !body.phone) {
    return NextResponse.json({ error: 'Nome e WhatsApp são obrigatórios.' }, { status: 400 });
  }
  const cleanCpf = String(body.cpf ?? '').replace(/\D/g, '');
  if (cleanCpf.length !== 11) {
    return NextResponse.json({ error: 'Informe um CPF válido com 11 dígitos.' }, { status: 400 });
  }
  if (!body.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.birthDate))) {
    return NextResponse.json({ error: 'A data de nascimento é obrigatória.' }, { status: 400 });
  }
  const result = await enrollInGroupSession(id, {
    name: body.name,
    phone: body.phone,
    cpf: cleanCpf,
    birthDate: String(body.birthDate),
    email: body.email ?? null,
    paymentMethod: body.paymentMethod ?? null,
    notes: body.notes ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  const dateFormatted = result.date ? result.date.split('-').reverse().join('/') : '';
  const timeFormatted = result.startTime ?? '';
  const groupServiceTitle = `Sessão em Grupo: ${result.sessionTitle ?? 'Atendimento Coletivo'}`;

  // 1. Dispara lembrete automático de WhatsApp se configurado
  try {
    await dispatchWhatsappReminder({
      triggerType: 'sessao_agendada',
      clientName: body.name,
      phone: body.phone,
      referenceId: result.enrollmentId ?? null,
      variables: {
        servico: groupServiceTitle,
        data: dateFormatted,
        horario: timeFormatted,
        modalidade: 'Sessão em Grupo',
        referencia: result.enrollmentId ? result.enrollmentId.slice(0, 8).toUpperCase() : '',
      },
    });
  } catch {
    // non-blocking
  }

  // 2. Dispara Push de Novo Agendamento para a Administração
  if (result.enrollmentId) {
    const startIso = result.date && result.startTime ? `${result.date}T${result.startTime}:00` : new Date().toISOString();
    await notifyAdminNewAppointment({
      appointmentId: result.enrollmentId,
      clientName: body.name,
      serviceName: groupServiceTitle,
      startAt: startIso,
      modality: 'Sessão em Grupo',
      source: 'publico',
    }).catch(() => null);

    // Se gerou fatura pendente, avisa a administração
    if (result.paymentId && result.priceCents && result.priceCents > 0) {
      await notifyAdminPendingPayment({
        paymentId: result.paymentId,
        clientName: body.name,
        amountCents: result.priceCents,
        dueDate: startIso,
        serviceName: groupServiceTitle,
      }).catch(() => null);
    }
  }

  // 3. Dispara Push para o Paciente se ele tiver push ativo
  if (result.clientId) {
    try {
      const clientPushCfg = await getPushConfig('client_appointment_confirmed');
      if (clientPushCfg.enabled) {
        const title = renderPushTemplate(clientPushCfg.title, {
          paciente: body.name.split(' ')[0],
          servico: groupServiceTitle,
          modalidade: 'Sessão em Grupo',
          data: dateFormatted,
          horario: timeFormatted,
        });
        const message = renderPushTemplate(clientPushCfg.message, {
          paciente: body.name.split(' ')[0],
          servico: groupServiceTitle,
          modalidade: 'Sessão em Grupo',
          data: dateFormatted,
          horario: timeFormatted,
        });

        await sendOneSignalPush({
          title,
          message,
          url: '/cliente?tab=agendamentos',
          target: { type: 'client', clientId: result.clientId },
          data: { type: 'group_appointment_confirmed', enrollmentId: result.enrollmentId },
        }).catch(() => null);
      }
    } catch {
      // non-blocking
    }
  }

  return NextResponse.json(
    {
      ok: true,
      enrollmentId: result.enrollmentId,
      reference: result.enrollmentId?.slice(0, 8).toUpperCase(),
    },
    { status: 201 }
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { enrollInGroupSession } from '@/lib/repository';
import { dispatchWhatsappReminder } from '@/lib/whatsapp-reminders';

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

  // Dispara lembrete automático de WhatsApp se configurado
  try {
    await dispatchWhatsappReminder({
      triggerType: 'sessao_agendada',
      clientName: body.name,
      phone: body.phone,
      referenceId: result.enrollmentId ?? null,
      variables: {
        servico: `Sessão em Grupo: ${result.sessionTitle ?? 'Atendimento em Grupo'}`,
        data: result.date ? result.date.split('-').reverse().join('/') : '',
        horario: result.startTime ?? '',
        modalidade: 'Sessão em Grupo',
        referencia: result.enrollmentId ? result.enrollmentId.slice(0, 8).toUpperCase() : '',
      },
    });
  } catch {
    // non-blocking
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

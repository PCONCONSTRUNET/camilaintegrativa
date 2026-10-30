import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import {
  dispatchWhatsappReminder,
  formatDateOnlyPtBr,
  getWhatsappAutomationSettings,
  normalizePhoneForWhatsapp,
} from '@/lib/whatsapp-reminders';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((cents || 0) / 100);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { paymentId } = await context.params;

  try {
    const db = getDatabase();
    const payment = (await db
      .prepare(
        `SELECT
          p.id,
          p.clinic_id,
          p.client_id,
          p.description,
          p.amount_cents,
          p.paid_amount_cents,
          p.remaining_amount_cents,
          p.status,
          p.due_at,
          p.entry_type,
          c.name AS client_name,
          c.phone AS client_phone
        FROM client_payments p
        LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.id = ? AND p.clinic_id = ?
        LIMIT 1`
      )
      .get(paymentId, IDS.clinic)) as
      | {
          id: string;
          clinic_id: string;
          client_id: string | null;
          description: string | null;
          amount_cents: number;
          paid_amount_cents: number;
          remaining_amount_cents: number;
          status: string;
          due_at: string | null;
          entry_type: string;
          client_name: string | null;
          client_phone: string | null;
        }
      | undefined;

    if (!payment) {
      return NextResponse.json({ error: 'Fatura ou lançamento não encontrado.' }, { status: 404 });
    }

    if (payment.entry_type === 'saida') {
      return NextResponse.json(
        { error: 'Não é possível cobrar uma saída/despesa.' },
        { status: 400 }
      );
    }

    const remCents = Number(payment.remaining_amount_cents ?? 0);
    if (remCents <= 0 || payment.status === 'pago') {
      return NextResponse.json(
        { error: 'Esta fatura já está quitada (não possui saldo pendente em aberto).' },
        { status: 400 }
      );
    }

    const clientPhone = (payment.client_phone || '').trim();
    if (!clientPhone) {
      return NextResponse.json(
        { error: 'O cliente desta fatura não possui telefone cadastrado.' },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      customMessage?: string;
    };

    const settings = await getWhatsappAutomationSettings();
    const clinicPhoneClean = settings.adminNotifyPhone
      ? normalizePhoneForWhatsapp(settings.adminNotifyPhone)
      : '';
    const pixKey = clinicPhoneClean
      ? `(48) 99691-5303 (Chave Telefone)`
      : '(48) 99691-5303 (Camila Machado)';

    const totalCents = Number(payment.amount_cents ?? remCents);
    const dueDateStr = payment.due_at
      ? formatDateOnlyPtBr(payment.due_at)
      : formatDateOnlyPtBr(new Date().toISOString());

    const clientName = payment.client_name || 'Cliente';
    const firstName = clientName.split(/\s+/)[0] || 'Cliente';

    const log = await dispatchWhatsappReminder({
      triggerType: 'fatura_vencida',
      clientId: payment.client_id,
      clientName: clientName,
      phone: clientPhone,
      referenceId: payment.id,
      forceSend: true, // Envio manual solicitado expressamente pela profissional
      customMessageOverride: body.customMessage?.trim() || undefined,
      variables: {
        primeiro_nome: firstName,
        nome_cliente: clientName,
        fatura_descricao: payment.description || 'Atendimento Clínico',
        valor_pendente: formatCurrency(remCents),
        valor_total: formatCurrency(totalCents),
        data_vencimento: dueDateStr,
        chave_pix: pixKey,
        profissional: 'Camila Machado',
      },
    });

    if (!log) {
      return NextResponse.json(
        { error: 'Não foi possível disparar o lembrete de WhatsApp.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      log,
      status: log.status,
      responsePreview: log.responsePreview,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao disparar cobrança via WhatsApp.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


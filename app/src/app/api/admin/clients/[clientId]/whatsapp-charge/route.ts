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
  context: { params: Promise<{ clientId: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { clientId } = await context.params;

  try {
    const db = getDatabase();
    const todaySimpleStr = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());

    // 1. Buscar cliente
    const client = (await db
      .prepare('SELECT id, name, phone, email FROM clients WHERE id = ? AND clinic_id = ? LIMIT 1')
      .get(clientId, IDS.clinic)) as { id: string; name: string; phone: string; email: string | null } | undefined;

    if (!client) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
    }

    const clientPhone = (client.phone || '').trim();
    if (!clientPhone) {
      return NextResponse.json(
        { error: 'Este cliente não possui telefone cadastrado.' },
        { status: 400 }
      );
    }

    // 2. Buscar faturas em aberto/vencidas
    let overduePayments = (await db
      .prepare(`
        SELECT id, description, amount_cents, remaining_amount_cents, due_at
        FROM client_payments
        WHERE client_id = ? AND clinic_id = ?
          AND entry_type = 'entrada'
          AND status NOT IN ('cancelado', 'pago')
          AND remaining_amount_cents > 0
          AND due_at IS NOT NULL
          AND SUBSTR(due_at, 1, 10) < ?
        ORDER BY due_at ASC
      `)
      .all(clientId, IDS.clinic, todaySimpleStr)) as Array<{
      id: string;
      description: string | null;
      amount_cents: number;
      remaining_amount_cents: number;
      due_at: string;
    }>;

    // Fallback: se não tiver vencida com data estrita anterior a hoje, busca qualquer fatura em aberto do cliente
    if (!overduePayments || overduePayments.length === 0) {
      overduePayments = (await db
        .prepare(`
          SELECT id, description, amount_cents, remaining_amount_cents, due_at
          FROM client_payments
          WHERE client_id = ? AND clinic_id = ?
            AND entry_type = 'entrada'
            AND status NOT IN ('cancelado', 'pago')
            AND remaining_amount_cents > 0
          ORDER BY COALESCE(due_at, created_at) ASC
        `)
        .all(clientId, IDS.clinic)) as Array<{
        id: string;
        description: string | null;
        amount_cents: number;
        remaining_amount_cents: number;
        due_at: string;
      }>;
    }

    if (!overduePayments || overduePayments.length === 0) {
      return NextResponse.json(
        { error: 'Este cliente não possui faturas ou débitos pendentes em aberto.' },
        { status: 400 }
      );
    }

    const totalOverdueCents = overduePayments.reduce((acc, p) => acc + Number(p.remaining_amount_cents || 0), 0);
    const oldestPayment = overduePayments[0];
    const clientName = client.name || 'Cliente';
    const firstName = clientName.split(/\s+/)[0] || 'Cliente';
    const dueDateStr = formatDateOnlyPtBr(oldestPayment.due_at);
    const serviceName = oldestPayment.description || 'Atendimento Terapêutico';

    const settings = await getWhatsappAutomationSettings();
    const clinicPhoneClean = settings.adminNotifyPhone
      ? normalizePhoneForWhatsapp(settings.adminNotifyPhone)
      : '';
    const pixKey = clinicPhoneClean
      ? `(48) 99691-5303 (Chave Telefone)`
      : '(48) 99691-5303 (Camila Machado)';

    const body = (await request.json().catch(() => ({}))) as {
      customMessage?: string;
    };

    const log = await dispatchWhatsappReminder({
      triggerType: 'fatura_vencida',
      clientId: client.id,
      clientName: clientName,
      phone: clientPhone,
      referenceId: oldestPayment.id,
      forceSend: true, // Disparo manual expresso pela profissional ao clicar em Cobrar
      customMessageOverride: body.customMessage?.trim() || undefined,
      variables: {
        primeiro_nome: firstName,
        nome_cliente: clientName,
        fatura_descricao: overduePayments.length > 1
          ? `${serviceName} (+${overduePayments.length - 1} fatura${overduePayments.length > 2 ? 's' : ''})`
          : serviceName,
        valor_pendente: formatCurrency(totalOverdueCents),
        valor_total: formatCurrency(totalOverdueCents),
        data_vencimento: dueDateStr,
        chave_pix: pixKey,
        profissional: 'Camila Machado',
      },
    });

    if (!log) {
      return NextResponse.json(
        { error: 'Não foi possível disparar o lembrete de cobrança.' },
        { status: 500 }
      );
    }

    if (log.status === 'erro') {
      return NextResponse.json(
        {
          error: `Falha ao enviar pelo WhatsApp: ${log.responsePreview || 'Verifique se a API do WhatsApp está conectada em Configurações'}.`,
          status: log.status,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Cobrança enviada com sucesso no WhatsApp do cliente!',
      clientName,
      phone: clientPhone,
      amount: formatCurrency(totalOverdueCents),
      status: log.status,
    });
  } catch (err) {
    console.error('[api/admin/clients/[clientId]/whatsapp-charge] error:', err);
    const msg = err instanceof Error ? err.message : 'Erro ao disparar cobrança via WhatsApp.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

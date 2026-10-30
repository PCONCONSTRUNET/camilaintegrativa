import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import {
  dispatchWhatsappReminder,
  getWhatsappAutomationSettings,
  listWhatsappMessageLogs,
  processDue24hReminders,
  processOverdueInvoiceReminders,
  requestWhatsappSessionAction,
  saveWhatsappAutomationSettings,
  WhatsappProviderType,
  WhatsappTriggerType,
} from '@/lib/whatsapp-reminders';

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  // Opportunistically process any due 24h reminders and overdue invoices
  await Promise.all([
    processDue24hReminders({ opportunistic: true }).catch(() => null),
    processOverdueInvoiceReminders({ opportunistic: true }).catch(() => null),
  ]);

  const [settings, logs] = await Promise.all([
    getWhatsappAutomationSettings(),
    listWhatsappMessageLogs(60),
  ]);

  let connectionStatus: {
    status: 'connected' | 'disconnected' | 'idle' | 'error';
    connectedPhone?: string | null;
    profileName?: string | null;
    message?: string;
  } = { status: 'idle' };

  if (settings.apiBaseUrl || settings.qrEndpoint) {
    try {
      const check = await requestWhatsappSessionAction({
        action: 'status',
        apiBaseUrl: settings.apiBaseUrl,
        apiKey: settings.apiKey,
        instanceName: settings.instanceName,
        qrEndpointOverride: settings.qrEndpoint,
      });
      if (check.status === 'connected') {
        connectionStatus = {
          status: 'connected',
          connectedPhone: check.connectedPhone,
          profileName: check.profileName,
          message: check.message || 'WhatsApp Conectado e ativo na API!',
        };
      } else if (check.status === 'disconnected') {
        connectionStatus = {
          status: 'disconnected',
          message: check.message || 'Desconectado',
        };
      }
    } catch {
      // non-blocking
    }
  }

  const db = getDatabase();
  const now = new Date();
  const next26h = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();
  const upcoming24hRow = (await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM appointments
       WHERE clinic_id = ?
         AND status IN ('confirmado', 'solicitado')
         AND start_at >= ?
         AND start_at <= ?`
    )
    .get(IDS.clinic, now.toISOString(), next26h)
    .catch(() => ({ count: 0 }))) as { count?: number } | undefined;

  const overdueInvoicesRow = (await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM client_payments
       WHERE clinic_id = ?
         AND entry_type = 'entrada'
         AND status IN ('pendente', 'parcial')
         AND remaining_amount_cents > 0
         AND due_at IS NOT NULL
         AND due_at <= ?`
    )
    .get(IDS.clinic, now.toISOString())
    .catch(() => ({ count: 0 }))) as { count?: number } | undefined;

  return NextResponse.json({
    settings,
    logs,
    connectionStatus,
    upcoming24hCount: Number(upcoming24hRow?.count ?? 0),
    overdueInvoicesCount: Number(overdueInvoicesRow?.count ?? 0),
  });
}

export async function PUT(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      enabled?: boolean;
      providerType?: WhatsappProviderType;
      apiBaseUrl?: string;
      apiKey?: string;
      instanceName?: string;
      adminNotifyPhone?: string;
      notifyOwnerOnCancel?: boolean;
      notifyOwnerOnPayment?: boolean;
      qrEndpoint?: string;
      templates?: Partial<Record<WhatsappTriggerType, { enabled?: boolean; messageTemplate?: string }>>;
    };

    const updated = await saveWhatsappAutomationSettings(body);
    const logs = await listWhatsappMessageLogs(60);

    return NextResponse.json({
      ok: true,
      settings: updated,
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar configurações de WhatsApp.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action: 'test' | 'run_24h_check' | 'run_overdue_check' | 'clear_logs' | 'qrcode' | 'status' | 'disconnect';
      triggerType?: WhatsappTriggerType;
      phone?: string;
      clientName?: string;
      customMessageOverride?: string;
      qrEndpointOverride?: string;
      apiBaseUrl?: string;
      apiKey?: string;
      instanceName?: string;
    };

    if (body.action === 'qrcode' || body.action === 'status' || body.action === 'disconnect') {
      const result = await requestWhatsappSessionAction({
        action: body.action,
        qrEndpointOverride: body.qrEndpointOverride,
        apiBaseUrl: body.apiBaseUrl,
        apiKey: body.apiKey,
        instanceName: body.instanceName,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 422 });
    }

    if (body.action === 'run_24h_check') {
      const result = await processDue24hReminders();
      const logs = await listWhatsappMessageLogs(60);
      return NextResponse.json({
        ok: true,
        checkedCount: result.checkedCount,
        dispatchedCount: result.dispatchedCount,
        logs,
      });
    }

    if (body.action === 'run_overdue_check') {
      const result = await processOverdueInvoiceReminders();
      const logs = await listWhatsappMessageLogs(60);
      return NextResponse.json({
        ok: true,
        checkedCount: result.checkedCount,
        dispatchedCount: result.dispatchedCount,
        logs,
      });
    }

    if (body.action === 'clear_logs') {
      const db = getDatabase();
      await db.prepare(`DELETE FROM whatsapp_message_logs WHERE clinic_id = ?`).run(IDS.clinic);
      return NextResponse.json({ ok: true, logs: [] });
    }

    if (body.action === 'test') {
      const triggerType: WhatsappTriggerType = body.triggerType || 'sessao_agendada';
      const phone = (body.phone || '').trim();
      if (!phone) {
        return NextResponse.json(
          { error: 'Informe um número de WhatsApp com DDD para enviar o teste.' },
          { status: 400 }
        );
      }

      const sampleVariables: Record<string, string> = {
        primeiro_nome: (body.clientName || 'Lucas').trim().split(/\s+/)[0] || 'Lucas',
        nome_cliente: body.clientName || 'Lucas Pereira de Souza',
        servico: 'Sessão de Hipnoterapia Integrativa',
        data: '29/10/2026',
        horario: '14:00',
        modalidade: 'Presencial',
        valor: 'R$ 380,00',
        cancelado_por: 'Cancelado pelo cliente na Área do Cliente',
        motivo: 'Reagendamento solicitado',
        fatura_descricao: 'Reiki nível III (Fatura #F-104)',
        valor_pago: 'R$ 125,00',
        valor_pendente: 'R$ 125,00',
        valor_total: 'R$ 450,00',
        valor_total_fatura: 'R$ 450,00',
        saldo_restante: 'R$ 0,00 (Quitado ✅)',
        data_vencimento: '28/10/2026',
        chave_pix: '(48) 99691-5303 (Camila Machado)',
        forma_pagamento: 'PIX',
        status_fatura: 'Fatura Quitada (100% Pago)',
        data_pagamento: '28/10/2026 às 15:30',
        profissional: 'Camila Machado',
      };

      const log = await dispatchWhatsappReminder({
        triggerType,
        clientName: body.clientName || 'Lucas Pereira de Souza (Teste)',
        phone,
        variables: sampleVariables,
        forceSend: true,
        customMessageOverride: body.customMessageOverride,
      });

      const logs = await listWhatsappMessageLogs(60);
      return NextResponse.json({
        ok: true,
        log,
        logs,
      });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao processar ação de WhatsApp.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

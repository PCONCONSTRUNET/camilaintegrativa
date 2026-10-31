import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getAllPushConfigs,
  savePushConfig,
  getPushConfig,
  renderPushTemplate,
} from '@/lib/push-configs';
import { sendOneSignalPush } from '@/lib/onesignal';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const configs = await getAllPushConfigs();
    return NextResponse.json({ configs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao listar configurações.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { key, enabled, title, message } = body;

    if (!key) {
      return NextResponse.json({ error: 'Chave da regra é obrigatória.' }, { status: 400 });
    }

    const updated = await savePushConfig(key, { enabled, title, message });
    return NextResponse.json({ ok: true, config: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao salvar configuração.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/onesignal/configs/test
 * Dispara uma notificação de teste com as variáveis preenchidas para simulação
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json({ error: 'Chave da regra é obrigatória.' }, { status: 400 });
    }

    const cfg = await getPushConfig(key);

    // Variáveis de exemplo para teste
    const sampleVars: Record<string, string> = {
      paciente: 'Maria Silva (Exemplo)',
      servico: 'Terapia Integrativa Individual',
      modalidade: 'Presencial',
      origem: 'pelo site',
      data: new Intl.DateTimeFormat('pt-BR').format(new Date()),
      horario: '14:30',
      valor: 'R$ 250,00',
      metodo: 'PIX',
      vencimento: ' Vencimento: Hoje.',
      data_vencimento: new Intl.DateTimeFormat('pt-BR').format(new Date()),
      cancelado_por: 'pela clínica',
      motivo: ' Reagendamento solicitado',
    };

    const renderedTitle = renderPushTemplate(cfg.title, sampleVars);
    const renderedMessage = renderPushTemplate(cfg.message, sampleVars);

    const result = await sendOneSignalPush({
      title: renderedTitle,
      message: renderedMessage,
      url: '/admin/onesignal',
      target: { type: 'admins' },
      data: { isTestSimulation: true, ruleKey: key },
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Falha ao disparar teste no OneSignal' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      recipients: result.recipients,
      title: renderedTitle,
      message: renderedMessage,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao testar regra.' },
      { status: 500 }
    );
  }
}


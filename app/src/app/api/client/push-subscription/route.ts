import { NextResponse } from 'next/server';
import { getCurrentClient } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import { sendOneSignalPush } from '@/lib/onesignal';

export async function POST(request: Request) {
  const session = await getCurrentClient();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  try {
    const db = getDatabase();
    const now = new Date().toISOString();

    // Atualizar no banco que o cliente ativou push
    try {
      await db
        .prepare(
          `UPDATE clients SET updated_at = ? WHERE id = ? AND clinic_id = ?`
        )
        .run(now, session.clientId, IDS.clinic);
    } catch {}

    // Enviar notificação de boas-vindas push personalizada para o cliente
    const firstName = session.name ? session.name.split(' ')[0] : 'Paciente';
    await sendOneSignalPush({
      title: '🌿 Notificações Ativadas com Sucesso!',
      message: `Olá, ${firstName}! Agora você receberá lembretes das suas consultas e avisos da clínica direto na tela.`,
      url: '/cliente',
      target: { type: 'client', clientId: session.clientId },
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      message: 'Notificações Push ativadas com sucesso para sua conta!',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao registrar assinatura push.' },
      { status: 500 }
    );
  }
}


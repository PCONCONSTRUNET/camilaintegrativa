import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sendOneSignalPush, PushTarget } from '@/lib/onesignal';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const title = (body.title || '').trim();
    const message = (body.message || '').trim();
    const url = (body.url || '').trim() || '/';
    const targetType = body.targetType || 'all'; // 'all' | 'admins' | 'clients' | 'client'
    const clientId = body.clientId;

    if (!title) {
      return NextResponse.json({ error: 'Informe o título da notificação push.' }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: 'Informe a mensagem da notificação push.' }, { status: 400 });
    }

    let target: PushTarget = { type: 'all' };

    if (targetType === 'admins') {
      target = { type: 'admins' };
    } else if (targetType === 'clients') {
      target = { type: 'clients' };
    } else if (targetType === 'client') {
      if (!clientId) {
        return NextResponse.json({ error: 'Selecione o cliente destinatário.' }, { status: 400 });
      }
      target = { type: 'client', clientId };
    }

    const result = await sendOneSignalPush({
      title,
      message,
      url,
      target,
      data: {
        sentBy: user.userId,
        senderName: user.name,
        role: user.role,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'Falha ao disparar push no OneSignal.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Notificação Push enviada com sucesso pelo OneSignal!',
      onesignalId: result.onesignalId,
      recipients: result.recipients,
    });
  } catch (err) {
    console.error('[api/admin/onesignal/send] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno ao disparar push.' },
      { status: 500 }
    );
  }
}

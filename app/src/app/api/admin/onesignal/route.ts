import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  listPushNotificationLogs,
  ONESIGNAL_APP_ID,
  ONESIGNAL_REST_API_KEY,
  ONESIGNAL_SAFARI_WEB_ID,
} from '@/lib/onesignal';
import { getDatabase, IDS } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const logs = await listPushNotificationLogs(50);
    const db = getDatabase();

    // Buscar total de clientes cadastrados para referência
    const clientCountRow = (await db
      .prepare('SELECT COUNT(*) as total FROM clients WHERE clinic_id = ?')
      .get(IDS.clinic)) as { total: number } | undefined;

    const totalSent = logs.filter((l) => l.status === 'enviado').length;
    const totalFailed = logs.filter((l) => l.status === 'erro').length;
    const totalRecipients = logs.reduce((sum, l) => sum + (l.recipientsCount || 0), 0);

    return NextResponse.json({
      appId: ONESIGNAL_APP_ID,
      safariWebId: ONESIGNAL_SAFARI_WEB_ID,
      hasApiKey: Boolean(ONESIGNAL_REST_API_KEY),
      apiKeyPreview: ONESIGNAL_REST_API_KEY
        ? `${ONESIGNAL_REST_API_KEY.slice(0, 14)}...${ONESIGNAL_REST_API_KEY.slice(-6)}`
        : '',
      totalClients: clientCountRow?.total || 0,
      stats: {
        totalDispatches: logs.length,
        totalSent,
        totalFailed,
        totalRecipients,
      },
      logs,
    });
  } catch (err) {
    console.error('[api/admin/onesignal] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao consultar OneSignal.' },
      { status: 500 }
    );
  }
}


import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import { ensurePushTables } from '@/lib/onesignal';

/**
 * GET /api/admin/onesignal/subscriptions
 * Retorna clientes com push ativo + histórico de pushes enviados a eles
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  try {
    await ensurePushTables();
    const db = getDatabase();

    // Buscar logs de push enviados para clientes
    let clientLogs: Array<{
      id: string;
      targetType: string;
      targetId: string | null;
      title: string;
      message: string;
      url: string | null;
      status: string;
      recipientsCount: number;
      onesignalId: string | null;
      errorMessage: string | null;
      createdAt: string;
      clientName: string | null;
    }> = [];

    try {
      clientLogs = (await db
        .prepare(
          `SELECT
            pl.id,
            pl.target_type as "targetType",
            pl.target_id as "targetId",
            pl.title,
            pl.message,
            pl.url,
            pl.status,
            pl.recipients_count as "recipientsCount",
            pl.onesignal_id as "onesignalId",
            pl.error_message as "errorMessage",
            pl.created_at as "createdAt",
            c.name as "clientName"
          FROM push_notification_logs pl
          LEFT JOIN clients c ON c.id = pl.target_id AND c.clinic_id = pl.clinic_id
          WHERE pl.clinic_id = ?
            AND pl.target_type IN ('client', 'clients', 'all')
          ORDER BY pl.created_at DESC
          LIMIT 100`
        )
        .all(IDS.clinic)) as typeof clientLogs;
    } catch {
      // Tabela pode não existir ainda
    }

    // Buscar logs de push da admin (alertas automáticos + manuais para admin)
    let adminLogs: Array<{
      id: string;
      targetType: string;
      title: string;
      message: string;
      url: string | null;
      status: string;
      recipientsCount: number;
      errorMessage: string | null;
      createdAt: string;
    }> = [];

    try {
      adminLogs = (await db
        .prepare(
          `SELECT
            id,
            target_type as "targetType",
            title,
            message,
            url,
            status,
            recipients_count as "recipientsCount",
            error_message as "errorMessage",
            created_at as "createdAt"
          FROM push_notification_logs
          WHERE clinic_id = ?
            AND target_type IN ('admins', 'admin')
          ORDER BY created_at DESC
          LIMIT 100`
        )
        .all(IDS.clinic)) as typeof adminLogs;
    } catch {
      // Tabela pode não existir ainda
    }

    // Buscar clientes que já tiveram push enviado (distintos)
    let clientsWithPush: Array<{ id: string; name: string; phone: string | null; email: string | null; pushCount: number; lastPush: string | null }> = [];
    try {
      clientsWithPush = (await db
        .prepare(
          `SELECT
            c.id,
            c.name,
            c.phone,
            c.email,
            COUNT(pl.id) as "pushCount",
            MAX(pl.created_at) as "lastPush"
          FROM clients c
          INNER JOIN push_notification_logs pl ON pl.target_id = c.id AND pl.clinic_id = c.clinic_id
          WHERE c.clinic_id = ?
          GROUP BY c.id, c.name, c.phone, c.email
          ORDER BY MAX(pl.created_at) DESC
          LIMIT 50`
        )
        .all(IDS.clinic)) as typeof clientsWithPush;
    } catch {
      // Tabela pode não existir
    }

    return NextResponse.json({
      clientLogs,
      adminLogs,
      clientsWithPush,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao buscar assinaturas.' },
      { status: 500 }
    );
  }
}


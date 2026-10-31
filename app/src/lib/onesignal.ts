import { getDatabase, IDS } from '@/lib/db';
import { randomUUID } from 'node:crypto';

export const ONESIGNAL_APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || 'd1a83484-dce6-45f0-880f-15f3d8235d4c';

export const ONESIGNAL_SAFARI_WEB_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || 'web.onesignal.auto.4b51c712-23a7-447d-a673-6f24b07d407b';

export const ONESIGNAL_REST_API_KEY =
  process.env.ONESIGNAL_REST_API_KEY || '';

export type PushTarget =
  | { type: 'all' }
  | { type: 'admins' }
  | { type: 'clients' }
  | { type: 'client'; clientId: string }
  | { type: 'user'; externalId: string };

export interface SendPushPayload {
  title: string;
  message: string;
  url?: string;
  target: PushTarget;
  data?: Record<string, unknown>;
}

export interface PushNotificationLog {
  id: string;
  clinicId: string;
  targetType: string;
  targetId: string | null;
  title: string;
  message: string;
  url: string | null;
  status: 'enviado' | 'erro';
  recipientsCount: number;
  onesignalId: string | null;
  errorMessage: string | null;
  createdAt: string;
}

let tablesEnsured = false;

export async function ensurePushTables() {
  if (tablesEnsured) return;
  const db = getDatabase();
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS push_notification_logs (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        url TEXT,
        status TEXT NOT NULL,
        recipients_count INTEGER DEFAULT 0,
        onesignal_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      );
    `);
    tablesEnsured = true;
  } catch (err) {
    console.error('[OneSignal] Erro ao criar tabela push_notification_logs:', err);
  }
}

/**
 * Dispara uma notificação Push via API REST do OneSignal
 */
export async function sendOneSignalPush(payload: SendPushPayload): Promise<{
  ok: boolean;
  onesignalId?: string;
  recipients?: number;
  error?: string;
}> {
  await ensurePushTables();
  const db = getDatabase();
  const now = new Date().toISOString();
  const logId = randomUUID();

  const titleClean = payload.title.trim() || 'Clínica Camila Machado';
  const messageClean = payload.message.trim();
  const rawUrl = payload.url?.trim() || '';
  // OneSignal exige URL completa com http:// ou https://; relativa não é aceita
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://camilaintegrativa.vercel.app';
  const urlClean = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;

  const body: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: titleClean, pt: titleClean },
    contents: { en: messageClean, pt: messageClean },
    web_url: urlClean,
    chrome_web_icon: `${baseUrl}/icone-c.png`,
    chrome_web_badge: `${baseUrl}/icone-c.png`,
    data: {
      ...payload.data,
      sentAt: now,
    },
  };

  let targetTypeStr = payload.target.type;
  let targetIdStr: string | null = null;

  if (payload.target.type === 'all') {
    body.included_segments = ['Total Subscriptions', 'Subscribed Users'];
  } else if (payload.target.type === 'admins') {
    body.filters = [{ field: 'tag', key: 'role', relation: '=', value: 'admin' }];
  } else if (payload.target.type === 'clients') {
    body.filters = [{ field: 'tag', key: 'role', relation: '=', value: 'client' }];
  } else if (payload.target.type === 'client') {
    targetIdStr = payload.target.clientId;
    body.include_aliases = { external_id: [payload.target.clientId] };
    body.target_channel = 'push';
  } else if (payload.target.type === 'user') {
    targetIdStr = payload.target.externalId;
    body.include_aliases = { external_id: [payload.target.externalId] };
    body.target_channel = 'push';
  }

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.errors) {
      const errDetail = Array.isArray(data.errors)
        ? data.errors.join(', ')
        : typeof data.errors === 'object'
        ? JSON.stringify(data.errors)
        : data.message || 'Falha ao disparar push no OneSignal';

      await db
        .prepare(
          `INSERT INTO push_notification_logs (
            id, clinic_id, target_type, target_id, title, message, url, status,
            recipients_count, onesignal_id, error_message, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          logId,
          IDS.clinic,
          targetTypeStr,
          targetIdStr,
          titleClean,
          messageClean,
          urlClean,
          'erro',
          0,
          null,
          errDetail,
          now
        );

      return { ok: false, error: errDetail };
    }

    const onesignalId = data.id || null;
    const recipients = Number(data.recipients || 0);

    try {
      await db
        .prepare(
          `INSERT INTO push_notification_logs (
            id, clinic_id, target_type, target_id, title, message, url, status,
            recipients_count, onesignal_id, error_message, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          logId,
          IDS.clinic,
          targetTypeStr,
          targetIdStr,
          titleClean,
          messageClean,
          urlClean,
          'enviado',
          recipients,
          onesignalId,
          null,
          now
        );
    } catch (logErr) {
      console.warn('[OneSignal] Aviso ao registrar log de sucesso:', logErr);
    }

    return { ok: true, onesignalId, recipients };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro de rede ao conectar com OneSignal.';
    try {
      await db
        .prepare(
          `INSERT INTO push_notification_logs (
            id, clinic_id, target_type, target_id, title, message, url, status,
            recipients_count, onesignal_id, error_message, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          logId,
          IDS.clinic,
          targetTypeStr,
          targetIdStr,
          titleClean,
          messageClean,
          urlClean,
          'erro',
          0,
          null,
          msg,
          now
        );
    } catch (logErr) {
      console.warn('[OneSignal] Aviso ao registrar log de erro:', logErr);
    }

    return { ok: false, error: msg };
  }
}

/**
 * Lista histórico de envios de Push
 */
export async function listPushNotificationLogs(limit = 40): Promise<PushNotificationLog[]> {
  try {
    await ensurePushTables();
    const db = getDatabase();
    const rows = (await db
      .prepare(
        `SELECT id, clinic_id as "clinicId", target_type as "targetType", target_id as "targetId",
                title, message, url, status, recipients_count as "recipientsCount",
                onesignal_id as "onesignalId", error_message as "errorMessage", created_at as "createdAt"
         FROM push_notification_logs
         WHERE clinic_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(IDS.clinic, limit)) as PushNotificationLog[];

    return rows;
  } catch (err) {
    console.warn('[OneSignal] Falha ao listar logs de push:', err);
    return [];
  }
}


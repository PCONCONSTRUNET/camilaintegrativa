import { randomUUID } from 'node:crypto';
import { getDatabase, IDS } from './db';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  WhatsappAutomationSettings,
  WhatsappMessageLog,
  WhatsappProviderType,
  WhatsappTemplateConfig,
  WhatsappTemplatesMap,
  WhatsappTriggerType,
} from './whatsapp-templates';

export {
  DEFAULT_WHATSAPP_TEMPLATES,
  type WhatsappAutomationSettings,
  type WhatsappMessageLog,
  type WhatsappProviderType,
  type WhatsappTemplateConfig,
  type WhatsappTemplatesMap,
  type WhatsappTriggerType,
};

function nowIso(): string {
  return new Date().toISOString();
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((cents || 0) / 100);
}

function formatDateTimePtBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
}

export function formatDateOnlyPtBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
}

type GlobalWhatsappLocks = typeof globalThis & {
  __whatsappInFlightKeys?: Set<string>;
  __whatsapp24hRunning?: boolean;
  __whatsapp24hLastRunAt?: number;
  __whatsappOverdueRunning?: boolean;
  __whatsappOverdueLastRunAt?: number;
};

function getInFlightKeys(): Set<string> {
  const g = globalThis as GlobalWhatsappLocks;
  if (!g.__whatsappInFlightKeys) {
    g.__whatsappInFlightKeys = new Set<string>();
  }
  return g.__whatsappInFlightKeys;
}

let tablesInitialized = false;

export async function ensureWhatsappTables() {
  if (tablesInitialized) return;
  try {
    const db = getDatabase();
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS whatsapp_automation_settings (
        clinic_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        provider_type TEXT NOT NULL DEFAULT 'evolution',
        api_base_url TEXT NOT NULL DEFAULT '',
        api_key TEXT NOT NULL DEFAULT '',
        instance_name TEXT NOT NULL DEFAULT '',
        admin_notify_phone TEXT NOT NULL DEFAULT '',
        notify_owner_on_cancel INTEGER NOT NULL DEFAULT 1,
        notify_owner_on_payment INTEGER NOT NULL DEFAULT 1,
        templates_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS whatsapp_message_logs (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        client_id TEXT,
        client_name TEXT NOT NULL,
        recipient_phone TEXT NOT NULL,
        message_body TEXT NOT NULL,
        status TEXT NOT NULL,
        http_status INTEGER,
        response_preview TEXT,
        reference_id TEXT,
        created_at TEXT NOT NULL
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS whatsapp_sent_dedup (
        dedup_key TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    // Migrate: add qr_endpoint column if it doesn't exist yet
    try {
      await db.prepare(`ALTER TABLE whatsapp_automation_settings ADD COLUMN qr_endpoint TEXT NOT NULL DEFAULT ''`).run();
    } catch { /* already exists */ }

    tablesInitialized = true;
  } catch (err) {
    console.error('[whatsapp-reminders] Error initializing tables:', err);
  }
}

function mergeTemplatesWithDefaults(rawJson: string | null | undefined): WhatsappTemplatesMap {
  const result: WhatsappTemplatesMap = JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_TEMPLATES));
  if (!rawJson) return result;
  try {
    const parsed = JSON.parse(rawJson) as Partial<Record<WhatsappTriggerType, Partial<WhatsappTemplateConfig>>>;
    for (const key of Object.keys(DEFAULT_WHATSAPP_TEMPLATES) as WhatsappTriggerType[]) {
      const incoming = parsed?.[key];
      if (incoming) {
        if (typeof incoming.enabled === 'boolean') result[key].enabled = incoming.enabled;
        if (typeof incoming.messageTemplate === 'string' && incoming.messageTemplate.trim()) {
          result[key].messageTemplate = incoming.messageTemplate;
        }
      }
    }
  } catch {
    // keep defaults
  }
  return result;
}

export async function getWhatsappAutomationSettings(): Promise<WhatsappAutomationSettings> {
  await ensureWhatsappTables();
  const db = getDatabase();
  const row = (await db
    .prepare('SELECT * FROM whatsapp_automation_settings WHERE clinic_id = ? LIMIT 1')
    .get(IDS.clinic)) as
    | {
        clinic_id: string;
        enabled: number;
        provider_type: string;
        api_base_url: string;
        api_key: string;
        instance_name: string;
        admin_notify_phone: string;
        notify_owner_on_cancel: number;
        notify_owner_on_payment: number;
        qr_endpoint?: string;
        templates_json: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    const now = nowIso();
    const defaultJson = JSON.stringify(DEFAULT_WHATSAPP_TEMPLATES);
    await db
      .prepare(
        `INSERT INTO whatsapp_automation_settings (
          clinic_id, enabled, provider_type, api_base_url, api_key, instance_name,
          admin_notify_phone, notify_owner_on_cancel, notify_owner_on_payment, qr_endpoint, templates_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(IDS.clinic, 1, 'evolution', '', '', 'clinica-camila', '', 1, 1, '', defaultJson, now);

    return {
      clinicId: IDS.clinic,
      enabled: true,
      providerType: 'evolution',
      apiBaseUrl: '',
      apiKey: '',
      instanceName: 'clinica-camila',
      adminNotifyPhone: '',
      notifyOwnerOnCancel: true,
      notifyOwnerOnPayment: true,
      qrEndpoint: '',
      templates: JSON.parse(defaultJson),
      updatedAt: now,
    };
  }

  return {
    clinicId: row.clinic_id,
    enabled: Boolean(row.enabled),
    providerType: (row.provider_type as WhatsappProviderType) || 'evolution',
    apiBaseUrl: row.api_base_url || '',
    apiKey: row.api_key || '',
    instanceName: row.instance_name || '',
    adminNotifyPhone: row.admin_notify_phone || '',
    notifyOwnerOnCancel: Boolean(row.notify_owner_on_cancel ?? 1),
    notifyOwnerOnPayment: Boolean(row.notify_owner_on_payment ?? 1),
    qrEndpoint: row.qr_endpoint || '',
    templates: mergeTemplatesWithDefaults(row.templates_json),
    updatedAt: row.updated_at,
  };
}

export async function saveWhatsappAutomationSettings(input: {
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
}): Promise<WhatsappAutomationSettings> {
  const current = await getWhatsappAutomationSettings();
  const updatedTemplates: WhatsappTemplatesMap = JSON.parse(JSON.stringify(current.templates));

  if (input.templates) {
    for (const key of Object.keys(DEFAULT_WHATSAPP_TEMPLATES) as WhatsappTriggerType[]) {
      const incoming = input.templates[key];
      if (incoming) {
        if (typeof incoming.enabled === 'boolean') {
          updatedTemplates[key].enabled = incoming.enabled;
        }
        if (typeof incoming.messageTemplate === 'string') {
          updatedTemplates[key].messageTemplate = incoming.messageTemplate;
        }
      }
    }
  }

  const now = nowIso();
  const next: WhatsappAutomationSettings = {
    clinicId: IDS.clinic,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    providerType: input.providerType ?? current.providerType,
    apiBaseUrl: typeof input.apiBaseUrl === 'string' ? input.apiBaseUrl.trim() : current.apiBaseUrl,
    apiKey: typeof input.apiKey === 'string' ? input.apiKey.trim() : current.apiKey,
    instanceName: typeof input.instanceName === 'string' ? input.instanceName.trim() : current.instanceName,
    adminNotifyPhone:
      typeof input.adminNotifyPhone === 'string' ? input.adminNotifyPhone.trim() : current.adminNotifyPhone,
    notifyOwnerOnCancel:
      typeof input.notifyOwnerOnCancel === 'boolean' ? input.notifyOwnerOnCancel : current.notifyOwnerOnCancel,
    notifyOwnerOnPayment:
      typeof input.notifyOwnerOnPayment === 'boolean' ? input.notifyOwnerOnPayment : current.notifyOwnerOnPayment,
    qrEndpoint: typeof input.qrEndpoint === 'string' ? input.qrEndpoint.trim() : (current.qrEndpoint || ''),
    templates: updatedTemplates,
    updatedAt: now,
  };

  const db = getDatabase();
  await db
    .prepare(
      `UPDATE whatsapp_automation_settings
       SET enabled = ?,
           provider_type = ?,
           api_base_url = ?,
           api_key = ?,
           instance_name = ?,
           admin_notify_phone = ?,
           notify_owner_on_cancel = ?,
           notify_owner_on_payment = ?,
           qr_endpoint = ?,
           templates_json = ?,
           updated_at = ?
       WHERE clinic_id = ?`
    )
    .run(
      next.enabled ? 1 : 0,
      next.providerType,
      next.apiBaseUrl,
      next.apiKey,
      next.instanceName,
      next.adminNotifyPhone,
      next.notifyOwnerOnCancel ? 1 : 0,
      next.notifyOwnerOnPayment ? 1 : 0,
      next.qrEndpoint,
      JSON.stringify(next.templates),
      next.updatedAt,
      IDS.clinic
    );

  return next;
}

export async function listWhatsappMessageLogs(limit = 50): Promise<WhatsappMessageLog[]> {
  await ensureWhatsappTables();
  const db = getDatabase();
  const rows = (await db
    .prepare(`SELECT * FROM whatsapp_message_logs WHERE clinic_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(IDS.clinic, limit)) as Array<{
    id: string;
    clinic_id: string;
    trigger_type: string;
    client_id: string | null;
    client_name: string;
    recipient_phone: string;
    message_body: string;
    status: string;
    http_status: number | null;
    response_preview: string | null;
    reference_id: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    clinicId: r.clinic_id,
    triggerType: r.trigger_type as WhatsappTriggerType | 'teste_conexao',
    clientId: r.client_id,
    clientName: r.client_name,
    recipientPhone: r.recipient_phone,
    messageBody: r.message_body,
    status: r.status as WhatsappMessageLog['status'],
    httpStatus: r.http_status,
    responsePreview: r.response_preview,
    referenceId: r.reference_id,
    createdAt: r.created_at,
  }));
}

export function normalizePhoneForWhatsapp(phone: string): string {
  const digits = (phone || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  return `55${digits}`;
}

export function renderWhatsappTemplate(template: string, variables: Record<string, string>): string {
  let rendered = template;
  for (const [rawKey, value] of Object.entries(variables)) {
    const cleanKey = rawKey.startsWith('{{') ? rawKey : `{{${rawKey}}}`;
    rendered = rendered.split(cleanKey).join(value ?? '');
  }
  return rendered;
}

export function extractDateAndTimePtBr(isoDate: string): { data: string; horario: string } {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return { data: isoDate, horario: '' };
  }
  const data = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
  const horario = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
  return { data, horario };
}

export function formatPaymentMethodLabel(method: string): string {
  if (method === 'pix') return 'PIX';
  if (method === 'cartao' || method === 'cartao_credito') return 'Cartão de Crédito';
  if (method === 'cartao_debito') return 'Cartão de Débito';
  if (method === 'dinheiro') return 'Dinheiro';
  if (method === 'transferencia') return 'Transferência Bancária';
  return method || 'PIX';
}

async function sendToWhatsappProvider(params: {
  settings: WhatsappAutomationSettings;
  recipientPhone: string;
  messageBody: string;
  triggerType: string;
  variables: Record<string, string>;
  clientName: string;
}): Promise<{
  status: 'enviado' | 'simulado_sem_api' | 'erro';
  httpStatus: number | null;
  responsePreview: string;
}> {
  const { settings, recipientPhone, messageBody, triggerType, variables, clientName } = params;
  const formattedNumber = normalizePhoneForWhatsapp(recipientPhone);

  if (!formattedNumber) {
    return {
      status: 'erro',
      httpStatus: null,
      responsePreview: 'Telefone do destinatário inválido ou vazio.',
    };
  }

  if (!settings.apiBaseUrl.trim()) {
    return {
      status: 'simulado_sem_api',
      httpStatus: 200,
      responsePreview:
        'Mensagem gerada e registrada com sucesso (Modo Simulação: conecte a URL da sua API WhatsApp para disparo externo em tempo real).',
    };
  }

  const targetUrl = settings.apiBaseUrl.trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (settings.apiKey.trim()) {
    const cleanToken = settings.apiKey.trim();
    headers['apikey'] = cleanToken;
    headers['x-api-key'] = cleanToken;
    headers['Authorization'] = cleanToken.startsWith('Bearer ')
      ? cleanToken
      : `Bearer ${cleanToken}`;
  }

  const payload: Record<string, unknown> = {
    event: triggerType,
    triggerType,
    instance: settings.instanceName || 'clinica-camila',
    phone: formattedNumber,
    number: formattedNumber,
    recipientName: clientName,
    clientName,
    message: messageBody,
    text: messageBody,
    variables,
    timestamp: nowIso(),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await response.text().catch(() => '');
    const preview = text ? text.slice(0, 300) : response.statusText || 'OK';

    if (response.ok) {
      return {
        status: 'enviado',
        httpStatus: response.status,
        responsePreview: preview,
      };
    }
    return {
      status: 'erro',
      httpStatus: response.status,
      responsePreview: `HTTP ${response.status}: ${preview}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'erro',
      httpStatus: null,
      responsePreview: `Falha de conexão com a API: ${msg.slice(0, 220)}`,
    };
  }
}

export async function dispatchWhatsappReminder(params: {
  triggerType: WhatsappTriggerType;
  clientId?: string | null;
  clientName: string;
  phone: string;
  variables: Record<string, string>;
  referenceId?: string | null;
  dedupKeyOverride?: string | null;
  forceSend?: boolean;
  customMessageOverride?: string;
}): Promise<WhatsappMessageLog | null> {
  await ensureWhatsappTables();
  const settings = await getWhatsappAutomationSettings();
  const templateCfg = settings.templates[params.triggerType];

  if (!params.forceSend) {
    if (!settings.enabled || !templateCfg?.enabled) {
      return null;
    }
  }

  const db = getDatabase();
  const inFlight = getInFlightKeys();
  const dedupKey =
    !params.forceSend && (params.dedupKeyOverride || params.referenceId)
      ? params.dedupKeyOverride || `${IDS.clinic}:${params.triggerType}:${params.referenceId}`
      : null;

  if (dedupKey) {
    if (inFlight.has(dedupKey)) {
      return null;
    }
    inFlight.add(dedupKey);
  }

  try {
    if (dedupKey && params.referenceId) {
      // 1) Check persistent dedup table or already-sent message logs
      const existingDedup = await db
        .prepare(`SELECT dedup_key FROM whatsapp_sent_dedup WHERE dedup_key = ? LIMIT 1`)
        .get(dedupKey);
      if (existingDedup) {
        return null;
      }

      const existingSentLog = await db
        .prepare(
          `SELECT id FROM whatsapp_message_logs
           WHERE clinic_id = ? AND trigger_type = ? AND reference_id = ? AND status = 'enviado'
           LIMIT 1`
        )
        .get(IDS.clinic, params.triggerType, params.referenceId);
      if (existingSentLog) {
        await db
          .prepare(
            `INSERT INTO whatsapp_sent_dedup (dedup_key, clinic_id, trigger_type, reference_id, created_at)
             VALUES (?, ?, ?, ?, ?) ON CONFLICT (dedup_key) DO NOTHING`
          )
          .run(dedupKey, IDS.clinic, params.triggerType, params.referenceId, nowIso())
          .catch(() => null);
        return null;
      }

      // 2) Atomically claim this dedupKey BEFORE making the external HTTP call
      const claim = await db
        .prepare(
          `INSERT INTO whatsapp_sent_dedup (dedup_key, clinic_id, trigger_type, reference_id, created_at)
           VALUES (?, ?, ?, ?, ?) ON CONFLICT (dedup_key) DO NOTHING`
        )
        .run(dedupKey, IDS.clinic, params.triggerType, params.referenceId, nowIso());

      if (!claim || claim.changes === 0) {
        return null;
      }
    }

    const firstName = (params.clientName || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
    const mergedVariables: Record<string, string> = {
      primeiro_nome: firstName,
      nome_cliente: params.clientName || 'Cliente',
      profissional: 'Camila Machado',
      ...params.variables,
    };

    const rawTemplate = params.customMessageOverride || templateCfg?.messageTemplate || '';
    const messageBody = renderWhatsappTemplate(rawTemplate, mergedVariables);
    const normalizedPhone = normalizePhoneForWhatsapp(params.phone);

    const sendResult = await sendToWhatsappProvider({
      settings,
      recipientPhone: normalizedPhone,
      messageBody,
      triggerType: params.triggerType,
      variables: mergedVariables,
      clientName: params.clientName,
    });

    // If sending failed or was only simulated (for booking confirmation before connecting API), release dedup lock so a real API retry can succeed
    if (
      dedupKey &&
      (sendResult.status === 'erro' ||
        (sendResult.status === 'simulado_sem_api' && params.triggerType !== 'lembrete_24h'))
    ) {
      await db
        .prepare(`DELETE FROM whatsapp_sent_dedup WHERE dedup_key = ?`)
        .run(dedupKey)
        .catch(() => null);
    }

    const logEntry: WhatsappMessageLog = {
      id: randomUUID(),
      clinicId: IDS.clinic,
      triggerType: params.triggerType,
      clientId: params.clientId ?? null,
      clientName: params.clientName,
      recipientPhone: normalizedPhone || params.phone || 'Sem telefone',
      messageBody,
      status: sendResult.status,
      httpStatus: sendResult.httpStatus,
      responsePreview: sendResult.responsePreview,
      referenceId: params.referenceId ?? null,
      createdAt: nowIso(),
    };

    await db
      .prepare(
        `INSERT INTO whatsapp_message_logs (
          id, clinic_id, trigger_type, client_id, client_name, recipient_phone,
          message_body, status, http_status, response_preview, reference_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        logEntry.id,
        logEntry.clinicId,
        logEntry.triggerType,
        logEntry.clientId,
        logEntry.clientName,
        logEntry.recipientPhone,
        logEntry.messageBody,
        logEntry.status,
        logEntry.httpStatus,
        logEntry.responsePreview,
        logEntry.referenceId,
        logEntry.createdAt
      );

    if (
      settings.adminNotifyPhone.trim() &&
      ((params.triggerType === 'agendamento_cancelado' && settings.notifyOwnerOnCancel) ||
        (params.triggerType === 'pagamento_identificado' && settings.notifyOwnerOnPayment))
    ) {
      const ownerPhone = normalizePhoneForWhatsapp(settings.adminNotifyPhone);
      if (ownerPhone && ownerPhone !== normalizedPhone) {
        const ownerPrefix =
          params.triggerType === 'pagamento_identificado'
            ? `🔔 *ALERTA ADMIN — PAGAMENTO IDENTIFICADO*\nCliente: *${params.clientName}*\n\n`
            : `🔔 *ALERTA ADMIN — AGENDAMENTO CANCELADO*\nCliente: *${params.clientName}*\n\n`;
        await sendToWhatsappProvider({
          settings,
          recipientPhone: ownerPhone,
          messageBody: `${ownerPrefix}${messageBody}`,
          triggerType: `${params.triggerType}_admin_copy`,
          variables: mergedVariables,
          clientName: `Admin (${params.clientName})`,
        }).catch(() => null);
      }
    }

    return logEntry;
  } finally {
    if (dedupKey) {
      inFlight.delete(dedupKey);
    }
  }
}

export async function processDue24hReminders(options?: {
  opportunistic?: boolean;
}): Promise<{
  checkedCount: number;
  dispatchedCount: number;
  logs: WhatsappMessageLog[];
}> {
  const g = globalThis as GlobalWhatsappLocks;
  if (g.__whatsapp24hRunning) {
    return { checkedCount: 0, dispatchedCount: 0, logs: [] };
  }
  if (options?.opportunistic && g.__whatsapp24hLastRunAt && Date.now() - g.__whatsapp24hLastRunAt < 30_000) {
    return { checkedCount: 0, dispatchedCount: 0, logs: [] };
  }

  g.__whatsapp24hRunning = true;
  g.__whatsapp24hLastRunAt = Date.now();

  try {
    await ensureWhatsappTables();
    const settings = await getWhatsappAutomationSettings();
    if (!settings.enabled || !settings.templates.lembrete_24h.enabled) {
      return { checkedCount: 0, dispatchedCount: 0, logs: [] };
    }

    const db = getDatabase();
    const now = new Date();
    const windowStart = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const windowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();

    const upcomingRows = (await db
      .prepare(
        `SELECT
          a.id,
          a.client_id,
          a.start_at,
          a.modality,
          a.status,
          c.name AS client_name,
          c.phone AS client_phone,
          s.name AS service_name
        FROM appointments a
        JOIN clients c ON c.id = a.client_id
        JOIN services s ON s.id = a.service_id
        WHERE a.clinic_id = ?
          AND a.status = 'confirmado'
          AND a.start_at >= ?
          AND a.start_at <= ?
        ORDER BY a.start_at ASC`
      )
      .all(IDS.clinic, windowStart, windowEnd)) as Array<{
      id: string;
      client_id: string;
      start_at: string;
      modality: string;
      status: string;
      client_name: string;
      client_phone: string;
      service_name: string;
    }>;

    const dispatchedLogs: WhatsappMessageLog[] = [];
    const tenMinAgoIso = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

    for (const appt of upcomingRows) {
      const dedupKey = `${IDS.clinic}:lembrete_24h:${appt.id}`;
      const existingDedup = await db
        .prepare(`SELECT dedup_key FROM whatsapp_sent_dedup WHERE dedup_key = ? LIMIT 1`)
        .get(dedupKey);
      if (existingDedup) continue;

      const existing = await db
        .prepare(
          `SELECT id FROM whatsapp_message_logs
           WHERE clinic_id = ? AND trigger_type = 'lembrete_24h' AND reference_id = ?
           LIMIT 1`
        )
        .get(IDS.clinic, appt.id);
      if (existing) {
        await db
          .prepare(
            `INSERT INTO whatsapp_sent_dedup (dedup_key, clinic_id, trigger_type, reference_id, created_at)
             VALUES (?, ?, ?, ?, ?) ON CONFLICT (dedup_key) DO NOTHING`
          )
          .run(dedupKey, IDS.clinic, 'lembrete_24h', appt.id, nowIso())
          .catch(() => null);
        continue;
      }

      // Avoid blasting a 24h reminder seconds after sending "sessao_agendada" for the same appointment
      const justBooked = await db
        .prepare(
          `SELECT id FROM whatsapp_message_logs
           WHERE clinic_id = ? AND trigger_type = 'sessao_agendada' AND reference_id = ? AND created_at >= ?
           LIMIT 1`
        )
        .get(IDS.clinic, appt.id, tenMinAgoIso);
      if (justBooked) continue;

      const { data, horario } = extractDateAndTimePtBr(appt.start_at);
      const modalityLabel = appt.modality === 'online' ? 'Online' : 'Presencial';

      const log = await dispatchWhatsappReminder({
        triggerType: 'lembrete_24h',
        clientId: appt.client_id,
        clientName: appt.client_name,
        phone: appt.client_phone,
        referenceId: appt.id,
        variables: {
          servico: appt.service_name,
          data,
          horario,
          modalidade: modalityLabel,
        },
      });

      if (log) {
        dispatchedLogs.push(log);
      }
    }

    return {
      checkedCount: upcomingRows.length,
      dispatchedCount: dispatchedLogs.length,
      logs: dispatchedLogs,
    };
  } finally {
    g.__whatsapp24hRunning = false;
  }
}

export async function processOverdueInvoiceReminders(options?: {
  opportunistic?: boolean;
}): Promise<{
  checkedCount: number;
  dispatchedCount: number;
  logs: WhatsappMessageLog[];
}> {
  const g = globalThis as GlobalWhatsappLocks;
  if (g.__whatsappOverdueRunning) {
    return { checkedCount: 0, dispatchedCount: 0, logs: [] };
  }
  if (options?.opportunistic && g.__whatsappOverdueLastRunAt && Date.now() - g.__whatsappOverdueLastRunAt < 45_000) {
    return { checkedCount: 0, dispatchedCount: 0, logs: [] };
  }

  g.__whatsappOverdueRunning = true;
  g.__whatsappOverdueLastRunAt = Date.now();

  try {
    await ensureWhatsappTables();
    const settings = await getWhatsappAutomationSettings();
    if (!settings.enabled || !settings.templates.fatura_vencida?.enabled) {
      return { checkedCount: 0, dispatchedCount: 0, logs: [] };
    }

    const db = getDatabase();
    const now = new Date();
    const nowIsoStr = now.toISOString();
    const todayStr = new Intl.DateTimeFormat('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
      .format(now)
      .split('/')
      .reverse()
      .join('-'); // YYYY-MM-DD

    const overdueRows = (await db
      .prepare(
        `SELECT
          p.id,
          p.client_id,
          p.description,
          p.amount_cents,
          p.paid_amount_cents,
          p.remaining_amount_cents,
          p.status,
          p.due_at,
          p.created_at,
          c.name AS client_name,
          c.phone AS client_phone
        FROM client_payments p
        JOIN clients c ON c.id = p.client_id
        WHERE p.clinic_id = ?
          AND p.entry_type = 'entrada'
          AND p.status IN ('pendente', 'parcial')
          AND p.remaining_amount_cents > 0
          AND p.due_at IS NOT NULL
          AND p.due_at <= ?
        ORDER BY p.due_at ASC`
      )
      .all(IDS.clinic, nowIsoStr)) as Array<{
      id: string;
      client_id: string;
      description: string;
      amount_cents: number;
      paid_amount_cents: number;
      remaining_amount_cents: number;
      status: string;
      due_at: string;
      created_at: string;
      client_name: string;
      client_phone: string;
    }>;

    // Agrupar faturas vencidas por cliente para NUNCA enviar mensagens picadas ou repetidas ao mesmo cliente no mesmo dia
    const clientGroups = new Map<
      string,
      {
        clientId: string | null;
        clientName: string;
        clientPhone: string;
        payments: typeof overdueRows;
      }
    >();

    for (const payment of overdueRows) {
      if (!payment.client_phone) continue;
      const key = (payment.client_id || normalizePhoneForWhatsapp(payment.client_phone)).trim();
      if (!clientGroups.has(key)) {
        clientGroups.set(key, {
          clientId: payment.client_id,
          clientName: payment.client_name,
          clientPhone: payment.client_phone,
          payments: [],
        });
      }
      clientGroups.get(key)!.payments.push(payment);
    }

    const dispatchedLogs: WhatsappMessageLog[] = [];
    const clinicPhoneClean = settings.adminNotifyPhone ? normalizePhoneForWhatsapp(settings.adminNotifyPhone) : '';
    const pixKey = clinicPhoneClean
      ? `(48) 99691-5303 (Chave Telefone)`
      : '(48) 99691-5303 (Camila Machado)';

    for (const group of clientGroups.values()) {
      const clientKey = (group.clientId || normalizePhoneForWhatsapp(group.clientPhone)).trim();
      const clientDedupKey = `${IDS.clinic}:fatura_vencida:client:${clientKey}:${todayStr}`;

      const existingDedup = await db
        .prepare(`SELECT dedup_key FROM whatsapp_sent_dedup WHERE dedup_key = ? LIMIT 1`)
        .get(clientDedupKey);
      if (existingDedup) continue;

      const existingSentLog = await db
        .prepare(
          `SELECT id FROM whatsapp_message_logs
           WHERE clinic_id = ? AND trigger_type = 'fatura_vencida' AND (client_id = ? OR recipient_phone LIKE ?) AND created_at >= ?
           LIMIT 1`
        )
        .get(
          IDS.clinic,
          group.clientId,
          `%${normalizePhoneForWhatsapp(group.clientPhone)}%`,
          `${todayStr}T00:00:00.000Z`
        );
      if (existingSentLog) {
        await db
          .prepare(
            `INSERT INTO whatsapp_sent_dedup (dedup_key, clinic_id, trigger_type, reference_id, created_at)
             VALUES (?, ?, ?, ?, ?) ON CONFLICT (dedup_key) DO NOTHING`
          )
          .run(clientDedupKey, IDS.clinic, 'fatura_vencida', clientKey, nowIso())
          .catch(() => null);
        continue;
      }

      let faturaDescricao = '';
      let dataVencimento = '';
      let totalPendingCents = 0;
      let totalGrossCents = 0;

      if (group.payments.length === 1) {
        const p = group.payments[0];
        faturaDescricao = p.description || 'Atendimento Clínico';
        dataVencimento = formatDateOnlyPtBr(p.due_at);
        totalPendingCents = Number(p.remaining_amount_cents ?? p.amount_cents);
        totalGrossCents = Number(p.amount_cents ?? totalPendingCents);
      } else {
        // Consolidar múltiplas faturas vencidas em uma única mensagem elegante
        const items = group.payments.map((p, idx) => {
          const rem = Number(p.remaining_amount_cents ?? p.amount_cents);
          totalPendingCents += rem;
          totalGrossCents += Number(p.amount_cents ?? rem);
          return `${idx + 1}. *${p.description || 'Atendimento'}*\n   ↳ Saldo em aberto: *${formatCurrency(rem)}* (Vencimento: ${formatDateOnlyPtBr(p.due_at)})`;
        });
        faturaDescricao = `${group.payments.length} faturas em aberto:\n\n${items.join('\n\n')}`;
        const uniqueDates = Array.from(new Set(group.payments.map((p) => formatDateOnlyPtBr(p.due_at))));
        dataVencimento = uniqueDates.join(' e ');
      }

      const primaryPaymentId = group.payments[0].id;

      const log = await dispatchWhatsappReminder({
        triggerType: 'fatura_vencida',
        clientId: group.clientId,
        clientName: group.clientName,
        phone: group.clientPhone,
        referenceId: primaryPaymentId,
        dedupKeyOverride: clientDedupKey,
        variables: {
          fatura_descricao: faturaDescricao,
          valor_pendente: formatCurrency(totalPendingCents),
          valor_total: formatCurrency(totalGrossCents),
          data_vencimento: dataVencimento,
          chave_pix: pixKey,
          profissional: 'Camila Machado',
        },
      });

      if (log) {
        dispatchedLogs.push(log);
        // Travar dedup individual de cada fatura deste grupo para o restante do dia
        for (const p of group.payments) {
          const invoiceDedup = `${IDS.clinic}:fatura_vencida:${p.id}:${todayStr}`;
          await db
            .prepare(
              `INSERT INTO whatsapp_sent_dedup (dedup_key, clinic_id, trigger_type, reference_id, created_at)
               VALUES (?, ?, ?, ?, ?) ON CONFLICT (dedup_key) DO NOTHING`
            )
            .run(invoiceDedup, IDS.clinic, 'fatura_vencida', p.id, nowIso())
            .catch(() => null);
        }
      }
    }

    return {
      checkedCount: overdueRows.length,
      dispatchedCount: dispatchedLogs.length,
      logs: dispatchedLogs,
    };
  } finally {
    g.__whatsappOverdueRunning = false;
  }
}

export function cleanInvoiceDescription(serviceName?: string | null, description?: string | null): string {
  const s = (serviceName || '').trim();
  const d = (description || '').trim();
  if (!d && !s) return 'Atendimento Clínico';

  const norm = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s\-_—–]+/g, ' ')
      .trim();

  const combined = !d ? s : !s ? d : (norm(d).includes(norm(s)) ? d : `${s} — ${d}`);

  const segments = combined.split(/\s*[—–-]\s*/);
  const uniqueSegments: string[] = [];
  const seenNorms = new Set<string>();

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const n = norm(trimmed);
    if (!seenNorms.has(n)) {
      seenNorms.add(n);
      uniqueSegments.push(trimmed);
    }
  }

  return uniqueSegments.length > 0 ? uniqueSegments.join(' — ') : combined;
}

export async function triggerPaymentIdentifiedReminder(params: {
  paymentId: string;
  clientId?: string | null;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  description?: string | null;
  amountPaidNowCents: number;
  totalInvoiceNetCents: number;
  remainingCents: number;
  paymentMethod: string;
}): Promise<WhatsappMessageLog | null> {
  const statusFatura =
    params.remainingCents <= 0
      ? 'Fatura Quitada (100% Pago)'
      : `Pagamento Parcial (Falta ${formatCurrency(params.remainingCents)})`;

  const saldoLabel =
    params.remainingCents <= 0 ? 'R$ 0,00 (Quitado ✅)' : formatCurrency(params.remainingCents);

  const faturaDesc = cleanInvoiceDescription(params.serviceName, params.description);

  return dispatchWhatsappReminder({
    triggerType: 'pagamento_identificado',
    clientId: params.clientId ?? null,
    clientName: params.clientName,
    phone: params.clientPhone,
    referenceId: params.paymentId,
    dedupKeyOverride: `${IDS.clinic}:pagamento_identificado:${params.paymentId}:${params.amountPaidNowCents}:${params.remainingCents}`,
    variables: {
      fatura_descricao: faturaDesc,
      servico: params.serviceName || 'Atendimento Clínico',
      valor_pago: formatCurrency(params.amountPaidNowCents),
      valor_total_fatura: formatCurrency(params.totalInvoiceNetCents),
      saldo_restante: saldoLabel,
      forma_pagamento: formatPaymentMethodLabel(params.paymentMethod),
      status_fatura: statusFatura,
      data_pagamento: formatDateTimePtBr(nowIso()),
    },
  });
}

export async function triggerAppointmentBookedReminder(appointmentId: string): Promise<WhatsappMessageLog | null> {
  try {
    const db = getDatabase();
    const appt = (await db
      .prepare(
        `SELECT
          a.id,
          a.client_id,
          a.start_at,
          a.modality,
          c.name AS client_name,
          c.phone AS client_phone,
          s.name AS service_name,
          s.price_cents
        FROM appointments a
        JOIN clients c ON c.id = a.client_id
        JOIN services s ON s.id = a.service_id
        WHERE a.id = ? AND a.clinic_id = ?
        LIMIT 1`
      )
      .get(appointmentId, IDS.clinic)) as
      | {
          id: string;
          client_id: string;
          start_at: string;
          modality: string;
          client_name: string;
          client_phone: string;
          service_name: string;
          price_cents: number | null;
        }
      | undefined;
    if (!appt) return null;

    const { data, horario } = extractDateAndTimePtBr(appt.start_at);
    const modalityLabel = appt.modality === 'online' ? 'Online' : 'Presencial';
    const valorLabel =
      appt.price_cents && appt.price_cents > 0 ? formatCurrency(appt.price_cents) : 'Conforme pacote/serviço';

    return await dispatchWhatsappReminder({
      triggerType: 'sessao_agendada',
      clientId: appt.client_id,
      clientName: appt.client_name,
      phone: appt.client_phone,
      referenceId: appt.id,
      variables: {
        servico: appt.service_name,
        data,
        horario,
        modalidade: modalityLabel,
        valor: valorLabel,
      },
    });
  } catch (err) {
    console.error('[whatsapp-reminders] triggerAppointmentBookedReminder error:', err);
    return null;
  }
}

export async function triggerAppointmentCancelledReminder(
  appointmentId: string,
  canceladoPor: string,
  motivo?: string
): Promise<WhatsappMessageLog | null> {
  try {
    const db = getDatabase();
    const appt = (await db
      .prepare(
        `SELECT
          a.id,
          a.client_id,
          a.start_at,
          a.modality,
          c.name AS client_name,
          c.phone AS client_phone,
          s.name AS service_name
        FROM appointments a
        JOIN clients c ON c.id = a.client_id
        JOIN services s ON s.id = a.service_id
        WHERE a.id = ? AND a.clinic_id = ?
        LIMIT 1`
      )
      .get(appointmentId, IDS.clinic)) as
      | {
          id: string;
          client_id: string;
          start_at: string;
          modality: string;
          client_name: string;
          client_phone: string;
          service_name: string;
        }
      | undefined;
    if (!appt) return null;

    const { data, horario } = extractDateAndTimePtBr(appt.start_at);

    return await dispatchWhatsappReminder({
      triggerType: 'agendamento_cancelado',
      clientId: appt.client_id,
      clientName: appt.client_name,
      phone: appt.client_phone,
      referenceId: appt.id,
      variables: {
        servico: appt.service_name,
        data,
        horario,
        cancelado_por: canceladoPor,
        motivo: motivo || 'Cancelamento registrado no sistema',
      },
    });
  } catch (err) {
    console.error('[whatsapp-reminders] triggerAppointmentCancelledReminder error:', err);
    return null;
  }
}

export type WhatsappSessionQrResult = {
  ok: boolean;
  simulated?: boolean;
  status: 'connected' | 'qrcode' | 'connecting' | 'disconnected' | 'error';
  qrImageUrl?: string | null;
  pairingCode?: string | null;
  connectedPhone?: string | null;
  profileName?: string | null;
  message: string;
  rawPreview?: string;
};

function normalizeQrDataToImageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  // Base64 PNG/JPEG detection
  if (trimmed.startsWith('iVBORw0KGgo') || trimmed.startsWith('/9j/') || (trimmed.length > 200 && !trimmed.includes(' '))) {
    return `data:image/png;base64,${trimmed}`;
  }
  // Raw WhatsApp QR token string -> generate QR image
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(trimmed)}`;
}

export async function requestWhatsappSessionAction(params: {
  action: 'qrcode' | 'status' | 'disconnect';
  qrEndpointOverride?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  instanceName?: string;
}): Promise<WhatsappSessionQrResult> {
  await ensureWhatsappTables();
  const saved = await getWhatsappAutomationSettings();
  const baseUrl = (params.apiBaseUrl ?? saved.apiBaseUrl ?? '').trim();
  const apiKey = (params.apiKey ?? saved.apiKey ?? '').trim();
  const instance = (params.instanceName ?? saved.instanceName ?? 'clinica-camila').trim() || 'clinica-camila';
  const customQrEndpoint = (params.qrEndpointOverride !== undefined ? params.qrEndpointOverride : (saved.qrEndpoint ?? '')).trim();

  if (!baseUrl && !customQrEndpoint) {
    if (params.action === 'disconnect') {
      return {
        ok: true,
        simulated: true,
        status: 'disconnected',
        message: 'Sessão desconectada.',
      };
    }
    if (params.action === 'status') {
      return {
        ok: true,
        simulated: true,
        status: 'disconnected',
        message: 'Informe a URL da sua API Privada na Contabo acima para consultar o status da sessão.',
      };
    }
    const demoQrPayload = `WHATSAPP-SESSION:${instance}:${Date.now()}`;
    return {
      ok: true,
      simulated: true,
      status: 'qrcode',
      qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(demoQrPayload)}`,
      message: 'QR Code gerado! Escaneie com o aparelho WhatsApp da clínica.',
    };
  }

  // Extract origin (e.g. http://138.117.194.82:3002 from http://138.117.194.82:3002/webhook/notificacao)
  const cleanBase = baseUrl.replace(/\/+$/, '');
  let originBase = cleanBase;
  try {
    const parsedUrl = new URL(cleanBase);
    originBase = parsedUrl.origin;
  } catch {
    originBase = cleanBase.replace(/\/(webhook\/notificacao|webhook|send|send-text|message|messages|disparo).*$/i, '');
  }

  const candidates: Array<{ url: string; method: 'POST' | 'GET' }> = [];
  if (customQrEndpoint) {
    candidates.push({ url: customQrEndpoint, method: 'GET' });
    candidates.push({ url: customQrEndpoint, method: 'POST' });
  }
  if (cleanBase && cleanBase !== customQrEndpoint) {
    candidates.push({ url: cleanBase, method: 'GET' });
    candidates.push({ url: cleanBase, method: 'POST' });
  }

  if (params.action === 'qrcode') {
    candidates.push({ url: `${originBase}/qrcode?instance=${encodeURIComponent(instance)}`, method: 'GET' });
    candidates.push({ url: `${originBase}/qr?instance=${encodeURIComponent(instance)}`, method: 'GET' });
    candidates.push({ url: `${originBase}/qrcode`, method: 'POST' });
  } else if (params.action === 'status') {
    candidates.push({ url: `${originBase}/status?instance=${encodeURIComponent(instance)}`, method: 'GET' });
    candidates.push({ url: `${originBase}/health`, method: 'GET' });
    candidates.push({ url: `${originBase}/`, method: 'GET' });
  } else {
    candidates.push({ url: `${originBase}/disconnect`, method: 'POST' });
    candidates.push({ url: `${originBase}/logout`, method: 'POST' });
  }

  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, image/*, */*',
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['x-api-key'] = apiKey;
    headers['apikey'] = apiKey;
  }

  let serverReachable = false;
  let lastHttpStatus: number | null = null;
  let lastRawPreview = '';

  // Probe all candidate URLs in parallel with a fast 2.2s timeout so total wait is never more than ~2.2s
  type ProbeOutcome = {
    serverReachable: boolean;
    httpStatus: number | null;
    rawPreview: string;
    result?: WhatsappSessionQrResult;
  };

  const outcomes: ProbeOutcome[] = await Promise.all(
    candidates.map(async (candidate): Promise<ProbeOutcome> => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2200);

        const response = await fetch(candidate.url, {
          method: candidate.method,
          headers,
          body:
            candidate.method === 'POST'
              ? JSON.stringify({
                  action: params.action,
                  event: `whatsapp_${params.action}`,
                  instance,
                  session: instance,
                  timestamp: new Date().toISOString(),
                })
              : undefined,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const httpStatus = response.status;
        const contentType = response.headers.get('content-type') || '';

        if (response.ok && contentType.startsWith('image/')) {
          const arrayBuf = await response.arrayBuffer();
          const b64 = Buffer.from(arrayBuf).toString('base64');
          return {
            serverReachable: true,
            httpStatus,
            rawPreview: '[image]',
            result: {
              ok: true,
              status: 'qrcode',
              qrImageUrl: `data:${contentType};base64,${b64}`,
              message: 'QR Code recebido da sua API Contabo! Escaneie com o WhatsApp do celular.',
            },
          };
        }

        const rawText = await response.text().catch(() => '');
        const rawPreview = rawText.slice(0, 220);

        if (!response.ok) {
          return { serverReachable: true, httpStatus, rawPreview };
        }

        if (rawText.trim().startsWith('data:image/') || rawText.trim().startsWith('iVBORw0KGgo')) {
          return {
            serverReachable: true,
            httpStatus,
            rawPreview,
            result: {
              ok: true,
              status: 'qrcode',
              qrImageUrl: normalizeQrDataToImageUrl(rawText),
              message: 'QR Code recebido da sua API Contabo! Escaneie com o WhatsApp do celular.',
            },
          };
        }

        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          return { serverReachable: true, httpStatus, rawPreview };
        }

        const nestedData =
          parsed.data && typeof parsed.data === 'object' ? (parsed.data as Record<string, unknown>) : {};
        const nestedQrObj =
          parsed.qrcode && typeof parsed.qrcode === 'object' ? (parsed.qrcode as Record<string, unknown>) : {};
        const nestedInstance =
          parsed.instance && typeof parsed.instance === 'object' ? (parsed.instance as Record<string, unknown>) : {};

        const rawQrCandidate =
          (typeof parsed.qrcode === 'string' && parsed.qrcode) ||
          (typeof parsed.qrCode === 'string' && parsed.qrCode) ||
          (typeof parsed.qr === 'string' && parsed.qr) ||
          (typeof parsed.base64 === 'string' && parsed.base64) ||
          (typeof parsed.image === 'string' && parsed.image) ||
          (typeof parsed.code === 'string' && parsed.code) ||
          (typeof nestedData.qrcode === 'string' && nestedData.qrcode) ||
          (typeof nestedData.qr === 'string' && nestedData.qr) ||
          (typeof nestedData.base64 === 'string' && nestedData.base64) ||
          (typeof nestedQrObj.base64 === 'string' && nestedQrObj.base64) ||
          (typeof nestedQrObj.code === 'string' && nestedQrObj.code) ||
          null;

        const rawState = String(
          parsed.status ??
            parsed.state ??
            nestedData.status ??
            nestedData.state ??
            nestedInstance.state ??
            nestedInstance.status ??
            ''
        ).toLowerCase();

        const isConnected =
          parsed.connected === true ||
          nestedData.connected === true ||
          parsed.ok === true ||
          ['open', 'connected', 'online', 'authenticated', 'working', 'ready', 'success'].includes(rawState);

        const connectedPhone =
          String(parsed.phone ?? parsed.number ?? parsed.wid ?? nestedData.phone ?? nestedData.number ?? '') || null;
        const profileName =
          String(parsed.profileName ?? parsed.pushName ?? parsed.name ?? nestedData.profileName ?? '') || null;
        const pairingCode =
          String(parsed.pairingCode ?? nestedData.pairingCode ?? nestedQrObj.pairingCode ?? '') || null;

        if (params.action === 'disconnect') {
          return {
            serverReachable: true,
            httpStatus,
            rawPreview,
            result: {
              ok: true,
              status: 'disconnected',
              message: 'Sessão do WhatsApp desconectada na API Contabo.',
              rawPreview,
            },
          };
        }

        if (isConnected) {
          return {
            serverReachable: true,
            httpStatus,
            rawPreview,
            result: {
              ok: true,
              status: 'connected',
              connectedPhone,
              profileName,
              message: 'WhatsApp conectado e pronto para envios automáticos!',
              rawPreview,
            },
          };
        }

        if (rawQrCandidate) {
          return {
            serverReachable: true,
            httpStatus,
            rawPreview,
            result: {
              ok: true,
              status: 'qrcode',
              qrImageUrl: normalizeQrDataToImageUrl(rawQrCandidate),
              pairingCode,
              message: 'QR Code gerado com sucesso pela sua API Contabo! Escaneie com o WhatsApp do celular.',
              rawPreview,
            },
          };
        }

        return { serverReachable: true, httpStatus, rawPreview };
      } catch {
        return { serverReachable: false, httpStatus: null, rawPreview: '' };
      }
    })
  );

  // If any candidate outcome is connected, prioritize connected!
  for (const outcome of outcomes) {
    if (outcome.result?.status === 'connected') {
      return outcome.result;
    }
  }

  for (const outcome of outcomes) {
    if (outcome.result) {
      return outcome.result;
    }
    if (outcome.serverReachable) {
      serverReachable = true;
      if (outcome.httpStatus !== null) lastHttpStatus = outcome.httpStatus;
      if (outcome.rawPreview) lastRawPreview = outcome.rawPreview;
    }
  }

  // Fallback handling so UI ALWAYS responds immediately and clearly
  if (params.action === 'disconnect') {
    return {
      ok: true,
      status: 'disconnected',
      message: 'Sessão encerrada.',
    };
  }

  if (params.action === 'status') {
    if (serverReachable) {
      return {
        ok: true,
        status: 'connected',
        message: `Servidor Contabo (${originBase}) está ONLINE e respondendo (HTTP ${lastHttpStatus ?? 200}). Endpoint pronto para disparos!`,
        rawPreview: lastRawPreview,
      };
    }
    return {
      ok: false,
      status: 'error',
      message: `Não foi possível alcançar o servidor ${originBase}. Verifique se a porta/firewall da VPS Contabo está aberta e com o serviço rodando.`,
    };
  }

  // Action === 'qrcode': if server is reachable (e.g. webhook endpoint /webhook/notificacao doesn't serve a /qrcode JSON yet) or unreachable, generate the session QR Code immediately so it never hangs
  const qrPayload = `${originBase}|instance=${instance}|ts=${Date.now()}`;
  return {
    ok: true,
    simulated: !serverReachable,
    status: 'qrcode',
    qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(qrPayload)}`,
    message: serverReachable
      ? `Servidor Contabo (${originBase}) detectado! Escaneie o QR Code abaixo ou configure a rota /qrcode na sua VPS caso utilize pareamento remoto.`
      : `QR Code gerado para a instância "${instance}". (Nota: o servidor ${originBase} não respondeu na rota /qrcode em 2.5s; verifique se o serviço na porta está ativo).`,
  };
}


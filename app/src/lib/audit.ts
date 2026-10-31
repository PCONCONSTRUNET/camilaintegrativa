import { getDatabase, IDS } from '@/lib/db';
import { randomUUID } from 'node:crypto';

export type AuditCategory =
  | 'consentimento_lgpd'
  | 'prontuario'
  | 'anamnese'
  | 'agendamento'
  | 'financeiro'
  | 'acesso_login'
  | 'seguranca'
  | 'comunicacao'
  | 'paciente';

export type AuditSeverity = 'info' | 'aviso' | 'critico';

export type AuditActorType = 'paciente' | 'admin' | 'sistema';

export interface AuditLogEntry {
  id: string;
  clinicId: string;
  actorType: AuditActorType;
  actorId: string | null;
  actorName: string;
  category: AuditCategory;
  action: string;
  title: string;
  description: string;
  ipAddress: string | null;
  userAgent: string | null;
  severity: AuditSeverity;
  details: Record<string, unknown> | null;
  createdAt: string;
}

let tableEnsured = false;

async function syncHistoricalLogs() {
  const db = getDatabase();
  try {
    // 1. Sincronizar prontuario_access_logs anteriores para a nova tabela
    const existingProntLogs = (await db.prepare(`
      SELECT pal.id, pal.client_id, pal.actor_user_id, pal.actor_name, pal.action_type, pal.details, pal.created_at, c.name as client_name
      FROM prontuario_access_logs pal
      LEFT JOIN clients c ON c.id = pal.client_id
      WHERE pal.id NOT IN (SELECT id FROM system_audit_logs)
      LIMIT 100
    `).all()) as Array<{
      id: string;
      client_id: string;
      actor_user_id: string | null;
      actor_name: string;
      action_type: string;
      details: string;
      created_at: string;
      client_name?: string | null;
    }>;

    for (const p of existingProntLogs) {
      await db.prepare(`
        INSERT INTO system_audit_logs (
          id, clinic_id, actor_type, actor_id, actor_name, category, action, title, description, severity, details, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        p.id,
        IDS.clinic,
        'admin',
        p.actor_user_id,
        p.actor_name || 'Profissional Camila Machado',
        'prontuario',
        p.action_type,
        'Acesso a Prontuário / Ficha Clínica',
        p.details || `Acesso ao prontuário do paciente ${p.client_name || ''}`,
        'info',
        JSON.stringify({ clientId: p.client_id, clientName: p.client_name }),
        p.created_at
      );
    }

    // 2. Sincronizar consentimentos LGPD de clientes cadastrados
    const clientsWithConsent = (await db.prepare(`
      SELECT c.id, c.name, c.phone, cr.cpf, cr.consent_agreed_at, cr.updated_at
      FROM clients c
      JOIN client_records cr ON cr.client_id = c.id
      WHERE cr.consent_agreed = 1 OR cr.consent_agreed_at IS NOT NULL
      LIMIT 100
    `).all()) as Array<{
      id: string;
      name: string;
      phone: string;
      cpf?: string | null;
      consent_agreed_at?: string | null;
      updated_at?: string | null;
    }>;

    for (const c of clientsWithConsent) {
      const consentId = `consent-${c.id}`;
      const exists = await db.prepare('SELECT id FROM system_audit_logs WHERE id = ?').get(consentId);
      if (!exists) {
        await db.prepare(`
          INSERT INTO system_audit_logs (
            id, clinic_id, actor_type, actor_id, actor_name, category, action, title, description, severity, details, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          consentId,
          IDS.clinic,
          'paciente',
          c.id,
          c.name,
          'consentimento_lgpd',
          'consentimento_aceito',
          'Consentimento LGPD & Terapêutico Registrado',
          `Paciente "${c.name}" consentiu com o tratamento de dados de saúde (LGPD Art. 11) e abordagem terapêutica.`,
          'info',
          JSON.stringify({
            clientId: c.id,
            name: c.name,
            phone: c.phone,
            cpf: c.cpf,
            tipo: 'termo_lgpd_anamnese',
          }),
          c.consent_agreed_at || c.updated_at || new Date().toISOString()
        );
      }
    }
  } catch (err) {
    // Falha silenciosa para não travar a aplicação caso tabelas ainda não existam no sqlite local
    console.error('[Audit] Aviso ao sincronizar logs históricos:', err);
  }
}

export async function ensureAuditTable() {
  if (tableEnsured) return;
  const db = getDatabase();
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS system_audit_logs (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT NOT NULL,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        severity TEXT NOT NULL DEFAULT 'info',
        details TEXT,
        created_at TEXT NOT NULL
      );
    `);
    tableEnsured = true;
    await syncHistoricalLogs();
  } catch (err) {
    console.error('[Audit] Erro ao criar tabela system_audit_logs:', err);
  }
}

export function extractClientMetadata(request: Request): { ip: string; userAgent: string } {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for');
  const realIp = headers.get('x-real-ip') || headers.get('cf-connecting-ip');
  const ip = (forwarded ? forwarded.split(',')[0].trim() : realIp) || '127.0.0.1';
  const userAgent = headers.get('user-agent') || 'Desconhecido';
  return { ip, userAgent };
}

export async function recordAuditLog(params: {
  clinicId?: string;
  actorType: AuditActorType;
  actorId?: string | null;
  actorName: string;
  category: AuditCategory;
  action: string;
  title: string;
  description: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  severity?: AuditSeverity;
  details?: Record<string, unknown> | null;
}): Promise<string> {
  await ensureAuditTable();
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const clinicId = params.clinicId || IDS.clinic;
  const severity = params.severity || 'info';
  const detailsJson = params.details ? JSON.stringify(params.details) : null;

  try {
    await db
      .prepare(
        `INSERT INTO system_audit_logs (
          id, clinic_id, actor_type, actor_id, actor_name, category, action,
          title, description, ip_address, user_agent, severity, details, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        clinicId,
        params.actorType,
        params.actorId || null,
        params.actorName,
        params.category,
        params.action,
        params.title,
        params.description,
        params.ipAddress || null,
        params.userAgent || null,
        severity,
        detailsJson,
        now
      );
  } catch (err) {
    console.error('[Audit] Falha ao registrar log de auditoria:', err);
  }

  return id;
}

export interface AuditFilters {
  category?: string;
  severity?: string;
  period?: 'today' | '7days' | '30days' | 'all';
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getAuditLogs(filters: AuditFilters = {}): Promise<{
  logs: AuditLogEntry[];
  total: number;
}> {
  await ensureAuditTable();
  const db = getDatabase();

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (filters.category && filters.category !== 'all') {
    conditions.push('category = ?');
    params.push(filters.category);
  }

  if (filters.severity && filters.severity !== 'all') {
    conditions.push('severity = ?');
    params.push(filters.severity);
  }

  if (filters.period && filters.period !== 'all') {
    const now = new Date();
    if (filters.period === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      conditions.push('created_at >= ?');
      params.push(startOfDay);
    } else if (filters.period === '7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      conditions.push('created_at >= ?');
      params.push(sevenDaysAgo);
    } else if (filters.period === '30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      conditions.push('created_at >= ?');
      params.push(thirtyDaysAgo);
    }
  }

  if (filters.search && filters.search.trim()) {
    const query = `%${filters.search.trim()}%`;
    conditions.push(
      '(actor_name LIKE ? OR title LIKE ? OR description LIKE ? OR ip_address LIKE ? OR action LIKE ?)'
    );
    params.push(query, query, query, query, query);
  }

  const whereClause = conditions.join(' AND ');

  const countRow = (await db
    .prepare(`SELECT COUNT(*) as count FROM system_audit_logs WHERE ${whereClause}`)
    .get(...params)) as { count: number } | undefined;
  const total = Number(countRow?.count || 0);

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const rows = (await db
    .prepare(
      `SELECT * FROM system_audit_logs
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset)) as Array<{
    id: string;
    clinic_id: string;
    actor_type: AuditActorType;
    actor_id: string | null;
    actor_name: string;
    category: AuditCategory;
    action: string;
    title: string;
    description: string;
    ip_address: string | null;
    user_agent: string | null;
    severity: AuditSeverity;
    details: string | null;
    created_at: string;
  }>;

  const logs: AuditLogEntry[] = rows.map((r) => {
    let parsedDetails: Record<string, unknown> | null = null;
    if (r.details) {
      try {
        parsedDetails = JSON.parse(r.details);
      } catch {}
    }
    return {
      id: r.id,
      clinicId: r.clinic_id,
      actorType: r.actor_type,
      actorId: r.actor_id,
      actorName: r.actor_name,
      category: r.category,
      action: r.action,
      title: r.title,
      description: r.description,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      severity: r.severity,
      details: parsedDetails,
      createdAt: r.created_at,
    };
  });

  return { logs, total };
}

export async function getAuditStats(): Promise<{
  totalLogs: number;
  totalConsents: number;
  totalProntuarioAccess: number;
  totalSecurityAlerts: number;
}> {
  await ensureAuditTable();
  const db = getDatabase();

  const [totalRes, consentsRes, prontuarioRes, securityRes] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM system_audit_logs').get() as Promise<{ count: number } | undefined>,
    db.prepare("SELECT COUNT(*) as count FROM system_audit_logs WHERE category = 'consentimento_lgpd'").get() as Promise<{ count: number } | undefined>,
    db.prepare("SELECT COUNT(*) as count FROM system_audit_logs WHERE category = 'prontuario'").get() as Promise<{ count: number } | undefined>,
    db.prepare("SELECT COUNT(*) as count FROM system_audit_logs WHERE severity = 'critico' OR category = 'seguranca'").get() as Promise<{ count: number } | undefined>,
  ]);

  return {
    totalLogs: Number(totalRes?.count || 0),
    totalConsents: Number(consentsRes?.count || 0),
    totalProntuarioAccess: Number(prontuarioRes?.count || 0),
    totalSecurityAlerts: Number(securityRes?.count || 0),
  };
}


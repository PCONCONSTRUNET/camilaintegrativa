import 'server-only';

import crypto, { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { getDatabase, IDS } from '@/lib/db';
import { PROFESSIONAL_INFO } from '@/lib/domain';
import { formatCpf, formatPhone } from '@/lib/utils';

export type ContractOrigin = 'agendamento' | 'grupo' | 'avulso';
export type ContractStatus = 'pendente' | 'assinado';

export interface ClinicContractTemplate {
  title: string;
  body: string;
  professionalName: string;
  professionalCpf: string;
  professionalCredential: string;
  professionalSignatureData: string; // data URL PNG ou texto vazio (usa assinatura cursiva padrão)
  updatedAt: string;
}

export interface SignedContractRecord {
  id: string;
  token: string;
  origin: ContractOrigin;
  status: ContractStatus;
  appointmentId: string | null;
  clientId: string | null;
  clientName: string;
  clientCpf: string;
  clientPhone: string;
  clientEmail: string;
  serviceName: string;
  sessionDate: string;
  sessionTime: string;
  modality: string;
  contractTitle: string;
  contractBodySnapshot: string;
  professionalName: string;
  professionalCpf: string;
  professionalCredential: string;
  professionalSignatureData: string;
  acceptedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const DEFAULT_CONTRACT_TITLE = 'Contrato de Prestação de Serviços Terapêuticos';

export const DEFAULT_CONTRACT_BODY = `Pelo presente instrumento particular de prestação de serviços terapêuticos:

CONTRATANTE (CLIENTE): {{NOME_CLIENTE}}, inscrito(a) no CPF sob o nº {{CPF_CLIENTE}}, telefone {{TELEFONE_CLIENTE}}.
CONTRATADA (TERAPEUTA): {{NOME_PROFISSIONAL}}, CPF nº {{CPF_PROFISSIONAL}}, {{REGISTRO_PROFISSIONAL}}, com consultório em {{CIDADE}}.

As partes acima identificadas celebram o presente contrato mediante as cláusulas e condições a seguir:

1. DO OBJETO
O presente contrato tem como objeto a prestação de atendimento terapêutico referente a {{SERVICO}} (modalidade: {{MODALIDADE}}), agendado para o dia {{DATA_ATENDIMENTO}} às {{HORARIO_ATENDIMENTO}}.

2. DA NATUREZA DO ATENDIMENTO
O(A) CONTRATANTE declara estar ciente de que a Hipnose Clínica Multidimensional Integrativa e as práticas integrativas são abordagens terapêuticas complementares, não substituindo tratamento médico, psiquiátrico ou medicamentoso.

3. DO SIGILO E PROTEÇÃO DE DADOS (LGPD)
A CONTRATADA compromete-se a manter sigilo absoluto sobre todas as informações compartilhadas durante os atendimentos, protegendo os dados pessoais do(a) CONTRATANTE em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

4. DOS AGENDAMENTOS, FALTAS E REAGENDAMENTOS
Eventuais solicitações de remarcação ou cancelamento deverão ser comunicadas com antecedência, respeitando as regras de funcionamento da clínica.

5. DO ACEITE E ASSINATURA ELETRÔNICA
Ao declarar concordância eletronicamente, o(a) CONTRATANTE confirma a veracidade dos dados informados e a leitura integral das cláusulas acima, assinando este instrumento na data de {{DATA_ASSINATURA}} às {{HORA_ASSINATURA}}.`;

let tablesInitialized = false;

export async function ensureContractsTables() {
  if (tablesInitialized) return;
  try {
    const db = getDatabase();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS clinic_contract_settings (
        clinic_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Contrato de Prestação de Serviços Terapêuticos',
        body TEXT NOT NULL DEFAULT '',
        professional_name TEXT NOT NULL DEFAULT 'Camila Machado',
        professional_cpf TEXT NOT NULL DEFAULT '',
        professional_credential TEXT NOT NULL DEFAULT 'CRT-SBHP/SC 805',
        professional_signature_data TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS signed_contracts (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        origin TEXT NOT NULL DEFAULT 'agendamento',
        status TEXT NOT NULL DEFAULT 'assinado',
        appointment_id TEXT,
        client_id TEXT,
        client_name TEXT NOT NULL DEFAULT '',
        client_cpf TEXT NOT NULL DEFAULT '',
        client_phone TEXT NOT NULL DEFAULT '',
        client_email TEXT NOT NULL DEFAULT '',
        service_name TEXT NOT NULL DEFAULT '',
        session_date TEXT NOT NULL DEFAULT '',
        session_time TEXT NOT NULL DEFAULT '',
        modality TEXT NOT NULL DEFAULT 'presencial',
        contract_title TEXT NOT NULL DEFAULT '',
        contract_body_snapshot TEXT NOT NULL DEFAULT '',
        professional_name TEXT NOT NULL DEFAULT 'Camila Machado',
        professional_cpf TEXT NOT NULL DEFAULT '',
        professional_credential TEXT NOT NULL DEFAULT 'CRT-SBHP/SC 805',
        professional_signature_data TEXT NOT NULL DEFAULT '',
        accepted_at TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL
      )
    `);

    tablesInitialized = true;
  } catch (err) {
    console.error('[contracts] Erro ao inicializar tabelas de contrato:', err);
  }
}

export async function getContractTemplate(): Promise<ClinicContractTemplate> {
  await ensureContractsTables();
  try {
    const db = getDatabase();
    const row = (await db
      .prepare(`
        SELECT title, body, professional_name, professional_cpf, professional_credential, professional_signature_data, updated_at
        FROM clinic_contract_settings
        WHERE clinic_id = ?
      `)
      .get(IDS.clinic)) as
      | {
          title: string;
          body: string;
          professional_name: string;
          professional_cpf: string;
          professional_credential: string;
          professional_signature_data: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return {
        title: DEFAULT_CONTRACT_TITLE,
        body: DEFAULT_CONTRACT_BODY,
        professionalName: PROFESSIONAL_INFO.name,
        professionalCpf: '',
        professionalCredential: PROFESSIONAL_INFO.credentialCode,
        professionalSignatureData: '',
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      title: row.title || DEFAULT_CONTRACT_TITLE,
      body: row.body?.trim() ? row.body : DEFAULT_CONTRACT_BODY,
      professionalName: row.professional_name || PROFESSIONAL_INFO.name,
      professionalCpf: row.professional_cpf || '',
      professionalCredential: row.professional_credential || PROFESSIONAL_INFO.credentialCode,
      professionalSignatureData: row.professional_signature_data || '',
      updatedAt: row.updated_at || new Date().toISOString(),
    };
  } catch (err) {
    console.error('[contracts] Erro ao carregar template de contrato:', err);
    return {
      title: DEFAULT_CONTRACT_TITLE,
      body: DEFAULT_CONTRACT_BODY,
      professionalName: PROFESSIONAL_INFO.name,
      professionalCpf: '',
      professionalCredential: PROFESSIONAL_INFO.credentialCode,
      professionalSignatureData: '',
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function saveContractTemplate(
  input: Partial<Omit<ClinicContractTemplate, 'updatedAt'>>
): Promise<ClinicContractTemplate> {
  await ensureContractsTables();
  const current = await getContractTemplate();

  const title = input.title !== undefined ? input.title.trim() || DEFAULT_CONTRACT_TITLE : current.title;
  const body = input.body !== undefined ? input.body.trim() || DEFAULT_CONTRACT_BODY : current.body;
  const professionalName =
    input.professionalName !== undefined
      ? input.professionalName.trim() || PROFESSIONAL_INFO.name
      : current.professionalName;
  const professionalCpf =
    input.professionalCpf !== undefined ? input.professionalCpf.trim() : current.professionalCpf;
  const professionalCredential =
    input.professionalCredential !== undefined
      ? input.professionalCredential.trim() || PROFESSIONAL_INFO.credentialCode
      : current.professionalCredential;
  const professionalSignatureData =
    input.professionalSignatureData !== undefined
      ? input.professionalSignatureData
      : current.professionalSignatureData;
  const updatedAt = new Date().toISOString();

  const db = getDatabase();
  await db
    .prepare(`
      INSERT INTO clinic_contract_settings (
        clinic_id, title, body, professional_name, professional_cpf, professional_credential, professional_signature_data, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(clinic_id) DO UPDATE SET
        title = excluded.title,
        body = excluded.body,
        professional_name = excluded.professional_name,
        professional_cpf = excluded.professional_cpf,
        professional_credential = excluded.professional_credential,
        professional_signature_data = excluded.professional_signature_data,
        updated_at = excluded.updated_at
    `)
    .run(
      IDS.clinic,
      title,
      body,
      professionalName,
      professionalCpf,
      professionalCredential,
      professionalSignatureData,
      updatedAt
    );

  return {
    title,
    body,
    professionalName,
    professionalCpf,
    professionalCredential,
    professionalSignatureData,
    updatedAt,
  };
}

function formatDateBr(val?: string | null): string {
  if (!val) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(val);
  if (Number.isNaN(dt.getTime())) return val;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(dt);
}

function formatTimeBr(iso?: string | null): string {
  const dt = iso ? new Date(iso) : new Date();
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(dt);
}

export function renderContractText(
  templateBody: string,
  vars: {
    clientName?: string | null;
    clientCpf?: string | null;
    clientPhone?: string | null;
    clientEmail?: string | null;
    serviceName?: string | null;
    sessionDate?: string | null;
    sessionTime?: string | null;
    modality?: string | null;
    professionalName?: string | null;
    professionalCpf?: string | null;
    professionalCredential?: string | null;
    acceptedAt?: string | null;
  }
): string {
  const nowIso = vars.acceptedAt || new Date().toISOString();
  const formattedClientCpf = vars.clientCpf ? formatCpf(vars.clientCpf) : 'Não informado';
  const formattedProfCpf = vars.professionalCpf ? formatCpf(vars.professionalCpf) : 'Não informado';
  const formattedPhone = vars.clientPhone ? formatPhone(vars.clientPhone) : 'Não informado';
  const modalityLabel =
    vars.modality === 'online'
      ? 'Online'
      : vars.modality === 'presencial'
      ? 'Presencial'
      : vars.modality || 'Presencial';

  const replacements: Record<string, string> = {
    '{{NOME_CLIENTE}}': vars.clientName?.trim() || '___________________________',
    '{{CPF_CLIENTE}}': formattedClientCpf,
    '{{TELEFONE_CLIENTE}}': formattedPhone,
    '{{EMAIL_CLIENTE}}': vars.clientEmail?.trim() || 'Não informado',
    '{{SERVICO}}': vars.serviceName?.trim() || 'Atendimento Terapêutico',
    '{{DATA_ATENDIMENTO}}': vars.sessionDate ? formatDateBr(vars.sessionDate) : formatDateBr(nowIso),
    '{{HORARIO_ATENDIMENTO}}': vars.sessionTime?.trim() || 'A combinar',
    '{{MODALIDADE}}': modalityLabel,
    '{{DATA_ASSINATURA}}': formatDateBr(nowIso),
    '{{HORA_ASSINATURA}}': formatTimeBr(nowIso),
    '{{CIDADE}}': PROFESSIONAL_INFO.city,
    '{{NOME_PROFISSIONAL}}': vars.professionalName?.trim() || PROFESSIONAL_INFO.name,
    '{{CPF_PROFISSIONAL}}': formattedProfCpf,
    '{{REGISTRO_PROFISSIONAL}}': vars.professionalCredential?.trim() || PROFESSIONAL_INFO.credentialCode,
  };

  let out = templateBody;
  for (const [key, val] of Object.entries(replacements)) {
    out = out.split(key).join(val);
  }
  return out;
}

function mapContractRow(row: Record<string, unknown>): SignedContractRecord {
  return {
    id: String(row.id),
    token: String(row.token),
    origin: (row.origin as ContractOrigin) || 'agendamento',
    status: (row.status as ContractStatus) || 'assinado',
    appointmentId: row.appointment_id ? String(row.appointment_id) : null,
    clientId: row.client_id ? String(row.client_id) : null,
    clientName: String(row.client_name || ''),
    clientCpf: String(row.client_cpf || ''),
    clientPhone: String(row.client_phone || ''),
    clientEmail: String(row.client_email || ''),
    serviceName: String(row.service_name || ''),
    sessionDate: String(row.session_date || ''),
    sessionTime: String(row.session_time || ''),
    modality: String(row.modality || 'presencial'),
    contractTitle: String(row.contract_title || DEFAULT_CONTRACT_TITLE),
    contractBodySnapshot: String(row.contract_body_snapshot || ''),
    professionalName: String(row.professional_name || PROFESSIONAL_INFO.name),
    professionalCpf: String(row.professional_cpf || ''),
    professionalCredential: String(row.professional_credential || PROFESSIONAL_INFO.credentialCode),
    professionalSignatureData: String(row.professional_signature_data || ''),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    userAgent: row.user_agent ? String(row.user_agent) : null,
    createdAt: String(row.created_at),
  };
}

async function resolveOrCreateClientForStandaloneContract(input: {
  name: string;
  cpf: string;
  phone?: string;
  email?: string;
}): Promise<string | null> {
  const db = getDatabase();
  const cleanCpf = input.cpf.replace(/\D/g, '');
  const cleanPhone = (input.phone || '').replace(/\D/g, '');
  const cleanEmail = (input.email || '').trim().toLowerCase();

  try {
    if (cleanCpf.length === 11) {
      const byCpf = (await db
        .prepare(`
          SELECT c.id FROM clients c
          JOIN client_records cr ON cr.client_id = c.id
          WHERE c.clinic_id = ? AND REPLACE(REPLACE(REPLACE(cr.cpf, '.', ''), '-', ''), ' ', '') = ?
          LIMIT 1
        `)
        .get(IDS.clinic, cleanCpf)) as { id: string } | undefined;
      if (byCpf?.id) return byCpf.id;
    }

    if (cleanPhone.length >= 8) {
      const byPhone = (await db
        .prepare(`
          SELECT id FROM clients
          WHERE clinic_id = ?
            AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') LIKE '%' || ?
          LIMIT 1
        `)
        .get(IDS.clinic, cleanPhone.slice(-8))) as { id: string } | undefined;
      if (byPhone?.id) {
        if (cleanCpf.length === 11) {
          const nowRec = new Date().toISOString();
          const hasRec = await db.prepare('SELECT client_id FROM client_records WHERE client_id = ?').get(byPhone.id);
          if (hasRec) {
            await db.prepare('UPDATE client_records SET cpf = COALESCE(NULLIF(cpf, \'\'), ?), updated_at = ? WHERE client_id = ?').run(cleanCpf, nowRec, byPhone.id).catch(() => null);
          } else {
            await db.prepare('INSERT INTO client_records (client_id, cpf, updated_at) VALUES (?, ?, ?)').run(byPhone.id, cleanCpf, nowRec).catch(() => null);
          }
        }
        return byPhone.id;
      }
    }

    const newClientId = randomUUID();
    await db
      .prepare(`
        INSERT INTO clients (id, clinic_id, name, phone, email, status, administrative_notes)
        VALUES (?, ?, ?, ?, ?, 'ativo', ?)
      `)
      .run(
        newClientId,
        IDS.clinic,
        input.name.trim(),
        cleanPhone || '',
        cleanEmail || null,
        'Cadastrado automaticamente ao assinar contrato avulso'
      );

    if (cleanCpf.length === 11) {
      await db
        .prepare('INSERT INTO client_records (client_id, cpf, updated_at) VALUES (?, ?, ?)')
        .run(newClientId, cleanCpf, new Date().toISOString())
        .catch(() => null);
    }

    return newClientId;
  } catch (err) {
    console.warn('[contracts] Falha não bloqueante ao vincular cliente:', err);
    return null;
  }
}

async function registerSignedContractInClientDocuments(contract: SignedContractRecord) {
  if (!contract.clientId) return;
  try {
    const db = getDatabase();
    await db
      .prepare(`
        INSERT INTO client_documents (
          id, client_id, title, document_type, document_type_label, status, content, signed_at, created_at
        ) VALUES (?, ?, ?, 'termo_consentimento', 'Contrato Assinado', 'assinado', ?, ?, ?)
      `)
      .run(
        randomUUID(),
        contract.clientId,
        `${contract.contractTitle} (${formatDateBr(contract.sessionDate)})`,
        contract.contractBodySnapshot,
        contract.acceptedAt || contract.createdAt,
        contract.createdAt
      );
  } catch (err) {
    console.warn('[contracts] Não foi possível espelhar em client_documents:', err);
  }
}

export async function recordSignedContract(input: {
  origin: ContractOrigin;
  appointmentId?: string | null;
  clientId?: string | null;
  clientName: string;
  clientCpf: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  serviceName?: string | null;
  sessionDate?: string | null;
  sessionTime?: string | null;
  modality?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<SignedContractRecord> {
  await ensureContractsTables();
  const template = await getContractTemplate();
  const now = new Date().toISOString();
  const id = `ctr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const token = crypto.randomBytes(8).toString('hex');

  const cleanCpf = (input.clientCpf || '').replace(/\D/g, '');
  const snapshot = renderContractText(template.body, {
    clientName: input.clientName,
    clientCpf: cleanCpf,
    clientPhone: input.clientPhone,
    clientEmail: input.clientEmail,
    serviceName: input.serviceName,
    sessionDate: input.sessionDate,
    sessionTime: input.sessionTime,
    modality: input.modality,
    professionalName: template.professionalName,
    professionalCpf: template.professionalCpf,
    professionalCredential: template.professionalCredential,
    acceptedAt: now,
  });

  let resolvedClientId = input.clientId || null;
  if (!resolvedClientId && input.origin === 'avulso') {
    resolvedClientId = await resolveOrCreateClientForStandaloneContract({
      name: input.clientName,
      cpf: cleanCpf,
      phone: input.clientPhone || '',
      email: input.clientEmail || '',
    });
  }

  const db = getDatabase();
  await db
    .prepare(`
      INSERT INTO signed_contracts (
        id, clinic_id, token, origin, status, appointment_id, client_id,
        client_name, client_cpf, client_phone, client_email,
        service_name, session_date, session_time, modality,
        contract_title, contract_body_snapshot,
        professional_name, professional_cpf, professional_credential, professional_signature_data,
        accepted_at, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, 'assinado', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      IDS.clinic,
      token,
      input.origin,
      input.appointmentId || null,
      resolvedClientId,
      input.clientName.trim(),
      cleanCpf,
      (input.clientPhone || '').replace(/\D/g, ''),
      (input.clientEmail || '').trim(),
      (input.serviceName || 'Atendimento Terapêutico').trim(),
      (input.sessionDate || now.slice(0, 10)).trim(),
      (input.sessionTime || '').trim(),
      (input.modality || 'presencial').trim(),
      template.title,
      snapshot,
      template.professionalName,
      template.professionalCpf,
      template.professionalCredential,
      template.professionalSignatureData,
      now,
      input.ipAddress || null,
      input.userAgent || null,
      now
    );

  const created = (await getContractById(id))!;
  await registerSignedContractInClientDocuments(created);
  return created;
}

export async function createPendingContractLink(input: {
  clientName?: string;
  clientCpf?: string;
  clientPhone?: string;
  serviceName?: string;
  sessionDate?: string;
  sessionTime?: string;
  modality?: string;
}): Promise<SignedContractRecord> {
  await ensureContractsTables();
  const template = await getContractTemplate();
  const now = new Date().toISOString();
  const id = `ctr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const token = crypto.randomBytes(6).toString('hex');

  const db = getDatabase();
  await db
    .prepare(`
      INSERT INTO signed_contracts (
        id, clinic_id, token, origin, status,
        client_name, client_cpf, client_phone, client_email,
        service_name, session_date, session_time, modality,
        contract_title, contract_body_snapshot,
        professional_name, professional_cpf, professional_credential, professional_signature_data,
        created_at
      ) VALUES (?, ?, ?, 'avulso', 'pendente', ?, ?, ?, '', ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
    `)
    .run(
      id,
      IDS.clinic,
      token,
      (input.clientName || '').trim(),
      (input.clientCpf || '').replace(/\D/g, ''),
      (input.clientPhone || '').replace(/\D/g, ''),
      (input.serviceName || 'Atendimento Terapêutico').trim(),
      (input.sessionDate || '').trim(),
      (input.sessionTime || '').trim(),
      (input.modality || 'presencial').trim(),
      template.title,
      template.professionalName,
      template.professionalCpf,
      template.professionalCredential,
      template.professionalSignatureData,
      now
    );

  return (await getContractById(id))!;
}

export async function signPendingContractByToken(
  token: string,
  input: {
    clientName: string;
    clientCpf: string;
    clientPhone?: string;
    clientEmail?: string;
    serviceName?: string;
    sessionDate?: string;
    sessionTime?: string;
    modality?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
): Promise<SignedContractRecord> {
  await ensureContractsTables();
  const existing = await getContractByToken(token);
  if (!existing) {
    throw new Error('Link de contrato não encontrado ou expirado.');
  }
  if (existing.status === 'assinado') {
    return existing;
  }

  const template = await getContractTemplate();
  const now = new Date().toISOString();
  const cleanCpf = input.clientCpf.replace(/\D/g, '');
  const cleanPhone = (input.clientPhone || existing.clientPhone || '').replace(/\D/g, '');
  const cleanEmail = (input.clientEmail || existing.clientEmail || '').trim();
  const finalService = (input.serviceName || existing.serviceName || 'Atendimento Terapêutico').trim();
  const finalDate = (input.sessionDate || existing.sessionDate || now.slice(0, 10)).trim();
  const finalTime = (input.sessionTime || existing.sessionTime || '').trim();
  const finalModality = (input.modality || existing.modality || 'presencial').trim();

  const snapshot = renderContractText(template.body, {
    clientName: input.clientName,
    clientCpf: cleanCpf,
    clientPhone: cleanPhone,
    clientEmail: cleanEmail,
    serviceName: finalService,
    sessionDate: finalDate,
    sessionTime: finalTime,
    modality: finalModality,
    professionalName: template.professionalName,
    professionalCpf: template.professionalCpf,
    professionalCredential: template.professionalCredential,
    acceptedAt: now,
  });

  const resolvedClientId = await resolveOrCreateClientForStandaloneContract({
    name: input.clientName,
    cpf: cleanCpf,
    phone: cleanPhone,
    email: cleanEmail,
  });

  const db = getDatabase();
  await db
    .prepare(`
      UPDATE signed_contracts
      SET status = 'assinado',
          client_id = ?,
          client_name = ?,
          client_cpf = ?,
          client_phone = ?,
          client_email = ?,
          service_name = ?,
          session_date = ?,
          session_time = ?,
          modality = ?,
          contract_title = ?,
          contract_body_snapshot = ?,
          professional_name = ?,
          professional_cpf = ?,
          professional_credential = ?,
          professional_signature_data = ?,
          accepted_at = ?,
          ip_address = ?,
          user_agent = ?
      WHERE id = ? AND clinic_id = ?
    `)
    .run(
      resolvedClientId,
      input.clientName.trim(),
      cleanCpf,
      cleanPhone,
      cleanEmail,
      finalService,
      finalDate,
      finalTime,
      finalModality,
      template.title,
      snapshot,
      template.professionalName,
      template.professionalCpf,
      template.professionalCredential,
      template.professionalSignatureData,
      now,
      input.ipAddress || null,
      input.userAgent || null,
      existing.id,
      IDS.clinic
    );

  const signed = (await getContractById(existing.id))!;
  await registerSignedContractInClientDocuments(signed);
  return signed;
}

export async function listContracts(filter?: {
  status?: string;
  origin?: string;
  search?: string;
}): Promise<SignedContractRecord[]> {
  await ensureContractsTables();
  const db = getDatabase();
  const rows = (await db
    .prepare(`
      SELECT * FROM signed_contracts
      WHERE clinic_id = ?
      ORDER BY COALESCE(accepted_at, created_at) DESC
    `)
    .all(IDS.clinic)) as Record<string, unknown>[];

  let list = rows.map(mapContractRow);
  if (filter?.status && filter.status !== 'todos') {
    list = list.filter((c) => c.status === filter.status);
  }
  if (filter?.origin && filter.origin !== 'todos') {
    list = list.filter((c) => c.origin === filter.origin);
  }
  if (filter?.search?.trim()) {
    const q = filter.search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    list = list.filter(
      (c) =>
        c.clientName.toLowerCase().includes(q) ||
        c.serviceName.toLowerCase().includes(q) ||
        (qDigits && c.clientCpf.includes(qDigits)) ||
        c.id.toLowerCase().includes(q)
    );
  }
  return list;
}

export async function getContractById(id: string): Promise<SignedContractRecord | null> {
  await ensureContractsTables();
  const db = getDatabase();
  const row = (await db
    .prepare('SELECT * FROM signed_contracts WHERE id = ? AND clinic_id = ?')
    .get(id, IDS.clinic)) as Record<string, unknown> | undefined;
  return row ? mapContractRow(row) : null;
}

export async function getContractByToken(token: string): Promise<SignedContractRecord | null> {
  await ensureContractsTables();
  const db = getDatabase();
  const row = (await db
    .prepare('SELECT * FROM signed_contracts WHERE token = ? AND clinic_id = ?')
    .get(token, IDS.clinic)) as Record<string, unknown> | undefined;
  return row ? mapContractRow(row) : null;
}

export async function deleteContractById(id: string): Promise<boolean> {
  await ensureContractsTables();
  const db = getDatabase();
  const res = await db
    .prepare('DELETE FROM signed_contracts WHERE id = ? AND clinic_id = ?')
    .run(id, IDS.clinic);
  return res.changes > 0;
}

// ============================================================================
// GERADOR DE PDF DO CONTRATO ASSINADO (A4 MULTI-PÁGINA COM ASSINATURAS)
// ============================================================================

const NAVY = rgb(0.102, 0.227, 0.29);
const GOLD = rgb(0.722, 0.537, 0.165);
const GRAY = rgb(0.39, 0.45, 0.5);
const DARK = rgb(0.09, 0.12, 0.15);

function cleanPdfText(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '');
}

function wrapPdfLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of cleanPdfText(text).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        line = test;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export async function buildSignedContractPdf(contract: SignedContractRecord): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(cleanPdfText(`${contract.contractTitle} - ${contract.clientName || 'Cliente'}`));
  pdf.setAuthor('Camila Machado - Clínica Integrativa');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let logoImage = null;
  try {
    const logoBytes = await readFile(path.join(process.cwd(), 'public', 'logo-camila-machado.png'));
    logoImage = await pdf.embedPng(logoBytes);
  } catch {}

  let signatureImage = null;
  if (contract.professionalSignatureData && contract.professionalSignatureData.startsWith('data:image/')) {
    try {
      const base64 = contract.professionalSignatureData.split(',')[1];
      if (base64) {
        const imgBytes = Buffer.from(base64, 'base64');
        if (contract.professionalSignatureData.includes('image/png')) {
          signatureImage = await pdf.embedPng(imgBytes);
        } else {
          signatureImage = await pdf.embedJpg(imgBytes);
        }
      }
    } catch {}
  }

  const W = 595.28;
  const H = 841.89;
  const M = 46;
  const contentWidth = W - M * 2;

  const drawPageHeader = (page: PDFPage, isFirst: boolean) => {
    let topY = H - 34;
    if (isFirst && logoImage) {
      const lw = 140;
      const lh = (logoImage.height / logoImage.width) * lw;
      page.drawImage(logoImage, { x: (W - lw) / 2, y: topY - lh, width: lw, height: lh });
      topY = topY - lh - 8;
    } else {
      const headerLabel = cleanPdfText(`${contract.professionalName} • ${contract.contractTitle}`);
      page.drawText(headerLabel, {
        x: (W - bold.widthOfTextAtSize(headerLabel, 10)) / 2,
        y: topY,
        size: 10,
        font: bold,
        color: NAVY,
      });
      topY -= 16;
    }

    if (isFirst) {
      const sub = cleanPdfText(`${PROFESSIONAL_INFO.title} • ${contract.professionalCredential}`);
      page.drawText(sub, {
        x: (W - regular.widthOfTextAtSize(sub, 8.5)) / 2,
        y: topY,
        size: 8.5,
        font: regular,
        color: GRAY,
      });
      topY -= 12;
      page.drawLine({ start: { x: M, y: topY }, end: { x: W - M, y: topY }, thickness: 1.5, color: GOLD });
      topY -= 24;

      const titleUpper = cleanPdfText(contract.contractTitle.toUpperCase());
      page.drawText(titleUpper, {
        x: Math.max(M, (W - bold.widthOfTextAtSize(titleUpper, 12.5)) / 2),
        y: topY,
        size: 12.5,
        font: bold,
        color: NAVY,
      });
      topY -= 20;
    } else {
      page.drawLine({ start: { x: M, y: topY }, end: { x: W - M, y: topY }, thickness: 1, color: GOLD });
      topY -= 22;
    }

    return topY;
  };

  let page = pdf.addPage([W, H]);
  let y = drawPageHeader(page, true);

  // Quadro resumo do atendimento / assinatura
  page.drawRectangle({
    x: M,
    y: y - 54,
    width: contentWidth,
    height: 54,
    color: rgb(0.97, 0.985, 0.995),
    borderColor: rgb(0.82, 0.88, 0.93),
    borderWidth: 1,
  });

  const cpfFmt = contract.clientCpf ? formatCpf(contract.clientCpf) : 'Não informado';
  const profCpfFmt = contract.professionalCpf ? formatCpf(contract.professionalCpf) : 'Não informado';
  page.drawText(cleanPdfText(`CONTRATANTE: ${contract.clientName || '—'}  |  CPF: ${cpfFmt}`), {
    x: M + 12,
    y: y - 18,
    size: 8.8,
    font: bold,
    color: NAVY,
  });
  page.drawText(
    cleanPdfText(
      `SERVIÇO: ${contract.serviceName || 'Atendimento'}  |  DATA: ${formatDateBr(contract.sessionDate)}${contract.sessionTime ? ` às ${contract.sessionTime}` : ''} (${contract.modality})`
    ),
    {
      x: M + 12,
      y: y - 33,
      size: 8.3,
      font: regular,
      color: DARK,
    }
  );
  page.drawText(
    cleanPdfText(
      `CONTRATADA: ${contract.professionalName}  |  CPF: ${profCpfFmt}  |  REGISTRO: ${contract.professionalCredential}`
    ),
    {
      x: M + 12,
      y: y - 46,
      size: 8,
      font: regular,
      color: GRAY,
    }
  );

  y -= 72;

  const lines = wrapPdfLines(contract.contractBodySnapshot || '', regular, 9.5, contentWidth);
  for (const line of lines) {
    if (y < 145) {
      page = pdf.addPage([W, H]);
      y = drawPageHeader(page, false);
    }
    if (line === '') {
      y -= 8;
      continue;
    }
    const isHeading = /^\d+\.\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(line);
    page.drawText(line, {
      x: M,
      y,
      size: 9.5,
      font: isHeading ? bold : regular,
      color: isHeading ? NAVY : DARK,
    });
    y -= 13.5;
  }

  // Garante espaço para o bloco de assinaturas lado a lado
  if (y < 170) {
    page = pdf.addPage([W, H]);
    y = drawPageHeader(page, false);
  }

  const signY = Math.max(92, y - 58);
  const halfW = (contentWidth - 28) / 2;
  const x1 = M;
  const x2 = M + halfW + 28;

  // Bloco 1: Assinatura Eletrônica do Cliente
  page.drawRectangle({
    x: x1,
    y: signY - 46,
    width: halfW,
    height: 92,
    color: rgb(0.975, 0.99, 0.985),
    borderColor: rgb(0.75, 0.88, 0.82),
    borderWidth: 1,
  });
  const cSignLabel = cleanPdfText(
    contract.status === 'assinado' ? 'ASSINADO ELETRONICAMENTE POR:' : 'AGUARDANDO ASSINATURA:'
  );
  page.drawText(cSignLabel, { x: x1 + 10, y: signY + 32, size: 7.2, font: bold, color: rgb(0.05, 0.45, 0.3) });
  const cNameItalic = cleanPdfText(contract.clientName || 'Cliente');
  page.drawText(cNameItalic, { x: x1 + 10, y: signY + 12, size: 11.5, font: italic, color: NAVY });
  page.drawLine({ start: { x: x1 + 10, y: signY + 6 }, end: { x: x1 + halfW - 10, y: signY + 6 }, thickness: 0.7, color: GRAY });
  page.drawText(cleanPdfText(`CPF: ${cpfFmt}`), { x: x1 + 10, y: signY - 8, size: 8, font: bold, color: DARK });
  if (contract.acceptedAt) {
    page.drawText(
      cleanPdfText(`Data/Hora: ${formatDateBr(contract.acceptedAt)} às ${formatTimeBr(contract.acceptedAt)}`),
      { x: x1 + 10, y: signY - 20, size: 7.4, font: regular, color: GRAY }
    );
  }
  if (contract.ipAddress) {
    page.drawText(cleanPdfText(`IP: ${contract.ipAddress}`), {
      x: x1 + 10,
      y: signY - 31,
      size: 7.2,
      font: regular,
      color: GRAY,
    });
  }

  // Bloco 2: Assinatura Padrão da Camila + CPF
  page.drawRectangle({
    x: x2,
    y: signY - 46,
    width: halfW,
    height: 92,
    color: rgb(0.98, 0.985, 0.995),
    borderColor: rgb(0.82, 0.86, 0.92),
    borderWidth: 1,
  });
  page.drawText('CONTRATADA / PROFISSIONAL:', { x: x2 + 10, y: signY + 32, size: 7.2, font: bold, color: NAVY });

  if (signatureImage) {
    const maxW = halfW - 24;
    const maxH = 26;
    const ratio = Math.min(maxW / signatureImage.width, maxH / signatureImage.height);
    const sw = signatureImage.width * ratio;
    const sh = signatureImage.height * ratio;
    page.drawImage(signatureImage, { x: x2 + 10, y: signY + 7, width: sw, height: sh });
  } else {
    page.drawText(cleanPdfText(contract.professionalName), {
      x: x2 + 10,
      y: signY + 12,
      size: 12,
      font: italic,
      color: NAVY,
    });
  }

  page.drawLine({ start: { x: x2 + 10, y: signY + 6 }, end: { x: x2 + halfW - 10, y: signY + 6 }, thickness: 0.7, color: GRAY });
  page.drawText(cleanPdfText(contract.professionalName), { x: x2 + 10, y: signY - 8, size: 8.5, font: bold, color: NAVY });
  page.drawText(cleanPdfText(`CPF: ${profCpfFmt}`), { x: x2 + 10, y: signY - 20, size: 8, font: bold, color: DARK });
  page.drawText(cleanPdfText(contract.professionalCredential), { x: x2 + 10, y: signY - 31, size: 7.4, font: regular, color: GRAY });

  const footer = cleanPdfText(`Código do Contrato: ${contract.id.toUpperCase()} • ${PROFESSIONAL_INFO.city}`);
  page.drawText(footer, {
    x: (W - regular.widthOfTextAtSize(footer, 7.5)) / 2,
    y: 22,
    size: 7.5,
    font: regular,
    color: GRAY,
  });

  return pdf.save();
}

import 'server-only';

import { getDatabase, IDS } from './db';
import { PROFESSIONAL_INFO } from './domain';

export type BackupSummary = {
  clinicId: string;
  clinicName: string;
  generatedAt: string;
  generatedBy: string;
  counts: {
    clients: number;
    prontuarioRecords: number;
    clinicalEvolutions: number;
    treatmentGoals: number;
    clientDocuments: number;
    clientPackages: number;
    appointments: number;
    timeBlocks: number;
    services: number;
    expenses: number;
    payments: number;
    groupSessions: number;
    groupEnrollments: number;
    noteFolders: number;
    notes: number;
  };
};

export type FullBackupPayload = {
  meta: {
    exportVersion: string;
    system: string;
    generatedAt: string;
    generatedBy: string;
    clinicId: string;
    environment: string;
    lgpdCompliance: string;
    professional: typeof PROFESSIONAL_INFO;
    counts: BackupSummary['counts'];
  };
  clinic: Record<string, unknown>;
  clients: Array<Record<string, unknown>>;
  prontuarios: {
    records: Array<Record<string, unknown>>;
    evolutions: Array<Record<string, unknown>>;
    goals: Array<Record<string, unknown>>;
    documents: Array<Record<string, unknown>>;
    packages: Array<Record<string, unknown>>;
  };
  agenda: {
    appointments: Array<Record<string, unknown>>;
    timeBlocks: Array<Record<string, unknown>>;
  };
  financeiro: {
    expenses: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
  };
  catalogo: {
    services: Array<Record<string, unknown>>;
    groupSessions: Array<Record<string, unknown>>;
    groupEnrollments: Array<Record<string, unknown>>;
  };
  cadernoAnotacoes: {
    folders: Array<Record<string, unknown>>;
    notes: Array<Record<string, unknown>>;
  };
  configuracoes: {
    whatsapp: Record<string, unknown> | null;
  };
};

export async function getBackupSummary(
  clinicId: string = IDS.clinic,
  actorName: string = 'Camila Machado'
): Promise<BackupSummary> {
  const db = getDatabase();

  const [
    clientsCount,
    recordsCount,
    evolutionsCount,
    goalsCount,
    docsCount,
    packagesCount,
    apptsCount,
    blocksCount,
    servicesCount,
    expensesCount,
    paymentsCount,
    groupSessionsCount,
    groupEnrollmentsCount,
    foldersCount,
    notesCount,
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM clients WHERE clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM client_records cr JOIN clients c ON c.id = cr.client_id WHERE c.clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM clinical_evolutions ce JOIN clients c ON c.id = ce.client_id WHERE c.clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM treatment_goals tg JOIN clients c ON c.id = tg.client_id WHERE c.clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM client_documents cd JOIN clients c ON c.id = cd.client_id WHERE c.clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM client_packages WHERE clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM appointments WHERE clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM time_blocks WHERE clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM services WHERE clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM expenses WHERE clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM payments').get<{ c: number }>(),
    db.prepare('SELECT COUNT(*) as c FROM group_sessions WHERE clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM group_session_enrollments gse JOIN group_sessions gs ON gs.id = gse.group_session_id WHERE gs.clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM note_folders WHERE clinic_id = ?').get<{ c: number }>(clinicId),
    db.prepare('SELECT COUNT(*) as c FROM notes WHERE clinic_id = ?').get<{ c: number }>(clinicId),
  ]);

  return {
    clinicId,
    clinicName: 'Clínica Camila Machado',
    generatedAt: new Date().toISOString(),
    generatedBy: actorName,
    counts: {
      clients: Number(clientsCount?.c || 0),
      prontuarioRecords: Number(recordsCount?.c || 0),
      clinicalEvolutions: Number(evolutionsCount?.c || 0),
      treatmentGoals: Number(goalsCount?.c || 0),
      clientDocuments: Number(docsCount?.c || 0),
      clientPackages: Number(packagesCount?.c || 0),
      appointments: Number(apptsCount?.c || 0),
      timeBlocks: Number(blocksCount?.c || 0),
      services: Number(servicesCount?.c || 0),
      expenses: Number(expensesCount?.c || 0),
      payments: Number(paymentsCount?.c || 0),
      groupSessions: Number(groupSessionsCount?.c || 0),
      groupEnrollments: Number(groupEnrollmentsCount?.c || 0),
      noteFolders: Number(foldersCount?.c || 0),
      notes: Number(notesCount?.c || 0),
    },
  };
}

export async function generateFullClinicBackup(
  clinicId: string = IDS.clinic,
  actor: { userId: string; name: string }
): Promise<FullBackupPayload> {
  const db = getDatabase();
  const summary = await getBackupSummary(clinicId, actor.name);

  // Consultar todas as tabelas
  const [
    clinicRow,
    clientsRows,
    recordsRows,
    evolutionsRows,
    goalsRows,
    documentsRows,
    packagesRows,
    appointmentsRows,
    timeBlocksRows,
    expensesRows,
    paymentsRows,
    servicesRows,
    groupSessionsRows,
    groupEnrollmentsRows,
    foldersRows,
    notesRows,
    whatsappSettingsRow,
  ] = await Promise.all([
    db.prepare('SELECT * FROM clinics WHERE id = ?').get<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT id, clinic_id, name, phone, email, status, administrative_notes, demo_data, created_at, updated_at, last_login_at
      FROM clients
      WHERE clinic_id = ?
      ORDER BY name ASC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT cr.*
      FROM client_records cr
      JOIN clients c ON c.id = cr.client_id
      WHERE c.clinic_id = ?
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT ce.*
      FROM clinical_evolutions ce
      JOIN clients c ON c.id = ce.client_id
      WHERE c.clinic_id = ?
      ORDER BY ce.session_date DESC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT tg.*
      FROM treatment_goals tg
      JOIN clients c ON c.id = tg.client_id
      WHERE c.clinic_id = ?
      ORDER BY tg.created_at DESC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT cd.*
      FROM client_documents cd
      JOIN clients c ON c.id = cd.client_id
      WHERE c.clinic_id = ?
      ORDER BY cd.created_at DESC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT * FROM client_packages WHERE clinic_id = ? ORDER BY created_at DESC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT * FROM appointments WHERE clinic_id = ? ORDER BY start_at DESC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT * FROM time_blocks WHERE clinic_id = ? ORDER BY start_at DESC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT * FROM expenses WHERE clinic_id = ? ORDER BY occurred_at DESC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT * FROM payments ORDER BY created_at DESC
    `).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT * FROM services WHERE clinic_id = ? ORDER BY name ASC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT * FROM group_sessions WHERE clinic_id = ? ORDER BY date DESC, start_time DESC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT gse.*
      FROM group_session_enrollments gse
      JOIN group_sessions gs ON gs.id = gse.group_session_id
      WHERE gs.clinic_id = ?
      ORDER BY gse.created_at DESC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT * FROM note_folders WHERE clinic_id = ? ORDER BY sort_order ASC, name ASC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT * FROM notes WHERE clinic_id = ? ORDER BY is_pinned DESC, updated_at DESC
    `).all<Record<string, unknown>>(clinicId),
    db.prepare(`
      SELECT * FROM whatsapp_automation_settings WHERE clinic_id = ?
    `).get<Record<string, unknown>>(clinicId),
  ]);

  // Sanitizar configurações de WhatsApp (mascarar chave de API)
  let sanitizedWhatsapp: Record<string, unknown> | null = null;
  if (whatsappSettingsRow) {
    sanitizedWhatsapp = { ...whatsappSettingsRow };
    if (sanitizedWhatsapp.api_key && typeof sanitizedWhatsapp.api_key === 'string') {
      sanitizedWhatsapp.api_key = sanitizedWhatsapp.api_key.slice(0, 4) + '****' + sanitizedWhatsapp.api_key.slice(-4);
    }
  }

  return {
    meta: {
      exportVersion: '2.0.0',
      system: `Clínica Camila Machado — ${PROFESSIONAL_INFO.title}`,
      generatedAt: summary.generatedAt,
      generatedBy: actor.name,
      clinicId,
      environment: process.env.NODE_ENV || 'production',
      lgpdCompliance: 'Backup integral para fins de segurança, continuidade e atendimento ao Art. 18, V da Lei 13.709/2018 (Portabilidade e Preservação de Dados).',
      professional: PROFESSIONAL_INFO,
      counts: summary.counts,
    },
    clinic: clinicRow || { id: clinicId, name: 'Clínica Camila Machado' },
    clients: clientsRows || [],
    prontuarios: {
      records: recordsRows || [],
      evolutions: evolutionsRows || [],
      goals: goalsRows || [],
      documents: documentsRows || [],
      packages: packagesRows || [],
    },
    agenda: {
      appointments: appointmentsRows || [],
      timeBlocks: timeBlocksRows || [],
    },
    financeiro: {
      expenses: expensesRows || [],
      payments: paymentsRows || [],
    },
    catalogo: {
      services: servicesRows || [],
      groupSessions: groupSessionsRows || [],
      groupEnrollments: groupEnrollmentsRows || [],
    },
    cadernoAnotacoes: {
      folders: foldersRows || [],
      notes: notesRows || [],
    },
    configuracoes: {
      whatsapp: sanitizedWhatsapp,
    },
  };
}

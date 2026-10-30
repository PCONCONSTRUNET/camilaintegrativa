import { DatabaseSync } from 'node:sqlite';
import { Client } from 'pg';
import path from 'node:path';
import fs from 'node:fs';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Lucasduda28123@db.phhsdjeduxahoeridpec.supabase.co:5432/postgres';
const sqlitePath = path.resolve('.data/clinica.sqlite');

async function sync() {
  if (!fs.existsSync(sqlitePath)) {
    console.log('Nenhum banco local SQLite encontrado em', sqlitePath);
    return;
  }

  const sqlite = new DatabaseSync(sqlitePath);
  const pgClient = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await pgClient.connect();
  console.log('Conectado ao PostgreSQL para sincronização de dados...');

  const tablesInOrder = [
    'clinics',
    'clinic_settings',
    'users',
    'memberships',
    'professionals',
    'services',
    'service_modalities',
    'working_hours',
    'availability_exceptions',
    'holidays',
    'clients',
    'client_preferences',
    'appointments',
    'appointment_events',
    'time_blocks',
    'client_records',
    'treatment_goals',
    'clinical_evolutions',
    'clinical_techniques',
    'client_documents',
    'client_referrals',
    'prontuario_access_logs',
    'client_payments',
    'waitlist_entries',
    'form_templates',
    'form_versions',
    'form_fields',
    'form_responses',
    'consent_records',
    'session_records',
    'session_record_versions',
    'private_documents',
    'charges',
    'payments',
    'refunds',
    'expenses',
    'package_offerings',
    'client_packages',
    'package_usages',
    'message_templates',
    'notification_rules',
    'notification_jobs',
    'notification_attempts',
    'integration_settings',
    'public_site_content',
    'audit_logs',
    'privacy_requests',
  ];

  for (const tableName of tablesInOrder) {
    let rows = [];
    try {
      rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
    } catch {
      continue;
    }

    if (rows.length === 0) continue;

    console.log(`Sincronizando ${rows.length} registros da tabela ${tableName}...`);

    for (const row of rows) {
      const keys = Object.keys(row);
      const values = Object.values(row);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const columns = keys.map((k) => `"${k}"`).join(', ');

      const query = `
        INSERT INTO "${tableName}" (${columns})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
      `;

      try {
        await pgClient.query(query, values);
      } catch (err) {
        console.warn(`Aviso ao inserir em ${tableName}:`, err.message);
      }
    }
  }

  console.log('Sincronização de dados concluída com sucesso!');
  await pgClient.end();
}

sync().catch((err) => {
  console.error('Erro na sincronização:', err);
  process.exit(1);
});

import 'server-only';

import { getDatabase, IDS } from '@/lib/db';
import {
  ClinicPixConfig,
  DEFAULT_CLINIC_PIX_CONFIG,
  formatPixKeyForBacen,
  formatPixKeyDisplay,
  PixKeyType,
} from '@/lib/pix';
import { recordAuditLog } from '@/lib/audit';

let tablesInitialized = false;

export async function ensurePixSettingsTable() {
  if (tablesInitialized) return;
  try {
    const db = getDatabase();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS clinic_pix_settings (
        clinic_id TEXT PRIMARY KEY,
        key_type TEXT NOT NULL DEFAULT 'telefone',
        pix_key TEXT NOT NULL DEFAULT '+5548996915303',
        key_display TEXT NOT NULL DEFAULT '(48) 99691-5303',
        recipient_name TEXT NOT NULL DEFAULT 'Camila Machado',
        city TEXT NOT NULL DEFAULT 'Urussanga',
        instructions TEXT NOT NULL DEFAULT 'Após o pagamento via PIX, o agendamento é registrado com status pendente até a conciliação automática ou confirmação pela clínica.',
        whatsapp_number TEXT NOT NULL DEFAULT '5548996915303',
        whatsapp_display TEXT NOT NULL DEFAULT '(48) 99691-5303',
        updated_at TEXT NOT NULL
      )
    `);
    tablesInitialized = true;
  } catch (err) {
    console.error('[pix-settings] Erro ao inicializar tabela clinic_pix_settings:', err);
  }
}

export async function getClinicPixConfig(): Promise<ClinicPixConfig> {
  await ensurePixSettingsTable();
  try {
    const db = getDatabase();
    const row = (await db
      .prepare(`
        SELECT key_type, pix_key, key_display, recipient_name, city, instructions, whatsapp_number, whatsapp_display, updated_at
        FROM clinic_pix_settings
        WHERE clinic_id = ?
      `)
      .get(IDS.clinic)) as
      | {
          key_type: string;
          pix_key: string;
          key_display: string;
          recipient_name: string;
          city: string;
          instructions: string;
          whatsapp_number?: string;
          whatsapp_display?: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return DEFAULT_CLINIC_PIX_CONFIG;
    }

    const keyType = (row.key_type || 'telefone') as PixKeyType;

    return {
      keyType,
      key: row.pix_key || DEFAULT_CLINIC_PIX_CONFIG.key,
      keyDisplay: row.key_display || formatPixKeyDisplay(row.pix_key, keyType) || DEFAULT_CLINIC_PIX_CONFIG.keyDisplay,
      recipientName: row.recipient_name || DEFAULT_CLINIC_PIX_CONFIG.recipientName,
      city: row.city || DEFAULT_CLINIC_PIX_CONFIG.city,
      instructions: row.instructions || DEFAULT_CLINIC_PIX_CONFIG.instructions,
      whatsappNumber: row.whatsapp_number || DEFAULT_CLINIC_PIX_CONFIG.whatsappNumber,
      whatsappDisplay: row.whatsapp_display || DEFAULT_CLINIC_PIX_CONFIG.whatsappDisplay,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    console.error('[pix-settings] Erro ao carregar configurações PIX:', err);
    return DEFAULT_CLINIC_PIX_CONFIG;
  }
}

export async function saveClinicPixConfig(
  input: {
    keyType: PixKeyType;
    key: string;
    keyDisplay?: string;
    recipientName: string;
    city: string;
    instructions?: string;
    whatsappNumber?: string;
    whatsappDisplay?: string;
  },
  actorUserId?: string,
  clientMeta?: { ip?: string; userAgent?: string }
): Promise<ClinicPixConfig> {
  await ensurePixSettingsTable();
  const db = getDatabase();

  const keyType = input.keyType || 'telefone';
  const rawKey = (input.key || '').trim();
  if (!rawKey) {
    throw new Error('Informe a chave PIX da clínica.');
  }

  const normalizedKey = formatPixKeyForBacen(rawKey, keyType);
  const keyDisplay = (input.keyDisplay || '').trim() || formatPixKeyDisplay(rawKey, keyType);
  const recipientName = (input.recipientName || '').trim() || DEFAULT_CLINIC_PIX_CONFIG.recipientName;
  const city = (input.city || '').trim() || DEFAULT_CLINIC_PIX_CONFIG.city;
  const instructions = (input.instructions || '').trim() || DEFAULT_CLINIC_PIX_CONFIG.instructions;
  const whatsappNumber = (input.whatsappNumber || '').replace(/\D/g, '') || DEFAULT_CLINIC_PIX_CONFIG.whatsappNumber;
  const whatsappDisplay = (input.whatsappDisplay || '').trim() || DEFAULT_CLINIC_PIX_CONFIG.whatsappDisplay;
  const updatedAt = new Date().toISOString();

  // Upsert
  await db.prepare(`
    INSERT INTO clinic_pix_settings (
      clinic_id, key_type, pix_key, key_display, recipient_name, city, instructions, whatsapp_number, whatsapp_display, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(clinic_id) DO UPDATE SET
      key_type = excluded.key_type,
      pix_key = excluded.pix_key,
      key_display = excluded.key_display,
      recipient_name = excluded.recipient_name,
      city = excluded.city,
      instructions = excluded.instructions,
      whatsapp_number = excluded.whatsapp_number,
      whatsapp_display = excluded.whatsapp_display,
      updated_at = excluded.updated_at
  `).run(
    IDS.clinic,
    keyType,
    normalizedKey,
    keyDisplay,
    recipientName,
    city,
    instructions,
    whatsappNumber,
    whatsappDisplay,
    updatedAt
  );

  // Registro de Auditoria
  await recordAuditLog({
    clinicId: IDS.clinic,
    actorType: 'admin',
    actorId: actorUserId || null,
    actorName: 'Administração',
    category: 'financeiro',
    action: 'alteracao_chave_pix',
    title: 'Chave PIX da Clínica Atualizada',
    description: `Configurações de recebimento PIX atualizadas. Nova chave (${keyType}): ${keyDisplay} — Titular: ${recipientName}.`,
    severity: 'aviso',
    ipAddress: clientMeta?.ip,
    userAgent: clientMeta?.userAgent,
    details: {
      keyType,
      pixKey: normalizedKey,
      keyDisplay,
      recipientName,
      city,
    },
  }).catch(() => null);

  return {
    keyType,
    key: normalizedKey,
    keyDisplay,
    recipientName,
    city,
    instructions,
    whatsappNumber,
    whatsappDisplay,
    updatedAt,
  };
}

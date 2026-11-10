import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/repository';
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';
import { IDS, getDatabase } from '@/lib/db';
import { formatPhone } from '@/lib/utils';

interface RawImportContact {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

function normalizePhoneDigits(phone: string, defaultDdd = '48'): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';

  // Remove prefixo internacional 0055 ou 55
  if (digits.startsWith('0055') && digits.length >= 14) {
    digits = digits.slice(4);
  } else if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }

  // Remove código de operadora com zero (ex: 0154899999999 -> 48999999999)
  if (digits.startsWith('0') && (digits.length === 13 || digits.length === 14)) {
    digits = digits.slice(3);
  }

  // Remove zero antes do DDD (ex: 048999999999 -> 48999999999)
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  // Se tiver 8 ou 9 dígitos (sem DDD), adiciona DDD padrão
  if ((digits.length === 8 || digits.length === 9) && defaultDdd) {
    digits = `${defaultDdd}${digits}`;
  }

  return digits;
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const contacts: RawImportContact[] = Array.isArray(body?.contacts) ? body.contacts : [];

    if (contacts.length === 0) {
      return Response.json({ error: 'Nenhum contato fornecido para importação.' }, { status: 400 });
    }

    const database = getDatabase();
    if (database.isPostgres) {
      await database.prepare('ALTER TABLE clients ALTER COLUMN phone DROP NOT NULL').run().catch(() => null);
      await database.prepare('ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_clinic_id_phone_key').run().catch(() => null);
    }

    let importedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ name: string; phone: string; error: string }> = [];

    // Obter todos os telefones e nomes de clientes já existentes para consulta ultra-rápida em lote
    const existingRows = (await database.prepare(`
      SELECT name, phone FROM clients WHERE clinic_id = ?
    `).all(IDS.clinic)) as Array<{ name: string; phone: string }>;

    const existingPhoneSet = new Set<string>();
    const existingNameNoPhoneSet = new Set<string>();
    for (const row of existingRows) {
      if (row.phone) {
        const d = normalizePhoneDigits(row.phone);
        if (d.length >= 8) existingPhoneSet.add(d);
      } else if (row.name) {
        existingNameNoPhoneSet.add(row.name.trim().toLowerCase());
      }
    }

    const seenPhonesInBatch = new Set<string>();
    const seenNamesNoPhoneInBatch = new Set<string>();

    const rowsToInsert: Array<{
      id: string;
      clinicId: string;
      name: string;
      phone: string;
      email: string | null;
      status: string;
      notes: string;
    }> = [];

    for (const item of contacts) {
      const rawName = (item.name || '').trim().replace(/\s+/g, ' ');
      const phoneDigits = normalizePhoneDigits(item.phone || '');

      if (!rawName && !phoneDigits) {
        continue;
      }

      const formattedPhone = phoneDigits ? formatPhone(phoneDigits) : '';
      const cleanName = (rawName || (formattedPhone ? `Contato ${formattedPhone}` : 'Cliente sem nome')).slice(0, 120);

      // Evitar duplicidade por telefone ou por nome (quando sem telefone)
      if (phoneDigits.length >= 8) {
        if (existingPhoneSet.has(phoneDigits) || seenPhonesInBatch.has(phoneDigits)) {
          skippedCount++;
          continue;
        }
        seenPhonesInBatch.add(phoneDigits);
        existingPhoneSet.add(phoneDigits);
      } else {
        const lowerName = cleanName.toLowerCase();
        if (existingNameNoPhoneSet.has(lowerName) || seenNamesNoPhoneInBatch.has(lowerName)) {
          skippedCount++;
          continue;
        }
        seenNamesNoPhoneInBatch.add(lowerName);
        existingNameNoPhoneSet.add(lowerName);
      }

      const cleanEmail = item.email?.trim() ? item.email.trim().toLowerCase() : null;
      const notes = item.notes?.trim() || 'Importado da agenda do celular';

      rowsToInsert.push({
        id: randomUUID(),
        clinicId: IDS.clinic,
        name: cleanName,
        phone: formattedPhone,
        email: cleanEmail,
        status: 'ativo',
        notes,
      });
    }

    // Inserção em lotes rápidos de 50 contatos por comando SQL (evita timeout com 500+ ou 1000+ contatos)
    const CHUNK_SIZE = 50;
    for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values: Array<string | null> = [];
      for (const r of chunk) {
        values.push(r.id, r.clinicId, r.name, r.phone, r.email, r.status, r.notes);
      }

      try {
        await database
          .prepare(
            `INSERT INTO clients (id, clinic_id, name, phone, email, status, administrative_notes) VALUES ${placeholders}`
          )
          .run(...values);
        importedCount += chunk.length;
      } catch {
        // Fallback individual se algum item do lote tiver conflito isolado
        for (const r of chunk) {
          try {
            await createClient({
              name: r.name,
              phone: r.phone,
              email: r.email || '',
              status: 'ativo',
              administrativeNotes: r.notes,
            });
            importedCount++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro ao cadastrar';
            errors.push({ name: r.name, phone: r.phone, error: msg });
          }
        }
      }
    }

    // Auditoria
    const { ip, userAgent } = extractClientMetadata(request);
    await recordAuditLog({
      clinicId: IDS.clinic,
      actorType: 'admin',
      actorId: currentUser.userId,
      actorName: currentUser.name,
      category: 'paciente',
      action: 'importacao_contatos',
      title: 'Importação de Contatos do Celular',
      description: `${importedCount} novos contatos importados da agenda por ${currentUser.name} (${skippedCount} já existentes ignorados).`,
      severity: 'info',
      ipAddress: ip,
      userAgent,
      details: {
        totalReceived: contacts.length,
        importedCount,
        skippedCount,
        errorCount: errors.length,
      },
    }).catch(() => null);

    return Response.json({
      success: true,
      total: contacts.length,
      importedCount,
      skippedCount,
      errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno na importação.';
    return Response.json({ error: message }, { status: 500 });
  }
}



import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/repository';
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';
import { IDS, getDatabase } from '@/lib/db';
import { formatPhone } from '@/lib/utils';

interface RawImportContact {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}

function normalizePhoneDigits(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
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
    let importedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ name: string; phone: string; error: string }> = [];

    // Obter todos os telefones de clientes já existentes para consulta ultra-rápida em lote
    const existingRows = (await database.prepare(`
      SELECT phone FROM clients WHERE clinic_id = ?
    `).all(IDS.clinic)) as Array<{ phone: string }>;

    const existingPhoneSet = new Set<string>();
    for (const row of existingRows) {
      if (row.phone) {
        const d = normalizePhoneDigits(row.phone);
        if (d.length >= 10) existingPhoneSet.add(d);
      }
    }

    const seenInThisBatch = new Set<string>();

    for (const item of contacts) {
      const cleanName = (item.name || '').trim().replace(/\s+/g, ' ') || 'Cliente sem nome';
      const phoneDigits = normalizePhoneDigits(item.phone || '');

      if (!item.name?.trim() && !phoneDigits) {
        continue;
      }

      // Evitar duplicidade com contatos já salvos ou duplicados no próprio lote (quando houver telefone)
      if (phoneDigits.length >= 8) {
        if (existingPhoneSet.has(phoneDigits) || seenInThisBatch.has(phoneDigits)) {
          skippedCount++;
          continue;
        }
        seenInThisBatch.add(phoneDigits);
        existingPhoneSet.add(phoneDigits);
      }

      const formattedPhone = phoneDigits ? formatPhone(phoneDigits) : '';
      const cleanEmail = item.email?.trim() ? item.email.trim().toLowerCase() : '';

      try {
        await createClient({
          name: cleanName.slice(0, 120),
          phone: formattedPhone,
          email: cleanEmail,
          status: 'ativo',
          administrativeNotes: item.notes?.trim() || 'Importado da agenda do celular',
        });
        importedCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao cadastrar';
        errors.push({ name: cleanName, phone: formattedPhone, error: msg });
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


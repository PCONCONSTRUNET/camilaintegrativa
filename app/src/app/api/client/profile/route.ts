import { NextResponse } from 'next/server';
import { getCurrentClient } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import { unifyClientRecordsByIdentity } from '@/lib/repository';
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';

export async function PUT(request: Request) {
  try {
    const session = await getCurrentClient();
    if (!session) {
      return NextResponse.json({ error: 'Sessão não autorizada ou expirada.' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      email,
      cpf,
      birthDate,
      gender,
      occupation,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship,
    } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Nome completo é obrigatório.' }, { status: 400 });
    }

    const database = getDatabase();
    const now = new Date().toISOString();

    // 1. Atualizar dados básicos do cliente
    await database.prepare(`
      UPDATE clients
      SET name = ?, email = ?, updated_at = ?
      WHERE id = ?
    `).run(name.trim(), email?.trim() || null, now, session.clientId);

    // 2. Atualizar ou inserir ficha cadastral (client_records)
    const existingRecord = await database.prepare(`
      SELECT client_id FROM client_records WHERE client_id = ?
    `).get(session.clientId);

    if (existingRecord) {
      await database.prepare(`
        UPDATE client_records
        SET cpf = ?, birth_date = ?, gender = ?, occupation = ?,
            emergency_contact_name = ?, emergency_contact_phone = ?, emergency_contact_relationship = ?,
            updated_at = ?
        WHERE client_id = ?
      `).run(
        cpf?.trim() || null,
        birthDate?.trim() || null,
        gender?.trim() || null,
        occupation?.trim() || null,
        emergencyContactName?.trim() || null,
        emergencyContactPhone?.trim() || null,
        emergencyContactRelationship?.trim() || null,
        now,
        session.clientId
      );
    } else {
      await database.prepare(`
        INSERT INTO client_records (
          client_id, cpf, birth_date, gender, occupation,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.clientId,
        cpf?.trim() || null,
        birthDate?.trim() || null,
        gender?.trim() || null,
        occupation?.trim() || null,
        emergencyContactName?.trim() || null,
        emergencyContactPhone?.trim() || null,
        emergencyContactRelationship?.trim() || null,
        now
      );
    }

    await unifyClientRecordsByIdentity(database, session.clientId, cpf || null, session.phone, email || null);

    const { ip, userAgent } = extractClientMetadata(request);
    await recordAuditLog({
      clinicId: IDS.clinic,
      actorType: 'paciente',
      actorId: session.clientId,
      actorName: name.trim(),
      category: 'paciente',
      action: 'perfil_paciente_atualizado',
      title: 'Atualização Cadastral pelo Paciente',
      description: `O(A) paciente "${name.trim()}" atualizou seus dados cadastrais no Portal do Paciente.`,
      ipAddress: ip,
      userAgent,
      severity: 'info',
      details: {
        clientId: session.clientId,
        name: name.trim(),
        email: email?.trim() || null,
        cpf: cpf?.trim() || null,
        phone: session.phone,
      },
    }).catch(() => null);

    return NextResponse.json({ success: true, message: 'Perfil atualizado com sucesso!' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar dados.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


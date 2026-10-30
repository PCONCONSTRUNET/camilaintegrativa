import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDatabase, IDS } from '@/lib/db';
import { unifyClientRecordsByIdentity } from '@/lib/repository';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      cpf,
      phone,
      email,
      birthDate,
      gender,
      occupation,
      rg,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship,
      consultationReason,
      hasHealthConditions,
      healthConditionsDetails,
      hasPsychCare,
      psychCareDetails,
      medications,
      epilepsyHistory,
      previousHypnosis,
      previousHypnosisDetails,
      sleepQuality,
      stressLevel,
      consentAgreed,
    } = body ?? {};

    // Validações essenciais
    if (!name || typeof name !== 'string' || name.trim().length < 3) {
      return NextResponse.json({ error: 'Informe seu nome completo (mínimo 3 caracteres).' }, { status: 400 });
    }

    const cleanCpfDigits = (cpf ?? '').toString().replace(/\D/g, '');
    if (cleanCpfDigits.length !== 11) {
      return NextResponse.json({ error: 'Informe um CPF válido com 11 dígitos.' }, { status: 400 });
    }

    const cleanPhoneDigits = (phone ?? '').toString().replace(/\D/g, '');
    if (cleanPhoneDigits.length < 10) {
      return NextResponse.json({ error: 'Informe um número de WhatsApp válido com DDD.' }, { status: 400 });
    }

    if (!birthDate || typeof birthDate !== 'string' || birthDate.trim().length < 8) {
      return NextResponse.json({ error: 'Informe sua data de nascimento.' }, { status: 400 });
    }

    if (!consultationReason || typeof consultationReason !== 'string' || consultationReason.trim().length < 5) {
      return NextResponse.json(
        { error: 'Por favor, descreva o motivo principal da sua consulta ou o que deseja transformar.' },
        { status: 400 }
      );
    }

    if (!consentAgreed) {
      return NextResponse.json(
        { error: 'É obrigatório declarar ciência e concordar com o termo terapêutico para enviar a ficha.' },
        { status: 400 }
      );
    }

    const cleanEmail = email && typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null;
    const cleanPhone = phone.trim();
    const now = new Date().toISOString();

    const database = getDatabase();

    // 1. Verificar se o cliente já existe no sistema por CPF, Telefone ou E-mail
    let existingClient: { id: string; name: string; phone: string; email: string | null; password_hash: string | null } | undefined;

    existingClient = (await database.prepare(`
      SELECT c.id, c.name, c.phone, c.email, c.password_hash
      FROM clients c
      JOIN client_records cr ON cr.client_id = c.id
      WHERE c.clinic_id = ?
        AND REPLACE(REPLACE(REPLACE(COALESCE(cr.cpf, ''), '.', ''), '-', ''), ' ', '') = ?
      LIMIT 1
    `).get(IDS.clinic, cleanCpfDigits)) as typeof existingClient;

    if (!existingClient) {
      existingClient = (await database.prepare(`
        SELECT id, name, phone, email, password_hash
        FROM clients
        WHERE clinic_id = ?
          AND (
            REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?
            OR (LENGTH(?) >= 10 AND SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), -10) = SUBSTR(?, -10))
          )
        LIMIT 1
      `).get(IDS.clinic, cleanPhoneDigits, cleanPhoneDigits, cleanPhoneDigits)) as typeof existingClient;
    }

    if (!existingClient && cleanEmail) {
      existingClient = (await database.prepare(`
        SELECT id, name, phone, email, password_hash
        FROM clients
        WHERE clinic_id = ? AND LOWER(COALESCE(email, '')) = ?
        LIMIT 1
      `).get(IDS.clinic, cleanEmail)) as typeof existingClient;
    }

    let targetClientId: string;

    if (existingClient) {
      targetClientId = existingClient.id;
      // Atualizar dados cadastrais preservando histórico e ID
      await database.prepare(`
        UPDATE clients
        SET name = ?,
            phone = ?,
            email = COALESCE(?, email),
            status = 'ativo',
            updated_at = ?
        WHERE id = ?
      `).run(
        name.trim(),
        cleanPhone,
        cleanEmail,
        now,
        targetClientId
      );
    } else {
      // Criar novo cliente
      targetClientId = randomUUID();
      await database.prepare(`
        INSERT INTO clients (id, clinic_id, name, phone, email, status, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'ativo', NULL, ?, ?)
      `).run(
        targetClientId,
        IDS.clinic,
        name.trim(),
        cleanPhone,
        cleanEmail,
        now,
        now
      );

      // Preferências padrão do cliente
      await database.prepare(`
        INSERT INTO client_preferences (client_id, whatsapp_opt_in, email_opt_in, preferred_modality, updated_at)
        VALUES (?, 1, ?, 'presencial', ?)
      `).run(targetClientId, cleanEmail ? 1 : 0, now);
    }

    // 2. Montar contatos de emergência
    const ecName = emergencyContactName?.trim() || null;
    const ecPhone = emergencyContactPhone?.trim() || null;
    const ecRel = emergencyContactRelationship?.trim() || null;
    const ecJson = ecName || ecPhone ? JSON.stringify([{ name: ecName || '', phone: ecPhone, relationship: ecRel }]) : null;

    // 3. Montar histórico pessoal / hipnose / sono / estresse em personal_background
    const backgroundNotesParts: string[] = [];
    if (sleepQuality) backgroundNotesParts.push(`Qualidade do Sono: ${sleepQuality}`);
    if (stressLevel) backgroundNotesParts.push(`Nível de Estresse/Ansiedade: ${stressLevel}/10`);
    if (previousHypnosis) {
      backgroundNotesParts.push(
        `Experiência prévia com hipnose: Sim${previousHypnosisDetails?.trim() ? ` (${previousHypnosisDetails.trim()})` : ''}`
      );
    }
    const personalBackground = backgroundNotesParts.length > 0 ? backgroundNotesParts.join(' | ') : null;

    // 4. Salvar ou atualizar client_records
    const existingRec = await database.prepare(`
      SELECT client_id FROM client_records WHERE client_id = ?
    `).get(targetClientId);

    if (existingRec) {
      await database.prepare(`
        UPDATE client_records
        SET cpf = ?,
            rg = COALESCE(?, rg),
            birth_date = ?,
            gender = COALESCE(?, gender),
            occupation = COALESCE(?, occupation),
            emergency_contact_name = COALESCE(?, emergency_contact_name),
            emergency_contact_phone = COALESCE(?, emergency_contact_phone),
            emergency_contact_relationship = COALESCE(?, emergency_contact_relationship),
            emergency_contacts = COALESCE(?, emergency_contacts),
            consultation_reason = ?,
            chief_complaint = ?,
            has_health_conditions = ?,
            health_conditions_details = ?,
            has_psych_care = ?,
            psych_care_details = ?,
            medications = ?,
            epilepsy_history = ?,
            previous_hypnosis = ?,
            personal_background = COALESCE(?, personal_background),
            consent_agreed = 1,
            consent_agreed_at = ?,
            updated_at = ?
        WHERE client_id = ?
      `).run(
        cpf.trim(),
        rg?.trim() || null,
        birthDate.trim(),
        gender?.trim() || null,
        occupation?.trim() || null,
        ecName,
        ecPhone,
        ecRel,
        ecJson,
        consultationReason.trim(),
        consultationReason.trim(),
        hasHealthConditions ? 1 : 0,
        healthConditionsDetails?.trim() || null,
        hasPsychCare ? 1 : 0,
        psychCareDetails?.trim() || null,
        medications?.trim() || null,
        epilepsyHistory ? 1 : 0,
        previousHypnosis ? (previousHypnosisDetails?.trim() || 'Sim') : 'Não',
        personalBackground,
        now,
        now,
        targetClientId
      );
    } else {
      await database.prepare(`
        INSERT INTO client_records (
          client_id, cpf, rg, birth_date, gender, occupation,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, emergency_contacts,
          consultation_reason, chief_complaint,
          has_health_conditions, health_conditions_details,
          has_psych_care, psych_care_details,
          medications, epilepsy_history, previous_hypnosis,
          personal_background,
          consent_agreed, consent_agreed_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        targetClientId,
        cpf.trim(),
        rg?.trim() || null,
        birthDate.trim(),
        gender?.trim() || null,
        occupation?.trim() || null,
        ecName,
        ecPhone,
        ecRel,
        ecJson,
        consultationReason.trim(),
        consultationReason.trim(),
        hasHealthConditions ? 1 : 0,
        healthConditionsDetails?.trim() || null,
        hasPsychCare ? 1 : 0,
        psychCareDetails?.trim() || null,
        medications?.trim() || null,
        epilepsyHistory ? 1 : 0,
        previousHypnosis ? (previousHypnosisDetails?.trim() || 'Sim') : 'Não',
        personalBackground,
        now,
        now
      );
    }

    // 5. Registrar Termo de Consentimento assinado digitalmente
    const consentDocId = randomUUID();
    const consentContent = `Termo de Consentimento Informado & Anamnese Digital aceito eletronicamente em ${now} por ${name.trim()} (CPF ${cpf.trim()}, WhatsApp ${cleanPhone}). Motivo: ${consultationReason.trim()}`;
    
    await database.prepare(`
      INSERT INTO client_documents (
        id, client_id, document_type, title, content, status, signed_at, created_at
      ) VALUES (?, ?, 'termo_consentimento', 'Termo de Consentimento e Anamnese Digital', ?, 'assinado', ?, ?)
    `).run(
      consentDocId,
      targetClientId,
      consentContent,
      now,
      now
    );

    // 6. Unificar quaisquer outros registros idênticos por CPF / Telefone / E-mail
    await unifyClientRecordsByIdentity(database, targetClientId, cleanCpfDigits, cleanPhoneDigits, cleanEmail);

    // 7. Notificação interna para Camila Machado
    try {
      const notifId = randomUUID();
      await database.prepare(`
        INSERT INTO notifications (
          id, clinic_id, title, message, type, is_read, reference_id, reference_type, created_at
        ) VALUES (?, ?, ?, ?, 'anamnese_recebida', 0, ?, 'client', ?)
      `).run(
        notifId,
        IDS.clinic,
        'Nova Anamnese Digital Recebida!',
        `${name.trim()} preencheu a Ficha de Cadastro e Anamnese Digital com sucesso.`,
        targetClientId,
        now
      );
    } catch {
      // Ignora erro se notifications não existir ou tiver schema diferente
    }

    return NextResponse.json({
      ok: true,
      clientId: targetClientId,
      clientName: name.trim(),
      message: 'Ficha de cadastro e anamnese enviada com sucesso!',
    });
  } catch (error) {
    console.error('[public/anamnese]', error);
    const message = error instanceof Error ? error.message : 'Erro ao processar a ficha de anamnese.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

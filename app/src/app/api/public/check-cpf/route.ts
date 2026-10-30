import { NextResponse } from 'next/server';
import { getDatabase, IDS } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cpfParam = searchParams.get('cpf') || '';
    const cleanDigits = cpfParam.replace(/\D/g, '');

    if (cleanDigits.length !== 11) {
      return NextResponse.json({ found: false });
    }

    const database = getDatabase();

    // Buscar cliente por CPF em client_records
    const record = (await database.prepare(`
      SELECT 
        c.id,
        c.name,
        c.phone,
        c.email,
        c.password_hash,
        cr.cpf,
        cr.rg,
        cr.birth_date,
        cr.gender,
        cr.occupation,
        cr.emergency_contact_name,
        cr.emergency_contact_phone,
        cr.emergency_contact_relationship
      FROM clients c
      JOIN client_records cr ON cr.client_id = c.id
      WHERE c.clinic_id = ?
        AND REPLACE(REPLACE(REPLACE(COALESCE(cr.cpf, ''), '.', ''), '-', ''), ' ', '') = ?
      ORDER BY c.updated_at DESC
      LIMIT 1
    `).get(IDS.clinic, cleanDigits)) as {
      id: string;
      name: string;
      phone: string;
      email: string | null;
      password_hash: string | null;
      cpf: string | null;
      rg: string | null;
      birth_date: string | null;
      gender: string | null;
      occupation: string | null;
      emergency_contact_name: string | null;
      emergency_contact_phone: string | null;
      emergency_contact_relationship: string | null;
    } | undefined;

    if (!record) {
      return NextResponse.json({ found: false });
    }

    const hasPassword = Boolean(record.password_hash && record.password_hash.trim().length > 0);

    return NextResponse.json({
      found: true,
      hasPassword,
      name: record.name || '',
      phone: record.phone || '',
      email: record.email || '',
      birthDate: record.birth_date || '',
      rg: record.rg || '',
      gender: record.gender || '',
      occupation: record.occupation || '',
      emergencyContactName: record.emergency_contact_name || '',
      emergencyContactPhone: record.emergency_contact_phone || '',
      emergencyContactRelationship: record.emergency_contact_relationship || '',
    });
  } catch (error) {
    console.error('[api/public/check-cpf] error:', error);
    return NextResponse.json({ found: false, error: 'Erro ao consultar CPF' }, { status: 500 });
  }
}

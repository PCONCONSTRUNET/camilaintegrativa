import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getClinicPixConfig, saveClinicPixConfig } from '@/lib/pix-settings';
import { extractClientMetadata } from '@/lib/audit';

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const config = await getClinicPixConfig();
  return NextResponse.json({ config });
}

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const clientMeta = extractClientMetadata(request);
    const updated = await saveClinicPixConfig(body, session.userId, clientMeta);
    return NextResponse.json({ config: updated, success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar configurações do PIX.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


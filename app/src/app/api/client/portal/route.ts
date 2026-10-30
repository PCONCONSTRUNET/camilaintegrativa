import { NextResponse } from 'next/server';
import { getCurrentClient } from '@/lib/auth';
import { getClientPortalData } from '@/lib/repository';

export async function GET() {
  try {
    const session = await getCurrentClient();
    if (!session) {
      return NextResponse.json({ error: 'Sessão não autorizada ou expirada.' }, { status: 401 });
    }

    const data = await getClientPortalData(session.clientId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar dados do cliente.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getCurrentClient } from '@/lib/auth';
import { getClientPortalData } from '@/lib/repository';
import { processDue24hReminders, processOverdueInvoiceReminders } from '@/lib/whatsapp-reminders';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getCurrentClient();
    if (!session) {
      return NextResponse.json({ error: 'Sessão não autorizada ou expirada.' }, { status: 401 });
    }

    void processDue24hReminders({ opportunistic: true }).catch(() => null);
    void processOverdueInvoiceReminders({ opportunistic: true }).catch(() => null);

    const data = await getClientPortalData(session.clientId);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar dados do cliente.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

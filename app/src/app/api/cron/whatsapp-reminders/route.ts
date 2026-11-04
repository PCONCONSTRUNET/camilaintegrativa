import { NextResponse } from 'next/server';
import { processDue24hReminders, processOverdueInvoiceReminders } from '@/lib/whatsapp-reminders';

export async function GET() {
  try {
    const [r24h, overdue] = await Promise.all([
      processDue24hReminders(),
      processOverdueInvoiceReminders(),
    ]);

    return NextResponse.json({
      ok: true,
      reminders24h: {
        checkedCount: r24h.checkedCount,
        dispatchedCount: r24h.dispatchedCount,
      },
      overdueInvoices: {
        checkedCount: overdue.checkedCount,
        dispatchedCount: overdue.dispatchedCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao executar cron de lembretes.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

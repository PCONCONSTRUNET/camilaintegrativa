import { getCurrentUser } from '@/lib/auth';
import { getDashboard } from '@/lib/repository';
import { processDue24hReminders } from '@/lib/whatsapp-reminders';

let cachedDashboardPayload: { data: unknown; timestamp: number } | null = null;

export async function GET() {
  if (!(await getCurrentUser())) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const now = Date.now();
  if (cachedDashboardPayload && now - cachedDashboardPayload.timestamp < 10_000) {
    return Response.json(cachedDashboardPayload.data);
  }

  void processDue24hReminders({ opportunistic: true }).catch(() => null);
  const data = await getDashboard();
  cachedDashboardPayload = { data, timestamp: now };
  return Response.json(data);
}

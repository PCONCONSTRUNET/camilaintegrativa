import { getAvailability } from '@/lib/repository';
import { z } from 'zod';

function isRealDateKey(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const querySchema = z.object({
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDateKey),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ serviceId: url.searchParams.get('serviceId'), date: url.searchParams.get('date') });
  if (!parsed.success) return Response.json({ error: 'Parâmetros inválidos.' }, { status: 422 });
  return Response.json({ slots: await getAvailability(parsed.data.serviceId, parsed.data.date) });
}

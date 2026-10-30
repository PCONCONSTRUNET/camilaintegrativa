import { getCurrentUser } from '@/lib/auth';
import { saveClientRecord } from '@/lib/repository';
import { clientRecordSchema } from '@/lib/validation';

export async function POST(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;

  try {
    const json = await request.json();
    const parsed = clientRecordSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      return Response.json({ error: issues || 'Dados da ficha inicial inválidos.' }, { status: 400 });
    }

    const updated = await saveClientRecord(clientId, parsed.data, {
      userId: user.userId,
      name: user.name,
    });

    return Response.json({ record: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar ficha do cliente.';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  return POST(request, context);
}

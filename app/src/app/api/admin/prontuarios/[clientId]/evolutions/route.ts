import { getCurrentUser } from '@/lib/auth';
import { createClinicalEvolution, finalizeEvolution } from '@/lib/repository';
import { clinicalEvolutionSchema } from '@/lib/validation';

export async function POST(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;

  try {
    const json = await request.json();
    const parsed = clinicalEvolutionSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      return Response.json({ error: issues || 'Dados de evolução clínica inválidos.' }, { status: 400 });
    }

    const evolution = await createClinicalEvolution(clientId, parsed.data, {
      userId: user.userId,
      name: user.name,
    });

    return Response.json({ evolution }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao registrar evolução clínica.';
    return Response.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/admin/prontuarios/[clientId]/evolutions
// Body: { evolutionId: string }
// Finaliza (trava) um registro clínico — Lei 13.787/2018
export async function PATCH(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;

  try {
    const json = await request.json();
    const { evolutionId } = json as { evolutionId?: string };
    if (!evolutionId) return Response.json({ error: 'evolutionId é obrigatório.' }, { status: 400 });

    const result = await finalizeEvolution(evolutionId, clientId, {
      userId: user.userId,
      name: user.name,
    });

    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });

    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao finalizar registro.';
    return Response.json({ error: message }, { status: 500 });
  }
}

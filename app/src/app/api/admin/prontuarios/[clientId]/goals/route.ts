import { getCurrentUser } from '@/lib/auth';
import { createTreatmentGoal, updateTreatmentGoal } from '@/lib/repository';
import { treatmentGoalSchema } from '@/lib/validation';
import { z } from 'zod';

const goalUpdateSchema = z.object({
  goalId: z.string().uuid(),
  status: z.enum(['em_andamento', 'alcancado', 'ajustado', 'pausado']).optional(),
  progressPct: z.coerce.number().int().min(0).max(100).optional(),
  description: z.string().trim().optional().nullable(),
  targetDate: z.string().trim().optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;

  try {
    const json = await request.json();
    const parsed = treatmentGoalSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      return Response.json({ error: issues || 'Dados do objetivo inválidos.' }, { status: 400 });
    }

    const goal = await createTreatmentGoal(clientId, parsed.data, {
      userId: user.userId,
      name: user.name,
    });

    return Response.json({ goal }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao cadastrar objetivo.';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;

  try {
    const json = await request.json();
    const parsed = goalUpdateSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      return Response.json({ error: issues || 'Dados de atualização inválidos.' }, { status: 400 });
    }

    const { goalId, ...data } = parsed.data;
    const updated = await updateTreatmentGoal(clientId, goalId, data, {
      userId: user.userId,
      name: user.name,
    });

    return Response.json({ goal: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar objetivo.';
    return Response.json({ error: message }, { status: 500 });
  }
}

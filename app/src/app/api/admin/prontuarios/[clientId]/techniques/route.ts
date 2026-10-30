import { getCurrentUser } from '@/lib/auth';
import { createClinicalTechnique } from '@/lib/repository';
import { clinicalTechniqueSchema } from '@/lib/validation';

export async function POST(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;

  try {
    const json = await request.json();
    const parsed = clinicalTechniqueSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      return Response.json({ error: issues || 'Dados da técnica inválidos.' }, { status: 400 });
    }

    const technique = await createClinicalTechnique(clientId, parsed.data, {
      userId: user.userId,
      name: user.name,
    });

    return Response.json({ technique }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao registrar técnica aplicada.';
    return Response.json({ error: message }, { status: 500 });
  }
}

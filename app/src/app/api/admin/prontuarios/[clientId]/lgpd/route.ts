import { getCurrentUser } from '@/lib/auth';
import { exportClientLgpdDossier } from '@/lib/repository';

export async function GET(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;

  try {
    const dossier = await exportClientLgpdDossier(clientId, {
      userId: user.userId,
      name: user.name,
    });

    return Response.json(dossier);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao exportar dossiê LGPD.';
    return Response.json({ error: message }, { status: 500 });
  }
}

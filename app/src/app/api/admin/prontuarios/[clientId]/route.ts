import { getCurrentUser } from '@/lib/auth';
import { getProntuario } from '@/lib/repository';

export async function GET(
  _request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;
  const data = await getProntuario(clientId, { userId: user.userId, name: user.name });

  if (!data) {
    return Response.json({ error: 'Cliente ou prontuário não encontrado.' }, { status: 404 });
  }

  return Response.json(data);
}

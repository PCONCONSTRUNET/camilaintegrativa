import { getCurrentUser } from '@/lib/auth';
import { createClientReferral, updateClientReferralStatus } from '@/lib/repository';
import { clientReferralSchema } from '@/lib/validation';
import { z } from 'zod';

const referralUpdateSchema = z.object({
  referralId: z.string().uuid(),
  status: z.enum(['aguardando_retorno', 'retornou', 'concluido', 'cancelado']),
  returnNotes: z.string().trim().optional().nullable(),
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
    const parsed = clientReferralSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      return Response.json({ error: issues || 'Dados do encaminhamento inválidos.' }, { status: 400 });
    }

    const referral = await createClientReferral(clientId, parsed.data, {
      userId: user.userId,
      name: user.name,
    });

    return Response.json({ referral }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao registrar encaminhamento.';
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
    const parsed = referralUpdateSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      return Response.json({ error: issues || 'Dados de atualização inválidos.' }, { status: 400 });
    }

    const updated = await updateClientReferralStatus(
      clientId,
      parsed.data.referralId,
      parsed.data.status,
      parsed.data.returnNotes ?? null,
      {
        userId: user.userId,
        name: user.name,
      },
    );

    return Response.json({ referral: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar encaminhamento.';
    return Response.json({ error: message }, { status: 500 });
  }
}

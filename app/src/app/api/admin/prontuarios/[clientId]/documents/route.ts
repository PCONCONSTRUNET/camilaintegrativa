import { getCurrentUser } from '@/lib/auth';
import { createClientDocument, updateClientDocument, deleteClientDocument } from '@/lib/repository';
import { clientDocumentSchema } from '@/lib/validation';

export async function POST(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;

  try {
    const json = await request.json();
    const parsed = clientDocumentSchema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      return Response.json({ error: issues || 'Dados do documento inválidos.' }, { status: 400 });
    }

    const document = await createClientDocument(clientId, parsed.data, {
      userId: user.userId,
      name: user.name,
    });

    return Response.json({ document }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao cadastrar documento.';
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
    const { documentId, ...rest } = json;
    if (!documentId) return Response.json({ error: 'documentId obrigatório.' }, { status: 400 });

    const parsed = clientDocumentSchema.safeParse(rest);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(', ');
      return Response.json({ error: issues || 'Dados inválidos.' }, { status: 400 });
    }

    const document = await updateClientDocument(clientId, documentId, parsed.data, {
      userId: user.userId,
      name: user.name,
    });

    return Response.json({ document });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar documento.';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { clientId } = await context.params;

  try {
    const { documentId } = await request.json();
    if (!documentId) return Response.json({ error: 'documentId obrigatório.' }, { status: 400 });

    await deleteClientDocument(clientId, documentId, { userId: user.userId, name: user.name });

    return Response.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir documento.';
    return Response.json({ error: message }, { status: 500 });
  }
}

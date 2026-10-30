import { getCurrentUser } from '@/lib/auth';
import { updateFolder, deleteFolder } from '@/lib/notes-repository';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const json = await request.json();
    const updated = await updateFolder(id, undefined, {
      name: json.name,
      color: json.color,
      icon: json.icon,
      sortOrder: json.sortOrder,
    });

    if (!updated) {
      return Response.json({ error: 'Pasta não encontrada.' }, { status: 404 });
    }

    return Response.json({ folder: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar pasta.';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const url = new URL(request.url);
    const deleteNotes = url.searchParams.get('deleteNotes') === 'true';

    const ok = await deleteFolder(id, undefined, deleteNotes);
    if (!ok) {
      return Response.json({ error: 'Pasta não encontrada.' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir pasta.';
    return Response.json({ error: message }, { status: 500 });
  }
}


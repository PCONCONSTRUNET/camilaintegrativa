import { getCurrentUser } from '@/lib/auth';
import { updateNote, deleteNote, togglePinNote } from '@/lib/notes-repository';

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

    if (json.togglePin) {
      await togglePinNote(id);
      return Response.json({ success: true });
    }

    const updated = await updateNote(id, undefined, {
      title: json.title,
      content: json.content,
      folderId: json.folderId,
      color: json.color,
      isPinned: json.isPinned,
      tags: json.tags,
      attachments: json.attachments,
    });

    if (!updated) {
      return Response.json({ error: 'Anotação não encontrada.' }, { status: 404 });
    }

    return Response.json({ note: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar anotação.';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const ok = await deleteNote(id);
    if (!ok) {
      return Response.json({ error: 'Anotação não encontrada.' }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir anotação.';
    return Response.json({ error: message }, { status: 500 });
  }
}


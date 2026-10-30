import { getCurrentUser } from '@/lib/auth';
import { listNotes, listFolders, createNote } from '@/lib/notes-repository';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const folderIdParam = url.searchParams.get('folderId');
    const folderId = folderIdParam && folderIdParam !== 'all' ? folderIdParam : undefined;
    const query = url.searchParams.get('q') || undefined;
    const pinnedOnly = url.searchParams.get('pinned') === '1';

    const [notes, folders] = await Promise.all([
      listNotes(undefined, { folderId, query, pinnedOnly }),
      listFolders(),
    ]);

    return Response.json({ notes, folders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao listar anotações.';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const json = await request.json();
    if (!json.title || typeof json.title !== 'string' || !json.title.trim()) {
      return Response.json({ error: 'Título da anotação é obrigatório.' }, { status: 400 });
    }

    const note = await createNote(undefined, {
      title: json.title,
      content: json.content || '',
      folderId: json.folderId || null,
      color: json.color || '#ffffff',
      isPinned: Boolean(json.isPinned),
      tags: Array.isArray(json.tags) ? json.tags : [],
      attachments: Array.isArray(json.attachments) ? json.attachments : [],
    });

    return Response.json({ note }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao criar anotação.';
    return Response.json({ error: message }, { status: 500 });
  }
}


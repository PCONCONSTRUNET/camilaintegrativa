import { getCurrentUser } from '@/lib/auth';
import { listFolders, createFolder } from '@/lib/notes-repository';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const folders = await listFolders();
    return Response.json({ folders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao listar pastas.';
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
    if (!json.name || typeof json.name !== 'string' || !json.name.trim()) {
      return Response.json({ error: 'Nome da pasta é obrigatório.' }, { status: 400 });
    }

    const folder = await createFolder(undefined, {
      name: json.name,
      color: json.color || '#0f766e',
      icon: json.icon || 'folder',
      sortOrder: json.sortOrder,
    });

    return Response.json({ folder }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao criar pasta.';
    return Response.json({ error: message }, { status: 500 });
  }
}


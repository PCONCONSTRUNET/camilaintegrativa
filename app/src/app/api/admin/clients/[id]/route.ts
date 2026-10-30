import { getCurrentUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import { deleteClient, updateClient } from '@/lib/repository';
import { clientSchema } from '@/lib/validation';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = clientSchema.parse(body);
    const client = await updateClient(id, parsed);
    return Response.json({ client });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('UNIQUE') ||
        error.message.includes('duplicate key') ||
        error.message.includes('unique constraint'))
    ) {
      return Response.json(
        { error: 'Já existe outro cliente cadastrado com este telefone.' },
        { status: 409 },
      );
    }
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const result = await deleteClient(id);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}


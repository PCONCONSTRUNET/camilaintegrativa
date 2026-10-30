import { ZodError } from 'zod';

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: 'Verifique os campos informados.', fields: error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  if (error instanceof Error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ error: 'Não foi possível concluir a operação.' }, { status: 500 });
}

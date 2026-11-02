import { ZodError } from 'zod';

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    const flat = error.flatten();
    const fieldEntries = Object.entries(flat.fieldErrors);
    let detail = '';
    if (fieldEntries.length > 0) {
      const [fieldName, fieldMsgs] = fieldEntries[0];
      const msg = Array.isArray(fieldMsgs) ? fieldMsgs[0] : String(fieldMsgs);
      detail = msg ? `${fieldName}: ${msg}` : fieldName;
    }
    const message = detail
      ? `Verifique os campos informados (${detail}).`
      : 'Verifique os campos informados.';

    return Response.json(
      { error: message, fields: flat.fieldErrors },
      { status: 422 },
    );
  }
  if (error instanceof Error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ error: 'Não foi possível concluir a operação.' }, { status: 500 });
}

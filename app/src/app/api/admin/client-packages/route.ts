import { getCurrentUser } from '@/lib/auth';
import { createClientPackage, listClientPackages } from '@/lib/repository';
import { clientPackageSchema } from '@/lib/validation';
import { errorResponse } from '@/lib/http';

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId') || undefined;

  try {
    const packages = await listClientPackages(clientId);
    return Response.json({ packages });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    const body = await request.json();
    const input = clientPackageSchema.parse(body);
    const created = await createClientPackage(input);
    return Response.json({ package: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

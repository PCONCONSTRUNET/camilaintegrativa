import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  createPendingContractLink,
  deleteContractById,
  getContractTemplate,
  listContracts,
  saveContractTemplate,
} from '@/lib/contracts';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const sp = request.nextUrl.searchParams;
    const status = sp.get('status') || undefined;
    const origin = sp.get('origin') || undefined;
    const search = sp.get('search') || undefined;

    const [contracts, template] = await Promise.all([
      listContracts({ status, origin, search }),
      getContractTemplate(),
    ]);

    return Response.json(
      { contracts, template },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const action = body.action as string;

    if (action === 'save_template') {
      const template = await saveContractTemplate({
        title: body.title,
        body: body.body,
        professionalName: body.professionalName,
        professionalCpf: body.professionalCpf,
        professionalCredential: body.professionalCredential,
        professionalSignatureData: body.professionalSignatureData,
      });
      return Response.json({ template });
    }

    if (action === 'create_link') {
      const contract = await createPendingContractLink({
        clientName: typeof body.clientName === 'string' ? body.clientName : '',
        clientCpf: typeof body.clientCpf === 'string' ? body.clientCpf : '',
        clientPhone: typeof body.clientPhone === 'string' ? body.clientPhone : '',
        serviceName: typeof body.serviceName === 'string' ? body.serviceName : '',
        sessionDate: typeof body.sessionDate === 'string' ? body.sessionDate : '',
        sessionTime: typeof body.sessionTime === 'string' ? body.sessionTime : '',
        modality: typeof body.modality === 'string' ? body.modality : 'presencial',
      });
      return Response.json({ contract }, { status: 201 });
    }

    return Response.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const id = request.nextUrl.searchParams.get('id')?.trim() || '';
    if (!id) {
      return Response.json({ error: 'ID do contrato é obrigatório.' }, { status: 400 });
    }
    const deleted = await deleteContractById(id);
    if (!deleted) {
      return Response.json({ error: 'Contrato não encontrado.' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}


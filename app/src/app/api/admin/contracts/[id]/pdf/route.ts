import { getCurrentUser } from '@/lib/auth';
import { buildSignedContractPdf, getContractById } from '@/lib/contracts';
import { errorResponse } from '@/lib/http';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const contract = await getContractById(id);
    if (!contract) {
      return Response.json({ error: 'Contrato não encontrado.' }, { status: 404 });
    }

    const pdfBytes = await buildSignedContractPdf(contract);
    const slugName = (contract.clientName || 'cliente')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="contrato-${slugName || contract.id}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}


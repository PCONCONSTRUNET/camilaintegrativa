import { NextRequest } from 'next/server';
import { buildSignedContractPdf, getContractById } from '@/lib/contracts';
import { errorResponse } from '@/lib/http';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const token = request.nextUrl.searchParams.get('token')?.trim() || '';

    if (!token) {
      return Response.json({ error: 'Token de verificação ausente.' }, { status: 403 });
    }

    const contract = await getContractById(id);
    if (!contract || contract.token !== token) {
      return Response.json({ error: 'Contrato não encontrado ou token inválido.' }, { status: 404 });
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


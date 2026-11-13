import { NextRequest } from 'next/server';
import { getCurrentClient } from '@/lib/auth';
import { buildSignedContractPdf, getClientContractById } from '@/lib/contracts';
import { getDatabase } from '@/lib/db';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentClient();
  if (!session) {
    return Response.json({ error: 'Sessão não autorizada.' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const db = getDatabase();
    const rec = (await db
      .prepare('SELECT cpf FROM client_records WHERE client_id = ?')
      .get(session.clientId)) as { cpf?: string | null } | undefined;

    const contract = await getClientContractById(id, session.clientId, rec?.cpf || null);
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

    const isDownload = request.nextUrl.searchParams.get('download') === '1';
    const disposition = isDownload ? 'attachment' : 'inline';

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="contrato-${slugName || contract.id}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

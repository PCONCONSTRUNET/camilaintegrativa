import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getGroupSession, listGroupSessionEnrollments } from '@/lib/repository';
import { buildGroupSessionAttendancePdf } from '@/lib/group-session-pdf';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const session = await getGroupSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Sessão em grupo não encontrada' }, { status: 404 });
    }

    const enrollments = await listGroupSessionEnrollments(id);

    const pdfBytes = await buildGroupSessionAttendancePdf({
      session,
      enrollments,
    });

    const url = new URL(req.url);
    const isInlineView = url.searchParams.get('view') === '1' || url.searchParams.get('inline') === '1';

    // Gera nome de arquivo limpo
    const safeTitle = session.title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 35);
    const dateStr = session.date || 'data';
    const filename = `Lista-Presenca-${safeTitle}-${dateStr}.pdf`;

    const disposition = isInlineView ? `inline; filename="${filename}"` : `attachment; filename="${filename}"`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[group-sessions-pdf] Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar o PDF da lista de participantes.' },
      { status: 500 }
    );
  }
}


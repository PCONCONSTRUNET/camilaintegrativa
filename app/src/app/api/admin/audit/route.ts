import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAuditLogs, getAuditStats } from '@/lib/audit';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || undefined;
  const severity = searchParams.get('severity') || undefined;
  const period = (searchParams.get('period') as 'today' | '7days' | '30days' | 'all') || 'all';
  const search = searchParams.get('search') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = (page - 1) * limit;

  try {
    const [{ logs, total }, stats] = await Promise.all([
      getAuditLogs({ category, severity, period, search, limit, offset }),
      getAuditStats(),
    ]);

    return NextResponse.json({
      ok: true,
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      stats,
    });
  } catch (err) {
    console.error('[api/admin/audit] error:', err);
    return NextResponse.json(
      { error: 'Falha ao buscar registros de auditoria.' },
      { status: 500 }
    );
  }
}

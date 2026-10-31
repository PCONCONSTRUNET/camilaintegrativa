import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAuditLogs } from '@/lib/audit';

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function formatBrasilia(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(d);
  } catch {
    return iso;
  }
}

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

  try {
    const { logs } = await getAuditLogs({
      category,
      severity,
      period,
      search,
      limit: 5000, // Exportar até 5000 registros
    });

    const headers = [
      'ID do Registro',
      'Data e Hora (Brasília)',
      'Ator / Responsável',
      'Tipo de Ator',
      'Categoria',
      'Ação',
      'Título',
      'Descrição Detalhada',
      'Endereço IP',
      'Severidade',
    ];

    const rows = logs.map((log) => [
      escapeCsvField(log.id),
      escapeCsvField(formatBrasilia(log.createdAt)),
      escapeCsvField(log.actorName),
      escapeCsvField(log.actorType),
      escapeCsvField(log.category),
      escapeCsvField(log.action),
      escapeCsvField(log.title),
      escapeCsvField(log.description),
      escapeCsvField(log.ipAddress || 'Não registrado'),
      escapeCsvField(log.severity),
    ]);

    // UTF-8 BOM para abrir perfeitamente no Excel sem estragar acentuação em português
    const csvContent =
      '\uFEFF' +
      headers.map(escapeCsvField).join(';') +
      '\r\n' +
      rows.map((r) => r.join(';')).join('\r\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="relatorio-auditoria-lgpd-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (err) {
    console.error('[api/admin/audit/export] error:', err);
    return NextResponse.json({ error: 'Erro ao gerar relatório de auditoria.' }, { status: 500 });
  }
}

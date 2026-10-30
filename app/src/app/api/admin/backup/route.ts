import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { IDS } from '@/lib/db';
import { getBackupSummary, generateFullClinicBackup } from '@/lib/backup-service';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');
    const clinicId = IDS.clinic;

    if (mode === 'summary') {
      const summary = await getBackupSummary(clinicId, user.name || 'Camila Machado');
      return NextResponse.json({ success: true, summary });
    }

    // Gerar backup completo exportável
    const backupData = await generateFullClinicBackup(clinicId, {
      userId: user.userId,
      name: user.name || 'Camila Machado',
    });

    const now = new Date();
    const dateFormatted = now.toISOString().slice(0, 10);
    const timeFormatted = now.toTimeString().slice(0, 5).replace(':', 'h');
    const filename = `backup-clinica-camila-machado-${dateFormatted}-${timeFormatted}.json`;

    return new Response(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Erro ao gerar backup da clínica:', error);
    return NextResponse.json(
      {
        error: 'Falha ao processar o backup da clínica',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

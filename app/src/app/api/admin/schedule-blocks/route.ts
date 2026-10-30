import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import { localDateBounds } from '@/lib/time';
import { nextDateKey } from '@/lib/repository';

export type UnifiedScheduleBlock = {
  id: string;
  kind: 'manual' | 'automatico';
  startAt: string;
  endAt: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason: string;
  clientName?: string | null;
  clientId?: string | null;
  serviceName?: string | null;
  status?: string;
  modality?: string;
  canDelete: boolean;
};

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const to = searchParams.get('to') || from;
    const kind = searchParams.get('kind') || 'all'; // 'all' | 'manual' | 'automatico'

    const database = getDatabase();
    const startBounds = localDateBounds(from).start;
    const endBounds = localDateBounds(nextDateKey(to)).start;

    const list: UnifiedScheduleBlock[] = [];

    // 1. Bloqueios Manuais (time_blocks)
    if (kind === 'all' || kind === 'manual') {
      const manualRows = (await database.prepare(`
        SELECT id, start_at, end_at, reason, created_at
        FROM time_blocks
        WHERE clinic_id = ? AND professional_id = ?
          AND start_at < ? AND end_at > ?
        ORDER BY start_at ASC
      `).all(IDS.clinic, IDS.professional, endBounds.toISOString(), startBounds.toISOString())) as Array<{
        id: string;
        start_at: string;
        end_at: string;
        reason: string;
        created_at: string;
      }>;

      for (const row of manualRows) {
        const dStart = new Date(row.start_at);
        const dEnd = new Date(row.end_at);
        const durMin = Math.round((dEnd.getTime() - dStart.getTime()) / 60000);
        const dateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(dStart);
        const startTimeStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(dStart);
        const endTimeStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(dEnd);

        list.push({
          id: row.id,
          kind: 'manual',
          startAt: row.start_at,
          endAt: row.end_at,
          date: dateStr,
          startTime: startTimeStr,
          endTime: endTimeStr,
          durationMinutes: durMin,
          reason: row.reason || 'Bloqueio de Agenda',
          canDelete: true,
        });
      }
    }

    // 2. Bloqueios Automáticos (Agendamentos que travam o horário no sistema)
    if (kind === 'all' || kind === 'automatico') {
      const apptRows = (await database.prepare(`
        SELECT a.id, a.start_at, a.end_at, a.status, a.modality,
               c.id AS client_id, c.name AS client_name,
               s.name AS service_name
        FROM appointments a
        JOIN clients c ON c.id = a.client_id
        JOIN services s ON s.id = a.service_id
        WHERE a.clinic_id = ? AND a.professional_id = ?
          AND a.status NOT IN ('cancelado', 'nao_compareceu')
          AND a.start_at < ? AND a.end_at > ?
        ORDER BY a.start_at ASC
      `).all(IDS.clinic, IDS.professional, endBounds.toISOString(), startBounds.toISOString())) as Array<{
        id: string;
        start_at: string;
        end_at: string;
        status: string;
        modality: string;
        client_id: string;
        client_name: string;
        service_name: string;
      }>;

      for (const row of apptRows) {
        const dStart = new Date(row.start_at);
        const dEnd = new Date(row.end_at);
        const durMin = Math.round((dEnd.getTime() - dStart.getTime()) / 60000);
        const dateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(dStart);
        const startTimeStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(dStart);
        const endTimeStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(dEnd);

        list.push({
          id: row.id,
          kind: 'automatico',
          startAt: row.start_at,
          endAt: row.end_at,
          date: dateStr,
          startTime: startTimeStr,
          endTime: endTimeStr,
          durationMinutes: durMin,
          reason: `Agendamento: ${row.client_name} — ${row.service_name}`,
          clientName: row.client_name,
          clientId: row.client_id,
          serviceName: row.service_name,
          status: row.status,
          modality: row.modality,
          canDelete: false, // agendamentos são gerenciados na agenda
        });
      }
    }

    // Ordenar cronologicamente
    list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    return NextResponse.json({
      blocks: list,
      total: list.length,
      manualCount: list.filter((b) => b.kind === 'manual').length,
      automaticCount: list.filter((b) => b.kind === 'automatico').length,
    });
  } catch (error) {
    console.error('Error fetching schedule blocks:', error);
    return NextResponse.json({ error: 'Erro ao listar bloqueios de agenda.' }, { status: 500 });
  }
}

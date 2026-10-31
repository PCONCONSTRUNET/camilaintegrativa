import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listGroupSessions, createGroupSession } from '@/lib/repository';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') ?? undefined;
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const sessions = await listGroupSessions({
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
    });
    return NextResponse.json({ sessions });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao listar sessões em grupo.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const body = await req.json();
  if (!body.title || !body.date || !body.startTime) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: título, data e horário de início.' },
      { status: 400 }
    );
  }
  const session = await createGroupSession({
    title: String(body.title).trim(),
    description: body.description ? String(body.description).trim() : null,
    serviceId: body.serviceId ?? null,
    date: String(body.date),
    startTime: String(body.startTime),
    endTime: body.endTime ? String(body.endTime) : null,
    maxParticipants: body.maxParticipants != null ? Number(body.maxParticipants) : 0,
    showRemainingSpots: body.showRemainingSpots !== false,
    customRemainingSpots:
      body.customRemainingSpots !== undefined && body.customRemainingSpots !== null && body.customRemainingSpots !== ''
        ? Number(body.customRemainingSpots)
        : null,
    showOnHome: body.showOnHome !== false,
    priceCents: body.priceCents != null ? Number(body.priceCents) : null,
    priceVisible: body.priceVisible !== false,
    modality: body.modality === 'online' ? 'online' : 'presencial',
    locationNotes: body.locationNotes ? String(body.locationNotes).trim() : null,
    audioUrl: body.audioUrl ?? null,
    audioName: body.audioName ?? null,
    published: body.published !== false,
  });
  return NextResponse.json({ session }, { status: 201 });
}

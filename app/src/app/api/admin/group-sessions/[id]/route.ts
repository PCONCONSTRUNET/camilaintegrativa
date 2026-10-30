import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getGroupSession, updateGroupSession, deleteGroupSession } from '@/lib/repository';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const session = await getGroupSession(id);
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 });
  return NextResponse.json({ session });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  await updateGroupSession(id, {
    title: body.title,
    description: body.description,
    serviceId: body.serviceId,
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime,
    maxParticipants: body.maxParticipants != null ? Number(body.maxParticipants) : undefined,
    showRemainingSpots: body.showRemainingSpots,
    customRemainingSpots:
      body.customRemainingSpots !== undefined
        ? body.customRemainingSpots !== null && body.customRemainingSpots !== ''
          ? Number(body.customRemainingSpots)
          : null
        : undefined,
    showOnHome: body.showOnHome,
    priceCents: body.priceCents !== undefined ? (body.priceCents != null ? Number(body.priceCents) : null) : undefined,
    priceVisible: body.priceVisible,
    modality: body.modality,
    locationNotes: body.locationNotes,
    audioUrl: body.audioUrl,
    audioName: body.audioName,
    status: body.status,
    published: body.published,
  });
  const updated = await getGroupSession(id);
  return NextResponse.json({ session: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const result = await deleteGroupSession(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}

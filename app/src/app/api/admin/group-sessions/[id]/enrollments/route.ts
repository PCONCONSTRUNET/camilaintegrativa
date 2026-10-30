import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listGroupSessionEnrollments, cancelGroupEnrollment, enrollInGroupSession } from '@/lib/repository';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const enrollments = await listGroupSessionEnrollments(id);
  return NextResponse.json({ enrollments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  if (!body.name || !body.phone) {
    return NextResponse.json({ error: 'Nome e WhatsApp são obrigatórios.' }, { status: 400 });
  }
  const result = await enrollInGroupSession(id, {
    name: body.name,
    phone: body.phone,
    cpf: body.cpf ?? null,
    birthDate: body.birthDate ?? null,
    email: body.email ?? null,
    paymentMethod: body.paymentMethod ?? null,
    notes: body.notes ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true, enrollmentId: result.enrollmentId }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  void params;
  const body = await req.json();
  if (!body.enrollmentId) return NextResponse.json({ error: 'enrollmentId é obrigatório' }, { status: 400 });
  await cancelGroupEnrollment(body.enrollmentId);
  return NextResponse.json({ ok: true });
}


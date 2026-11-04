import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  listGroupSessionEnrollments,
  cancelGroupEnrollment,
  enrollInGroupSession,
  updateGroupEnrollmentPayment,
} from '@/lib/repository';
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';
import { IDS } from '@/lib/db';

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
    clientId: body.clientId ?? null,
    name: body.name,
    phone: body.phone,
    cpf: body.cpf ?? null,
    birthDate: body.birthDate ?? null,
    email: body.email ?? null,
    paymentMethod: body.paymentMethod ?? null,
    paymentStatus: body.paymentStatus ?? null,
    priceCents: body.priceCents != null ? Number(body.priceCents) : null,
    notes: body.notes ?? null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  const { ip, userAgent } = extractClientMetadata(req);
  await recordAuditLog({
    clinicId: IDS.clinic,
    actorType: 'admin',
    actorId: user.userId,
    actorName: user.name,
    category: 'agendamento',
    action: 'inscricao_sessao_grupo_manual',
    title: 'Inscrição Manual em Sessão em Grupo',
    description: `Participante "${body.name}" inscrito(a) na sessão em grupo "${result.sessionTitle || id}". Pagamento: ${result.paymentStatus || 'pendente'}.`,
    severity: 'info',
    ipAddress: ip,
    userAgent,
    details: {
      groupSessionId: id,
      enrollmentId: result.enrollmentId,
      clientId: result.clientId,
      clientName: body.name,
      clientPhone: body.phone,
      paymentStatus: result.paymentStatus,
      priceCents: result.priceCents,
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, enrollmentId: result.enrollmentId, paymentStatus: result.paymentStatus }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { enrollmentId, action, paymentMethod, priceCents, notes, paidAt } = body;

  if (!enrollmentId || !action) {
    return NextResponse.json({ error: 'enrollmentId e action são obrigatórios.' }, { status: 400 });
  }

  const result = await updateGroupEnrollmentPayment(enrollmentId, {
    action,
    paymentMethod,
    priceCents,
    notes,
    paidAt,
    userId: user.userId,
    userName: user.name,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  const { ip, userAgent } = extractClientMetadata(req);
  const actionTitle =
    action === 'mark_paid'
      ? 'Baixa de Pagamento em Sessão em Grupo'
      : action === 'mark_pending'
      ? 'Pagamento Marcado como Pendente'
      : 'Pagamento de Sessão em Grupo Atualizado';

  await recordAuditLog({
    clinicId: IDS.clinic,
    actorType: 'admin',
    actorId: user.userId,
    actorName: user.name,
    category: 'financeiro',
    action: `pagamento_sessao_grupo_${action}`,
    title: actionTitle,
    description: `Status de pagamento do participante atualizado (${action}). Sessão: ${id}.`,
    severity: 'info',
    ipAddress: ip,
    userAgent,
    details: {
      groupSessionId: id,
      enrollmentId,
      action,
      paymentMethod,
      priceCents,
      notes,
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, enrollment: result.enrollment });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  if (!body.enrollmentId) return NextResponse.json({ error: 'enrollmentId é obrigatório' }, { status: 400 });
  await cancelGroupEnrollment(body.enrollmentId);

  const { ip, userAgent } = extractClientMetadata(req);
  await recordAuditLog({
    clinicId: IDS.clinic,
    actorType: 'admin',
    actorId: user.userId,
    actorName: user.name,
    category: 'agendamento',
    action: 'cancelamento_inscricao_sessao_grupo',
    title: 'Cancelamento de Inscrição em Sessão em Grupo',
    description: `Inscrição (${body.enrollmentId}) cancelada na sessão ${id}.`,
    severity: 'info',
    ipAddress: ip,
    userAgent,
    details: {
      groupSessionId: id,
      enrollmentId: body.enrollmentId,
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}


import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';

export type NotificationCategory =
  | 'agendamento'
  | 'cancelamento'
  | 'pagamento'
  | 'grupo'
  | 'cliente';

export interface AdminNotificationItem {
  id: string;
  category: NotificationCategory;
  type:
    | 'appointment_requested'
    | 'appointment_confirmed'
    | 'appointment_cancelled'
    | 'payment_received'
    | 'payment_pending'
    | 'group_enrollment'
    | 'group_cancelled'
    | 'client_created';
  title: string;
  description: string;
  detail?: string | null;
  clientName?: string | null;
  amountCents?: number | null;
  timestamp: string;
  href: string;
  actionLabel: string;
  read: boolean;
}

let readTableEnsured = false;
let cachedNotificationsPayload: { data: unknown; timestamp: number } | null = null;

export function invalidateNotificationsCache() {
  cachedNotificationsPayload = null;
}

async function ensureNotificationReadsTable() {
  if (readTableEnsured) return;
  const db = getDatabase();
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS admin_notification_reads (
          notification_id TEXT PRIMARY KEY,
          clinic_id TEXT NOT NULL,
          read_at TEXT NOT NULL
        )`
      )
      .run();
    readTableEnsured = true;
  } catch {
    // ignore if table creation races
  }
}

function formatDatePtBr(isoOrDate: string): string {
  if (!isoOrDate) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) {
    const [y, m, d] = isoOrDate.split('-');
    return `${d}/${m}/${y}`;
  }
  const date = new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return isoOrDate;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatTimePtBr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function dateKeyFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatMethodLabel(method: string | null | undefined): string {
  if (!method) return 'PIX';
  const map: Record<string, string> = {
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    cartao: 'Cartão',
    cartao_credito: 'Cartão de Crédito',
    cartao_debito: 'Cartão de Débito',
    transferencia: 'Transferência',
    boleto: 'Boleto',
  };
  return map[method.toLowerCase()] || method;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const nowMs = Date.now();
  if (cachedNotificationsPayload && nowMs - cachedNotificationsPayload.timestamp < 10_000) {
    return NextResponse.json(cachedNotificationsPayload.data);
  }

  try {
    await ensureNotificationReadsTable();
    const db = getDatabase();

    // Load read IDs
    const readRows = (await db
      .prepare(`SELECT notification_id FROM admin_notification_reads WHERE clinic_id = ?`)
      .all(IDS.clinic)) as Array<{ notification_id: string }>;
    const readSet = new Set(readRows.map((r) => String(r.notification_id)));

    const items: AdminNotificationItem[] = [];

    // 1. Appointments (New, Confirmed, Cancelled)
    try {
      const apptRows = (await db
        .prepare(
          `SELECT
            a.id, a.status, a.modality, a.start_at, a.source,
            a.cancellation_reason, a.administrative_notes,
            a.created_at, a.updated_at, a.session_number,
            c.name AS client_name,
            s.name AS service_name
          FROM appointments a
          LEFT JOIN clients c ON c.id = a.client_id
          LEFT JOIN services s ON s.id = a.service_id
          WHERE a.clinic_id = ?
          ORDER BY COALESCE(a.updated_at, a.created_at, a.start_at) DESC
          LIMIT 60`
        )
        .all(IDS.clinic)) as Array<Record<string, unknown>>;

      for (const row of apptRows) {
        const apptId = String(row.id);
        const status = String(row.status ?? 'solicitado');
        const clientName = String(row.client_name ?? 'Paciente');
        const serviceName = String(row.service_name ?? 'Atendimento');
        const startAt = String(row.start_at ?? '');
        const dateFormatted = formatDatePtBr(startAt);
        const timeFormatted = formatTimePtBr(startAt);
        const dateKey = dateKeyFromIso(startAt);
        const modality = String(row.modality ?? 'presencial') === 'online' ? 'Online' : 'Presencial';
        const sourceLabel = String(row.source ?? 'publico') === 'publico' ? 'via agendamento online' : 'pela clínica';
        const createdAt = String(row.created_at ?? startAt);
        const updatedAt = String(row.updated_at ?? createdAt);

        if (status === 'cancelado') {
          const notifId = `appt-cancel-${apptId}`;
          const reason = row.cancellation_reason ? String(row.cancellation_reason).trim() : '';
          items.push({
            id: notifId,
            category: 'cancelamento',
            type: 'appointment_cancelled',
            title: `Agendamento cancelado · ${clientName}`,
            description: `${serviceName} (${modality}) de ${dateFormatted} às ${timeFormatted} foi cancelado.`,
            detail: reason ? `Motivo: "${reason}"` : null,
            clientName,
            timestamp: updatedAt,
            href: `/admin/agenda?date=${dateKey}`,
            actionLabel: 'Ver na Agenda',
            read: readSet.has(notifId),
          });
        } else if (status === 'solicitado') {
          const notifId = `appt-req-${apptId}`;
          items.push({
            id: notifId,
            category: 'agendamento',
            type: 'appointment_requested',
            title: `Nova solicitação de agendamento · ${clientName}`,
            description: `${serviceName} (${modality}) solicitado para ${dateFormatted} às ${timeFormatted} (${sourceLabel}).`,
            detail: 'Aguardando confirmação da clínica',
            clientName,
            timestamp: createdAt,
            href: `/admin/agenda?date=${dateKey}`,
            actionLabel: 'Confirmar na Agenda',
            read: readSet.has(notifId),
          });
        } else {
          const notifId = `appt-conf-${apptId}`;
          items.push({
            id: notifId,
            category: 'agendamento',
            type: 'appointment_confirmed',
            title: `Novo agendamento confirmado · ${clientName}`,
            description: `${serviceName} (${modality}) agendado para ${dateFormatted} às ${timeFormatted} (${sourceLabel}).`,
            detail: row.session_number ? `Sessão #${Number(row.session_number)} do pacote` : null,
            clientName,
            timestamp: createdAt,
            href: `/admin/agenda?date=${dateKey}`,
            actionLabel: 'Abrir na Agenda',
            read: readSet.has(notifId),
          });
        }
      }
    } catch {
      // ignore if appointments query fails
    }

    // 2. Payments (Received & Pending)
    try {
      const paymentRows = (await db
        .prepare(
          `SELECT
            p.id, p.entry_type, p.category, p.description,
            p.amount_cents, p.paid_amount_cents, p.payment_method,
            p.status, p.paid_at, p.due_at, p.created_at, p.updated_at,
            c.name AS client_name
          FROM client_payments p
          LEFT JOIN clients c ON c.id = p.client_id
          WHERE p.clinic_id = ? AND p.entry_type = 'entrada'
          ORDER BY COALESCE(p.paid_at, p.updated_at, p.created_at) DESC
          LIMIT 50`
        )
        .all(IDS.clinic)) as Array<Record<string, unknown>>;

      for (const row of paymentRows) {
        const payId = String(row.id);
        const status = String(row.status ?? 'pendente');
        const clientName = row.client_name ? String(row.client_name) : 'Paciente';
        const description = String(row.description ?? 'Recebimento');
        const amountCents = Number(row.amount_cents ?? 0);
        const paidCents = Number(row.paid_amount_cents ?? 0) || (status === 'pago' ? amountCents : 0);
        const method = formatMethodLabel(row.payment_method ? String(row.payment_method) : 'pix');
        const createdAt = String(row.created_at ?? new Date().toISOString());
        const paidAt = row.paid_at ? String(row.paid_at) : String(row.updated_at ?? createdAt);

        if (status === 'pago' || status === 'parcial' || paidCents > 0) {
          const notifId = `pay-paid-${payId}`;
          items.push({
            id: notifId,
            category: 'pagamento',
            type: 'payment_received',
            title: `Pagamento recebido (${formatCurrency(paidCents)}) · ${clientName}`,
            description: `${description} recebido via ${method}.`,
            detail: status === 'parcial' ? `Pagamento parcial de ${formatCurrency(amountCents)}` : `Quitado via ${method}`,
            clientName,
            amountCents: paidCents,
            timestamp: paidAt,
            href: '/admin/financeiro',
            actionLabel: 'Ver Financeiro',
            read: readSet.has(notifId),
          });
        } else if (status === 'pendente') {
          const notifId = `pay-pend-${payId}`;
          items.push({
            id: notifId,
            category: 'pagamento',
            type: 'payment_pending',
            title: `Nova cobrança registrada (${formatCurrency(amountCents)}) · ${clientName}`,
            description: `${description} · forma prevista: ${method}.`,
            detail: row.due_at ? `Vencimento: ${formatDatePtBr(String(row.due_at))}` : 'Aguardando baixa no financeiro',
            clientName,
            amountCents,
            timestamp: createdAt,
            href: '/admin/financeiro',
            actionLabel: 'Dar Baixa',
            read: readSet.has(notifId),
          });
        }
      }
    } catch {
      // ignore if payments table doesn't exist yet
    }

    // 3. Group Session Enrollments
    try {
      const groupRows = (await db
        .prepare(
          `SELECT
            e.id, e.client_name, e.client_phone, e.status, e.payment_method,
            e.enrolled_at, e.cancelled_at, e.created_at,
            gs.title AS session_title, gs.date AS session_date, gs.start_time AS session_time, gs.price_cents
          FROM group_session_enrollments e
          INNER JOIN group_sessions gs ON gs.id = e.group_session_id
          WHERE gs.clinic_id = ?
          ORDER BY COALESCE(e.cancelled_at, e.enrolled_at, e.created_at) DESC
          LIMIT 30`
        )
        .all(IDS.clinic)) as Array<Record<string, unknown>>;

      for (const row of groupRows) {
        const enrollId = String(row.id);
        const clientName = String(row.client_name ?? 'Participante');
        const sessionTitle = String(row.session_title ?? 'Sessão em Grupo');
        const sessionDate = formatDatePtBr(String(row.session_date ?? ''));
        const sessionTime = String(row.session_time ?? '');
        const status = String(row.status ?? 'confirmado');

        if (status === 'cancelado') {
          const notifId = `grp-cancel-${enrollId}`;
          items.push({
            id: notifId,
            category: 'cancelamento',
            type: 'group_cancelled',
            title: `Inscrição em grupo cancelada · ${clientName}`,
            description: `Cancelou participação em "${sessionTitle}" (${sessionDate} às ${sessionTime}).`,
            clientName,
            timestamp: String(row.cancelled_at ?? row.created_at ?? new Date().toISOString()),
            href: '/admin/sessoes-grupo',
            actionLabel: 'Ver Sessão em Grupo',
            read: readSet.has(notifId),
          });
        } else {
          const notifId = `grp-enroll-${enrollId}`;
          const method = row.payment_method ? ` · Pagamento: ${formatMethodLabel(String(row.payment_method))}` : '';
          items.push({
            id: notifId,
            category: 'grupo',
            type: 'group_enrollment',
            title: `Nova inscrição em grupo · ${clientName}`,
            description: `Garantiu vaga no evento "${sessionTitle}" (${sessionDate} às ${sessionTime})${method}.`,
            clientName,
            amountCents: row.price_cents != null ? Number(row.price_cents) : null,
            timestamp: String(row.enrolled_at ?? row.created_at ?? new Date().toISOString()),
            href: '/admin/sessoes-grupo',
            actionLabel: 'Ver Participantes',
            read: readSet.has(notifId),
          });
        }
      }
    } catch {
      // ignore if group tables don't exist yet
    }

    // 4. Newly Registered Clients
    try {
      const clientRows = (await db
        .prepare(
          `SELECT id, name, phone, email, created_at
           FROM clients
           WHERE clinic_id = ?
           ORDER BY created_at DESC
           LIMIT 25`
        )
        .all(IDS.clinic)) as Array<Record<string, unknown>>;

      for (const row of clientRows) {
        const clientId = String(row.id);
        const clientName = String(row.name ?? 'Paciente');
        const phone = row.phone ? String(row.phone) : '';
        const createdAt = String(row.created_at ?? new Date().toISOString());
        const notifId = `client-new-${clientId}`;

        items.push({
          id: notifId,
          category: 'cliente',
          type: 'client_created',
          title: `Novo paciente cadastrado · ${clientName}`,
          description: `Cadastro adicionado na base da clínica${phone ? ` · WhatsApp: ${phone}` : ''}.`,
          clientName,
          timestamp: createdAt,
          href: `/admin/prontuarios/${clientId}`,
          actionLabel: 'Abrir Prontuário',
          read: readSet.has(notifId),
        });
      }
    } catch {
      // ignore
    }

    // Sort all notifications newest first
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const limited = items.slice(0, 100);
    const summary = {
      total: limited.length,
      unread: limited.filter((i) => !i.read).length,
      agendamentos: limited.filter((i) => i.category === 'agendamento').length,
      cancelamentos: limited.filter((i) => i.category === 'cancelamento').length,
      pagamentos: limited.filter((i) => i.category === 'pagamento').length,
      grupos: limited.filter((i) => i.category === 'grupo').length,
      clientes: limited.filter((i) => i.category === 'cliente').length,
    };

    const responsePayload = {
      notifications: limited,
      summary,
    };
    cachedNotificationsPayload = { data: responsePayload, timestamp: Date.now() };

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('[GET /api/admin/notifications]', error);
    return NextResponse.json(
      { error: 'Erro ao carregar notificações.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  cachedNotificationsPayload = null;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    await ensureNotificationReadsTable();
    const db = getDatabase();
    const body = (await request.json()) as {
      action?: 'mark_read' | 'mark_unread' | 'mark_all_read';
      id?: string;
      ids?: string[];
    };

    const now = new Date().toISOString();

    if (body.action === 'mark_read' && body.id) {
      const existing = await db
        .prepare(`SELECT notification_id FROM admin_notification_reads WHERE notification_id = ?`)
        .get(body.id);
      if (!existing) {
        await db
          .prepare(
            `INSERT INTO admin_notification_reads (notification_id, clinic_id, read_at) VALUES (?, ?, ?)`
          )
          .run(body.id, IDS.clinic, now);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'mark_unread' && body.id) {
      await db
        .prepare(`DELETE FROM admin_notification_reads WHERE notification_id = ? AND clinic_id = ?`)
        .run(body.id, IDS.clinic);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'mark_all_read' && Array.isArray(body.ids)) {
      for (const notifId of body.ids) {
        if (!notifId) continue;
        const existing = await db
          .prepare(`SELECT notification_id FROM admin_notification_reads WHERE notification_id = ?`)
          .get(notifId);
        if (!existing) {
          await db
            .prepare(
              `INSERT INTO admin_notification_reads (notification_id, clinic_id, read_at) VALUES (?, ?, ?)`
            )
            .run(notifId, IDS.clinic, now);
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    console.error('[POST /api/admin/notifications]', error);
    return NextResponse.json({ error: 'Erro ao atualizar notificação.' }, { status: 500 });
  }
}


import { getDatabase, IDS } from '@/lib/db';
import { sendOneSignalPush } from '@/lib/onesignal';

let tableEnsured = false;

export async function ensureAdminAlertsTable() {
  if (tableEnsured) return;
  try {
    const db = getDatabase();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS admin_push_alerts_dedup (
        alert_key TEXT PRIMARY KEY,
        alert_type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    tableEnsured = true;
  } catch (err) {
    console.warn('[AdminPushAlerts] Erro ao criar tabela dedup:', err);
  }
}

async function isAlertAlreadySent(alertKey: string): Promise<boolean> {
  await ensureAdminAlertsTable();
  try {
    const db = getDatabase();
    const row = await db
      .prepare('SELECT alert_key FROM admin_push_alerts_dedup WHERE alert_key = ? LIMIT 1')
      .get(alertKey);
    return Boolean(row);
  } catch {
    return false;
  }
}

async function markAlertAsSent(alertKey: string, alertType: string, referenceId: string): Promise<void> {
  await ensureAdminAlertsTable();
  try {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db
      .prepare(
        'INSERT INTO admin_push_alerts_dedup (alert_key, alert_type, reference_id, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(alertKey, alertType, referenceId, now);
  } catch {}
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((cents || 0) / 100);
}

function formatDatePtBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
}

function formatTimePtBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
}

function dateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// ==============================================================================
// 1. NOVO AGENDAMENTO
// ==============================================================================
export async function notifyAdminNewAppointment(params: {
  appointmentId: string;
  clientName: string;
  serviceName?: string | null;
  startAt: string;
  modality?: string | null;
  source?: string | null;
}) {
  const dedupKey = `new_appt_${params.appointmentId}`;
  if (await isAlertAlreadySent(dedupKey)) return;

  const dateStr = formatDatePtBr(params.startAt);
  const timeStr = formatTimePtBr(params.startAt);
  const dateKey = dateKeyFromIso(params.startAt);
  const modalityLabel = params.modality === 'online' ? 'Online' : 'Presencial';
  const serviceLabel = params.serviceName || 'Sessão Individual';
  const originLabel = params.source === 'publico' ? 'pelo site' : 'na clínica';

  await sendOneSignalPush({
    title: `📅 Novo Agendamento: ${params.clientName}`,
    message: `${serviceLabel} (${modalityLabel}) agendado ${originLabel} para ${dateStr} às ${timeStr}.`,
    url: `/admin/agenda?date=${dateKey}`,
    target: { type: 'admins' },
    data: {
      type: 'new_appointment',
      appointmentId: params.appointmentId,
    },
  }).catch(() => null);

  await markAlertAsSent(dedupKey, 'new_appointment', params.appointmentId);
}

// ==============================================================================
// 2. AGENDAMENTO CANCELADO
// ==============================================================================
export async function notifyAdminCancelledAppointment(params: {
  appointmentId: string;
  clientName: string;
  serviceName?: string | null;
  startAt: string;
  reason?: string | null;
  cancelledBy?: string | null;
}) {
  const dedupKey = `cancel_appt_${params.appointmentId}`;
  if (await isAlertAlreadySent(dedupKey)) return;

  const dateStr = formatDatePtBr(params.startAt);
  const timeStr = formatTimePtBr(params.startAt);
  const dateKey = dateKeyFromIso(params.startAt);
  const reasonText = params.reason ? ` Motivo: "${params.reason}".` : '';
  const whoText = params.cancelledBy || 'Cancelado';

  await sendOneSignalPush({
    title: `❌ Agendamento Cancelado: ${params.clientName}`,
    message: `A consulta de ${dateStr} às ${timeStr} foi cancelada (${whoText}).${reasonText}`,
    url: `/admin/agenda?date=${dateKey}`,
    target: { type: 'admins' },
    data: {
      type: 'appointment_cancelled',
      appointmentId: params.appointmentId,
    },
  }).catch(() => null);

  await markAlertAsSent(dedupKey, 'appointment_cancelled', params.appointmentId);
}

// ==============================================================================
// 3. PAGAMENTO CONFIRMADO
// ==============================================================================
export async function notifyAdminConfirmedPayment(params: {
  paymentId: string;
  clientName: string;
  amountCents: number;
  paymentMethod?: string | null;
  serviceName?: string | null;
}) {
  const dedupKey = `paid_pmt_${params.paymentId}_${params.amountCents}`;
  if (await isAlertAlreadySent(dedupKey)) return;

  const methodClean = (params.paymentMethod || 'PIX').toUpperCase();
  const amountStr = formatCurrency(params.amountCents);
  const serviceText = params.serviceName ? ` ref. a ${params.serviceName}` : '';

  await sendOneSignalPush({
    title: `💰 Pagamento Confirmado: ${amountStr}`,
    message: `Recebido de ${params.clientName} via ${methodClean}${serviceText}.`,
    url: '/admin/financeiro',
    target: { type: 'admins' },
    data: {
      type: 'payment_confirmed',
      paymentId: params.paymentId,
    },
  }).catch(() => null);

  await markAlertAsSent(dedupKey, 'payment_confirmed', params.paymentId);
}

// ==============================================================================
// 4. PAGAMENTO PENDENTE
// ==============================================================================
export async function notifyAdminPendingPayment(params: {
  paymentId: string;
  clientName: string;
  amountCents: number;
  dueDate?: string | null;
  serviceName?: string | null;
}) {
  const dedupKey = `pending_pmt_${params.paymentId}`;
  if (await isAlertAlreadySent(dedupKey)) return;

  const amountStr = formatCurrency(params.amountCents);
  const dueText = params.dueDate ? ` Vencimento: ${formatDatePtBr(params.dueDate)}.` : '';
  const serviceText = params.serviceName ? ` (${params.serviceName})` : '';

  await sendOneSignalPush({
    title: `⏳ Pagamento Pendente: ${params.clientName}`,
    message: `Fatura de ${amountStr}${serviceText} gerada e aguardando quitação.${dueText}`,
    url: '/admin/financeiro',
    target: { type: 'admins' },
    data: {
      type: 'payment_pending',
      paymentId: params.paymentId,
    },
  }).catch(() => null);

  await markAlertAsSent(dedupKey, 'payment_pending', params.paymentId);
}

// ==============================================================================
// 5. FATURA VENCIDA
// ==============================================================================
export async function notifyAdminOverdueInvoice(params: {
  paymentId: string;
  clientName: string;
  amountCents: number;
  dueDate: string;
  serviceName?: string | null;
}) {
  // Dedup diário para não mandar de hora em hora a mesma fatura vencida
  const todayStr = new Date().toISOString().slice(0, 10);
  const dedupKey = `overdue_pmt_${params.paymentId}_${todayStr}`;
  if (await isAlertAlreadySent(dedupKey)) return;

  const amountStr = formatCurrency(params.amountCents);
  const dueStr = formatDatePtBr(params.dueDate);
  const serviceText = params.serviceName ? ` (${params.serviceName})` : '';

  await sendOneSignalPush({
    title: `⚠️ Fatura Vencida: ${params.clientName}`,
    message: `A cobrança de ${amountStr}${serviceText} venceu em ${dueStr} e ainda não foi paga.`,
    url: '/admin/financeiro?status=vencido',
    target: { type: 'admins' },
    data: {
      type: 'invoice_overdue',
      paymentId: params.paymentId,
    },
  }).catch(() => null);

  await markAlertAsSent(dedupKey, 'invoice_overdue', params.paymentId);
}

// ==============================================================================
// 6. LEMBRETE DE ATENDIMENTO 30 MINUTOS ANTES
// ==============================================================================
export async function notifyAdminUpcomingAppointment30m(params: {
  appointmentId: string;
  clientName: string;
  serviceName?: string | null;
  startAt: string;
  modality?: string | null;
}) {
  const dedupKey = `upcoming_30m_${params.appointmentId}`;
  if (await isAlertAlreadySent(dedupKey)) return;

  const timeStr = formatTimePtBr(params.startAt);
  const modalityLabel = params.modality === 'online' ? 'Online' : 'Presencial';
  const serviceLabel = params.serviceName || 'Consulta';

  await sendOneSignalPush({
    title: `⏰ Próximo Atendimento em ~30 min!`,
    message: `${params.clientName} às ${timeStr} · ${serviceLabel} (${modalityLabel}).`,
    url: '/admin/agenda',
    target: { type: 'admins' },
    data: {
      type: 'upcoming_30m',
      appointmentId: params.appointmentId,
    },
  }).catch(() => null);

  await markAlertAsSent(dedupKey, 'upcoming_30m', params.appointmentId);
}

// ==============================================================================
// SCAN PERIÓDICO (CRON / BACKGROUND CHECK): 30 MINUTOS ANTES & FATURAS VENCIDAS
// ==============================================================================
export async function runScheduledAdminAlertsScan(): Promise<{
  checkedUpcoming: number;
  alertedUpcoming: number;
  checkedOverdue: number;
  alertedOverdue: number;
}> {
  await ensureAdminAlertsTable();
  const db = getDatabase();
  const now = new Date();

  let alertedUpcoming = 0;
  let checkedUpcoming = 0;
  let alertedOverdue = 0;
  let checkedOverdue = 0;

  // 1. Checar agendamentos entre 15 e 45 minutos no futuro (janela de 30 minutos)
  try {
    const minTime = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const maxTime = new Date(now.getTime() + 45 * 60 * 1000).toISOString();

    const upcomingRows = (await db
      .prepare(`
        SELECT a.id, a.start_at, a.modality, c.name AS client_name, s.name AS service_name
        FROM appointments a
        LEFT JOIN clients c ON c.id = a.client_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE a.clinic_id = ?
          AND a.status IN ('agendado', 'confirmado', 'solicitado')
          AND a.start_at >= ?
          AND a.start_at <= ?
      `)
      .all(IDS.clinic, minTime, maxTime)) as Array<{
      id: string;
      start_at: string;
      modality: string | null;
      client_name: string | null;
      service_name: string | null;
    }>;

    checkedUpcoming = upcomingRows.length;

    for (const appt of upcomingRows) {
      const dedupKey = `upcoming_30m_${appt.id}`;
      if (!(await isAlertAlreadySent(dedupKey))) {
        await notifyAdminUpcomingAppointment30m({
          appointmentId: appt.id,
          clientName: appt.client_name || 'Paciente',
          serviceName: appt.service_name,
          startAt: appt.start_at,
          modality: appt.modality,
        });
        alertedUpcoming++;
      }
    }
  } catch (err) {
    console.warn('[AdminPushAlerts] Erro no scan de 30 minutos:', err);
  }

  // 2. Checar faturas vencidas (due_at < hoje e status pendente/parcial)
  try {
    const todayStr = now.toISOString().slice(0, 10);

    const overdueRows = (await db
      .prepare(`
        SELECT p.id, p.amount_cents, p.remaining_amount_cents, p.due_at,
               c.name AS client_name, s.name AS service_name
        FROM client_payments p
        LEFT JOIN clients c ON c.id = p.client_id
        LEFT JOIN services s ON s.id = p.service_id
        WHERE p.clinic_id = ?
          AND p.entry_type = 'entrada'
          AND p.status IN ('pendente', 'parcial')
          AND p.due_at IS NOT NULL
          AND p.due_at < ?
      `)
      .all(IDS.clinic, todayStr)) as Array<{
      id: string;
      amount_cents: number;
      remaining_amount_cents: number;
      due_at: string;
      client_name: string | null;
      service_name: string | null;
    }>;

    checkedOverdue = overdueRows.length;

    for (const pmt of overdueRows) {
      const dedupKey = `overdue_pmt_${pmt.id}_${todayStr}`;
      if (!(await isAlertAlreadySent(dedupKey))) {
        await notifyAdminOverdueInvoice({
          paymentId: pmt.id,
          clientName: pmt.client_name || 'Paciente',
          amountCents: pmt.remaining_amount_cents || pmt.amount_cents,
          dueDate: pmt.due_at,
          serviceName: pmt.service_name,
        });
        alertedOverdue++;
      }
    }
  } catch (err) {
    console.warn('[AdminPushAlerts] Erro no scan de faturas vencidas:', err);
  }

  return { checkedUpcoming, alertedUpcoming, checkedOverdue, alertedOverdue };
}

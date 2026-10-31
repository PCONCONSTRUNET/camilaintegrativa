import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentClient } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import { triggerAppointmentCancelledReminder } from '@/lib/whatsapp-reminders';
import { notifyAdminCancelledAppointment } from '@/lib/admin-push-alerts';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const clientSession = await getCurrentClient();
  if (!clientSession) {
    return NextResponse.json({ error: 'Sessão expirada. Faça login novamente.' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    const database = getDatabase();
    const appt = (await database.prepare(`
      SELECT id, client_id, status, start_at, administrative_notes
      FROM appointments
      WHERE id = ? AND client_id = ? AND clinic_id = ?
    `).get(id, clientSession.clientId, IDS.clinic)) as {
      id: string;
      client_id: string;
      status: string;
      start_at: string;
      administrative_notes: string | null;
    } | undefined;

    if (!appt) {
      return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 });
    }

    if (appt.status === 'cancelado') {
      return NextResponse.json({ error: 'Este agendamento já está cancelado.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updatedNotes = reason
      ? `${appt.administrative_notes ? `${appt.administrative_notes} | ` : ''}Cancelado pelo cliente: ${reason}`
      : appt.administrative_notes;

    await database.prepare(`
      UPDATE appointments
      SET status = 'cancelado',
          administrative_notes = ?,
          updated_at = ?
      WHERE id = ? AND clinic_id = ?
    `).run(updatedNotes, now, id, IDS.clinic);

    await database.prepare(`
      INSERT INTO appointment_events (id, appointment_id, event_type, previous_value, new_value)
      VALUES (?, ?, 'status_alterado', ?, 'cancelado')
    `).run(randomUUID(), id, appt.status);

    await triggerAppointmentCancelledReminder(
      id,
      'Cancelado pelo próprio cliente na Área do Cliente',
      reason || 'Cancelado pelo cliente no portal'
    ).catch(() => null);

    await notifyAdminCancelledAppointment({
      appointmentId: id,
      clientName: clientSession.name || 'Paciente',
      startAt: appt.start_at,
      reason: reason || null,
      cancelledBy: 'pelo paciente no portal',
    }).catch(() => null);

    return NextResponse.json({ ok: true, status: 'cancelado' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao cancelar agendamento.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


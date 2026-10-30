import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentClient } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import { triggerPaymentIdentifiedReminder } from '@/lib/whatsapp-reminders';

export async function POST(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  const clientSession = await getCurrentClient();
  if (!clientSession) {
    return NextResponse.json({ error: 'Sessão expirada. Faça login novamente.' }, { status: 401 });
  }

  const { paymentId } = await context.params;

  try {
    const database = getDatabase();
    const payment = (await database.prepare(`
      SELECT p.id, p.clinic_id, p.client_id, p.description, p.amount_cents,
             p.paid_amount_cents, p.remaining_amount_cents, p.status,
             c.name AS client_name, c.phone AS client_phone,
             s.name AS service_name
      FROM client_payments p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN services s ON s.id = p.service_id
      WHERE p.id = ? AND p.client_id = ? AND p.clinic_id = ?
    `).get(paymentId, clientSession.clientId, IDS.clinic)) as {
      id: string;
      clinic_id: string;
      client_id: string;
      description: string | null;
      amount_cents: number;
      paid_amount_cents: number;
      remaining_amount_cents: number;
      status: string;
      client_name: string | null;
      client_phone: string | null;
      service_name: string | null;
    } | undefined;

    if (!payment) {
      return NextResponse.json({ error: 'Fatura não encontrada.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const currentPaid = Number(payment.paid_amount_cents ?? 0);
    const totalAmount = Number(payment.amount_cents ?? 0);
    const currentRemaining = Number(
      payment.remaining_amount_cents ?? Math.max(0, totalAmount - currentPaid)
    );

    if (currentRemaining <= 0) {
      return NextResponse.json({ error: 'Esta fatura já se encontra totalmente quitada.' }, { status: 400 });
    }

    const requestedCents = body?.amountCents ? parseInt(String(body.amountCents), 10) : currentRemaining;
    const payAmount = Math.min(currentRemaining, Math.max(1, requestedCents || currentRemaining));
    const paymentMethod = typeof body?.paymentMethod === 'string' ? body.paymentMethod : 'pix';

    const newPaid = currentPaid + payAmount;
    const newRemaining = Math.max(0, totalAmount - newPaid);
    const newStatus = newRemaining === 0 ? 'pago' : 'parcial';
    const now = new Date().toISOString();

    await database.prepare(`
      UPDATE client_payments
      SET paid_amount_cents = ?,
          remaining_amount_cents = ?,
          status = ?,
          payment_method = ?,
          paid_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(newPaid, newRemaining, newStatus, paymentMethod, now, now, paymentId);

    const txId = randomUUID();
    await database.prepare(`
      INSERT INTO payment_transactions (
        id, clinic_id, payment_id, client_id, amount_cents, payment_method, paid_at, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txId,
      IDS.clinic,
      paymentId,
      payment.client_id,
      payAmount,
      paymentMethod,
      now,
      typeof body?.notes === 'string' && body.notes.trim()
        ? body.notes.trim()
        : newRemaining === 0
        ? 'Pagamento de fatura realizado na Área do Cliente (Quitado)'
        : 'Pagamento parcial de fatura realizado na Área do Cliente',
      now
    );

    // Disparar lembrete automático de Pagamento Identificado via WhatsApp
    await triggerPaymentIdentifiedReminder({
      paymentId,
      clientId: payment.client_id,
      clientName: payment.client_name || clientSession.name || 'Cliente',
      clientPhone: payment.client_phone || clientSession.phone || '',
      serviceName: payment.service_name || payment.description || 'Atendimento Clínico',
      description: payment.description,
      amountPaidNowCents: payAmount,
      totalInvoiceNetCents: totalAmount,
      remainingCents: newRemaining,
      paymentMethod,
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      transactionId: txId,
      paidAmountCents: newPaid,
      remainingAmountCents: newRemaining,
      status: newStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao processar pagamento da fatura.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


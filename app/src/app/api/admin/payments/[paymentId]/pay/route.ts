import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import { triggerPaymentIdentifiedReminder } from '@/lib/whatsapp-reminders';
import { notifyAdminConfirmedPayment } from '@/lib/admin-push-alerts';

export async function POST(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

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
      WHERE p.id = ? AND p.clinic_id = ?
    `).get(paymentId, IDS.clinic)) as {
      id: string;
      clinic_id: string;
      client_id: string | null;
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
      return NextResponse.json({ error: 'Lançamento financeiro não encontrado.' }, { status: 404 });
    }

    const body = await request.json();
    const { amountCents, paymentMethod = 'pix', paidAt, notes } = body;

    const payAmount = Math.max(0, parseInt(amountCents, 10));
    if (!payAmount || payAmount <= 0) {
      return NextResponse.json({ error: 'Informe um valor de pagamento válido maior que zero.' }, { status: 400 });
    }

    const currentPaid = Number(payment.paid_amount_cents ?? 0);
    const totalAmount = Number(payment.amount_cents ?? 0);
    const currentRemaining = Number(payment.remaining_amount_cents ?? Math.max(0, totalAmount - currentPaid));

    if (payAmount > currentRemaining) {
      return NextResponse.json({
        error: `O valor informado (R$ ${(payAmount / 100).toFixed(2)}) é maior que o saldo em aberto (R$ ${(currentRemaining / 100).toFixed(2)}).`,
      }, { status: 400 });
    }

    const newPaid = currentPaid + payAmount;
    const newRemaining = Math.max(0, totalAmount - newPaid);
    const newStatus = newRemaining === 0 ? 'pago' : 'parcial';
    const effectivePaidAt = paidAt || new Date().toISOString();
    const now = new Date().toISOString();

    // 1. Atualizar registro do pagamento
    await database.prepare(`
      UPDATE client_payments
      SET paid_amount_cents = ?,
          remaining_amount_cents = ?,
          status = ?,
          payment_method = ?,
          paid_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      newPaid,
      newRemaining,
      newStatus,
      paymentMethod,
      effectivePaidAt,
      now,
      paymentId
    );

    // 2. Registrar transação histórica
    const txId = randomUUID();
    await database.prepare(`
      INSERT INTO payment_transactions (
        id, clinic_id, payment_id, client_id, amount_cents, payment_method, paid_at, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txId,
      IDS.clinic,
      paymentId,
      payment.client_id,
      payAmount,
      paymentMethod,
      effectivePaidAt,
      notes || (newRemaining === 0 ? 'Quitação total de saldo' : 'Baixa parcial de saldo'),
      currentUser.userId,
      now
    );

    if (payment.client_id && payment.client_phone) {
      await triggerPaymentIdentifiedReminder({
        paymentId,
        clientId: payment.client_id,
        clientName: payment.client_name || 'Cliente',
        clientPhone: payment.client_phone,
        serviceName: payment.service_name || payment.description || 'Atendimento Clínico',
        description: payment.description,
        amountPaidNowCents: payAmount,
        totalInvoiceNetCents: totalAmount,
        remainingCents: newRemaining,
        paymentMethod,
      }).catch(() => null);
    }

    await notifyAdminConfirmedPayment({
      paymentId,
      clientName: payment.client_name || 'Paciente',
      amountCents: payAmount,
      paymentMethod,
      serviceName: payment.service_name || payment.description,
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      transactionId: txId,
      paidAmountCents: newPaid,
      remainingAmountCents: newRemaining,
      status: newStatus,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao processar baixa de pagamento.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


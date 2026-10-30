import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';

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
      SELECT * FROM client_payments WHERE id = ? AND clinic_id = ?
    `).get(paymentId, IDS.clinic)) as Record<string, unknown> | undefined;

    if (!payment) {
      return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 });
    }

    const remainingCents = Number(payment.remaining_amount_cents ?? 0);
    if (remainingCents <= 0) {
      return NextResponse.json({ error: 'Este lançamento não possui saldo em aberto para parcelamento.' }, { status: 400 });
    }

    const body = await request.json();
    const {
      installmentsCount = 2,
      intervalDays = 30,
      firstDueDate,
      paymentMethod = (payment.payment_method as string) || 'cartao',
      firstPaid = false,
      notes,
    } = body;

    const count = Math.max(2, parseInt(installmentsCount, 10) || 2);
    const interval = Math.max(1, parseInt(intervalDays, 10) || 30);
    const baseAmount = Math.floor(remainingCents / count);
    const remainder = remainingCents % count;

    const start = firstDueDate ? new Date(firstDueDate) : new Date();
    const now = new Date().toISOString();
    const createdIds: string[] = [];

    let totalPaidFromFirst = 0;

    for (let i = 1; i <= count; i++) {
      const installmentId = randomUUID();
      const amount = i === 1 ? baseAmount + remainder : baseAmount;
      const isFirstPaid = i === 1 && firstPaid;

      const d = new Date(start);
      d.setDate(d.getDate() + (i - 1) * interval);
      const dueAt = d.toISOString();
      const paidAt = isFirstPaid ? now : null;
      const status = isFirstPaid ? 'pago' : 'pendente';
      const paidAmount = isFirstPaid ? amount : 0;
      const remainingAmount = isFirstPaid ? 0 : amount;

      if (isFirstPaid) totalPaidFromFirst = amount;

      await database.prepare(`
        INSERT INTO client_payments (
          id, clinic_id, client_id, appointment_id, service_id, client_package_id, parent_payment_id,
          installment_number, total_installments, entry_type, category, charge_type, description,
          amount_cents, paid_amount_cents, remaining_amount_cents, discount_cents, payment_method,
          status, paid_at, due_at, notes, created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        installmentId,
        IDS.clinic,
        payment.client_id || null,
        payment.appointment_id || null,
        payment.service_id || null,
        payment.client_package_id || null,
        paymentId,
        i,
        count,
        (payment.entry_type as string) || 'entrada',
        (payment.category as string) || 'outros',
        'parcelado',
        `${payment.description} (Parcela ${i}/${count})`,
        amount,
        paidAmount,
        remainingAmount,
        0,
        paymentMethod,
        status,
        paidAt,
        dueAt,
        notes || `Parcelamento renegociado em ${count}x`,
        currentUser.userId,
        now,
        now
      );

      if (isFirstPaid) {
        const txId = randomUUID();
        await database.prepare(`
          INSERT INTO payment_transactions (
            id, clinic_id, payment_id, client_id, amount_cents, payment_method, paid_at, notes, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          txId,
          IDS.clinic,
          installmentId,
          payment.client_id || null,
          amount,
          paymentMethod,
          now,
          'Entrada quitada no ato do parcelamento',
          currentUser.userId,
          now
        );
      }

      createdIds.push(installmentId);
    }

    // O saldo em aberto passa para as parcelas filhas: o lançamento original fica apenas
    // com o que já havia sido pago, evitando contar o mesmo valor duas vezes no DRE.
    const originalPaid = Number(payment.paid_amount_cents ?? 0);
    void totalPaidFromFirst;

    await database.prepare(`
      UPDATE client_payments
      SET charge_type = 'parcelado',
          status = 'parcelado',
          total_installments = ?,
          amount_cents = ?,
          paid_amount_cents = ?,
          remaining_amount_cents = 0,
          updated_at = ?
      WHERE id = ?
    `).run(
      count,
      originalPaid,
      originalPaid,
      now,
      paymentId
    );

    return NextResponse.json({
      success: true,
      message: `Saldo parcelado em ${count} parcelas com sucesso.`,
      ids: createdIds,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao parcelar lançamento.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


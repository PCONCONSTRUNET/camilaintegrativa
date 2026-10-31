import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import { extractClientMetadata, recordAuditLog } from '@/lib/audit';
import { formatCurrency } from '@/lib/utils';

export async function GET(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const { paymentId } = await context.params;

  try {
    const database = getDatabase();
    const payment = (await database.prepare(`
      SELECT p.*, c.name as client_name, c.phone as client_phone, c.email as client_email, s.name as service_name
      FROM client_payments p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN services s ON s.id = p.service_id
      WHERE p.id = ? AND p.clinic_id = ?
    `).get(paymentId, IDS.clinic)) as Record<string, unknown> | undefined;

    if (!payment) {
      return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 });
    }

    const txRows = ((await database.prepare(`
      SELECT id, amount_cents, payment_method, paid_at, notes, created_at
      FROM payment_transactions
      WHERE payment_id = ?
      ORDER BY paid_at DESC
    `).all(paymentId)) as Array<Record<string, unknown>>) || [];

    return NextResponse.json({
      payment: {
        ...payment,
        transactions: txRows,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao buscar lançamento.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const { paymentId } = await context.params;

  try {
    const database = getDatabase();

    // Obter dados do pagamento antes de excluir para o log de auditoria
    const payment = (await database.prepare(`
      SELECT p.id, p.amount_cents, p.status, p.description, c.name as client_name, c.id as client_id
      FROM client_payments p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.id = ? AND p.clinic_id = ?
    `).get(paymentId, IDS.clinic)) as {
      id: string;
      amount_cents: number;
      status: string;
      description?: string | null;
      client_name?: string | null;
      client_id?: string | null;
    } | undefined;
    
    // Deletar transações do pagamento
    await database.prepare(`
      DELETE FROM payment_transactions WHERE payment_id = ?
    `).run(paymentId);

    // Se tiver parcelas filhas, deletar suas transações e registros
    await database.prepare(`
      DELETE FROM payment_transactions WHERE payment_id IN (SELECT id FROM client_payments WHERE parent_payment_id = ?)
    `).run(paymentId);

    await database.prepare(`
      DELETE FROM client_payments WHERE parent_payment_id = ? AND clinic_id = ?
    `).run(paymentId, IDS.clinic);

    // Deletar o próprio pagamento
    await database.prepare(`
      DELETE FROM client_payments WHERE id = ? AND clinic_id = ?
    `).run(paymentId, IDS.clinic);

    // Registrar log de auditoria financeira crítica
    const { ip, userAgent } = extractClientMetadata(request);
    const amountFormatted = payment ? formatCurrency(payment.amount_cents) : 'Valor não identificado';
    await recordAuditLog({
      clinicId: IDS.clinic,
      actorType: 'admin',
      actorId: currentUser.userId,
      actorName: currentUser.name,
      category: 'financeiro',
      action: 'pagamento_excluido',
      title: 'Exclusão de Lançamento Financeiro',
      description: `Lançamento de ${amountFormatted} (${payment?.description || 'sem descrição'}) vinculado a "${payment?.client_name || 'Paciente'}" excluído por ${currentUser.name}.`,
      severity: 'critico',
      ipAddress: ip,
      userAgent,
      details: {
        paymentId,
        amountCents: payment?.amount_cents,
        amountFormatted,
        status: payment?.status,
        description: payment?.description,
        clientId: payment?.client_id,
        clientName: payment?.client_name,
      },
    }).catch(() => null);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao cancelar lançamento.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


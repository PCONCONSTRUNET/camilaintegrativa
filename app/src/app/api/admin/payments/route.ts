import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { getDatabase, IDS } from '@/lib/db';
import { triggerPaymentIdentifiedReminder } from '@/lib/whatsapp-reminders';

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId');
  const status = url.searchParams.get('status');
  const method = url.searchParams.get('method');
  const entryType = url.searchParams.get('entryType'); // 'entrada' | 'saida' | 'todos'
  const category = url.searchParams.get('category');
  const period = url.searchParams.get('period') || 'mensal'; // 'hoje' | 'semanal' | 'mensal' | 'custom' | 'todos'
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const search = url.searchParams.get('search')?.trim().toLowerCase();

  try {
    const database = getDatabase();

    // Query principal com LEFT JOIN de cliente e serviço
    const query = `
      SELECT
        p.id, p.clinic_id, p.client_id, p.appointment_id, p.service_id, p.client_package_id,
        p.parent_payment_id, p.installment_number, p.total_installments, p.entry_type, p.category, p.charge_type,
        p.description, p.amount_cents, p.paid_amount_cents, p.remaining_amount_cents,
        p.discount_cents, p.payment_method, p.status, p.paid_at, p.due_at,
        p.receipt_url, p.notes, p.created_at, p.updated_at,
        c.name as client_name, c.phone as client_phone, c.email as client_email,
        s.name as service_name, s.price_cents as service_base_price
      FROM client_payments p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN services s ON s.id = p.service_id
      WHERE p.clinic_id = ?
      ORDER BY COALESCE(p.paid_at, p.due_at, p.created_at) DESC
    `;

    const rows = (await database.prepare(query).all(IDS.clinic)) as Array<Record<string, unknown>>;

    // Buscar transações
    const txQuery = `
      SELECT t.id, t.payment_id, t.client_id, t.amount_cents, t.payment_method, t.paid_at, t.notes, t.created_at
      FROM payment_transactions t
      WHERE t.clinic_id = ?
      ORDER BY t.paid_at DESC
    `;
    const txRows = ((await database.prepare(txQuery).all(IDS.clinic)) as Array<Record<string, unknown>>) || [];
    const txByPayment = new Map<string, Array<Record<string, unknown>>>();
    for (const tx of txRows) {
      const pid = String(tx.payment_id);
      if (!txByPayment.has(pid)) txByPayment.set(pid, []);
      txByPayment.get(pid)!.push(tx);
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Calcular intervalo de datas
    let fromDate = fromParam;
    let toDate = toParam;

    if (period === 'hoje') {
      fromDate = todayStr;
      toDate = todayStr;
    } else if (period === 'semanal') {
      const dayOfWeek = now.getDay(); // 0 = Domingo, 1 = Segunda...
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      fromDate = monday.toISOString().slice(0, 10);
      toDate = sunday.toISOString().slice(0, 10);
    } else if (period === 'mensal') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      fromDate = firstDay.toISOString().slice(0, 10);
      toDate = lastDay.toISOString().slice(0, 10);
    }

    const allPayments = rows.map((r) => {
      const id = String(r.id);
      const amountCents = Number(r.amount_cents ?? 0);
      let paidAmountCents = Number(r.paid_amount_cents ?? 0);
      let remainingAmountCents = Number(r.remaining_amount_cents ?? 0);
      const statusVal = String(r.status ?? 'pago');
      const dueAt = r.due_at ? String(r.due_at) : null;
      const typeVal = String(r.entry_type ?? 'entrada');

      if (statusVal === 'pago' && paidAmountCents === 0 && remainingAmountCents === 0 && amountCents > 0) {
        paidAmountCents = amountCents;
      }
      if (statusVal === 'pendente' && remainingAmountCents === 0 && amountCents > 0) {
        remainingAmountCents = amountCents;
      }

      const isOverdue = (statusVal === 'pendente' || statusVal === 'parcial') && dueAt && dueAt.slice(0, 10) < todayStr;

      const txs = (txByPayment.get(id) || []).map((t) => ({
        id: String(t.id),
        paymentId: String(t.payment_id),
        clientId: String(t.client_id),
        amountCents: Number(t.amount_cents ?? 0),
        paymentMethod: String(t.payment_method),
        paidAt: String(t.paid_at),
        notes: t.notes ? String(t.notes) : null,
        createdAt: String(t.created_at),
      }));

      return {
        id,
        clinicId: String(r.clinic_id),
        clientId: r.client_id ? String(r.client_id) : null,
        clientName: r.client_name ? String(r.client_name) : (typeVal === 'saida' ? 'Despesa Operacional' : 'Lançamento Avulso'),
        clientPhone: r.client_phone ? String(r.client_phone) : null,
        clientEmail: r.client_email ? String(r.client_email) : null,
        appointmentId: r.appointment_id ? String(r.appointment_id) : null,
        serviceId: r.service_id ? String(r.service_id) : null,
        serviceName: r.service_name ? String(r.service_name) : null,
        clientPackageId: r.client_package_id ? String(r.client_package_id) : null,
        parentPaymentId: r.parent_payment_id ? String(r.parent_payment_id) : null,
        installmentNumber: r.installment_number != null ? Number(r.installment_number) : null,
        totalInstallments: r.total_installments != null ? Number(r.total_installments) : null,
        entryType: typeVal as 'entrada' | 'saida',
        category: String(r.category ?? 'outros'),
        chargeType: String(r.charge_type ?? 'avulso'),
        description: String(r.description),
        amountCents,
        paidAmountCents,
        remainingAmountCents,
        discountCents: Number(r.discount_cents ?? 0),
        paymentMethod: String(r.payment_method ?? 'pix'),
        status: statusVal,
        isOverdue: Boolean(isOverdue),
        paidAt: r.paid_at ? String(r.paid_at) : null,
        dueAt,
        receiptUrl: r.receipt_url ? String(r.receipt_url) : null,
        notes: r.notes ? String(r.notes) : null,
        transactions: txs,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    // Filtros
    let filtered = allPayments;

    if (clientId) {
      filtered = filtered.filter((p) => p.clientId === clientId);
    }

    if (entryType && entryType !== 'todos') {
      filtered = filtered.filter((p) => p.entryType === entryType);
    }

    if (category && category !== 'todos') {
      filtered = filtered.filter((p) => p.category === category);
    }

    if (status && status !== 'todos') {
      if (status === 'vencido') {
        filtered = filtered.filter((p) => p.isOverdue);
      } else {
        filtered = filtered.filter((p) => p.status === status);
      }
    }

    if (method && method !== 'todos') {
      if (method === 'cartao') {
        filtered = filtered.filter((p) => p.paymentMethod === 'cartao' || p.paymentMethod === 'cartao_credito' || p.paymentMethod === 'cartao_debito');
      } else {
        filtered = filtered.filter((p) => p.paymentMethod === method);
      }
    }

    if (search) {
      filtered = filtered.filter(
        (p) =>
          p.clientName.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search) ||
          p.category.toLowerCase().includes(search) ||
          (p.serviceName && p.serviceName.toLowerCase().includes(search)) ||
          (p.notes && p.notes.toLowerCase().includes(search))
      );
    }

    if (fromDate || toDate) {
      filtered = filtered.filter((p) => {
        const refDate = (p.paidAt || p.dueAt || p.createdAt).slice(0, 10);
        if (fromDate && refDate < fromDate) return false;
        if (toDate && refDate > toDate) return false;
        return true;
      });
    }

    // ==========================================
    // CÁLCULOS DO DRE (DEMONSTRATIVO DE RESULTADOS DO EXERCÍCIO)
    // ==========================================
    const dreEntries = filtered;

    // 1. Receita Bruta (Total cobrado de sessões, pacotes, entradas)
    const receitaBrutaCents = dreEntries
      .filter((p) => p.entryType === 'entrada' && p.status !== 'cancelado')
      .reduce((acc, p) => acc + (p.amountCents + p.discountCents), 0);

    // 2. Deduções e Descontos Concedidos
    const deducoesDescontosCents = dreEntries
      .filter((p) => p.entryType === 'entrada' && p.status !== 'cancelado')
      .reduce((acc, p) => acc + p.discountCents, 0);

    // 3. Receita Operacional Líquida (Faturado após desconto)
    const receitaLiquidaCents = Math.max(0, receitaBrutaCents - deducoesDescontosCents);

    // 4. Receita Efetivamente Realizada em Caixa
    const receitaRealizadaCaixaCents = dreEntries
      .filter((p) => p.entryType === 'entrada')
      .reduce((acc, p) => acc + p.paidAmountCents, 0);

    // 5. Custos Diretos / Variáveis (Taxas de maquininha, suprimentos diretos)
    const custosVariaveisCents = dreEntries
      .filter((p) => p.entryType === 'saida' && (p.category === 'taxas_bancarias' || p.category === 'materiais_suprimentos'))
      .reduce((acc, p) => acc + p.amountCents, 0);

    // 6. Lucro Bruto (Receita Líquida - Custos Diretos)
    const lucroBrutoCents = receitaLiquidaCents - custosVariaveisCents;
    const margemBrutaPct = receitaLiquidaCents > 0 ? Math.round((lucroBrutoCents / receitaLiquidaCents) * 100) : 0;

    // 7. Despesas Operacionais / Fixas
    const despesasOperacionaisCents = dreEntries
      .filter((p) => p.entryType === 'saida' && p.category !== 'taxas_bancarias' && p.category !== 'materiais_suprimentos')
      .reduce((acc, p) => acc + p.amountCents, 0);

    // 8. Total Geral de Despesas / Saídas
    const totalDespesasCents = custosVariaveisCents + despesasOperacionaisCents;
    const totalDespesasPagasCents = dreEntries
      .filter((p) => p.entryType === 'saida')
      .reduce((acc, p) => acc + p.paidAmountCents, 0);

    // 9. Lucro Líquido do Período (Lucro Bruto - Despesas Operacionais)
    const lucroLiquidoCents = lucroBrutoCents - despesasOperacionaisCents;
    const margemLiquidaPct = receitaLiquidaCents > 0 ? Math.round((lucroLiquidoCents / receitaLiquidaCents) * 100) : 0;

    // 10. Saldo Líquido de Caixa (Efetivamente Recebido - Efetivamente Pago)
    const saldoLiquidoCaixaCents = receitaRealizadaCaixaCents - totalDespesasPagasCents;

    // 11. A Receber e A Pagar Futuros
    const totalAReceberCents = dreEntries
      .filter((p) => p.entryType === 'entrada' && p.status !== 'cancelado')
      .reduce((acc, p) => acc + p.remainingAmountCents, 0);

    const totalAPagarCents = dreEntries
      .filter((p) => p.entryType === 'saida' && p.status !== 'cancelado')
      .reduce((acc, p) => acc + p.remainingAmountCents, 0);

    const totalVencidoCents = dreEntries
      .filter((p) => p.isOverdue)
      .reduce((acc, p) => acc + p.remainingAmountCents, 0);

    // ==========================================
    // RANKING E DESTAQUE POR SERVIÇO
    // ==========================================
    const serviceStatsMap = new Map<string, { serviceName: string; count: number; totalCents: number; paidCents: number }>();
    for (const p of dreEntries) {
      if (p.entryType === 'entrada' && p.status !== 'cancelado') {
        const sName = p.serviceName || p.description.split('-')[0].trim() || 'Serviço Avulso';
        if (!serviceStatsMap.has(sName)) {
          serviceStatsMap.set(sName, { serviceName: sName, count: 0, totalCents: 0, paidCents: 0 });
        }
        const item = serviceStatsMap.get(sName)!;
        item.count += 1;
        item.totalCents += p.amountCents;
        item.paidCents += p.paidAmountCents;
      }
    }

    const servicesHighlight = Array.from(serviceStatsMap.values())
      .sort((a, b) => b.totalCents - a.totalCents)
      .map((s) => ({
        ...s,
        pctOfTotal: receitaLiquidaCents > 0 ? Math.round((s.totalCents / receitaLiquidaCents) * 100) : 0,
        averageTicketCents: s.count > 0 ? Math.round(s.totalCents / s.count) : 0,
      }));

    // ==========================================
    // DISTRIBUIÇÃO POR CATEGORIA DE DESPESA
    // ==========================================
    const expenseCategoryMap = new Map<string, { category: string; count: number; totalCents: number }>();
    for (const p of dreEntries) {
      if (p.entryType === 'saida' && p.status !== 'cancelado') {
        if (!expenseCategoryMap.has(p.category)) {
          expenseCategoryMap.set(p.category, { category: p.category, count: 0, totalCents: 0 });
        }
        const c = expenseCategoryMap.get(p.category)!;
        c.count += 1;
        c.totalCents += p.amountCents;
      }
    }

    const expensesByCategory = Array.from(expenseCategoryMap.values())
      .sort((a, b) => b.totalCents - a.totalCents)
      .map((e) => ({
        ...e,
        pctOfTotal: totalDespesasCents > 0 ? Math.round((e.totalCents / totalDespesasCents) * 100) : 0,
      }));

    // ==========================================
    // DISTRIBUIÇÃO POR FORMA DE PAGAMENTO (PIX, CARTÃO, DINHEIRO)
    // ==========================================
    const methodCounts: Record<string, { count: number; totalCents: number }> = {
      pix: { count: 0, totalCents: 0 },
      cartao: { count: 0, totalCents: 0 },
      dinheiro: { count: 0, totalCents: 0 },
    };

    for (const p of filtered) {
      if (p.paidAmountCents > 0) {
        const rawMethod = p.paymentMethod;
        const m =
          rawMethod === 'cartao' || rawMethod === 'cartao_credito' || rawMethod === 'cartao_debito'
            ? 'cartao'
            : rawMethod === 'dinheiro'
              ? 'dinheiro'
              : 'pix';
        methodCounts[m].count += 1;
        methodCounts[m].totalCents += p.paidAmountCents;
      }
    }

    const totalVolumeMethods = receitaRealizadaCaixaCents + totalDespesasPagasCents;

    // Tendência diária/mensal para gráficos de alta tecnologia
    const trendMap: Record<string, { label: string; dateStr: string; receivedCents: number; expenseCents: number; netCents: number }> = {};

    if (period === 'hoje') {
      const hours = [8, 10, 12, 14, 16, 18, 20, 22];
      for (const h of hours) {
        const label = `${String(h).padStart(2, '0')}:00`;
        trendMap[label] = { label, dateStr: label, receivedCents: 0, expenseCents: 0, netCents: 0 };
      }
      for (const p of filtered) {
        const d = new Date(p.paidAt || p.createdAt);
        const hour = d.getHours();
        let closest = hours[0];
        let minDiff = Math.abs(hour - hours[0]);
        for (const h of hours) {
          const diff = Math.abs(hour - h);
          if (diff < minDiff) {
            minDiff = diff;
            closest = h;
          }
        }
        const bucket = `${String(closest).padStart(2, '0')}:00`;
        if (trendMap[bucket]) {
          if (p.entryType === 'entrada') trendMap[bucket].receivedCents += p.paidAmountCents;
          else trendMap[bucket].expenseCents += p.paidAmountCents;
          trendMap[bucket].netCents = trendMap[bucket].receivedCents - trendMap[bucket].expenseCents;
        }
      }
    } else if (period === 'semanal') {
      const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
      days.forEach((day) => {
        trendMap[day] = { label: day, dateStr: day, receivedCents: 0, expenseCents: 0, netCents: 0 };
      });
      for (const p of filtered) {
        const d = new Date(p.paidAt || p.dueAt || p.createdAt);
        const dayIdx = (d.getDay() + 6) % 7; // Seg = 0 ... Dom = 6
        const key = days[dayIdx];
        if (trendMap[key]) {
          if (p.entryType === 'entrada') trendMap[key].receivedCents += p.paidAmountCents;
          else trendMap[key].expenseCents += p.paidAmountCents;
          trendMap[key].netCents = trendMap[key].receivedCents - trendMap[key].expenseCents;
        }
      }
    } else if ((period === 'personalizado' || period === 'custom') && fromDate && toDate) {
      const start = new Date(fromDate + 'T00:00:00');
      const end = new Date(toDate + 'T23:59:59');
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 31 && diffDays >= 0) {
        const curr = new Date(start);
        while (curr <= end) {
          const dateStr = curr.toISOString().slice(0, 10);
          const label = curr.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          trendMap[dateStr] = { label, dateStr, receivedCents: 0, expenseCents: 0, netCents: 0 };
          curr.setDate(curr.getDate() + 1);
        }
        for (const p of filtered) {
          const dateStr = (p.paidAt || p.dueAt || p.createdAt).slice(0, 10);
          if (trendMap[dateStr]) {
            if (p.entryType === 'entrada') trendMap[dateStr].receivedCents += p.paidAmountCents;
            else trendMap[dateStr].expenseCents += p.paidAmountCents;
            trendMap[dateStr].netCents = trendMap[dateStr].receivedCents - trendMap[dateStr].expenseCents;
          }
        }
      } else {
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
          trendMap[key] = { label, dateStr: key, receivedCents: 0, expenseCents: 0, netCents: 0 };
        }
        for (const p of filtered) {
          const dateKey = (p.paidAt || p.dueAt || p.createdAt).slice(0, 7);
          if (trendMap[dateKey]) {
            if (p.entryType === 'entrada') trendMap[dateKey].receivedCents += p.paidAmountCents;
            else trendMap[dateKey].expenseCents += p.paidAmountCents;
            trendMap[dateKey].netCents = trendMap[dateKey].receivedCents - trendMap[dateKey].expenseCents;
          }
        }
      }
    } else {
      // Mensal / Últimos 6 meses
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
        trendMap[key] = { label, dateStr: key, receivedCents: 0, expenseCents: 0, netCents: 0 };
      }
      for (const p of allPayments) {
        const dateKey = (p.paidAt || p.dueAt || p.createdAt).slice(0, 7);
        if (trendMap[dateKey]) {
          if (p.entryType === 'entrada') trendMap[dateKey].receivedCents += p.paidAmountCents;
          else trendMap[dateKey].expenseCents += p.paidAmountCents;
          trendMap[dateKey].netCents = trendMap[dateKey].receivedCents - trendMap[dateKey].expenseCents;
        }
      }
    }

    return NextResponse.json({
      payments: filtered,
      periodInfo: {
        period,
        fromDate,
        toDate,
      },
      dre: {
        receitaBrutaCents,
        deducoesDescontosCents,
        receitaLiquidaCents,
        receitaRealizadaCaixaCents,
        custosVariaveisCents,
        lucroBrutoCents,
        margemBrutaPct,
        despesasOperacionaisCents,
        totalDespesasCents,
        totalDespesasPagasCents,
        lucroLiquidoCents,
        margemLiquidaPct,
        saldoLiquidoCaixaCents,
        totalAReceberCents,
        totalAPagarCents,
        totalVencidoCents,
      },
      servicesHighlight,
      expensesByCategory,
      methodBreakdown: Object.entries(methodCounts).map(([m, data]) => ({
        method: m,
        count: data.count,
        totalCents: data.totalCents,
        pct: totalVolumeMethods > 0 ? Math.round((data.totalCents / totalVolumeMethods) * 100) : 0,
      })),
      timelineData: Object.values(trendMap),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao listar pagamentos.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    const body = await request.json();
    const {
      entryType = 'entrada', // 'entrada' | 'saida'
      category = 'outros',
      clientId = null,
      serviceId,
      appointmentId,
      clientPackageId,
      description,
      amountCents,
      discountCents = 0,
      billingType = 'avista', // 'avista', 'parcial', 'parcelado'
      paymentMethod = 'pix',
      status = 'pago',
      paidAt,
      dueAt,
      notes,
      initialPaidCents = 0,
      installmentsCount = 1,
      intervalDays = 30,
      firstDueDate,
      firstPaid = false,
      allPaid = false,
    } = body;

    if (!description || amountCents == null) {
      return NextResponse.json({ error: 'Informe a descrição e o valor da movimentação.' }, { status: 400 });
    }

    const totalGross = Math.max(0, parseInt(amountCents, 10));
    const discount = Math.max(0, parseInt(discountCents, 10));
    const netTotal = Math.max(0, totalGross - discount);

    const database = getDatabase();
    const now = new Date().toISOString();
    const createdIds: string[] = [];

    if (billingType === 'avista') {
      const isPaid = status === 'pago';
      const paidAmount = isPaid ? netTotal : 0;
      const remainingAmount = isPaid ? 0 : netTotal;
      const effectivePaidAt = isPaid ? (paidAt || now) : null;
      const effectiveDueAt = dueAt || (isPaid ? null : now.slice(0, 10));
      const paymentId = randomUUID();

      await database.prepare(`
        INSERT INTO client_payments (
          id, clinic_id, client_id, appointment_id, service_id, client_package_id,
          entry_type, category, charge_type, description, amount_cents, paid_amount_cents, remaining_amount_cents,
          discount_cents, payment_method, status, paid_at, due_at,
          notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'avulso', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        paymentId,
        IDS.clinic,
        clientId || null,
        appointmentId || null,
        serviceId || null,
        clientPackageId || null,
        entryType,
        category,
        description.trim(),
        netTotal,
        paidAmount,
        remainingAmount,
        discount,
        paymentMethod,
        isPaid ? 'pago' : 'pendente',
        effectivePaidAt,
        effectiveDueAt,
        notes || null,
        currentUser.userId,
        now,
        now
      );

      if (isPaid && paidAmount > 0 && clientId) {
        await database.prepare(`
          INSERT INTO payment_transactions (
            id, clinic_id, payment_id, client_id, amount_cents, payment_method, paid_at, notes, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          IDS.clinic,
          paymentId,
          clientId,
          paidAmount,
          paymentMethod,
          effectivePaidAt,
          notes || (entryType === 'saida' ? 'Saída liquidada' : 'Pagamento à vista liquidado'),
          currentUser.userId,
          now
        );
      }

      createdIds.push(paymentId);
    } else if (billingType === 'parcial') {
      const initialPaid = Math.min(netTotal, Math.max(0, parseInt(initialPaidCents, 10)));
      const remainingAmount = Math.max(0, netTotal - initialPaid);
      const isFullyPaid = remainingAmount === 0;
      const statusVal = isFullyPaid ? 'pago' : initialPaid > 0 ? 'parcial' : 'pendente';
      const effectivePaidAt = initialPaid > 0 ? (paidAt || now) : null;
      const effectiveDueAt = dueAt || (remainingAmount > 0 ? now.slice(0, 10) : null);
      const paymentId = randomUUID();

      await database.prepare(`
        INSERT INTO client_payments (
          id, clinic_id, client_id, appointment_id, service_id, client_package_id,
          entry_type, category, charge_type, description, amount_cents, paid_amount_cents, remaining_amount_cents,
          discount_cents, payment_method, status, paid_at, due_at,
          notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'parcial', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        paymentId,
        IDS.clinic,
        clientId || null,
        appointmentId || null,
        serviceId || null,
        clientPackageId || null,
        entryType,
        category,
        description.trim(),
        netTotal,
        initialPaid,
        remainingAmount,
        discount,
        paymentMethod,
        statusVal,
        effectivePaidAt,
        effectiveDueAt,
        notes || null,
        currentUser.userId,
        now,
        now
      );

      if (initialPaid > 0 && clientId) {
        await database.prepare(`
          INSERT INTO payment_transactions (
            id, clinic_id, payment_id, client_id, amount_cents, payment_method, paid_at, notes, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          IDS.clinic,
          paymentId,
          clientId,
          initialPaid,
          paymentMethod,
          effectivePaidAt,
          notes ? `Entrada parcial: ${notes}` : 'Entrada / Pagamento parcial registrado',
          currentUser.userId,
          now
        );
      }

      createdIds.push(paymentId);
    } else if (billingType === 'parcelado') {
      const numInstallments = Math.max(1, parseInt(installmentsCount, 10) || 1);
      const parentId = randomUUID();
      const baseAmount = Math.floor(netTotal / numInstallments);
      const remainder = netTotal % numInstallments;
      const startDueDate = firstDueDate ? new Date(firstDueDate) : new Date();

      for (let i = 1; i <= numInstallments; i++) {
        const installmentId = randomUUID();
        const installmentAmount = i === 1 ? baseAmount + remainder : baseAmount;

        const dueDateObj = new Date(startDueDate);
        dueDateObj.setDate(dueDateObj.getDate() + (i - 1) * (parseInt(intervalDays, 10) || 30));
        const installmentDueAt = dueDateObj.toISOString().slice(0, 10);

        const isPaid = allPaid || (i === 1 && firstPaid);
        const paidAmount = isPaid ? installmentAmount : 0;
        const remainingAmount = isPaid ? 0 : installmentAmount;
        const effectivePaidAt = isPaid ? now : null;

        await database.prepare(`
          INSERT INTO client_payments (
            id, clinic_id, client_id, appointment_id, service_id, client_package_id,
            parent_payment_id, installment_number, total_installments,
            entry_type, category, charge_type,
            description, amount_cents, paid_amount_cents, remaining_amount_cents,
            discount_cents, payment_method, status, paid_at, due_at,
            notes, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'parcelado', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          installmentId,
          IDS.clinic,
          clientId || null,
          appointmentId || null,
          serviceId || null,
          clientPackageId || null,
          parentId,
          i,
          numInstallments,
          entryType,
          category,
          `${description.trim()} (${i}/${numInstallments})`,
          installmentAmount,
          paidAmount,
          remainingAmount,
          i === 1 ? discount : 0,
          paymentMethod,
          isPaid ? 'pago' : 'pendente',
          effectivePaidAt,
          installmentDueAt,
          notes ? `Parcela ${i}/${numInstallments}. ${notes}` : `Parcela ${i}/${numInstallments}`,
          currentUser.userId,
          now,
          now
        );

        if (isPaid && paidAmount > 0 && clientId) {
          await database.prepare(`
            INSERT INTO payment_transactions (
              id, clinic_id, payment_id, client_id, amount_cents, payment_method, paid_at, notes, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            randomUUID(),
            IDS.clinic,
            installmentId,
            clientId,
            paidAmount,
            paymentMethod,
            effectivePaidAt,
            `Liquidação da parcela ${i}/${numInstallments}`,
            currentUser.userId,
            now
          );
        }

        createdIds.push(installmentId);
      }
    }

    if (clientId && entryType === 'entrada' && createdIds.length > 0) {
      const firstId = createdIds[0];
      const pRow = (await database.prepare(`
        SELECT p.id, p.description, p.amount_cents, p.paid_amount_cents, p.remaining_amount_cents,
               c.name AS client_name, c.phone AS client_phone, s.name AS service_name
        FROM client_payments p
        LEFT JOIN clients c ON c.id = p.client_id
        LEFT JOIN services s ON s.id = p.service_id
        WHERE p.id = ?
      `).get(firstId)) as {
        id: string;
        description: string;
        amount_cents: number;
        paid_amount_cents: number;
        remaining_amount_cents: number;
        client_name: string | null;
        client_phone: string | null;
        service_name: string | null;
      } | undefined;

      if (pRow && Number(pRow.paid_amount_cents ?? 0) > 0 && pRow.client_phone) {
        await triggerPaymentIdentifiedReminder({
          paymentId: pRow.id,
          clientId,
          clientName: pRow.client_name || 'Cliente',
          clientPhone: pRow.client_phone,
          serviceName: pRow.service_name || pRow.description || 'Atendimento Clínico',
          description: pRow.description,
          amountPaidNowCents: Number(pRow.paid_amount_cents),
          totalInvoiceNetCents: Number(pRow.amount_cents),
          remainingCents: Number(pRow.remaining_amount_cents ?? 0),
          paymentMethod,
        }).catch(() => null);
      }
    }

    return NextResponse.json({ success: true, count: createdIds.length, ids: createdIds }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao lançar movimentação.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import type { AppointmentSummary, AppointmentStatus } from '@/lib/domain';
import { formatCurrency, STATUS_COLORS, STATUS_LABELS } from '@/lib/utils';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { getInstantCache, setInstantCache } from '@/lib/client-cache';

type EnrichedAppointment = AppointmentSummary & {
  clientPhone?: string | null;
};

type DashboardPaymentItem = {
  id: string;
  paymentId?: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string | null;
  entryType?: string;
  description: string;
  movementLabel?: string;
  amountCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  discountCents: number;
  paymentMethod: string;
  status: string;
  paidAt?: string | null;
  dueAt: string | null;
  createdAt?: string;
  isOverdue: boolean;
};

type DashboardData = {
  date: string;
  appointments: EnrichedAppointment[];
  upcomingAppointments?: EnrichedAppointment[];
  pendingRequests?: EnrichedAppointment[];
  allAppointments?: EnrichedAppointment[];
  stats: {
    sessionsToday: number;
    completedToday?: number;
    confirmedToday?: number;
    pending: number;
    activeClients: number;
  };
  financial?: {
    receivedMonthCents: number;
    expensesMonthCents: number;
    netMonthCents: number;
    receivedTodayCents: number;
    receivedWeekCents?: number;
    receivedTotalCents?: number;
    openReceivablesCents: number;
    openReceivablesCount: number;
    overdueCount: number;
    openPayments: DashboardPaymentItem[];
    recentPayments?: DashboardPaymentItem[];
  };
};

function time(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function shortDate(iso: string, todayKey: string) {
  if (!iso) return '—';
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(iso)
  );
  if (dateKey === todayKey) return 'Hoje';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(iso));
}

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
  );
  if (hour >= 5 && hour < 12) return 'Bom dia, Camila';
  if (hour >= 12 && hour < 18) return 'Boa tarde, Camila';
  return 'Boa noite, Camila';
}

function methodLabel(m: string) {
  const clean = (m || 'pix').toLowerCase();
  if (clean.includes('cartao')) return 'Cartão';
  if (clean.includes('dinheiro')) return 'Dinheiro';
  return 'PIX';
}

function methodIconUrl(m: string) {
  const clean = (m || 'pix').toLowerCase();
  if (clean.includes('cartao')) return 'https://img.icons8.com/color/48/bank-card-back-side.png';
  if (clean.includes('dinheiro')) return 'https://img.icons8.com/offices/30/money.png';
  return 'https://img.icons8.com/fluency/48/pix.png';
}

function MethodBadge({ method, size = 14 }: { method: string; size?: number }) {
  const label = methodLabel(method);
  const src = methodIconUrl(method);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: '#0f172a' }}>
      <img
        width={size}
        height={size}
        src={src}
        alt={label}
        style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle' }}
      />
      <span>{label}</span>
    </span>
  );
}

let cachedDashboard: DashboardData | null = null;

function defaultDashboardData(): DashboardData {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date()
  );
  return {
    date: today,
    appointments: [],
    upcomingAppointments: [],
    pendingRequests: [],
    allAppointments: [],
    stats: { sessionsToday: 0, completedToday: 0, confirmedToday: 0, pending: 0, activeClients: 0 },
    financial: {
      receivedMonthCents: 0,
      expensesMonthCents: 0,
      netMonthCents: 0,
      receivedTodayCents: 0,
      receivedWeekCents: 0,
      receivedTotalCents: 0,
      openReceivablesCents: 0,
      openReceivablesCount: 0,
      overdueCount: 0,
      openPayments: [],
      recentPayments: [],
    },
  };
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData>(() =>
    getInstantCache<DashboardData>('admin_dashboard', defaultDashboardData())
  );
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  // Filtros simples e diretos
  const [periodFilter, setPeriodFilter] = useState<'hoje' | 'semana' | 'mes' | 'tudo'>('mes');
  const [agendaFilter, setAgendaFilter] = useState<'hoje' | 'proximos' | 'recentes'>('hoje');
  const [payFilter, setPayFilter] = useState<'todos' | 'pagos' | 'aberto'>('todos');

  // Modais compactos de visualização rápida
  const [selectedPayment, setSelectedPayment] = useState<DashboardPaymentItem | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<EnrichedAppointment | null>(null);
  const { confirmDialog, dialogNode } = useConfirmDialog();

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/dashboard', { cache: 'no-store' });
    if (!response.ok) return setError('Não foi possível carregar o painel.');
    const body = await response.json();
    setInstantCache('admin_dashboard', body);
    setData(body);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/dashboard', { cache: 'no-store' })
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => {
        if (!active) return;
        if (!ok) setError('Não foi possível carregar o painel.');
        else {
          setInstantCache('admin_dashboard', body);
          setData(body);
          const todayActive = (body.appointments ?? []).filter(
            (a: EnrichedAppointment) => a.status !== 'cancelado'
          );
          if (todayActive.length === 0) {
            if ((body.upcomingAppointments ?? []).length > 0) setAgendaFilter('proximos');
            else if ((body.allAppointments ?? []).length > 0) setAgendaFilter('recentes');
          }
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function changeStatus(id: string, status: AppointmentStatus) {
    if (status === 'cancelado') {
      const targetApt =
        (data.allAppointments ?? []).find((a) => a.id === id) ||
        (data.appointments ?? []).find((a) => a.id === id) ||
        selectedAppointment;
      const { confirmed } = await confirmDialog({
        title: 'Cancelar agendamento',
        description: 'Deseja realmente cancelar este agendamento? O horário será liberado na agenda.',
        highlightText: targetApt ? `${targetApt.clientName} — ${targetApt.serviceName}` : undefined,
        confirmLabel: 'Sim, cancelar',
        cancelLabel: 'Manter agendamento',
        variant: 'danger',
      });
      if (!confirmed) return;
    }
    setUpdating(id);
    const response = await fetch(`/api/admin/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setUpdating(null);
    if (!response.ok) return setError('Não foi possível atualizar o agendamento.');
    if (selectedAppointment?.id === id) {
      setSelectedAppointment((prev) => (prev ? { ...prev, status } : null));
    }
    await load();
  }

  const formattedDate = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(`${data.date}T12:00:00-03:00`));

  const todayList = data.appointments.filter((item) => item.status !== 'cancelado');
  const upcomingList = data.upcomingAppointments ?? [];
  const allAppointmentsList = data.allAppointments ?? [];
  const pendingList =
    data.pendingRequests ?? data.appointments.filter((item) => item.status === 'solicitado');

  const fin = data.financial ?? {
    receivedMonthCents: 0,
    expensesMonthCents: 0,
    netMonthCents: 0,
    receivedTodayCents: 0,
    receivedWeekCents: 0,
    receivedTotalCents: 0,
    openReceivablesCents: 0,
    openReceivablesCount: 0,
    overdueCount: 0,
    openPayments: [],
    recentPayments: [],
  };

  // Receita exibida de acordo com o filtro de período selecionado no topo
  const displayedReceivedCents =
    periodFilter === 'hoje'
      ? fin.receivedTodayCents
      : periodFilter === 'semana'
        ? (fin.receivedWeekCents ?? fin.receivedMonthCents)
        : periodFilter === 'mes'
          ? fin.receivedMonthCents
          : (fin.receivedTotalCents ?? fin.receivedMonthCents);

  const periodLabel =
    periodFilter === 'hoje'
      ? 'Recebido hoje'
      : periodFilter === 'semana'
        ? 'Recebido (7 dias)'
        : periodFilter === 'mes'
          ? 'Recebido no mês'
          : 'Recebido (geral)';

  // Lista de agendamentos filtrada
  const filteredAgenda = useMemo(() => {
    if (agendaFilter === 'hoje') return todayList;
    if (agendaFilter === 'proximos') return upcomingList.slice(0, 6);
    return allAppointmentsList.slice(0, 6);
  }, [agendaFilter, todayList, upcomingList, allAppointmentsList]);

  // Últimos 5 pagamentos filtrados (exibidos na seção dedicada abaixo)
  const lastFivePayments = useMemo(() => {
    const base = fin.recentPayments && fin.recentPayments.length > 0 ? fin.recentPayments : fin.openPayments;
    const filtered = base.filter((p) => {
      if (payFilter === 'aberto') return p.remainingAmountCents > 0;
      if (payFilter === 'pagos') return p.paidAmountCents > 0 && p.remainingAmountCents === 0;
      return true;
    });
    return filtered.slice(0, 5);
  }, [fin.recentPayments, fin.openPayments, payFilter]);

  if (error) {
    return (
      <div className="state-panel error-state">
        <AlertCircle size={28} />
        <h2>Algo deu errado</h2>
        <p>{error}</p>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setError('');
            load();
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* CABEÇALHO + FILTRO DE PERÍODO */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <span className="eyebrow">Resumo operacional</span>
          <h1>{getGreeting()}</h1>
          <p className="capitalize">{formattedDate}</p>
        </div>

        <div className="header-actions" style={{ alignItems: 'center' }}>
          {/* Filtro rápido de período */}
          <div className="filter-tabs" style={{ padding: '3px', borderRadius: '10px' }}>
            {[
              { key: 'hoje', label: 'Hoje' },
              { key: 'semana', label: '7 dias' },
              { key: 'mes', label: 'Mês' },
              { key: 'tudo', label: 'Geral' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={periodFilter === item.key ? 'active' : ''}
                onClick={() => {
                  setPeriodFilter(item.key as typeof periodFilter);
                  if (item.key === 'hoje') setAgendaFilter('hoje');
                  else if (item.key === 'tudo') setAgendaFilter('recentes');
                }}
                style={{ padding: '6px 10px', fontSize: '12px' }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Link href="/admin/agenda" className="btn btn-primary btn-sm" style={{ padding: '8px 14px' }}>
            <CalendarDays size={15} /> Abrir agenda
          </Link>
          <Link href="/admin/financeiro" className="btn btn-secondary btn-sm" style={{ padding: '8px 14px' }}>
            <Wallet size={15} /> Financeiro
          </Link>
        </div>
      </div>

      {/* 4 INDICADORES ESSENCIAIS (2x2 no celular, 4 em linha no PC) */}
      <div className="stats-grid">
        <Link href="/admin/agenda" className="metric-card" style={{ textDecoration: 'none' }}>
          <span className="metric-icon blue">
            <CalendarDays size={19} />
          </span>
          <div>
            <strong>{data.stats.sessionsToday}</strong>
            <span>Sessões hoje</span>
          </div>
        </Link>

        <Link href="/admin/agenda" className="metric-card" style={{ textDecoration: 'none' }}>
          <span className="metric-icon amber">
            <Clock3 size={19} />
          </span>
          <div>
            <strong>{data.stats.pending}</strong>
            <span>Solicitações</span>
          </div>
        </Link>

        <Link href="/admin/financeiro" className="metric-card" style={{ textDecoration: 'none' }}>
          <span className="metric-icon green">
            <TrendingUp size={19} />
          </span>
          <div>
            <strong style={{ fontSize: '19px', color: '#15803d' }}>
              {formatCurrency(displayedReceivedCents)}
            </strong>
            <span>
              {periodFilter !== 'hoje' && fin.receivedTodayCents > 0
                ? `${periodLabel} · Hoje: +${formatCurrency(fin.receivedTodayCents)}`
                : periodLabel}
            </span>
          </div>
        </Link>

        <Link href="/admin/financeiro" className="metric-card" style={{ textDecoration: 'none' }}>
          <span className="metric-icon amber">
            <CreditCard size={19} />
          </span>
          <div>
            <strong
              style={{
                fontSize: '19px',
                color: fin.openReceivablesCents > 0 ? '#b45309' : 'var(--color-text)',
              }}
            >
              {formatCurrency(fin.openReceivablesCents)}
            </strong>
            <span>
              {fin.openReceivablesCount > 0
                ? `${fin.openReceivablesCount} pagamento(s) em aberto`
                : 'Em aberto'}
            </span>
          </div>
        </Link>
      </div>

      {/* 2 COLUNAS PRINCIPAIS: AGENDAMENTOS & SALDOS EM ABERTO */}
      <div className="dashboard-grid">
        {/* COLUNA 1: AGENDAMENTOS COM FILTRO */}
        <section className="card dashboard-card">
          <div className="section-heading" style={{ flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <div>
              <span className="eyebrow">Agenda</span>
              <h2>
                {agendaFilter === 'hoje'
                  ? 'Agendamentos de hoje'
                  : agendaFilter === 'proximos'
                    ? 'Próximos atendimentos'
                    : 'Últimos agendamentos'}
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div className="filter-tabs" style={{ padding: '2px', borderRadius: '9px' }}>
                <button
                  type="button"
                  className={agendaFilter === 'hoje' ? 'active' : ''}
                  onClick={() => setAgendaFilter('hoje')}
                  style={{ padding: '4px 9px', fontSize: '11.5px' }}
                >
                  Hoje ({todayList.length})
                </button>
                <button
                  type="button"
                  className={agendaFilter === 'proximos' ? 'active' : ''}
                  onClick={() => setAgendaFilter('proximos')}
                  style={{ padding: '4px 9px', fontSize: '11.5px' }}
                >
                  Próximos ({upcomingList.length})
                </button>
                <button
                  type="button"
                  className={agendaFilter === 'recentes' ? 'active' : ''}
                  onClick={() => setAgendaFilter('recentes')}
                  style={{ padding: '4px 9px', fontSize: '11.5px' }}
                >
                  Recentes ({allAppointmentsList.length})
                </button>
              </div>

              <Link href="/admin/agenda" className="text-link" style={{ fontSize: '12.5px' }}>
                Agenda <ChevronRight size={14} />
              </Link>
            </div>
          </div>

          {/* Se houver solicitações pendentes, destaca no topo */}
          {pendingList.length > 0 && (
            <div
              style={{
                marginBottom: '12px',
                padding: '10px 12px',
                borderRadius: '11px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  color: '#b45309',
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                }}
              >
                ⏳ {pendingList.length} solicitação(ões) aguardando confirmação
              </span>
              {pendingList.map((req) => (
                <article
                  key={req.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    paddingTop: '4px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '13px', color: '#0f172a' }}>
                      {req.clientName}
                    </strong>
                    <span style={{ fontSize: '11.5px', color: '#92400e' }}>
                      {shortDate(req.startAt, data.date)} às {time(req.startAt)} · {req.serviceName}
                    </span>
                  </div>
                  <div className="request-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={updating === req.id}
                      onClick={() => changeStatus(req.id, 'confirmado')}
                    >
                      <CheckCircle2 size={13} /> Confirmar
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={updating === req.id}
                      onClick={() => changeStatus(req.id, 'cancelado')}
                    >
                      Recusar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {filteredAgenda.length > 0 ? (
            <div className="appointment-list">
              {filteredAgenda.map((appointment) => (
                <article
                  className="appointment-row"
                  key={appointment.id}
                  onClick={() => setSelectedAppointment(appointment)}
                  style={{ cursor: 'pointer', padding: '11px 4px' }}
                >
                  <time style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                    {agendaFilter !== 'hoje' && (
                      <small style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                        {shortDate(appointment.startAt, data.date)}
                      </small>
                    )}
                    <span>{time(appointment.startAt)}</span>
                  </time>
                  <span className="appointment-line" />
                  <div className="appointment-copy">
                    <strong style={{ fontSize: '13.5px', color: 'var(--color-text)' }}>
                      {appointment.clientName}
                    </strong>
                    <span>
                      {appointment.serviceName} · {appointment.modality}
                    </span>
                  </div>
                  <span className={`badge ${STATUS_COLORS[appointment.status]}`}>
                    {STATUS_LABELS[appointment.status]}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <CalendarDays size={24} />
              <h3>
                {agendaFilter === 'hoje'
                  ? 'Nenhum atendimento hoje'
                  : 'Nenhum atendimento encontrado'}
              </h3>
              <p>A agenda está livre para este filtro.</p>
            </div>
          )}
        </section>

        {/* COLUNA 2: PAGAMENTOS & SALDOS EM ABERTO */}
        <section className="card dashboard-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Financeiro</span>
              <h2>Pagamentos & saldos</h2>
            </div>
            <Link href="/admin/financeiro" className="text-link">
              Ver tudo <ChevronRight size={15} />
            </Link>
          </div>

          {/* Mini resumo rápido */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                padding: '9px 11px',
                borderRadius: '10px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#15803d',
                  textTransform: 'uppercase',
                }}
              >
                ✓ {periodLabel}
              </span>
              <strong style={{ fontSize: '14.5px', fontWeight: 800, color: '#14532d' }}>
                {formatCurrency(displayedReceivedCents)}
              </strong>
            </div>

            <div
              style={{
                padding: '9px 11px',
                borderRadius: '10px',
                background: fin.openReceivablesCents > 0 ? '#fffbeb' : '#f8fafc',
                border: fin.openReceivablesCents > 0 ? '1px solid #fde68a' : '1px solid #e2e8f0',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: fin.openReceivablesCents > 0 ? '#b45309' : '#64748b',
                  textTransform: 'uppercase',
                }}
              >
                ⏳ A Receber
              </span>
              <strong
                style={{
                  fontSize: '14.5px',
                  fontWeight: 800,
                  color: fin.openReceivablesCents > 0 ? '#92400e' : '#0f172a',
                }}
              >
                {formatCurrency(fin.openReceivablesCents)}
              </strong>
            </div>
          </div>

          {/* Lista de saldos em aberto / parciais */}
          {fin.openPayments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {fin.openPayments.map((pay) => (
                <article
                  key={pay.id}
                  onClick={() => setSelectedPayment(pay)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '11px',
                    background: '#fffdf7',
                    border: '1px solid #fde68a',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        color: '#0f172a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {pay.clientName}
                    </strong>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', fontSize: '11.5px', color: '#64748b' }}>
                      <span>{pay.description} ·</span>
                      <MethodBadge method={pay.paymentMethod} size={13} />
                      <span>·</span>
                      <span style={{ color: '#15803d', fontWeight: 600 }}>
                        Pago: {formatCurrency(pay.paidAmountCents)}
                      </span>
                    </span>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <strong style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: '#b45309' }}>
                      Falta {formatCurrency(pay.remainingAmountCents)}
                    </strong>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)' }}>
                      Dar baixa →
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <CheckCircle2 size={24} />
              <h3>Tudo em dia</h3>
              <p>Não há pagamentos parciais ou pendentes em aberto.</p>
            </div>
          )}
        </section>
      </div>

      {/* SEÇÃO DEDICADA ABAIXO: ÚLTIMOS 5 PAGAMENTOS */}
      <section className="card dashboard-card" style={{ marginTop: '4px' }}>
        <div
          className="section-heading"
          style={{ flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}
        >
          <div>
            <span className="eyebrow">Histórico Recente</span>
            <h2>Últimos 5 pagamentos</h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div className="filter-tabs" style={{ padding: '2px', borderRadius: '9px' }}>
              <button
                type="button"
                className={payFilter === 'todos' ? 'active' : ''}
                onClick={() => setPayFilter('todos')}
                style={{ padding: '4px 10px', fontSize: '11.5px' }}
              >
                Todos
              </button>
              <button
                type="button"
                className={payFilter === 'pagos' ? 'active' : ''}
                onClick={() => setPayFilter('pagos')}
                style={{ padding: '4px 10px', fontSize: '11.5px' }}
              >
                Quitados
              </button>
              <button
                type="button"
                className={payFilter === 'aberto' ? 'active' : ''}
                onClick={() => setPayFilter('aberto')}
                style={{ padding: '4px 10px', fontSize: '11.5px' }}
              >
                Parciais / Em aberto
              </button>
            </div>

            <Link href="/admin/financeiro" className="text-link" style={{ fontSize: '12.5px' }}>
              Financeiro completo <ChevronRight size={14} />
            </Link>
          </div>
        </div>

        {lastFivePayments.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {lastFivePayments.map((pay) => {
              const hasOpen = pay.remainingAmountCents > 0;
              const isExpense = pay.entryType === 'saida';
              const refDate = pay.paidAt || pay.createdAt || '';
              return (
                <article
                  key={pay.id}
                  onClick={() => setSelectedPayment(pay)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    background: hasOpen ? '#fffdf7' : '#f8fafc',
                    border: hasOpen ? '1px solid #fde68a' : '1px solid #e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: '180px', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
                        {pay.clientName}
                      </strong>
                      {pay.movementLabel && (
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '999px',
                            background: isExpense
                              ? '#fee2e2'
                              : hasOpen
                                ? '#fef3c7'
                                : '#dcfce7',
                            color: isExpense
                              ? '#b91c1c'
                              : hasOpen
                                ? '#b45309'
                                : '#15803d',
                          }}
                        >
                          {pay.movementLabel}
                        </span>
                      )}
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      <span>{pay.description} ·</span>
                      <MethodBadge method={pay.paymentMethod} size={14} />
                      {refDate ? <span>· {shortDate(refDate, data.date)} às {time(refDate)}</span> : null}
                    </span>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <strong
                      style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 800,
                        color: isExpense ? '#dc2626' : '#15803d',
                      }}
                    >
                      {isExpense ? `- ${formatCurrency(pay.paidAmountCents)}` : formatCurrency(pay.paidAmountCents)}
                    </strong>
                    {hasOpen ? (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309' }}>
                        Falta {formatCurrency(pay.remainingAmountCents)}
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#64748b' }}>✓ Quitado</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state compact">
            <Wallet size={24} />
            <h3>Nenhum pagamento encontrado</h3>
            <p>Não há pagamentos registrados para este filtro.</p>
          </div>
        )}
      </section>

      {/* MODAL COMPACTO: DETALHES DO PAGAMENTO */}
      {selectedPayment && (
        <div
          className="modal-layer"
          onClick={() => setSelectedPayment(null)}
          style={{ padding: '12px' }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '410px', borderRadius: '16px' }}
          >
            <div className="modal-header" style={{ padding: '14px 16px' }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: '2px', fontSize: '10px' }}>
                  Resumo da Fatura
                </span>
                <h2 style={{ fontSize: '15.5px' }}>{selectedPayment.clientName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  color: '#64748b',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12.5px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <strong>Serviço / Descrição:</strong>
                <span>{selectedPayment.description}</span>
                <span>·</span>
                <MethodBadge method={selectedPayment.paymentMethod} size={15} />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '11px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                  fontSize: '12.5px',
                }}
              >
                {selectedPayment.discountCents > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                      <span>Valor original:</span>
                      <span>
                        {formatCurrency(selectedPayment.amountCents + selectedPayment.discountCents)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                      <span>Desconto concedido:</span>
                      <strong>- {formatCurrency(selectedPayment.discountCents)}</strong>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0f172a' }}>
                  <span>Total líquido da fatura:</span>
                  <strong>{formatCurrency(selectedPayment.amountCents)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 700 }}>
                  <span>✓ Valor deste pagamento:</span>
                  <strong>{formatCurrency(selectedPayment.paidAmountCents)}</strong>
                </div>
                {selectedPayment.remainingAmountCents > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      color: '#b45309',
                      fontWeight: 800,
                      borderTop: '1px dashed #cbd5e1',
                      paddingTop: '5px',
                      marginTop: '2px',
                    }}
                  >
                    <span>⏳ Saldo restante:</span>
                    <strong>{formatCurrency(selectedPayment.remainingAmountCents)}</strong>
                  </div>
                )}
              </div>

              <div className="modal-actions" style={{ marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedPayment(null)}
                >
                  Fechar
                </button>
                <Link href="/admin/financeiro" className="btn btn-primary btn-sm">
                  {selectedPayment.remainingAmountCents > 0
                    ? 'Dar baixa no Financeiro'
                    : 'Abrir no Financeiro'}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL COMPACTO: DETALHES DO AGENDAMENTO */}
      {selectedAppointment && (
        <div
          className="modal-layer"
          onClick={() => setSelectedAppointment(null)}
          style={{ padding: '12px' }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '410px', borderRadius: '16px' }}
          >
            <div className="modal-header" style={{ padding: '14px 16px' }}>
              <div>
                <span className="eyebrow" style={{ marginBottom: '2px', fontSize: '10px' }}>
                  Detalhes do Atendimento
                </span>
                <h2 style={{ fontSize: '15.5px' }}>{selectedAppointment.clientName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppointment(null)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  color: '#64748b',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '11px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '12.5px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Data e horário:</span>
                  <strong>
                    {shortDate(selectedAppointment.startAt, data.date)} às{' '}
                    {time(selectedAppointment.startAt)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Serviço:</span>
                  <strong>{selectedAppointment.serviceName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Modalidade:</span>
                  <strong style={{ textTransform: 'capitalize' }}>
                    {selectedAppointment.modality}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>Status:</span>
                  <span className={`badge ${STATUS_COLORS[selectedAppointment.status]}`}>
                    {STATUS_LABELS[selectedAppointment.status]}
                  </span>
                </div>
              </div>

              <div className="modal-actions" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <Link
                  href={`/admin/prontuarios/${selectedAppointment.clientId}`}
                  className="btn btn-secondary btn-sm"
                >
                  <FileText size={14} /> Prontuário
                </Link>

                <div style={{ display: 'flex', gap: '6px' }}>
                  {selectedAppointment.status === 'solicitado' && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={updating === selectedAppointment.id}
                      onClick={() => changeStatus(selectedAppointment.id, 'confirmado')}
                    >
                      <CheckCircle2 size={14} /> Confirmar
                    </button>
                  )}
                  {(selectedAppointment.status === 'confirmado' ||
                    selectedAppointment.status === 'em_atendimento') && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={updating === selectedAppointment.id}
                      onClick={() => changeStatus(selectedAppointment.id, 'concluido')}
                    >
                      <CheckCircle2 size={14} /> Concluir
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedAppointment(null)}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {dialogNode}
    </div>
  );
}

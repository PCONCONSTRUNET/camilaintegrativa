'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Bell,
  CalendarPlus,
  CalendarX2,
  Check,
  CheckCheck,
  DollarSign,
  ExternalLink,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import type { AdminNotificationItem, NotificationCategory } from '@/app/api/admin/notifications/route';
import { formatRelativeTimePtBr, getNotificationVisual } from '@/components/admin-notification-bell';

interface NotificationSummary {
  total: number;
  unread: number;
  agendamentos: number;
  cancelamentos: number;
  pagamentos: number;
  grupos: number;
  clientes: number;
}

function formatCompactDateTimePtBr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const [summary, setSummary] = useState<NotificationSummary>({
    total: 0,
    unread: 0,
    agendamentos: 0,
    cancelamentos: 0,
    pagamentos: 0,
    grupos: 0,
    clientes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'all' | NotificationCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [search, setSearch] = useState('');

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setItems((data.notifications ?? []) as AdminNotificationItem[]);
      if (data.summary) setSummary(data.summary as NotificationSummary);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const handleSync = () => void loadNotifications();
    window.addEventListener('admin-notifications-updated', handleSync);
    return () => window.removeEventListener('admin-notifications-updated', handleSync);
  }, [loadNotifications]);

  async function toggleRead(item: AdminNotificationItem) {
    const nextRead = !item.read;
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: nextRead } : n)));
    setSummary((prev) => ({
      ...prev,
      unread: Math.max(0, prev.unread + (nextRead ? -1 : 1)),
    }));
    try {
      await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: nextRead ? 'mark_read' : 'mark_unread',
          id: item.id,
        }),
      });
      window.dispatchEvent(new Event('admin-notifications-updated'));
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setSummary((prev) => ({ ...prev, unread: 0 }));
    try {
      await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read', ids: unreadIds }),
      });
      window.dispatchEvent(new Event('admin-notifications-updated'));
    } catch {
      // ignore
    }
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (statusFilter === 'unread' && item.read) return false;
      if (statusFilter === 'read' && !item.read) return false;
      if (q) {
        const hay = `${item.title} ${item.description} ${item.detail ?? ''} ${item.clientName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, categoryFilter, statusFilter, search]);

  return (
    <div className="notif-page">
      {/* Compact Header */}
      <div className="notif-page-header">
        <div className="notif-page-header-left">
          <span className="notif-page-header-icon">
            <Bell size={18} />
          </span>
          <div className="notif-page-header-copy">
            <div className="notif-page-title-row">
              <h1>Central de Notificações</h1>
              {summary.unread > 0 && (
                <span className="notif-page-unread-badge">{summary.unread} nova(s)</span>
              )}
            </div>
            <p>Agendamentos, cancelamentos, pagamentos e sessões em grupo em tempo real.</p>
          </div>
        </div>

        <div className="notif-page-header-actions">
          <button
            type="button"
            className="notif-action-btn secondary"
            onClick={() => void loadNotifications()}
            disabled={loading}
            title="Atualizar notificações"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Atualizar</span>
          </button>
          {summary.unread > 0 && (
            <button
              type="button"
              className="notif-action-btn primary"
              onClick={() => void markAllRead()}
            >
              <CheckCheck size={14} />
              <span>Ler todas</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact KPI Strip (Swipeable on Mobile, Grid on Desktop) */}
      <div className="notif-kpi-strip">
        {[
          {
            key: 'all' as const,
            label: 'Total',
            value: summary.total,
            icon: Bell,
            bg: '#f1f5f9',
            color: '#1a3a4a',
          },
          {
            key: 'agendamento' as const,
            label: 'Agenda',
            value: summary.agendamentos,
            icon: CalendarPlus,
            bg: '#e0f2fe',
            color: '#0369a1',
          },
          {
            key: 'cancelamento' as const,
            label: 'Cancelados',
            value: summary.cancelamentos,
            icon: CalendarX2,
            bg: '#fee2e2',
            color: '#dc2626',
          },
          {
            key: 'pagamento' as const,
            label: 'Pagamentos',
            value: summary.pagamentos,
            icon: DollarSign,
            bg: '#dcfce7',
            color: '#15803d',
          },
          {
            key: 'grupo' as const,
            label: 'Em Grupo',
            value: summary.grupos,
            icon: Users,
            bg: '#f3e8ff',
            color: '#7e22ce',
          },
        ].map((card) => {
          const Icon = card.icon;
          const active = categoryFilter === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setCategoryFilter(card.key)}
              className={`notif-kpi-card${active ? ' active' : ''}`}
              style={active ? { borderColor: card.color } : undefined}
            >
              <span
                className="notif-kpi-icon"
                style={{ background: card.bg, color: card.color }}
              >
                <Icon size={15} />
              </span>
              <div className="notif-kpi-info">
                <strong>{card.value}</strong>
                <span>{card.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Compact Filter & Search Toolbar */}
      <div className="notif-toolbar">
        {/* Single-line Horizontal Scrollable Category Pills */}
        <div className="notif-category-scroll">
          {[
            { key: 'all', label: 'Todas', count: summary.total },
            { key: 'agendamento', label: 'Agendamentos', count: summary.agendamentos },
            { key: 'cancelamento', label: 'Cancelamentos', count: summary.cancelamentos },
            { key: 'pagamento', label: 'Pagamentos', count: summary.pagamentos },
            { key: 'grupo', label: 'Sessões em Grupo', count: summary.grupos },
            { key: 'cliente', label: 'Pacientes', count: summary.clientes },
          ].map((tab) => {
            const active = categoryFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCategoryFilter(tab.key as typeof categoryFilter)}
                className={`notif-cat-pill${active ? ' active' : ''}`}
              >
                <span>{tab.label}</span>
                <small>{tab.count}</small>
              </button>
            );
          })}
        </div>

        {/* Status Toggle + Search Row */}
        <div className="notif-toolbar-bottom">
          <div className="notif-status-segmented">
            {[
              { key: 'all', label: 'Todas' },
              { key: 'unread', label: `Não lidas (${summary.unread})` },
              { key: 'read', label: 'Lidas' },
            ].map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => setStatusFilter(st.key as typeof statusFilter)}
                className={statusFilter === st.key ? 'active' : ''}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="notif-search-box">
            <Search size={14} className="notif-search-icon" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar paciente, serviço ou valor..."
            />
            {search && (
              <button
                type="button"
                className="notif-search-clear"
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compact Notifications Feed */}
      <div className="notif-feed-container">
        {loading && items.length === 0 ? (
          <div className="notif-feed-empty">Carregando histórico de notificações...</div>
        ) : filteredItems.length === 0 ? (
          <div className="notif-feed-empty">
            <Bell size={28} style={{ opacity: 0.3, marginBottom: '6px' }} />
            <h3>Nenhuma notificação encontrada</h3>
            <p>Não há registros para o filtro selecionado no momento.</p>
          </div>
        ) : (
          <div className="notif-feed-list">
            {filteredItems.map((item) => {
              const visual = getNotificationVisual(item);
              const Icon = visual.Icon;
              return (
                <article
                  key={item.id}
                  className={`notif-feed-card${!item.read ? ' is-unread' : ''}`}
                >
                  {/* Top Meta Row: Icon + Badge + Nova + Timestamp */}
                  <div className="notif-feed-card-top">
                    <div className="notif-feed-meta-left">
                      <span
                        className="notif-feed-icon"
                        style={{
                          background: visual.bg,
                          color: visual.color,
                          borderColor: visual.border,
                        }}
                      >
                        <Icon size={14} />
                      </span>
                      <span
                        className="notif-feed-badge"
                        style={{ background: visual.bg, color: visual.color }}
                      >
                        {visual.badge}
                      </span>
                      {!item.read && (
                        <span className="notif-feed-new-dot">
                          <i /> Nova
                        </span>
                      )}
                    </div>
                    <time className="notif-feed-time">
                      {formatCompactDateTimePtBr(item.timestamp)} · {formatRelativeTimePtBr(item.timestamp)}
                    </time>
                  </div>

                  {/* Title & Description */}
                  <div className="notif-feed-card-body">
                    <strong className="notif-feed-title">{item.title}</strong>
                    <p className="notif-feed-desc">{item.description}</p>
                  </div>

                  {/* Bottom Inline Footer: Detail Chip on Left + Actions on Right */}
                  <div className="notif-feed-card-footer">
                    {item.detail ? (
                      <span
                        className={`notif-feed-detail-chip${
                          item.category === 'cancelamento' ? ' is-danger' : ''
                        }`}
                      >
                        {item.detail}
                      </span>
                    ) : (
                      <span />
                    )}

                    <div className="notif-feed-actions">
                      <button
                        type="button"
                        onClick={() => void toggleRead(item)}
                        className={`notif-item-btn-read${item.read ? ' is-read' : ''}`}
                        title={item.read ? 'Marcar como não lida' : 'Marcar como lida'}
                      >
                        <Check size={12} />
                        <span>{item.read ? 'Lida' : 'Ler'}</span>
                      </button>

                      <Link
                        href={item.href}
                        onClick={() => {
                          if (!item.read) void toggleRead(item);
                        }}
                        className="notif-item-btn-go"
                      >
                        <span>{item.actionLabel}</span>
                        <ExternalLink size={11} />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

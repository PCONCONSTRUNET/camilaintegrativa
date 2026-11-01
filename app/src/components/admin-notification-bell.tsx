'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CalendarPlus,
  CalendarX2,
  CheckCheck,
  Clock,
  DollarSign,
  Users,
  UserPlus,
  ArrowRight,
  X,
  Check,
  Sparkles,
} from 'lucide-react';
import type { AdminNotificationItem, NotificationCategory } from '@/app/api/admin/notifications/route';

export function formatRelativeTimePtBr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'agora';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'ontem';
  if (diffDays < 7) return `há ${diffDays}d`;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

export function getNotificationVisual(item: AdminNotificationItem) {
  switch (item.type) {
    case 'appointment_requested':
      return {
        Icon: Clock,
        bg: '#fef3c7',
        color: '#b45309',
        border: '#fde68a',
        badge: 'Solicitação',
      };
    case 'appointment_confirmed':
      return {
        Icon: CalendarPlus,
        bg: '#e0f2fe',
        color: '#0369a1',
        border: '#bae6fd',
        badge: 'Agendamento',
      };
    case 'appointment_cancelled':
    case 'group_cancelled':
      return {
        Icon: CalendarX2,
        bg: '#fee2e2',
        color: '#dc2626',
        border: '#fecaca',
        badge: 'Cancelamento',
      };
    case 'payment_received':
      return {
        Icon: DollarSign,
        bg: '#dcfce7',
        color: '#15803d',
        border: '#bbf7d0',
        badge: 'Pagamento',
      };
    case 'payment_pending':
      return {
        Icon: DollarSign,
        bg: '#fef9c3',
        color: '#a16207',
        border: '#fde047',
        badge: 'Cobrança',
      };
    case 'group_enrollment':
      return {
        Icon: Users,
        bg: '#f3e8ff',
        color: '#7e22ce',
        border: '#e9d5ff',
        badge: 'Grupo',
      };
    case 'client_created':
    default:
      return {
        Icon: UserPlus,
        bg: '#f1f5f9',
        color: '#1a3a4a',
        border: '#cbd5e1',
        badge: 'Paciente',
      };
  }
}

export function AdminNotificationBell({
  variant = 'default',
  onUnreadCountChange,
}: {
  variant?: 'default' | 'sidebar' | 'toolbar';
  onUnreadCountChange?: (count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | NotificationCategory>('all');
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; isMobile: boolean }>({
    top: 60,
    left: 12,
    isMobile: false,
  });
  const [mounted, setMounted] = useState(false);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as { notifications?: AdminNotificationItem[]; summary?: { unread?: number } } | null;
      if (!data) return;
      const list = (data.notifications ?? []) as AdminNotificationItem[];
      const unread = Number(data.summary?.unread ?? list.filter((i) => !i.read).length);
      setItems(list);
      setUnreadCount(unread);
      onUnreadCountChange?.(unread);
    } catch {
      // ignore network error
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    setMounted(true);
    void fetchNotifications();
    const interval = window.setInterval(() => {
      void fetchNotifications();
    }, 30000);

    const handleSync = () => void fetchNotifications();
    window.addEventListener('admin-notifications-updated', handleSync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('admin-notifications-updated', handleSync);
    };
  }, [fetchNotifications]);

  const updatePosition = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw <= 640;

    if (isMobile || !buttonRef.current) {
      setPopoverPos({ top: 58, left: 10, isMobile: true });
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(360, vw - 24);
    const popoverHeight = 440;

    let left = rect.right - popoverWidth;
    if (variant === 'sidebar' || left < 12) {
      left = Math.max(12, Math.min(rect.left, vw - popoverWidth - 12));
    }
    let top = rect.bottom + 8;
    if (top + popoverHeight > vh - 12) {
      top = Math.max(12, vh - popoverHeight - 16);
    }

    setPopoverPos({ top, left, isMobile: false });
  }, [variant]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    void fetchNotifications();

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition, fetchNotifications]);

  async function markAsRead(id: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    setUnreadCount((prev) => {
      const next = Math.max(0, prev - 1);
      onUnreadCountChange?.(next);
      return next;
    });
    try {
      await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', id }),
      });
      window.dispatchEvent(new Event('admin-notifications-updated'));
    } catch {
      // ignore
    }
  }

  async function markAllAsRead() {
    const unreadIds = items.filter((i) => !i.read).map((i) => i.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    onUnreadCountChange?.(0);
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

  const filteredItems = items
    .filter((item) => {
      if (filter === 'all') return true;
      if (filter === 'unread') return !item.read;
      return item.category === filter;
    })
    .slice(0, 12);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`notif-bell-trigger notif-bell-${variant}${open ? ' is-open' : ''}${unreadCount > 0 ? ' has-unread' : ''}`}
        aria-label="Abrir notificações recentes"
        title="Notificações recentes"
      >
        <Bell size={variant === 'sidebar' ? 16 : 17} className="notif-bell-icon" />
        {unreadCount > 0 && (
          <span className="notif-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {mounted &&
        open &&
        createPortal(
          <>
            {popoverPos.isMobile && (
              <div
                className="notif-popover-backdrop"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
            )}
            <div
              ref={popoverRef}
              className={`notif-popover-modal${popoverPos.isMobile ? ' is-mobile' : ''}`}
              style={
                popoverPos.isMobile
                  ? undefined
                  : { top: popoverPos.top, left: popoverPos.left }
              }
              role="dialog"
              aria-label="Últimas notificações"
            >
              {/* Header */}
              <div className="notif-popover-header">
                <div className="notif-popover-title-wrap">
                  <span className="notif-popover-icon-chip">
                    <Sparkles size={12} />
                  </span>
                  <strong>Notificações</strong>
                  {unreadCount > 0 && (
                    <span className="notif-popover-unread-pill">{unreadCount}</span>
                  )}
                </div>
                <div className="notif-popover-header-actions">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="notif-popover-markall"
                      onClick={markAllAsRead}
                      title="Marcar todas como lidas"
                    >
                      <CheckCheck size={12} />
                      <span>Ler todas</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="notif-popover-close"
                    onClick={() => setOpen(false)}
                    aria-label="Fechar"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Filter Chips */}
              <div className="notif-popover-filters">
                {[
                  { key: 'all', label: 'Todas' },
                  { key: 'unread', label: `Não lidas (${unreadCount})` },
                  { key: 'agendamento', label: 'Agenda' },
                  { key: 'cancelamento', label: 'Cancelados' },
                  { key: 'pagamento', label: 'Pagamentos' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`notif-filter-chip${filter === tab.key ? ' active' : ''}`}
                    onClick={() => setFilter(tab.key as typeof filter)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* List */}
              <div className="notif-popover-list">
                {loading && items.length === 0 ? (
                  <div className="notif-popover-empty">Carregando...</div>
                ) : filteredItems.length === 0 ? (
                  <div className="notif-popover-empty">
                    <Bell size={20} style={{ opacity: 0.35 }} />
                    <strong>Nenhuma notificação neste filtro</strong>
                    <span>Novos eventos aparecerão aqui.</span>
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const visual = getNotificationVisual(item);
                    const Icon = visual.Icon;
                    return (
                      <div
                        key={item.id}
                        className={`notif-popover-item${!item.read ? ' is-unread' : ''}`}
                        onClick={() => {
                          if (!item.read) void markAsRead(item.id);
                          setOpen(false);
                          router.push(item.href);
                        }}
                      >
                        <span
                          className="notif-popover-item-icon"
                          style={{
                            background: visual.bg,
                            color: visual.color,
                            borderColor: visual.border,
                          }}
                        >
                          <Icon size={14} />
                        </span>
                        <div className="notif-popover-item-body">
                          <div className="notif-popover-item-top">
                            <span
                              className="notif-popover-item-tag"
                              style={{ background: visual.bg, color: visual.color }}
                            >
                              {visual.badge}
                            </span>
                            <time className="notif-popover-item-time">
                              {formatRelativeTimePtBr(item.timestamp)}
                            </time>
                          </div>
                          <strong className="notif-popover-item-title">{item.title}</strong>
                          <p className="notif-popover-item-desc">{item.description}</p>
                          {item.detail && (
                            <span className="notif-popover-item-detail">{item.detail}</span>
                          )}
                        </div>
                        {!item.read && (
                          <button
                            type="button"
                            className="notif-popover-read-btn"
                            onClick={(e) => void markAsRead(item.id, e)}
                            title="Marcar como lida"
                            aria-label="Marcar como lida"
                          >
                            <Check size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="notif-popover-footer">
                <Link
                  href="/admin/notificacoes"
                  className="notif-popover-all-link"
                  onClick={() => setOpen(false)}
                >
                  <span>Ver todas as notificações</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

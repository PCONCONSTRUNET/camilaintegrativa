'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  CalendarRange,
  Users,
  FileText,
  Sparkles,
  Settings,
  Menu,
  X,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  WalletCards,
  ArrowUpRight,
  UserRound,
  Globe,
  Bell,
  Clock,
  NotebookPen,
} from 'lucide-react';
import { AdminNotificationBell } from '@/components/admin-notification-bell';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Visão geral', href: '/admin' },
  { icon: CalendarDays, label: 'Agenda', href: '/admin/agenda' },
  { icon: Users, label: 'Clientes', href: '/admin/clientes' },
  { icon: FileText, label: 'Prontuários', href: '/admin/prontuarios' },
  { icon: NotebookPen, label: 'Anotações', href: '/admin/anotacoes' },
  { icon: WalletCards, label: 'Financeiro', href: '/admin/financeiro' },
  { icon: Sparkles, label: 'Serviços', href: '/admin/servicos' },
  { icon: CalendarRange, label: 'Sessões em Grupo', href: '/admin/sessoes-grupo' },
  { icon: Bell, label: 'Notificações', href: '/admin/notificacoes' },
  { icon: Clock, label: 'Horários', href: '/admin/horarios' },
  { icon: Settings, label: 'Configurações', href: '/admin/configuracoes' },
];

export default function AdminShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; role: string };
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const currentPage =
    NAV_ITEMS.find((item) => item.href === pathname)?.label ??
    (pathname?.startsWith('/admin/prontuarios')
      ? 'Prontuários'
      : pathname?.startsWith('/admin/anotacoes')
      ? 'Anotações'
      : pathname?.startsWith('/admin/financeiro') || pathname?.startsWith('/admin/pagamentos')
      ? 'Financeiro'
      : pathname?.startsWith('/admin/servicos')
      ? 'Serviços'
      : pathname?.startsWith('/admin/notificacoes')
      ? 'Notificações'
      : 'Painel');
  const isAgendaPage = pathname === '/admin/agenda';

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/entrar');
    router.refresh();
  }

  return (
    <div className={`admin-layout${collapsed ? ' is-collapsed' : ''}${isAgendaPage ? ' is-agenda-immersive' : ''}`}>
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <Link href="/admin" aria-label="Visão geral" className="sidebar-brand-link">
            {collapsed ? (
              <Image src="/icone-c.png" alt="" width={38} height={38} className="sidebar-logo-icon" aria-hidden="true" priority />
            ) : (
              <Image src="/logo-camila-machado.png" alt="Camila Machado" width={132} height={40} className="sidebar-logo-image" priority />
            )}
          </Link>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {!collapsed && (
              <AdminNotificationBell
                variant="sidebar"
                onUnreadCountChange={setUnreadNotifications}
              />
            )}
            <button
              className="sidebar-collapse-btn desktop-only"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <button className="sidebar-collapse-btn mobile-only" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Navegação administrativa">
          <div className="nav-section-title">
            <span>Operação</span>
          </div>
          <div className="sidebar-nav-list">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href === '/admin/prontuarios' && pathname?.startsWith('/admin/prontuarios')) ||
                (item.href === '/admin/anotacoes' && pathname?.startsWith('/admin/anotacoes')) ||
                (item.href === '/admin/financeiro' && (pathname?.startsWith('/admin/financeiro') || pathname?.startsWith('/admin/pagamentos'))) ||
                (item.href === '/admin/notificacoes' && pathname?.startsWith('/admin/notificacoes'));
              const isNotifItem = item.href === '/admin/notificacoes';
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className={`nav-item${active ? ' active' : ''}`}
                  title={collapsed ? item.label : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="nav-icon-box" style={{ position: 'relative' }}>
                    <Icon size={18} className="nav-icon" />
                    {collapsed && isNotifItem && unreadNotifications > 0 && (
                      <span className="nav-collapsed-dot" />
                    )}
                  </span>
                  {!collapsed && <span className="nav-item-label">{item.label}</span>}
                  {!collapsed && isNotifItem && unreadNotifications > 0 && (
                    <span className="nav-unread-pill">
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </span>
                  )}
                  {!collapsed && active && !isNotifItem && <span className="nav-active-dot" aria-hidden="true" />}
                </Link>
              );
            })}
          </div>

          {!collapsed ? (
            <div className="sidebar-external-card">
              <div className="sidebar-external-header">
                <Globe size={12} />
                <span>Acesso Externo</span>
              </div>
              <Link href="/agendar" target="_blank" className="sidebar-external-link">
                <span className="sidebar-external-icon">
                  <CalendarDays size={14} />
                </span>
                <span className="sidebar-external-text">Página de Agendamento</span>
                <ArrowUpRight size={14} className="sidebar-external-arrow" />
              </Link>
              <Link href="/cliente" target="_blank" className="sidebar-external-link">
                <span className="sidebar-external-icon">
                  <UserRound size={14} />
                </span>
                <span className="sidebar-external-text">Portal do Paciente</span>
                <ArrowUpRight size={14} className="sidebar-external-arrow" />
              </Link>
            </div>
          ) : (
            <div className="sidebar-external-collapsed">
              <Link href="/agendar" target="_blank" className="sidebar-external-mini" title="Página de Agendamento">
                <CalendarDays size={16} />
              </Link>
              <Link href="/cliente" target="_blank" className="sidebar-external-mini" title="Portal do Paciente">
                <UserRound size={16} />
              </Link>
            </div>
          )}
        </nav>

        <div className={`sidebar-user${collapsed ? ' is-collapsed' : ''}`}>
          <span className="sidebar-user-avatar" title={user.name}>CM</span>
          {!collapsed && (
            <div className="sidebar-user-copy">
              <strong>{user.name}</strong>
              <span>
                <i className="sidebar-role-dot" />
                {user.role === 'Proprietaria' ? 'Proprietária' : user.role}
              </span>
            </div>
          )}
          <button
            className="sidebar-logout-btn"
            onClick={logout}
            aria-label="Sair"
            title="Encerrar sessão"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {isAgendaPage && (
        <button
          type="button"
          className="agenda-admin-menu-trigger mobile-only"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir navegação da clínica"
          aria-expanded={mobileOpen}
        >
          <Menu size={20} />
        </button>
      )}

      <main className="admin-main">
        {!isAgendaPage && (
          <header className="topbar">
            <div className="topbar-left">
              <button className="btn btn-ghost btn-icon mobile-only" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" aria-expanded={mobileOpen}><Menu size={20} /></button>
              <div className="topbar-title-group">
                <span className="topbar-eyebrow">Operação da clínica</span>
                <h1>{currentPage}</h1>
              </div>
            </div>
            <div className="topbar-right">
              <AdminNotificationBell variant="default" />
              <span className="topbar-clinic-badge">
                <span className="topbar-clinic-dot" />
                <span className="topbar-clinic-text-full">Clínica Ativa • CRT-SBHP/SC 805</span>
                <span className="topbar-clinic-text-short">Ativa</span>
              </span>
            </div>
          </header>
        )}
        <div className={`page-content${isAgendaPage ? ' agenda-immersive-content' : ''}`}>{children}</div>
      </main>
    </div>
  );
}

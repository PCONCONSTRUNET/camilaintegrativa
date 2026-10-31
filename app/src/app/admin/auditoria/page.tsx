'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  FileText,
  Search,
  Filter,
  Download,
  Printer,
  RefreshCw,
  AlertTriangle,
  Info,
  Calendar,
  User,
  Key,
  Globe,
  DollarSign,
  MessageSquare,
  Lock,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Sparkles,
} from 'lucide-react';

interface AuditLogItem {
  id: string;
  clinicId: string;
  actorType: 'paciente' | 'admin' | 'sistema';
  actorId: string | null;
  actorName: string;
  category: string;
  action: string;
  title: string;
  description: string;
  ipAddress: string | null;
  userAgent: string | null;
  severity: 'info' | 'aviso' | 'critico';
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditStats {
  totalLogs: number;
  totalConsents: number;
  totalProntuarioAccess: number;
  totalSecurityAlerts: number;
}

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [stats, setStats] = useState<AuditStats>({
    totalLogs: 0,
    totalConsents: 0,
    totalProntuarioAccess: 0,
    totalSecurityAlerts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [period, setPeriod] = useState<'today' | '7days' | '30days' | 'all'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30',
        period,
      });
      if (category !== 'all') params.append('category', category);
      if (severity !== 'all') params.append('severity', severity);
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (!res.ok) throw new Error('Falha ao carregar auditoria');
      const data = await res.json();

      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error('Erro ao carregar auditoria:', err);
    } finally {
      setLoading(false);
    }
  }, [category, severity, period, search, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Formatador de data para Brasília
  function formatBrasilia(iso: string) {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(d);
    } catch {
      return iso;
    }
  }

  // Ícone por categoria
  function getCategoryBadge(cat: string) {
    switch (cat) {
      case 'consentimento_lgpd':
        return {
          icon: <ShieldCheck size={13} />,
          label: 'Consentimento LGPD',
          bg: '#ecfdf5',
          color: '#065f46',
          border: '#a7f3d0',
        };
      case 'prontuario':
        return {
          icon: <FileText size={13} />,
          label: 'Prontuário & Saúde',
          bg: '#f0f9ff',
          color: '#0369a1',
          border: '#bae6fd',
        };
      case 'anamnese':
        return {
          icon: <Sparkles size={13} />,
          label: 'Ficha de Anamnese',
          bg: '#fdf4ff',
          color: '#86198f',
          border: '#f5d0fe',
        };
      case 'agendamento':
        return {
          icon: <Calendar size={13} />,
          label: 'Agendamento',
          bg: '#fefce8',
          color: '#854d0e',
          border: '#fef08a',
        };
      case 'financeiro':
        return {
          icon: <DollarSign size={13} />,
          label: 'Financeiro',
          bg: '#f0fdf4',
          color: '#166534',
          border: '#bbf7d0',
        };
      case 'acesso_login':
        return {
          icon: <Key size={13} />,
          label: 'Acesso / Login',
          bg: '#eef2ff',
          color: '#3730a3',
          border: '#c7d2fe',
        };
      case 'comunicacao':
        return {
          icon: <MessageSquare size={13} />,
          label: 'Comunicação',
          bg: '#fff7ed',
          color: '#9a3412',
          border: '#fed7aa',
        };
      default:
        return {
          icon: <Info size={13} />,
          label: cat,
          bg: '#f1f5f9',
          color: '#475569',
          border: '#cbd5e1',
        };
    }
  }

  function getSeverityBadge(sev: string) {
    switch (sev) {
      case 'critico':
        return { label: 'Crítico', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' };
      case 'aviso':
        return { label: 'Atenção', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' };
      default:
        return { label: 'Informativo', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
    }
  }

  function handleExportCsv() {
    const params = new URLSearchParams({ period });
    if (category !== 'all') params.append('category', category);
    if (severity !== 'all') params.append('severity', severity);
    if (search.trim()) params.append('search', search.trim());
    window.open(`/api/admin/audit/export?${params.toString()}`, '_blank');
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '24px 20px 60px' }}>
      {/* Top Banner de Conformidade Legal */}
      <div
        style={{
          background: 'linear-gradient(135deg, #182B38 0%, #245D80 100%)',
          borderRadius: '16px',
          padding: '24px',
          color: '#ffffff',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 8px 24px rgba(24, 43, 56, 0.15)',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.15)',
              fontSize: '0.74rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}
          >
            <ShieldCheck size={14} color="#D4A843" />
            Conformidade LGPD &bull; Lei Federal 13.709/2018 (Art. 37)
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
            Trilha de Auditoria & Sigilo Terapêutico
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.86rem', color: '#B8D5E5', maxWidth: '680px', lineHeight: 1.45 }}>
            Registro obrigatório e auditável de todos os consentimentos dos pacientes, acessos a prontuários eletrônicos,
            confirmações financeiras e operações no sistema para máxima segurança jurídica.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 15px',
              borderRadius: '10px',
              background: '#ffffff',
              color: '#182B38',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            }}
          >
            <Download size={15} /> Exportar Relatório (CSV)
          </button>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 15px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.15)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.3)',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Printer size={15} /> Imprimir Relatório
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={{ background: '#ffffff', padding: '18px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Total de Ações Auditadas</span>
            <Lock size={18} color="#245D80" />
          </div>
          <p style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: '8px 0 0' }}>
            {stats.totalLogs.toLocaleString('pt-BR')}
          </p>
          <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>✓ Trilha ativa e protegida</span>
        </div>

        <div style={{ background: '#ffffff', padding: '18px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Consentimentos Jurídicos LGPD</span>
            <ShieldCheck size={18} color="#059669" />
          </div>
          <p style={{ fontSize: '1.65rem', fontWeight: 800, color: '#065f46', margin: '8px 0 0' }}>
            {stats.totalConsents.toLocaleString('pt-BR')}
          </p>
          <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>Veracidade & Abordagem Terapêutica</span>
        </div>

        <div style={{ background: '#ffffff', padding: '18px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Acessos a Prontuários</span>
            <FileText size={18} color="#0284c7" />
          </div>
          <p style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0369a1', margin: '8px 0 0' }}>
            {stats.totalProntuarioAccess.toLocaleString('pt-BR')}
          </p>
          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Sigilo e rastreabilidade médica</span>
        </div>

        <div style={{ background: '#ffffff', padding: '18px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Alertas de Segurança</span>
            <AlertTriangle size={18} color="#d97706" />
          </div>
          <p style={{ fontSize: '1.65rem', fontWeight: 800, color: stats.totalSecurityAlerts > 0 ? '#b91c1c' : '#166534', margin: '8px 0 0' }}>
            {stats.totalSecurityAlerts.toLocaleString('pt-BR')}
          </p>
          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Tentativas de login ou anomalias</span>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
          {/* Busca */}
          <div style={{ position: 'relative', minWidth: '260px', flex: 1 }}>
            <Search
              size={16}
              color="#94a3b8"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Buscar por paciente, ação, IP ou descrição..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.84rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Categoria */}
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1.5px solid #cbd5e1',
              fontSize: '0.84rem',
              fontWeight: 600,
              background: '#ffffff',
              color: '#334155',
            }}
          >
            <option value="all">Todas as Categorias</option>
            <option value="consentimento_lgpd">🛡️ Consentimentos LGPD</option>
            <option value="prontuario">📋 Prontuários & Saúde</option>
            <option value="anamnese">✨ Ficha de Anamnese</option>
            <option value="agendamento">📅 Agendamentos</option>
            <option value="financeiro">💵 Financeiro & Pagamentos</option>
            <option value="acesso_login">🔑 Acessos & Logins</option>
            <option value="comunicacao">📢 Notificações & Avisos</option>
          </select>

          {/* Período */}
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as 'today' | '7days' | '30days' | 'all');
              setPage(1);
            }}
            style={{
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1.5px solid #cbd5e1',
              fontSize: '0.84rem',
              fontWeight: 600,
              background: '#ffffff',
              color: '#334155',
            }}
          >
            <option value="all">Todo o Período</option>
            <option value="today">Hoje</option>
            <option value="7days">Últimos 7 dias</option>
            <option value="30days">Últimos 30 dias</option>
          </select>

          {/* Severidade */}
          <select
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '9px 14px',
              borderRadius: '10px',
              border: '1.5px solid #cbd5e1',
              fontSize: '0.84rem',
              fontWeight: 600,
              background: '#ffffff',
              color: '#334155',
            }}
          >
            <option value="all">Todas as Severidades</option>
            <option value="info">Informativo</option>
            <option value="aviso">Atenção</option>
            <option value="critico">Crítico</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void loadLogs()}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '9px 14px',
            borderRadius: '10px',
            background: '#f8fafc',
            border: '1.5px solid #cbd5e1',
            fontSize: '0.82rem',
            fontWeight: 700,
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Tabela de Registros de Auditoria */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(15,23,42,0.03)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#475569', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Data / Hora (Brasília)</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Categoria</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Ator / Responsável</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Ação & Descrição</th>
                <th style={{ padding: '14px 18px', fontWeight: 800 }}>Endereço IP</th>
                <th style={{ padding: '14px 18px', fontWeight: 800, textAlign: 'center' }}>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={22} className="spin" style={{ margin: '0 auto 10px' }} />
                    <p style={{ margin: 0, fontWeight: 600 }}>Consultando trilha de auditoria...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                    <ShieldCheck size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b' }}>Nenhum registro encontrado</h3>
                    <p style={{ margin: 0, fontSize: '0.82rem' }}>
                      Não há eventos correspondentes aos filtros selecionados.
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const catBadge = getCategoryBadge(log.category);
                  const sevBadge = getSeverityBadge(log.severity);
                  return (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', color: '#334155', fontWeight: 600 }}>
                        {formatBrasilia(log.createdAt)}
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 9px',
                            borderRadius: '8px',
                            background: catBadge.bg,
                            color: catBadge.color,
                            border: `1px solid ${catBadge.border}`,
                            fontSize: '0.74rem',
                            fontWeight: 700,
                          }}
                        >
                          {catBadge.icon}
                          {catBadge.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ color: '#0f172a', fontSize: '0.84rem' }}>{log.actorName}</strong>
                          <span
                            style={{
                              fontSize: '0.70rem',
                              fontWeight: 700,
                              color: log.actorType === 'admin' ? '#0f766e' : log.actorType === 'paciente' ? '#2563eb' : '#64748b',
                              textTransform: 'uppercase',
                            }}
                          >
                            {log.actorType === 'admin' ? '🛡️ Administração' : log.actorType === 'paciente' ? '👤 Paciente' : '⚙️ Sistema'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', maxWidth: '380px' }}>
                        <strong style={{ display: 'block', color: '#1e293b', fontSize: '0.84rem', marginBottom: '2px' }}>
                          {log.title}
                        </strong>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.78rem', lineHeight: 1.4 }}>
                          {log.description}
                        </p>
                      </td>
                      <td style={{ padding: '14px 18px', whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                        {log.ipAddress || 'Não registrado'}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            color: '#334155',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Eye size={13} /> Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div
          style={{
            padding: '14px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.82rem',
            color: '#64748b',
          }}
        >
          <span>
            Mostrando <strong>{logs.length}</strong> de <strong>{total}</strong> registros de auditoria
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: page <= 1 ? '#f1f5f9' : '#ffffff',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 700,
              }}
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <span style={{ fontWeight: 700, padding: '0 6px' }}>
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: page >= totalPages ? '#f1f5f9' : '#ffffff',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 700,
              }}
            >
              Próxima <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Detalhes Técnicos */}
      {selectedLog && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '640px',
              width: '100%',
              padding: '24px 28px',
              color: '#182B38',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedLog(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: '#64748b',
              }}
            >
              <X size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <ShieldCheck size={20} color="#245D80" />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Registro de Auditoria Oficial</h2>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: '0.8rem', color: '#64748b' }}>
              Evidência técnica registrada para fins de conformidade jurídica e fiscalização (LGPD).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Data & Hora (Brasília)</span>
                <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: '0.86rem' }}>{formatBrasilia(selectedLog.createdAt)}</p>
              </div>

              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Ator / Responsável</span>
                <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: '0.86rem' }}>
                  {selectedLog.actorName} ({selectedLog.actorType})
                </p>
              </div>

              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Endereço IP</span>
                <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: '0.86rem', fontFamily: 'monospace' }}>
                  {selectedLog.ipAddress || 'Não registrado'}
                </p>
              </div>

              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Ação Registrada</span>
                <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: '0.86rem' }}>{selectedLog.action}</p>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Descrição Completa</span>
              <p style={{ margin: '6px 0 0', fontSize: '0.84rem', lineHeight: 1.5, color: '#1e293b' }}>
                {selectedLog.description}
              </p>
            </div>

            {selectedLog.userAgent && (
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Navegador / Dispositivo (User-Agent)</span>
                <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: '#475569', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  {selectedLog.userAgent}
                </p>
              </div>
            )}

            {selectedLog.details && (
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Metadados Estruturados (JSON)</span>
                <pre
                  style={{
                    background: '#0f172a',
                    color: '#38bdf8',
                    padding: '12px',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                    overflowX: 'auto',
                    margin: '6px 0 0',
                    maxHeight: '180px',
                  }}
                >
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            )}

            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                style={{
                  padding: '9px 18px',
                  borderRadius: '10px',
                  background: '#245D80',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

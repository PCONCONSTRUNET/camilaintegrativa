'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  FileText,
  Mail,
  Phone,
  Plus,
  Search,
  UserRound,
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  Pencil,
  Trash2,
  MessageCircle,
  Eye,
  LayoutGrid,
  List,
  ShieldCheck,
  AlertCircle,
  Wallet,
  Users,
  HeartHandshake,
  Clock,
  ClipboardList,
} from 'lucide-react';
import type { ClientSummary } from '@/lib/domain';
import { formatPhone, maskPhone, maskCpf, formatCurrency } from '@/lib/utils';
import { QuickDocumentsModal, type QuickDocumentPrefill } from '@/components/quick-documents-modal';
import { WhatsappIcon } from '@/components/whatsapp-icon';
import { getInstantCache, setInstantCache } from '@/lib/client-cache';

type QuickFilter = 'todos' | 'ativo' | 'pendente' | 'inativo' | 'pacote' | 'saldo';

type ClientFormState = {
  name: string;
  phone: string;
  email: string;
  status: 'ativo' | 'pendente' | 'inativo';
  cpf: string;
  birthDate: string;
  gender: string;
  occupation: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  administrativeNotes: string;
};

const EMPTY_CLIENT_FORM: ClientFormState = {
  name: '',
  phone: '',
  email: '',
  status: 'ativo',
  cpf: '',
  birthDate: '',
  gender: '',
  occupation: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
  administrativeNotes: '',
};

function formatDateTime(value: string | null) {
  if (!value) return 'Sem agendamento';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Sem agendamento';
  }
}

function formatBirthDate(value?: string | null) {
  if (!value) return 'Não informada';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  return value;
}

function buildWhatsAppUrl(phone: string, name: string) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const full = digits.startsWith('55') ? digits : `55${digits}`;
  const firstName = name.split(' ')[0] || 'Cliente';
  return `https://wa.me/${full}?text=${encodeURIComponent(`Olá, ${firstName}! Tudo bem? Aqui é do consultório da Camila Machado.`)}`;
}

function getClientInitials(name: string) {
  const cleaned = (name || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-ZÀ-ÿ\s]/g, ' ')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

let cachedClients: ClientSummary[] | null = null;

export default function ClientesPage() {
  const [clients, setClients] = useState<ClientSummary[]>(() =>
    getInstantCache<ClientSummary[]>('admin_clients', [])
  );
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('todos');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const cached = getInstantCache<ClientSummary[]>('admin_clients', []);
    return cached.length === 0;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal Criar / Editar Cliente
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientSummary | null>(null);
  const [modalStep, setModalStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<ClientFormState>(EMPTY_CLIENT_FORM);
  const [formError, setFormError] = useState('');

  // Modal Detalhes 360º do Cliente
  const [viewingClient, setViewingClient] = useState<ClientSummary | null>(null);

  // Modal Gerador de Documentos / Recibos
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docPrefill, setDocPrefill] = useState<QuickDocumentPrefill | undefined>(undefined);

  // Modal Confirmar Exclusão
  const [deletingClient, setDeletingClient] = useState<ClientSummary | null>(null);
  const [anamneseLinkCopied, setAnamneseLinkCopied] = useState(false);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/clients?status=todos', { cache: 'no-store' });
      const body = await response.json();
      setLoading(false);
      if (!response.ok) return setError(body.error ?? 'Não foi possível carregar os clientes.');
      const list: ClientSummary[] = body.clients ?? [];
      setInstantCache('admin_clients', list);
      setClients(list);
    } catch {
      setLoading(false);
      setError('Erro de conexão ao carregar clientes.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Estatísticas para os KPIs do topo
  const stats = useMemo(() => {
    const total = clients.length;
    const ativos = clients.filter((c) => c.status === 'ativo').length;
    const pendentes = clients.filter((c) => c.status === 'pendente').length;
    const inativos = clients.filter((c) => c.status === 'inativo').length;
    const comPacote = clients.filter((c) => (c.activePackagesCount ?? 0) > 0).length;
    const sessoesEmHaver = clients.reduce((acc, c) => acc + (c.activePackagesRemainingSessions ?? 0), 0);
    const anamneseOk = clients.filter((c) => c.hasAnamnese).length;
    const comSaldoAberto = clients.filter((c) => (c.openBalanceCents ?? 0) > 0).length;
    const totalSaldoAbertoCents = clients.reduce((acc, c) => acc + (c.openBalanceCents ?? 0), 0);

    return {
      total,
      ativos,
      pendentes,
      inativos,
      comPacote,
      sessoesEmHaver,
      anamneseOk,
      comSaldoAberto,
      totalSaldoAbertoCents,
    };
  }, [clients]);

  // Lista filtrada por busca + filtro rápido (suporta CPF com ou sem pontuação)
  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return clients.filter((c) => {
      if (quickFilter === 'ativo' && c.status !== 'ativo') return false;
      if (quickFilter === 'pendente' && c.status !== 'pendente') return false;
      if (quickFilter === 'inativo' && c.status !== 'inativo') return false;
      if (quickFilter === 'pacote' && !(c.activePackagesCount && c.activePackagesCount > 0)) return false;
      if (quickFilter === 'saldo' && !(c.openBalanceCents && c.openBalanceCents > 0)) return false;

      if (!q) return true;
      const matchName = c.name.toLowerCase().includes(q);
      const phoneRaw = (c.phone || '').toLowerCase();
      const phoneDigits = phoneRaw.replace(/\D/g, '');
      const matchPhone =
        phoneRaw.includes(q) ||
        formatPhone(c.phone).toLowerCase().includes(q) ||
        (qDigits.length > 0 && phoneDigits.includes(qDigits));
      const matchEmail = (c.email || '').toLowerCase().includes(q);

      const cpfRaw = (c.cpf || '').toLowerCase();
      const cpfFormatted = c.cpf ? maskCpf(c.cpf).toLowerCase() : '';
      const cpfDigits = cpfRaw.replace(/\D/g, '');
      const matchCpf =
        cpfRaw.includes(q) ||
        cpfFormatted.includes(q) ||
        (qDigits.length > 0 && cpfDigits.includes(qDigits));

      return matchName || matchPhone || matchEmail || matchCpf;
    });
  }, [clients, search, quickFilter]);

  function handleOpenCreate() {
    setEditingClient(null);
    setForm(EMPTY_CLIENT_FORM);
    setFormError('');
    setModalStep(1);
    setIsFormOpen(true);
  }

  function handleOpenEdit(client: ClientSummary) {
    setViewingClient(null);
    setEditingClient(client);
    setForm({
      name: client.name || '',
      phone: maskPhone(client.phone || ''),
      email: client.email || '',
      status: client.status || 'ativo',
      cpf: client.cpf ? maskCpf(client.cpf) : '',
      birthDate: client.birthDate || '',
      gender: client.gender || '',
      occupation: client.occupation || '',
      emergencyContactName: client.emergencyContactName || '',
      emergencyContactPhone: client.emergencyContactPhone ? maskPhone(client.emergencyContactPhone) : '',
      emergencyContactRelationship: client.emergencyContactRelationship || '',
      administrativeNotes: client.administrativeNotes || '',
    });
    setFormError('');
    setModalStep(1);
    setIsFormOpen(true);
  }

  async function handleSubmitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    if (!form.name.trim() || form.name.trim().length < 3) {
      setModalStep(1);
      return setFormError('Informe o nome completo do cliente (mínimo 3 caracteres).');
    }
    const cleanPhone = form.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setModalStep(1);
      return setFormError('Informe um número de WhatsApp válido com DDD.');
    }

    setSaving(true);
    try {
      const url = editingClient ? `/api/admin/clients/${editingClient.id}` : '/api/admin/clients';
      const method = editingClient ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone,
          email: form.email.trim(),
          status: form.status,
          cpf: form.cpf.trim() || null,
          birthDate: form.birthDate.trim() || null,
          gender: form.gender.trim() || null,
          occupation: form.occupation.trim() || null,
          emergencyContactName: form.emergencyContactName.trim() || null,
          emergencyContactPhone: form.emergencyContactPhone.trim() || null,
          emergencyContactRelationship: form.emergencyContactRelationship.trim() || null,
          administrativeNotes: form.administrativeNotes.trim() || undefined,
        }),
      });
      const resJson = await response.json();
      setSaving(false);

      if (!response.ok) {
        return setFormError(resJson.error ?? 'Não foi possível salvar os dados do cliente.');
      }

      setIsFormOpen(false);
      setSuccessMsg(
        editingClient
          ? `Cadastro de "${form.name.trim()}" atualizado com sucesso!`
          : `Cliente "${form.name.trim()}" cadastrado com sucesso! A Ficha Inicial já foi alimentada.`,
      );
      setTimeout(() => setSuccessMsg(''), 4500);
      await load();
    } catch (err) {
      setSaving(false);
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar cliente.');
    }
  }

  async function handleQuickStatusChange(client: ClientSummary, newStatus: 'ativo' | 'pendente' | 'inativo') {
    try {
      const response = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: client.name,
          phone: client.phone,
          email: client.email || '',
          status: newStatus,
          cpf: client.cpf || null,
          birthDate: client.birthDate || null,
          gender: client.gender || null,
          occupation: client.occupation || null,
          emergencyContactName: client.emergencyContactName || null,
          emergencyContactPhone: client.emergencyContactPhone || null,
          emergencyContactRelationship: client.emergencyContactRelationship || null,
          administrativeNotes: client.administrativeNotes || undefined,
        }),
      });
      if (response.ok) {
        setSuccessMsg(`Status de "${client.name}" alterado para ${newStatus.toUpperCase()}.`);
        setTimeout(() => setSuccessMsg(''), 3500);
        if (viewingClient?.id === client.id) {
          setViewingClient({ ...viewingClient, status: newStatus });
        }
        await load();
      }
    } catch {
      setError('Não foi possível alterar o status do cliente.');
    }
  }

  async function handleConfirmDelete() {
    if (!deletingClient) return;
    setDeletingLoading(true);
    try {
      const response = await fetch(`/api/admin/clients/${deletingClient.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      setDeletingLoading(false);
      if (!response.ok) {
        setError(data.error ?? 'Erro ao excluir cliente.');
        setDeletingClient(null);
        return;
      }
      const deletedName = deletingClient.name;
      setDeletingClient(null);
      if (viewingClient?.id === deletingClient.id) setViewingClient(null);
      setSuccessMsg(`Cliente "${deletedName}" removido com sucesso.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await load();
    } catch {
      setDeletingLoading(false);
      setError('Falha ao excluir cliente.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {/* ══════════════════════════════════════════════════════════
          CABEÇALHO DA PÁGINA
      ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <span className="eyebrow" style={{ color: '#21577a', fontWeight: 800 }}>
            Relacionamento & Base Clínica
          </span>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: '0.15rem 0' }}>
            Central de Clientes
          </h1>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b' }}>
            Gerencie fichas cadastrais, status de acompanhamento, pacotes ativos e acesso rápido ao prontuário.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Link
            href="/admin/prontuarios"
            className="btn btn-secondary"
            style={{
              borderRadius: '999px',
              padding: '0.58rem 1.05rem',
              fontSize: '0.83rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <FileText size={16} /> Prontuários
          </Link>
          <button
            type="button"
            onClick={async () => {
              const url = `${window.location.origin}/anamnese`;
              try {
                await navigator.clipboard.writeText(url);
                setAnamneseLinkCopied(true);
                setTimeout(() => setAnamneseLinkCopied(false), 3000);
              } catch {
                // fallback
              }
            }}
            style={{
              borderRadius: '999px',
              padding: '0.6rem 1.15rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: anamneseLinkCopied ? '#15803d' : '#f0fdf4',
              color: anamneseLinkCopied ? '#ffffff' : '#166534',
              border: anamneseLinkCopied ? '1.5px solid #15803d' : '1.5px solid #bbf7d0',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 8px rgba(22, 163, 74, 0.12)',
            }}
            title="Copiar link público para o cliente preencher a ficha de cadastro e anamnese online"
          >
            <ClipboardList size={16} />
            {anamneseLinkCopied ? 'Link Copiado!' : 'Copiar Link da Anamnese'}
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenCreate}
            style={{
              borderRadius: '999px',
              padding: '0.6rem 1.2rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: '0 6px 18px rgba(33, 87, 122, 0.24)',
            }}
          >
            <Plus size={17} /> Novo Cliente
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          CARDS DE RESUMO (KPIs)
      ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '0.85rem',
        }}
      >
        {/* KPI 1: Total de Clientes */}
        <button
          type="button"
          onClick={() => setQuickFilter('todos')}
          style={{
            textAlign: 'left',
            background: '#ffffff',
            border: quickFilter === 'todos' ? '1.5px solid #21577a' : '1px solid #e2e8f0',
            borderRadius: '18px',
            padding: '1rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '13px',
              background: '#eff6ff',
              color: '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Users size={21} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {stats.total}
            </div>
            <div style={{ fontSize: '0.77rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
              {stats.ativos} ativo(s) · {stats.pendentes} pendente(s)
            </div>
          </div>
        </button>

        {/* KPI 2: Pacotes Ativos */}
        <button
          type="button"
          onClick={() => setQuickFilter(quickFilter === 'pacote' ? 'todos' : 'pacote')}
          style={{
            textAlign: 'left',
            background: '#ffffff',
            border: quickFilter === 'pacote' ? '1.5px solid #059669' : '1px solid #e2e8f0',
            borderRadius: '18px',
            padding: '1rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '13px',
              background: '#ecfdf5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={21} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#047857', lineHeight: 1.1 }}>
              {stats.comPacote}
            </div>
            <div style={{ fontSize: '0.77rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
              Com pacote ({stats.sessoesEmHaver} sessões em haver)
            </div>
          </div>
        </button>

        {/* KPI 3: Anamnese & Ficha */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '18px',
            padding: '1rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '13px',
              background: '#f5f3ff',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={21} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {stats.anamneseOk}/{stats.total}
            </div>
            <div style={{ fontSize: '0.77rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
              Fichas / Anamneses preenchidas
            </div>
          </div>
        </div>

        {/* KPI 4: Saldos em Aberto */}
        <button
          type="button"
          onClick={() => setQuickFilter(quickFilter === 'saldo' ? 'todos' : 'saldo')}
          style={{
            textAlign: 'left',
            background: '#ffffff',
            border: quickFilter === 'saldo' ? '1.5px solid #d97706' : '1px solid #e2e8f0',
            borderRadius: '18px',
            padding: '1rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '13px',
              background: '#fffbeb',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Wallet size={21} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.22rem', fontWeight: 800, color: stats.totalSaldoAbertoCents > 0 ? '#b45309' : '#0f172a', lineHeight: 1.1 }}>
              {formatCurrency(stats.totalSaldoAbertoCents)}
            </div>
            <div style={{ fontSize: '0.77rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
              {stats.comSaldoAberto} cliente(s) com saldo em aberto
            </div>
          </div>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          BARRA DE BUSCA, FILTROS RÁPIDOS & SELETOR DE VISÃO
      ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '18px',
          padding: '0.85rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
        }}
      >
        {/* Campo de Busca */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            background: '#f8fafc',
            border: '1.5px solid #cbd5e1',
            borderRadius: '999px',
            padding: '0.5rem 0.95rem',
            flex: '1 1 260px',
            maxWidth: '420px',
          }}
        >
          <Search size={16} style={{ color: '#64748b', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, WhatsApp, CPF ou e-mail..."
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              width: '100%',
              fontSize: '0.84rem',
              color: '#0f172a',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                border: 'none',
                background: '#e2e8f0',
                color: '#475569',
                borderRadius: '999px',
                width: '20px',
                height: '20px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Limpar busca"
            >
              <X size={12} />
            </button>
          )}
        </label>

        {/* Pílulas de Filtro Rápido + Alternador Tabela/Cards */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div
            role="group"
            aria-label="Filtrar clientes"
            style={{
              display: 'inline-flex',
              flexWrap: 'wrap',
              background: '#f1f5f9',
              padding: '0.24rem',
              borderRadius: '999px',
              border: '1px solid #e2e8f0',
              gap: '0.18rem',
            }}
          >
            {([
              { id: 'todos', label: `Todos (${stats.total})` },
              { id: 'ativo', label: `Ativos (${stats.ativos})` },
              { id: 'pendente', label: `Pendentes (${stats.pendentes})` },
              { id: 'inativo', label: `Inativos (${stats.inativos})` },
              { id: 'pacote', label: `✨ Pacotes (${stats.comPacote})` },
              { id: 'saldo', label: `💳 Em Aberto (${stats.comSaldoAberto})` },
            ] as Array<{ id: QuickFilter; label: string }>).map((tab) => {
              const active = quickFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setQuickFilter(tab.id)}
                  style={{
                    border: 'none',
                    background: active ? '#ffffff' : 'transparent',
                    color: active ? '#0f172a' : '#64748b',
                    fontWeight: active ? 700 : 600,
                    fontSize: '0.76rem',
                    padding: '0.36rem 0.78rem',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    boxShadow: active ? '0 1px 4px rgba(15, 23, 42, 0.1)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Toggle Tabela vs Cards */}
          <div
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: '0.22rem',
              borderRadius: '999px',
              border: '1px solid #e2e8f0',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Visualização em Lista"
              style={{
                border: 'none',
                background: viewMode === 'table' ? '#ffffff' : 'transparent',
                color: viewMode === 'table' ? '#0f172a' : '#64748b',
                padding: '0.35rem 0.65rem',
                borderRadius: '999px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(15,23,42,0.1)' : 'none',
              }}
            >
              <List size={14} /> Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              title="Visualização em Cards"
              style={{
                border: 'none',
                background: viewMode === 'cards' ? '#ffffff' : 'transparent',
                color: viewMode === 'cards' ? '#0f172a' : '#64748b',
                padding: '0.35rem 0.65rem',
                borderRadius: '999px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(15,23,42,0.1)' : 'none',
              }}
            >
              <LayoutGrid size={14} /> Cards
            </button>
          </div>
        </div>
      </div>

      {/* Alertas de Sucesso / Erro */}
      {successMsg && (
        <div className="form-alert form-alert-success page-alert" role="status" style={{ borderRadius: '14px' }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} aria-label="Fechar"><X size={16} /></button>
        </div>
      )}

      {error && (
        <div className="form-alert page-alert" role="alert" style={{ borderRadius: '14px' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Fechar"><X size={16} /></button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          LISTAGEM DE CLIENTES (MODO TABELA RICA OU CARDS)
      ══════════════════════════════════════════════════════════ */}
      {filteredClients.length === 0 && !loading ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1.5px dashed #cbd5e1',
            padding: '3rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '999px',
              background: '#f1f5f9',
              color: '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '0.85rem',
            }}
          >
            <UserRound size={26} />
          </div>
          <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.08rem', fontWeight: 800, color: '#0f172a' }}>
            Nenhum cliente encontrado para este filtro
          </h3>
          <p style={{ margin: '0 auto 1.2rem', maxWidth: '420px', fontSize: '0.85rem', color: '#64748b' }}>
            Experimente limpar o filtro de busca ou cadastre um novo cliente na base da clínica.
          </p>
          <div style={{ display: 'inline-flex', gap: '0.6rem' }}>
            {(search || quickFilter !== 'todos') && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSearch('');
                  setQuickFilter('todos');
                }}
                style={{ borderRadius: '999px', padding: '0.55rem 1.1rem', fontSize: '0.82rem' }}
              >
                Limpar Filtros
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenCreate}
              style={{ borderRadius: '999px', padding: '0.55rem 1.15rem', fontSize: '0.82rem' }}
            >
              <Plus size={16} /> Cadastrar Novo Cliente
            </button>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <div
          className="responsive-table card clients-table-wrapper"
          style={{
            borderRadius: '20px',
            border: '2px solid #cbd5e1',
            overflow: 'hidden',
            boxShadow: '0 6px 20px rgba(15, 23, 42, 0.06)',
          }}
        >
          <table className="data-table clients-data-table">
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th>Cliente & Indicadores</th>
                <th>Contato & CPF</th>
                <th>Agenda & Sessões</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ações Rápidas</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => {
                const waUrl = buildWhatsAppUrl(client.phone, client.name);
                const initials = getClientInitials(client.name);

                return (
                  <tr
                    key={client.id}
                    className="client-table-row-card"
                    onClick={() => setViewingClient(client)}
                    style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                  >
                    <td data-label="Cliente">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', width: '100%' }}>
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, #21577a 0%, #173f5a 100%)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.88rem',
                            flexShrink: 0,
                            border: '2px solid rgba(255, 255, 255, 0.85)',
                            boxShadow: '0 4px 10px rgba(33, 87, 122, 0.25)',
                          }}
                        >
                          {initials}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.96rem', color: '#0f172a', fontWeight: 800 }}>
                              {client.name}
                            </strong>
                            {client.hasAnamnese ? (
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  padding: '0.14rem 0.52rem',
                                  borderRadius: '999px',
                                  background: '#dcfce7',
                                  color: '#166534',
                                  border: '1px solid #86efac',
                                }}
                                title="Ficha inicial / Anamnese preenchida"
                              >
                                ✓ Ficha OK
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  padding: '0.14rem 0.52rem',
                                  borderRadius: '999px',
                                  background: '#f1f5f9',
                                  color: '#475569',
                                  border: '1px solid #cbd5e1',
                                }}
                                title="Ficha inicial pendente de preenchimento completo"
                              >
                                Ficha básica
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.28rem' }}>
                            {Boolean(client.activePackagesCount) && (client.activePackagesRemainingSessions ?? 0) > 0 ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  background: '#ecfdf5',
                                  color: '#047857',
                                  padding: '2px 8px',
                                  borderRadius: '9999px',
                                  border: '1.5px solid #86efac',
                                }}
                              >
                                <Sparkles size={11} /> 🎟️ Pacote Ativo · Restam {client.activePackagesRemainingSessions} pagas
                              </span>
                            ) : client.completedAppointments >= 4 && (!client.activePackagesCount || (client.activePackagesRemainingSessions ?? 0) === 0) ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  background: '#fef3c7',
                                  color: '#b45309',
                                  padding: '2px 8px',
                                  borderRadius: '9999px',
                                  border: '1.5px solid #fde68a',
                                }}
                              >
                                🔁 Pacote Concluído · Oferecer Manutenção
                              </span>
                            ) : null}

                            {(client.openBalanceCents ?? 0) > 0 && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  background: '#fffbeb',
                                  color: '#b45309',
                                  padding: '2px 8px',
                                  borderRadius: '9999px',
                                  border: '1px solid #fcd34d',
                                }}
                              >
                                ⏳ Em aberto: {formatCurrency(client.openBalanceCents ?? 0)}
                              </span>
                            )}

                            {client.occupation && (
                              <span style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 600 }}>
                                {client.occupation}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td data-label="Contato & CPF">
                      <div className="client-cell-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.24rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.84rem', fontWeight: 800, color: '#0f172a' }}>
                          <Phone size={13} style={{ color: '#0284c7' }} /> {formatPhone(client.phone)}
                        </span>
                        {client.email && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: '#475569', fontWeight: 500 }}>
                            <Mail size={12} /> {client.email}
                          </span>
                        )}
                        {client.cpf && (
                          <span style={{ fontSize: '0.73rem', color: '#334155', fontWeight: 700 }}>
                            CPF: {maskCpf(client.cpf)}
                          </span>
                        )}
                      </div>
                    </td>

                    <td data-label="Agenda & Sessões">
                      <div className="client-cell-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.8rem',
                            fontWeight: client.nextAppointmentAt ? 700 : 600,
                            color: client.nextAppointmentAt ? '#0369a1' : '#475569',
                          }}
                        >
                          <CalendarDays size={13} />
                          {formatDateTime(client.nextAppointmentAt)}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 700 }}>
                          ✓ <strong>{client.completedAppointments}</strong> sessão(ões) concluída(s)
                        </span>
                      </div>
                    </td>

                    <td data-label="Status" onClick={(e) => e.stopPropagation()}>
                      <span
                        className={`badge ${
                          client.status === 'ativo'
                            ? 'badge-success'
                            : client.status === 'pendente'
                              ? 'badge-warning'
                              : 'badge-muted'
                        }`}
                        style={{
                          textTransform: 'capitalize',
                          fontWeight: 800,
                          padding: '0.3rem 0.78rem',
                          borderRadius: '999px',
                          border:
                            client.status === 'ativo'
                              ? '1.5px solid #86efac'
                              : client.status === 'pendente'
                                ? '1.5px solid #fcd34d'
                                : '1.5px solid #cbd5e1',
                        }}
                      >
                        {client.status}
                      </span>
                    </td>

                    <td data-label="Ações Rápidas" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div className="client-actions-row" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Conversar no WhatsApp"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '34px',
                              height: '34px',
                              borderRadius: '999px',
                              background: '#dcfce7',
                              color: '#15803d',
                              border: '1.5px solid #4ade80',
                              textDecoration: 'none',
                            }}
                          >
                            <WhatsappIcon size={18} />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => setViewingClient(client)}
                          title="Ver Ficha 360º do Cliente"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.38rem 0.76rem',
                            borderRadius: '999px',
                            background: '#f8fafc',
                            color: '#1e293b',
                            border: '1.5px solid #94a3b8',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Eye size={13} /> Detalhes
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDocPrefill({
                              clientName: client.name,
                              clientCpf: client.cpf,
                              clientPhone: client.phone,
                              clientBirthDate: client.birthDate,
                            });
                            setDocModalOpen(true);
                          }}
                          title="Gerar Declaração, Recibo ou Termo LGPD em PDF"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.38rem 0.72rem',
                            borderRadius: '999px',
                            background: '#eff6ff',
                            color: '#1e40af',
                            border: '1.5px solid #93c5fd',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <FileText size={13} /> Doc / Recibo
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(client)}
                          title="Editar Cadastro do Cliente"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.38rem 0.76rem',
                            borderRadius: '999px',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1.5px solid #93c5fd',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Pencil size={13} /> Editar
                        </button>

                        <Link
                          href={`/admin/prontuarios/${client.id}`}
                          className="btn btn-primary btn-sm"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.32rem',
                            padding: '0.4rem 0.85rem',
                            fontSize: '0.76rem',
                            borderRadius: '999px',
                            fontWeight: 700,
                            border: '1.5px solid #163242',
                          }}
                        >
                          <FileText size={13} /> Prontuário
                        </Link>

                        <button
                          type="button"
                          onClick={() => setDeletingClient(client)}
                          title="Excluir cliente"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '34px',
                            height: '34px',
                            borderRadius: '999px',
                            background: '#fef2f2',
                            color: '#dc2626',
                            border: '1.5px solid #fca5a5',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════
           MODO CARDS VISUAIS
        ══════════════════════════════════════════════════════════ */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: '1rem',
          }}
        >
          {filteredClients.map((client) => {
            const waUrl = buildWhatsAppUrl(client.phone, client.name);
            const initials = getClientInitials(client.name);

            return (
              <article
                key={client.id}
                onClick={() => setViewingClient(client)}
                className="client-card-item"
                style={{
                  background: '#ffffff',
                  border: '2px solid #94a3b8',
                  borderLeft: '5px solid #1a3a4a',
                  borderRadius: '20px',
                  padding: '1.15rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.9rem',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.07)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <div>
                  {/* Topo do Card */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '14px',
                          background: 'linear-gradient(135deg, #21577a 0%, #173f5a 100%)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          flexShrink: 0,
                          border: '2px solid rgba(255,255,255,0.85)',
                          boxShadow: '0 3px 8px rgba(33, 87, 122, 0.22)',
                        }}
                      >
                        {initials}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            display: 'block',
                            fontSize: '0.98rem',
                            fontWeight: 800,
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {client.name}
                        </strong>
                        <span style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 700 }}>
                          {formatPhone(client.phone)}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`badge ${
                        client.status === 'ativo'
                          ? 'badge-success'
                          : client.status === 'pendente'
                            ? 'badge-warning'
                            : 'badge-muted'
                      }`}
                      style={{
                        textTransform: 'capitalize',
                        borderRadius: '999px',
                        fontWeight: 800,
                        border:
                          client.status === 'ativo'
                            ? '1.5px solid #86efac'
                            : client.status === 'pendente'
                              ? '1.5px solid #fcd34d'
                              : '1.5px solid #cbd5e1',
                      }}
                    >
                      {client.status}
                    </span>
                  </div>

                  {/* Badges de informação */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.85rem' }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.55rem',
                        borderRadius: '999px',
                        background: '#f1f5f9',
                        color: '#334155',
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      ✓ {client.completedAppointments} sessões concluídas
                    </span>

                    {Boolean(client.activePackagesCount) && (client.activePackagesRemainingSessions ?? 0) > 0 ? (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          background: '#ecfdf5',
                          color: '#047857',
                          border: '1.5px solid #86efac',
                        }}
                      >
                        🎟️ Pacote Ativo · Restam {client.activePackagesRemainingSessions} pagas
                      </span>
                    ) : client.completedAppointments >= 4 && (!client.activePackagesCount || (client.activePackagesRemainingSessions ?? 0) === 0) ? (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          background: '#fef3c7',
                          color: '#b45309',
                          border: '1.5px solid #fde68a',
                        }}
                      >
                        🔁 Pacote Concluído · Oferecer Manutenção
                      </span>
                    ) : null}

                    {(client.openBalanceCents ?? 0) > 0 && (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          background: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fcd34d',
                        }}
                      >
                        ⏳ Falta {formatCurrency(client.openBalanceCents ?? 0)}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '12px',
                      background: '#f8fafc',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.78rem',
                      color: '#475569',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.22rem',
                    }}
                  >
                    {client.email && <span>✉️ {client.email}</span>}
                    <span>📅 Próximo: <strong>{formatDateTime(client.nextAppointmentAt)}</strong></span>
                  </div>
                </div>

                {/* Rodapé de Ações do Card */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    borderTop: '1.5px solid #cbd5e1',
                    paddingTop: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.4rem',
                  }}
                >
                  <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.36rem 0.7rem',
                          borderRadius: '999px',
                          background: '#dcfce7',
                          color: '#15803d',
                          border: '1.5px solid #4ade80',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        <WhatsappIcon size={15} /> WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(client)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.36rem 0.7rem',
                        borderRadius: '999px',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1.5px solid #93c5fd',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <Pencil size={13} /> Editar
                    </button>
                  </div>

                  <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setDocPrefill({
                          clientName: client.name,
                          clientCpf: client.cpf,
                          clientPhone: client.phone,
                          clientBirthDate: client.birthDate,
                        });
                        setDocModalOpen(true);
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ borderRadius: '999px', padding: '0.38rem 0.72rem', fontSize: '0.74rem', border: '1.5px solid #94a3b8' }}
                      title="Gerar Declaração, Recibo ou Termo LGPD em PDF"
                    >
                      <FileText size={13} /> Doc
                    </button>
                    <Link
                      href={`/admin/prontuarios/${client.id}`}
                      className="btn btn-primary btn-sm"
                      style={{ borderRadius: '999px', padding: '0.38rem 0.8rem', fontSize: '0.75rem', border: '1.5px solid #163242' }}
                    >
                      <FileText size={13} /> Prontuário
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeletingClient(client)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '999px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1.5px solid #fca5a5',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      title="Excluir cliente"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL 1: VISÃO 360º / DETALHES RÁPIDOS DO CLIENTE
      ══════════════════════════════════════════════════════════ */}
      {viewingClient && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewingClient(null);
          }}
        >
          <section
            className="modal client-modal-enhanced"
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-client-title"
            style={{
              maxWidth: '640px',
              width: '95%',
              overflow: 'hidden',
              border: '2px solid #64748b',
              borderRadius: '22px',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.28), 0 0 0 4px rgba(148, 163, 184, 0.2)',
            }}
          >
            <div
              className="modal-header"
              style={{
                padding: '1.2rem 1.45rem',
                borderBottom: '2px solid #cbd5e1',
                background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '15px',
                    background: 'linear-gradient(135deg, #21577a 0%, #173f5a 100%)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1rem',
                    border: '2px solid #ffffff',
                    boxShadow: '0 4px 10px rgba(33, 87, 122, 0.25)',
                  }}
                >
                  {getClientInitials(viewingClient.name)}
                </div>
                <div>
                  <span className="eyebrow">Visão 360º do Cliente</span>
                  <h2 id="view-client-title" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                    {viewingClient.name}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setViewingClient(null)}
                aria-label="Fechar"
                style={{ border: '1.5px solid #94a3b8', background: '#ffffff' }}
              >
                <X size={19} />
              </button>
            </div>

            <div
              className="modal-body"
              style={{
                maxHeight: 'calc(86vh - 130px)',
                overflowY: 'auto',
                marginRight: '4px',
                padding: '1.25rem 1.45rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              {/* Seletor Rápido de Status */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '2px solid #cbd5e1',
                  borderRadius: '14px',
                  padding: '0.8rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1e293b' }}>
                  Status de Relacionamento:
                </span>
                <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {(['ativo', 'pendente', 'inativo'] as const).map((st) => {
                    const active = viewingClient.status === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleQuickStatusChange(viewingClient, st)}
                        style={{
                          padding: '0.34rem 0.82rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          textTransform: 'capitalize',
                          cursor: 'pointer',
                          border: active ? '2px solid #173f5a' : '1.5px solid #94a3b8',
                          background: active ? '#21577a' : '#ffffff',
                          color: active ? '#ffffff' : '#334155',
                          boxShadow: active ? '0 2px 6px rgba(33, 87, 122, 0.25)' : 'none',
                        }}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grid de Informações Pessoais & Contato */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.85rem',
                }}
              >
                <div
                  style={{
                    background: '#f8fafc',
                    border: '2px solid #cbd5e1',
                    borderLeft: '4px solid #21577a',
                    borderRadius: '14px',
                    padding: '0.9rem 1.05rem',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#1e293b', letterSpacing: '0.04em' }}>
                    Contato & Identificação
                  </span>
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.32rem', fontSize: '0.84rem', color: '#1e293b' }}>
                    <div><strong>WhatsApp:</strong> {formatPhone(viewingClient.phone)}</div>
                    <div><strong>E-mail:</strong> {viewingClient.email || 'Não informado'}</div>
                    <div><strong>CPF:</strong> {viewingClient.cpf ? maskCpf(viewingClient.cpf) : 'Não informado'}</div>
                    <div><strong>Nascimento:</strong> {formatBirthDate(viewingClient.birthDate)}</div>
                    {viewingClient.occupation && <div><strong>Profissão:</strong> {viewingClient.occupation}</div>}
                  </div>
                </div>

                <div
                  style={{
                    background: '#f8fafc',
                    border: '2px solid #cbd5e1',
                    borderLeft: '4px solid #0284c7',
                    borderRadius: '14px',
                    padding: '0.9rem 1.05rem',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#1e293b', letterSpacing: '0.04em' }}>
                    Resumo Clínico & Financeiro
                  </span>
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.32rem', fontSize: '0.84rem', color: '#1e293b' }}>
                    <div><strong>Sessões concluídas:</strong> {viewingClient.completedAppointments}</div>
                    <div><strong>Próximo horário:</strong> {formatDateTime(viewingClient.nextAppointmentAt)}</div>
                    <div>
                      <strong>Pacotes ativos:</strong>{' '}
                      {viewingClient.activePackagesCount
                        ? `${viewingClient.activePackagesCount} (${viewingClient.activePackagesRemainingSessions ?? 0} sessões restantes)`
                        : 'Nenhum pacote ativo'}
                    </div>
                    <div>
                      <strong>Saldo em aberto:</strong>{' '}
                      <span style={{ color: (viewingClient.openBalanceCents ?? 0) > 0 ? '#b45309' : '#15803d', fontWeight: 800 }}>
                        {(viewingClient.openBalanceCents ?? 0) > 0
                          ? formatCurrency(viewingClient.openBalanceCents ?? 0)
                          : 'Quitado (R$ 0,00)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contato de Emergência & Observações */}
              {(viewingClient.emergencyContactName || viewingClient.administrativeNotes) && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '2px solid #fcd34d',
                    borderLeft: '4px solid #d97706',
                    borderRadius: '14px',
                    padding: '0.9rem 1.05rem',
                    fontSize: '0.83rem',
                    color: '#92400e',
                  }}
                >
                  {viewingClient.emergencyContactName && (
                    <div style={{ marginBottom: viewingClient.administrativeNotes ? '0.4rem' : 0 }}>
                      <strong>🚨 Contato de Emergência:</strong> {viewingClient.emergencyContactName}
                      {viewingClient.emergencyContactRelationship ? ` (${viewingClient.emergencyContactRelationship})` : ''}
                      {viewingClient.emergencyContactPhone ? ` · ${formatPhone(viewingClient.emergencyContactPhone)}` : ''}
                    </div>
                  )}
                  {viewingClient.administrativeNotes && (
                    <div>
                      <strong>📝 Observações de Recepção:</strong> {viewingClient.administrativeNotes}
                    </div>
                  )}
                </div>
              )}

              {/* Atalhos Rápidos */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.55rem',
                  paddingTop: '0.85rem',
                  borderTop: '2px solid #e2e8f0',
                }}
              >
                <Link
                  href={`/admin/prontuarios/${viewingClient.id}`}
                  className="btn btn-primary"
                  style={{ borderRadius: '999px', padding: '0.55rem 1.1rem', fontSize: '0.82rem', border: '1.5px solid #163242' }}
                >
                  <FileText size={15} /> Abrir Prontuário Completo
                </Link>

                {buildWhatsAppUrl(viewingClient.phone, viewingClient.name) && (
                  <a
                    href={buildWhatsAppUrl(viewingClient.phone, viewingClient.name)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{
                      borderRadius: '999px',
                      padding: '0.55rem 1.05rem',
                      fontSize: '0.82rem',
                      background: '#dcfce7',
                      color: '#166534',
                      border: '1.5px solid #4ade80',
                      fontWeight: 700,
                    }}
                  >
                    <WhatsappIcon size={17} /> Chamar no WhatsApp
                  </a>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleOpenEdit(viewingClient)}
                  style={{
                    borderRadius: '999px',
                    padding: '0.55rem 1.05rem',
                    fontSize: '0.82rem',
                    border: '1.5px solid #94a3b8',
                    fontWeight: 700,
                  }}
                >
                  <Pencil size={15} /> Editar Cadastro
                </button>

                <button
                  type="button"
                  onClick={() => setDeletingClient(viewingClient)}
                  style={{
                    marginLeft: 'auto',
                    borderRadius: '999px',
                    padding: '0.55rem 0.95rem',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1.5px solid #fca5a5',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={14} /> Excluir
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL 2: CRIAR / EDITAR CLIENTE (3 ETAPAS VISUAIS PREMIUM)
      ══════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !saving) setIsFormOpen(false);
          }}
        >
          <section
            className="modal client-modal-enhanced"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-modal-title"
            style={{
              maxWidth: '660px',
              width: '95%',
              overflow: 'hidden',
              border: '2px solid #64748b',
              borderRadius: '22px',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.28), 0 0 0 4px rgba(148, 163, 184, 0.2)',
            }}
          >
            <div
              className="modal-header"
              style={{
                padding: '1.2rem 1.45rem',
                borderBottom: '2px solid #cbd5e1',
                background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
              }}
            >
              <div>
                <span className="eyebrow">{editingClient ? 'Atualização Cadastral' : 'Cadastro Inteligente'}</span>
                <h2 id="client-modal-title" style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>
                  {editingClient ? `Editar: ${editingClient.name}` : 'Cadastrar Novo Cliente'}
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setIsFormOpen(false)}
                disabled={saving}
                aria-label="Fechar"
                style={{ border: '1.5px solid #94a3b8', background: '#ffffff' }}
              >
                <X size={19} />
              </button>
            </div>

            {/* Stepper estilo iOS Segmented */}
            <div style={{ padding: '0.9rem 1.45rem 0' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.4rem',
                  background: '#e2e8f0',
                  padding: '0.32rem',
                  borderRadius: '14px',
                  border: '1.5px solid #94a3b8',
                }}
              >
                {[
                  { step: 1 as const, title: '1. Contato & Status' },
                  { step: 2 as const, title: '2. Ficha Pessoal' },
                  { step: 3 as const, title: '3. Emergência & Obs' },
                ].map((item) => {
                  const active = modalStep === item.step;
                  return (
                    <button
                      key={item.step}
                      type="button"
                      onClick={() => setModalStep(item.step)}
                      style={{
                        border: active ? '1.5px solid #21577a' : '1.5px solid transparent',
                        borderRadius: '10px',
                        padding: '0.52rem 0.65rem',
                        background: active ? '#ffffff' : 'transparent',
                        color: active ? '#0f172a' : '#475569',
                        fontWeight: active ? 800 : 600,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        boxShadow: active ? '0 2px 8px rgba(15, 23, 42, 0.12)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {item.title}
                    </button>
                  );
                })}
              </div>
            </div>

            <form
              onSubmit={handleSubmitForm}
              className="modal-body"
              style={{
                maxHeight: 'calc(86vh - 150px)',
                overflowY: 'auto',
                marginRight: '4px',
                padding: '1.15rem 1.45rem 1.35rem',
              }}
            >
              {formError && (
                <div className="form-alert" role="alert" style={{ marginBottom: '1rem', borderRadius: '12px', border: '1.5px solid #fca5a5' }}>
                  <AlertCircle size={17} />
                  <span>{formError}</span>
                </div>
              )}

              {/* ── ETAPA 1: CONTATO & STATUS ── */}
              {modalStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
                  <label className="form-group" style={{ marginBottom: 0 }}>
                    <span className="form-label">Nome Completo do Cliente *</span>
                    <input
                      className="form-input"
                      required
                      minLength={3}
                      placeholder="Ex: Lucas Pereira de Souza"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      autoFocus
                    />
                  </label>

                  <div className="form-row form-row-2" style={{ marginBottom: 0 }}>
                    <label className="form-group" style={{ marginBottom: 0 }}>
                      <span className="form-label">WhatsApp com DDD *</span>
                      <input
                        className="form-input"
                        type="tel"
                        required
                        placeholder="(00) 00000-0000"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                      />
                    </label>
                    <label className="form-group" style={{ marginBottom: 0 }}>
                      <span className="form-label">E-mail (opcional)</span>
                      <input
                        className="form-input"
                        type="email"
                        placeholder="cliente@exemplo.com"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </label>
                  </div>

                  {/* Cards Selecionáveis de Status */}
                  <div>
                    <span className="form-label" style={{ display: 'block', marginBottom: '0.45rem' }}>
                      Status do Cliente na Clínica
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                      {([
                        { id: 'ativo', label: 'Ativo', desc: 'Em acompanhamento', color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
                        { id: 'pendente', label: 'Pendente', desc: 'Aguardando 1ª sessão', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
                        { id: 'inativo', label: 'Inativo', desc: 'Alta / Pausado', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
                      ] as const).map((st) => {
                        const selected = form.status === st.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setForm({ ...form, status: st.id })}
                            style={{
                              textAlign: 'left',
                              padding: '0.7rem 0.85rem',
                              borderRadius: '14px',
                              border: selected ? `2px solid ${st.color}` : '1.5px solid #94a3b8',
                              background: selected ? st.bg : '#ffffff',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: selected ? '0 3px 10px rgba(15, 23, 42, 0.08)' : 'none',
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: '0.84rem', color: selected ? st.color : '#0f172a' }}>
                              {st.label}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '0.15rem' }}>
                              {st.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── ETAPA 2: FICHA PESSOAL (INTEGRA COM PRONTUÁRIO) ── */}
              {modalStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1.5px solid #86efac',
                      borderRadius: '12px',
                      padding: '0.65rem 0.9rem',
                      fontSize: '0.8rem',
                      color: '#166534',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <Sparkles size={16} />
                    <span>
                      Estes dados alimentam automaticamente a <strong>Ficha Inicial do Prontuário</strong> e o acesso à Área do Cliente.
                    </span>
                  </div>

                  <div className="form-row form-row-2" style={{ marginBottom: 0 }}>
                    <label className="form-group" style={{ marginBottom: 0 }}>
                      <span className="form-label">CPF</span>
                      <input
                        className="form-input"
                        placeholder="000.000.000-00"
                        value={form.cpf}
                        onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
                      />
                    </label>
                    <label className="form-group" style={{ marginBottom: 0 }}>
                      <span className="form-label">Data de Nascimento</span>
                      <input
                        className="form-input"
                        type="date"
                        value={form.birthDate}
                        onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="form-row form-row-2" style={{ marginBottom: 0 }}>
                    <label className="form-group" style={{ marginBottom: 0 }}>
                      <span className="form-label">Gênero</span>
                      <input
                        className="form-input"
                        placeholder="Ex: Feminino, Masculino..."
                        value={form.gender}
                        onChange={(e) => setForm({ ...form, gender: e.target.value })}
                      />
                      <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                        {['Feminino', 'Masculino', 'Outro'].map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setForm({ ...form, gender: g })}
                            style={{
                              padding: '0.22rem 0.65rem',
                              borderRadius: '999px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              border: form.gender === g ? '1.5px solid #21577a' : '1.5px solid #94a3b8',
                              background: form.gender === g ? '#eff6ff' : '#ffffff',
                              color: form.gender === g ? '#1d4ed8' : '#334155',
                              cursor: 'pointer',
                            }}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </label>

                    <label className="form-group" style={{ marginBottom: 0 }}>
                      <span className="form-label">Profissão / Ocupação</span>
                      <input
                        className="form-input"
                        placeholder="Ex: Arquiteta, Empresário, Estudante..."
                        value={form.occupation}
                        onChange={(e) => setForm({ ...form, occupation: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* ── ETAPA 3: EMERGÊNCIA & OBSERVAÇÕES ── */}
              {modalStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '2px solid #cbd5e1',
                      borderRadius: '14px',
                      padding: '0.9rem 1rem',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.65rem' }}>
                      🚨 Contato de Emergência (Opcional)
                    </span>
                    <div className="form-row form-row-3" style={{ marginBottom: 0 }}>
                      <label className="form-group" style={{ marginBottom: 0 }}>
                        <span className="form-label">Nome do Contato</span>
                        <input
                          className="form-input"
                          placeholder="Nome completo"
                          value={form.emergencyContactName}
                          onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
                        />
                      </label>
                      <label className="form-group" style={{ marginBottom: 0 }}>
                        <span className="form-label">Telefone</span>
                        <input
                          className="form-input"
                          type="tel"
                          placeholder="(00) 00000-0000"
                          value={form.emergencyContactPhone}
                          onChange={(e) => setForm({ ...form, emergencyContactPhone: maskPhone(e.target.value) })}
                        />
                      </label>
                      <label className="form-group" style={{ marginBottom: 0 }}>
                        <span className="form-label">Parentesco</span>
                        <input
                          className="form-input"
                          placeholder="Ex: Cônjuge, Mãe..."
                          value={form.emergencyContactRelationship}
                          onChange={(e) => setForm({ ...form, emergencyContactRelationship: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>

                  <label className="form-group" style={{ marginBottom: 0 }}>
                    <span className="form-label">Observações Administrativas / Recepção</span>
                    <textarea
                      className="form-textarea"
                      rows={3}
                      maxLength={500}
                      placeholder="Horários de preferência, observações de pagamento ou recados administrativos..."
                      value={form.administrativeNotes}
                      onChange={(e) => setForm({ ...form, administrativeNotes: e.target.value })}
                    />
                    <small className="form-hint">
                      Uso administrativo da clínica. Anotações sigilosas de sessão devem ser feitas nas Evoluções do Prontuário.
                    </small>
                  </label>
                </div>
              )}

              {/* Rodapé do Modal */}
              <div
                className="modal-actions"
                style={{
                  justifyContent: 'space-between',
                  marginTop: '1.35rem',
                  paddingTop: '1rem',
                  borderTop: '2px solid #cbd5e1',
                }}
              >
                <div>
                  {modalStep > 1 ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setModalStep((prev) => (prev - 1) as 1 | 2)}
                      style={{ borderRadius: '999px', border: '1.5px solid #94a3b8' }}
                    >
                      <ChevronLeft size={15} /> Etapa Anterior
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setIsFormOpen(false)}
                      style={{ borderRadius: '999px', border: '1.5px solid #94a3b8' }}
                    >
                      Cancelar
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {modalStep < 3 && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setModalStep((prev) => (prev + 1) as 2 | 3)}
                      style={{ borderRadius: '999px', border: '1.5px solid #21577a' }}
                    >
                      Próxima Etapa <ChevronRight size={15} />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                    style={{ borderRadius: '999px', padding: '0.55rem 1.25rem', border: '1.5px solid #163242' }}
                  >
                    {saving
                      ? 'Salvando…'
                      : editingClient
                        ? 'Salvar Alterações'
                        : 'Concluir Cadastro'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL 3: CONFIRMAR EXCLUSÃO DE CLIENTE
      ══════════════════════════════════════════════════════════ */}
      {deletingClient && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deletingLoading) setDeletingClient(null);
          }}
        >
          <section
            className="modal client-modal-enhanced"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-client-title"
            style={{
              maxWidth: '460px',
              width: '94%',
              overflow: 'hidden',
              border: '2px solid #dc2626',
              borderRadius: '22px',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.28), 0 0 0 4px rgba(239, 68, 68, 0.18)',
            }}
          >
            <div className="modal-header" style={{ padding: '1.2rem 1.4rem', borderBottom: '2px solid #fca5a5', background: '#fef2f2' }}>
              <div>
                <span className="eyebrow" style={{ color: '#dc2626' }}>Ação Permanente</span>
                <h2 id="delete-client-title" style={{ margin: 0, color: '#991b1b', fontSize: '1.12rem', fontWeight: 800 }}>
                  Excluir Cliente
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setDeletingClient(null)}
                disabled={deletingLoading}
                aria-label="Fechar"
                style={{ border: '1.5px solid #fca5a5', background: '#ffffff' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '1.25rem 1.4rem' }}>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.5 }}>
                Tem certeza que deseja excluir o cadastro de <strong>{deletingClient.name}</strong>?
              </p>
              <div
                style={{
                  background: '#fff7ed',
                  border: '1.5px solid #fb923c',
                  borderRadius: '12px',
                  padding: '0.75rem 0.9rem',
                  fontSize: '0.79rem',
                  color: '#9a3412',
                  lineHeight: 1.45,
                }}
              >
                ⚠️ Esta ação removerá os agendamentos, pacotes e registros vinculados a este cliente. Se preferir apenas arquivar, altere o status para <strong>Inativo</strong>.
              </div>

              <div className="modal-actions" style={{ marginTop: '1.25rem', paddingTop: '0.85rem', borderTop: '1.5px solid #e2e8f0', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeletingClient(null)}
                  disabled={deletingLoading}
                  style={{ borderRadius: '999px', border: '1.5px solid #94a3b8' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deletingLoading}
                  style={{
                    borderRadius: '999px',
                    padding: '0.55rem 1.15rem',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    background: 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)',
                    color: '#ffffff',
                    border: '1.5px solid #991b1b',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                  }}
                >
                  {deletingLoading ? 'Excluindo…' : 'Sim, Excluir Cliente'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      <QuickDocumentsModal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        prefill={docPrefill}
      />
    </div>
  );
}

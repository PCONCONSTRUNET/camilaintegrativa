'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Search,
  ShieldCheck,
  UserRound,
  CheckCircle2,
  Clock,
  Target,
  ChevronRight,
  AlertCircle,
  Phone,
  Mail,
  X,
  Plus,
  Sparkles,
  Brain,
  FolderOpen,
  CalendarDays,
  MessageCircle,
  Eye,
  List,
  LayoutGrid,
  Users,
  ClipboardList,
} from 'lucide-react';
import type { ProntuarioListItem } from '@/lib/repository';
import { getInstantCache, setInstantCache } from '@/lib/client-cache';
import { WhatsappIcon } from '@/components/whatsapp-icon';
import { formatPhone, maskPhone, maskCpf } from '@/lib/utils';

type ProntuarioFilter =
  | 'todos'
  | 'ativo'
  | 'ficha_pendente'
  | 'ficha_ok'
  | 'com_evolucao'
  | 'inativo';

function formatDateBr(value: string | null | undefined) {
  if (!value) return 'Nenhum registro';
  if (value.includes('T')) {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(value));
    } catch {
      return value;
    }
  }
  const [year, month, day] = value.split('-');
  if (year && month && day) return `${day}/${month}/${year}`;
  return value;
}

function formatDateTimeBr(value: string | null | undefined) {
  if (!value) return 'Sem agendamento';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Sem agendamento';
  }
}

function buildWhatsAppUrl(phone: string, name: string, pendingFicha = false) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const full = digits.startsWith('55') ? digits : `55${digits}`;
  const firstName = name.split(' ')[0] || 'Cliente';
  const msg = pendingFicha
    ? `Olá, ${firstName}! Tudo bem? Lembrete do consultório da Camila Machado: sua Ficha de Anamnese Digital já está liberada na Área do Cliente para preenchimento antes da sessão.`
    : `Olá, ${firstName}! Tudo bem? Aqui é do consultório da Camila Machado.`;
  return `https://wa.me/${full}?text=${encodeURIComponent(msg)}`;
}

function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getClientInitials(name: string) {
  const cleaned = (name || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-ZÀ-ÿ\s]/g, ' ')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'PR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export default function ProntuariosPage() {
  const initialCached = getInstantCache<ProntuarioListItem[]>('admin_prontuarios', []);
  const [prontuarios, setProntuarios] = useState<ProntuarioListItem[]>(() => initialCached);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<ProntuarioFilter>('todos');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const [loading, setLoading] = useState(() => initialCached.length === 0);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal 1: Resumo Clínico 360º do Prontuário
  const [previewItem, setPreviewItem] = useState<ProntuarioListItem | null>(null);

  // Modal 2: Lançamento Rápido de Evolução Clínica
  const [quickEvolutionItem, setQuickEvolutionItem] = useState<ProntuarioListItem | null>(null);
  const [savingEvolution, setSavingEvolution] = useState(false);
  const [evoForm, setEvoForm] = useState({
    sessionDate: todayIsoDate(),
    title: '',
    summary: '',
    evolutionText: '',
    inductionMethod: '',
    tranceDepth: '',
    interventions: '',
    homeworkTasks: '',
  });

  // Modal 3: Novo Cliente + Abertura de Prontuário
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [anamneseLinkCopied, setAnamneseLinkCopied] = useState(false);
  const [patientForm, setPatientForm] = useState({
    name: '',
    phone: '',
    email: '',
    cpf: '',
    birthDate: '',
    occupation: '',
    chiefComplaint: '',
  });

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/prontuarios?status=todos', { cache: 'no-store' });
      const body = await response.json();
      setLoading(false);
      if (!response.ok) return setError(body.error ?? 'Não foi possível carregar os prontuários.');
      const list: ProntuarioListItem[] = body.prontuarios ?? [];
      setInstantCache('admin_prontuarios', list);
      setProntuarios(list);
    } catch {
      setLoading(false);
      setError('Erro de conexão ao carregar prontuários.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Métricas para os cards de KPI
  const metrics = useMemo(() => {
    const total = prontuarios.length;
    const ativos = prontuarios.filter((p) => p.status === 'ativo').length;
    const fichaOk = prontuarios.filter((p) => p.hasInitialRecord).length;
    const fichaPendente = total - fichaOk;
    const comEvolucao = prontuarios.filter((p) => p.totalEvolutions > 0).length;
    const totalEvolucoes = prontuarios.reduce((acc, p) => acc + p.totalEvolutions, 0);
    const totalMetas = prontuarios.reduce((acc, p) => acc + p.activeGoals, 0);
    const totalDocs = prontuarios.reduce((acc, p) => acc + (p.totalDocuments ?? 0), 0);
    const inativos = prontuarios.filter((p) => p.status === 'inativo').length;

    return {
      total,
      ativos,
      fichaOk,
      fichaPendente,
      comEvolucao,
      totalEvolucoes,
      totalMetas,
      totalDocs,
      inativos,
    };
  }, [prontuarios]);

  // Lista filtrada (suporta CPF com ou sem pontuação)
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return prontuarios.filter((item) => {
      if (quickFilter === 'ativo' && item.status !== 'ativo') return false;
      if (quickFilter === 'inativo' && item.status !== 'inativo') return false;
      if (quickFilter === 'ficha_pendente' && item.hasInitialRecord) return false;
      if (quickFilter === 'ficha_ok' && !item.hasInitialRecord) return false;
      if (quickFilter === 'com_evolucao' && item.totalEvolutions === 0) return false;

      if (!q) return true;
      const matchName = item.name.toLowerCase().includes(q);
      const phoneRaw = (item.phone || '').toLowerCase();
      const phoneDigits = phoneRaw.replace(/\D/g, '');
      const matchPhone =
        phoneRaw.includes(q) ||
        formatPhone(item.phone).toLowerCase().includes(q) ||
        (qDigits.length > 0 && phoneDigits.includes(qDigits));
      const matchEmail = (item.email || '').toLowerCase().includes(q);

      const cpfRaw = (item.cpf || '').toLowerCase();
      const cpfFormatted = item.cpf ? maskCpf(item.cpf).toLowerCase() : '';
      const cpfDigits = cpfRaw.replace(/\D/g, '');
      const matchCpf =
        cpfRaw.includes(q) ||
        cpfFormatted.includes(q) ||
        (qDigits.length > 0 && cpfDigits.includes(qDigits));

      const matchComplaint = (item.chiefComplaint || '').toLowerCase().includes(q);
      return matchName || matchPhone || matchEmail || matchCpf || matchComplaint;
    });
  }, [prontuarios, search, quickFilter]);

  function handleOpenQuickEvolution(item: ProntuarioListItem) {
    setPreviewItem(null);
    setQuickEvolutionItem(item);
    setEvoForm({
      sessionDate: todayIsoDate(),
      title: `Sessão ${(item.totalEvolutions || 0) + 1} - Evolução Clínica`,
      summary: '',
      evolutionText: '',
      inductionMethod: '',
      tranceDepth: '',
      interventions: '',
      homeworkTasks: '',
    });
  }

  async function handleSaveQuickEvolution(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!quickEvolutionItem) return;
    if (!evoForm.title.trim() || !evoForm.evolutionText.trim()) {
      setError('Preencha o título e o relato da evolução clínica.');
      return;
    }

    setSavingEvolution(true);
    try {
      const res = await fetch(`/api/admin/prontuarios/${quickEvolutionItem.clientId}/evolutions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionDate: evoForm.sessionDate,
          title: evoForm.title.trim(),
          summary: evoForm.summary.trim() || null,
          evolutionText: evoForm.evolutionText.trim(),
          inductionMethod: evoForm.inductionMethod.trim() || null,
          tranceDepth: evoForm.tranceDepth.trim() || null,
          interventions: evoForm.interventions.trim() || null,
          homeworkTasks: evoForm.homeworkTasks.trim() || null,
          isConfidential: true,
        }),
      });
      const data = await res.json();
      setSavingEvolution(false);
      if (!res.ok) {
        setError(data.error ?? 'Erro ao salvar evolução clínica.');
        return;
      }

      const clientName = quickEvolutionItem.name;
      setQuickEvolutionItem(null);
      setSuccessMsg(`Evolução clínica registrada com sucesso no prontuário de "${clientName}"!`);
      setTimeout(() => setSuccessMsg(''), 4500);
      await load();
    } catch {
      setSavingEvolution(false);
      setError('Erro de conexão ao registrar evolução.');
    }
  }

  async function handleCreateNewPatientAndRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!patientForm.name.trim() || patientForm.name.trim().length < 3) {
      setError('Informe o nome completo do paciente.');
      return;
    }
    if (patientForm.phone.replace(/\D/g, '').length < 10) {
      setError('Informe um WhatsApp válido com DDD.');
      return;
    }

    setSavingPatient(true);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patientForm.name.trim(),
          phone: patientForm.phone,
          email: patientForm.email.trim(),
          status: 'ativo',
          cpf: patientForm.cpf.trim() || null,
          birthDate: patientForm.birthDate.trim() || null,
          occupation: patientForm.occupation.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSavingPatient(false);
        setError(json.error ?? 'Erro ao cadastrar paciente.');
        return;
      }

      const newClientId = json.client?.id;
      if (newClientId && patientForm.chiefComplaint.trim()) {
        await fetch(`/api/admin/prontuarios/${newClientId}/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cpf: patientForm.cpf.trim() || null,
            birthDate: patientForm.birthDate.trim() || null,
            occupation: patientForm.occupation.trim() || null,
            chiefComplaint: patientForm.chiefComplaint.trim(),
            consultationReason: patientForm.chiefComplaint.trim(),
          }),
        });
      }

      setSavingPatient(false);
      setNewPatientOpen(false);
      setPatientForm({
        name: '',
        phone: '',
        email: '',
        cpf: '',
        birthDate: '',
        occupation: '',
        chiefComplaint: '',
      });
      setSuccessMsg('Paciente e Prontuário criados com sucesso!');
      setTimeout(() => setSuccessMsg(''), 4500);
      await load();
    } catch {
      setSavingPatient(false);
      setError('Falha ao criar paciente e prontuário.');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {/* ══════════════════════════════════════════════════════════
          CABEÇALHO DA PÁGINA + SELO DE GUARDA SEGURA
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            <span className="eyebrow" style={{ color: '#21577a', fontWeight: 800 }}>
              Atendimento & Registros Clínicos
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.18rem 0.6rem',
                borderRadius: '999px',
                background: '#ecfdf5',
                color: '#047857',
                border: '1px solid #a7f3d0',
              }}
            >
              <ShieldCheck size={12} /> Sigilo & LGPD Auditados · CRT-SBHP/SC 805
            </span>
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: '0.15rem 0' }}>
            Prontuários Eletrônicos
          </h1>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b' }}>
            Fichas de anamnese, protocolos de hipnoterapia, evoluções de sessão, técnicas e termos assinados.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Link
            href="/admin/clientes"
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
            <Users size={16} /> Base de Clientes
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
            onClick={() => setNewPatientOpen(true)}
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
            <Plus size={17} /> Novo Prontuário
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          CARDS DE INDICADORES CLÍNICOS (KPIs CLICÁVEIS)
      ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '0.85rem',
        }}
      >
        {/* KPI 1: Total de Prontuários */}
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
            <ClipboardList size={21} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {metrics.total}
            </div>
            <div style={{ fontSize: '0.77rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
              Prontuários ({metrics.ativos} em acompanhamento)
            </div>
          </div>
        </button>

        {/* KPI 2: Fichas Iniciais / Anamnese */}
        <button
          type="button"
          onClick={() => setQuickFilter(quickFilter === 'ficha_pendente' ? 'todos' : 'ficha_pendente')}
          style={{
            textAlign: 'left',
            background: '#ffffff',
            border: quickFilter === 'ficha_pendente' ? '1.5px solid #d97706' : '1px solid #e2e8f0',
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
              background: metrics.fichaPendente > 0 ? '#fffbeb' : '#ecfdf5',
              color: metrics.fichaPendente > 0 ? '#d97706' : '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={21} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {metrics.fichaOk}/{metrics.total}
            </div>
            <div style={{ fontSize: '0.77rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
              Anamneses OK ({metrics.fichaPendente} pendente{metrics.fichaPendente === 1 ? '' : 's'})
            </div>
          </div>
        </button>

        {/* KPI 3: Evoluções de Sessão */}
        <button
          type="button"
          onClick={() => setQuickFilter(quickFilter === 'com_evolucao' ? 'todos' : 'com_evolucao')}
          style={{
            textAlign: 'left',
            background: '#ffffff',
            border: quickFilter === 'com_evolucao' ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
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
              background: '#f0f9ff',
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FileText size={21} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0369a1', lineHeight: 1.1 }}>
              {metrics.totalEvolucoes}
            </div>
            <div style={{ fontSize: '0.77rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
              Evoluções ({metrics.comEvolucao} pacientes com registro)
            </div>
          </div>
        </button>

        {/* KPI 4: Metas & Documentos */}
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
            <Target size={21} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
              {metrics.totalMetas} <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b' }}>metas</span>
            </div>
            <div style={{ fontSize: '0.77rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
              {metrics.totalDocs} termo(s)/documento(s) anexado(s)
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          BARRA DE BUSCA, FILTROS & VISÃO LISTA / CARDS
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
            placeholder="Buscar por paciente, CPF, WhatsApp ou queixa..."
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div
            role="group"
            aria-label="Filtrar prontuários"
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
              { id: 'todos', label: `Todos (${metrics.total})` },
              { id: 'ativo', label: `Ativos (${metrics.ativos})` },
              { id: 'ficha_pendente', label: `⏳ Ficha Pendente (${metrics.fichaPendente})` },
              { id: 'ficha_ok', label: `✓ Ficha OK (${metrics.fichaOk})` },
              { id: 'com_evolucao', label: `📝 Com Evoluções (${metrics.comEvolucao})` },
              { id: 'inativo', label: `Alta / Inativos (${metrics.inativos})` },
            ] as Array<{ id: ProntuarioFilter; label: string }>).map((tab) => {
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
                    fontSize: '0.75rem',
                    padding: '0.36rem 0.76rem',
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

          {/* Toggle Lista / Cards */}
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

      {/* Alertas */}
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
          LISTAGEM DE PRONTUÁRIOS (TABELA RICA OU CARDS)
      ══════════════════════════════════════════════════════════ */}
      {filteredList.length === 0 && !loading ? (
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
            <FileText size={26} />
          </div>
          <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.08rem', fontWeight: 800, color: '#0f172a' }}>
            Nenhum prontuário encontrado para este filtro
          </h3>
          <p style={{ margin: '0 auto 1.2rem', maxWidth: '420px', fontSize: '0.85rem', color: '#64748b' }}>
            Limpe os filtros ativos ou cadastre um novo paciente para iniciar o prontuário eletrônico.
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
              onClick={() => setNewPatientOpen(true)}
              style={{ borderRadius: '999px', padding: '0.55rem 1.15rem', fontSize: '0.82rem' }}
            >
              <Plus size={16} /> Novo Prontuário
            </button>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <div
          className="responsive-table card prontuarios-table-wrapper"
          style={{
            borderRadius: '20px',
            border: '2px solid #cbd5e1',
            overflow: 'hidden',
            boxShadow: '0 6px 20px rgba(15, 23, 42, 0.06)',
          }}
        >
          <table className="data-table prontuarios-data-table">
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th>Paciente & Queixa Principal</th>
                <th>Ficha & Anamnese</th>
                <th>Evoluções & Última Sessão</th>
                <th>Metas & Documentos</th>
                <th style={{ textAlign: 'right' }}>Ações Clínicas</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((item) => {
                const initials = getClientInitials(item.name);
                const waUrl = buildWhatsAppUrl(item.phone, item.name, !item.hasInitialRecord);

                return (
                  <tr
                    key={item.clientId}
                    className="prontuario-table-row-card"
                    onClick={() => setPreviewItem(item)}
                    style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                  >
                    <td data-label="Paciente">
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem', width: '100%', minWidth: 0 }}>
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
                        <div style={{ minWidth: 0, flex: 1, width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: 800 }}>
                              {item.name}
                            </strong>
                            <span
                              className={`badge ${
                                item.status === 'ativo'
                                  ? 'badge-success'
                                  : item.status === 'pendente'
                                    ? 'badge-warning'
                                    : 'badge-muted'
                              }`}
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '0.14rem 0.52rem',
                                borderRadius: '999px',
                                textTransform: 'capitalize',
                                border:
                                  item.status === 'ativo'
                                    ? '1px solid #86efac'
                                    : item.status === 'pendente'
                                      ? '1px solid #fcd34d'
                                      : '1px solid #cbd5e1',
                              }}
                            >
                              {item.status}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600, marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span><Phone size={11} style={{ display: 'inline', marginRight: '3px', color: '#0284c7' }} />{formatPhone(item.phone)}</span>
                            {item.cpf && <span>· CPF: {maskCpf(item.cpf)}</span>}
                          </div>

                          {item.chiefComplaint && (
                            <div
                              className="prontuario-complaint-pill"
                              style={{
                                marginTop: '0.35rem',
                                fontSize: '0.74rem',
                                color: '#1e293b',
                                background: '#f8fafc',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '9px',
                                padding: '0.28rem 0.55rem',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                wordBreak: 'break-word',
                                lineHeight: 1.35,
                                maxWidth: '420px',
                              }}
                              title={item.chiefComplaint}
                            >
                              💬 {item.chiefComplaint}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td data-label="Ficha & Anamnese">
                      <div className="prontuario-cell-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem', alignItems: 'flex-start', minWidth: 0 }}>
                        {item.hasInitialRecord ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              padding: '0.22rem 0.65rem',
                              borderRadius: '999px',
                              background: '#dcfce7',
                              color: '#166534',
                              border: '1.5px solid #86efac',
                            }}
                          >
                            <CheckCircle2 size={12} /> Ficha Preenchida
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              padding: '0.22rem 0.65rem',
                              borderRadius: '999px',
                              background: '#fffbeb',
                              color: '#b45309',
                              border: '1.5px solid #fcd34d',
                            }}
                          >
                            <Clock size={12} /> Anamnese Pendente
                          </span>
                        )}

                        {item.consentAgreed && (
                          <span style={{ fontSize: '0.71rem', color: '#047857', fontWeight: 700, wordBreak: 'break-word' }}>
                            ✓ Consentimento LGPD assinado
                          </span>
                        )}
                      </div>
                    </td>

                    <td data-label="Evoluções & Última Sessão">
                      <div className="prontuario-cell-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem', minWidth: 0, width: '100%' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <FileText size={13} style={{ color: '#0284c7', flexShrink: 0 }} />
                          {item.totalEvolutions} evoluç{item.totalEvolutions === 1 ? 'ão' : 'ões'}
                        </span>
                        <span style={{ fontSize: '0.74rem', color: '#475569' }}>
                          Última: <strong>{formatDateBr(item.lastEvolutionDate)}</strong>
                        </span>
                        {item.lastEvolutionTitle && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: '#334155',
                              fontWeight: 600,
                              display: '-webkit-box',
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                              maxWidth: '260px',
                            }}
                            title={item.lastEvolutionTitle}
                          >
                            “{item.lastEvolutionTitle}”
                          </span>
                        )}
                      </div>
                    </td>

                    <td data-label="Metas & Documentos">
                      <div className="prontuario-cell-content" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.28rem',
                            fontSize: '0.73rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.58rem',
                            borderRadius: '999px',
                            background: '#f5f3ff',
                            color: '#6d28d9',
                            border: '1.5px solid #c4b5fd',
                          }}
                        >
                          <Target size={12} /> {item.activeGoals} meta{item.activeGoals === 1 ? '' : 's'}
                        </span>

                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.28rem',
                            fontSize: '0.73rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.58rem',
                            borderRadius: '999px',
                            background: '#f1f5f9',
                            color: '#334155',
                            border: '1.5px solid #cbd5e1',
                          }}
                        >
                          <FolderOpen size={12} /> {item.totalDocuments ?? 0} doc(s)
                        </span>
                      </div>
                    </td>

                    <td data-label="Ações Clínicas" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div className="prontuario-actions-row" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.38rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={item.hasInitialRecord ? 'Conversar no WhatsApp' : 'Lembrar preenchimento da Anamnese no WhatsApp'}
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
                              flexShrink: 0,
                            }}
                          >
                            <WhatsappIcon size={17} />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenQuickEvolution(item)}
                          title="Registrar Nova Evolução de Sessão"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.38rem 0.72rem',
                            borderRadius: '999px',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1.5px solid #93c5fd',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Plus size={13} /> Evolução
                        </button>

                        <button
                          type="button"
                          onClick={() => setPreviewItem(item)}
                          title="Resumo 360º do Prontuário"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.38rem 0.72rem',
                            borderRadius: '999px',
                            background: '#f8fafc',
                            color: '#1e293b',
                            border: '1.5px solid #94a3b8',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Eye size={13} /> Resumo
                        </button>

                        <Link
                          href={`/admin/prontuarios/${item.clientId}`}
                          className="btn btn-primary btn-sm"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.4rem 0.85rem',
                            fontSize: '0.76rem',
                            borderRadius: '999px',
                            fontWeight: 700,
                            border: '1.5px solid #163242',
                          }}
                        >
                          Abrir <ChevronRight size={14} />
                        </Link>
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
           MODO CARDS CLÍNICOS
        ══════════════════════════════════════════════════════════ */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: '1rem',
          }}
        >
          {filteredList.map((item) => {
            const initials = getClientInitials(item.name);

            return (
              <article
                key={item.clientId}
                onClick={() => setPreviewItem(item)}
                style={{
                  background: '#ffffff',
                  border: '2px solid #94a3b8',
                  borderLeft: '5px solid #1a3a4a',
                  borderRadius: '20px',
                  padding: '1.15rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.07)',
                }}
              >
                <div>
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
                            fontSize: '0.96rem',
                            fontWeight: 800,
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.name}
                        </strong>
                        <span style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600 }}>
                          {formatPhone(item.phone)}
                        </span>
                      </div>
                    </div>

                    {item.hasInitialRecord ? (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          background: '#dcfce7',
                          color: '#166534',
                          border: '1.5px solid #86efac',
                          flexShrink: 0,
                        }}
                      >
                        ✓ Ficha OK
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          background: '#fffbeb',
                          color: '#b45309',
                          border: '1.5px solid #fcd34d',
                          flexShrink: 0,
                        }}
                      >
                        ⏳ Pendente
                      </span>
                    )}
                  </div>

                  {item.chiefComplaint && (
                    <p
                      style={{
                        margin: '0.7rem 0 0',
                        fontSize: '0.78rem',
                        color: '#1e293b',
                        background: '#f8fafc',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        lineHeight: 1.4,
                        wordBreak: 'break-word',
                      }}
                    >
                      <strong>Queixa:</strong> {item.chiefComplaint}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                      📝 {item.totalEvolutions} evoluções
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px', background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}>
                      🎯 {item.activeGoals} metas
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
                      📂 {item.totalDocuments ?? 0} docs
                    </span>
                  </div>
                </div>

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
                  <button
                    type="button"
                    onClick={() => handleOpenQuickEvolution(item)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.38rem 0.75rem',
                      borderRadius: '999px',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1.5px solid #93c5fd',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={13} /> Nova Evolução
                  </button>

                  <Link
                    href={`/admin/prontuarios/${item.clientId}`}
                    className="btn btn-primary btn-sm"
                    style={{ borderRadius: '999px', padding: '0.38rem 0.85rem', fontSize: '0.75rem', border: '1.5px solid #163242' }}
                  >
                    Abrir Prontuário <ChevronRight size={14} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL 1: RESUMO CLÍNICO 360º & ATALHOS DO PRONTUÁRIO
      ══════════════════════════════════════════════════════════ */}
      {previewItem && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreviewItem(null);
          }}
        >
          <section
            className="modal client-modal-enhanced"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-prontuario-title"
            style={{
              maxWidth: '660px',
              width: '95%',
              overflow: 'hidden',
              border: '2px solid #64748b',
              borderRadius: '22px',
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
                  {getClientInitials(previewItem.name)}
                </div>
                <div>
                  <span className="eyebrow">Resumo Clínico & Navegação Rápida</span>
                  <h2 id="preview-prontuario-title" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                    {previewItem.name}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setPreviewItem(null)}
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
                padding: '1.2rem 1.45rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              {/* Queixa Principal */}
              <div
                style={{
                  background: previewItem.chiefComplaint ? '#f0f9ff' : '#f8fafc',
                  border: previewItem.chiefComplaint ? '2px solid #7dd3fc' : '2px solid #cbd5e1',
                  borderLeft: '4px solid #0284c7',
                  borderRadius: '14px',
                  padding: '0.9rem 1rem',
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#0369a1' }}>
                  💬 Queixa Principal / Motivo da Consulta
                </span>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.86rem', color: '#0f172a', lineHeight: 1.5 }}>
                  {previewItem.chiefComplaint || 'Ainda não registrada na Ficha Inicial.'}
                </p>
              </div>

              {/* Grid de Indicadores do Prontuário */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                  gap: '0.65rem',
                }}
              >
                <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 800 }}>EVOLUÇÕES</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                    {previewItem.totalEvolutions}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Última: {formatDateBr(previewItem.lastEvolutionDate)}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 800 }}>METAS ATIVAS</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#6d28d9', marginTop: '0.15rem' }}>
                    {previewItem.activeGoals}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Objetivos em curso</div>
                </div>

                <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 800 }}>TÉCNICAS & DOCS</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                    {previewItem.totalTechniques ?? 0} / {previewItem.totalDocuments ?? 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Técnicas / Termos</div>
                </div>

                <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 800 }}>PRÓXIMA SESSÃO</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0369a1', marginTop: '0.25rem' }}>
                    {formatDateTimeBr(previewItem.nextAppointmentAt)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    {previewItem.completedAppointments ?? 0} concluída(s)
                  </div>
                </div>
              </div>

              {/* Atalhos Diretos para as Abas do Prontuário */}
              <div>
                <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#334155', marginBottom: '0.5rem' }}>
                  Ir direto para a seção do Prontuário:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                  {[
                    { tab: 'ficha', label: '📋 Ficha Inicial & Anamnese', desc: previewItem.hasInitialRecord ? 'Preenchida' : 'Pendente' },
                    { tab: 'evolucoes', label: '📝 Protocolo de Sessão', desc: `${previewItem.totalEvolutions} registro(s)` },
                    { tab: 'objetivos', label: '🎯 Objetivos Terapêuticos', desc: `${previewItem.activeGoals} ativo(s)` },
                    { tab: 'tecnicas', label: '🧠 Técnicas Aplicadas', desc: `${previewItem.totalTechniques ?? 0} registrada(s)` },
                    { tab: 'documentos', label: '📂 Documentos & Termos', desc: `${previewItem.totalDocuments ?? 0} anexo(s)` },
                    { tab: 'sessoes', label: '📅 Histórico de Sessões', desc: `${previewItem.completedAppointments ?? 0} concluída(s)` },
                  ].map((nav) => (
                    <Link
                      key={nav.tab}
                      href={`/admin/prontuarios/${previewItem.clientId}?tab=${nav.tab}`}
                      style={{
                        textDecoration: 'none',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '12px',
                        border: '1.5px solid #94a3b8',
                        background: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{nav.label}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{nav.desc}</div>
                      </div>
                      <ChevronRight size={15} style={{ color: '#475569' }} />
                    </Link>
                  ))}
                </div>
              </div>

              {/* Ações do Rodapé */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '2px solid #cbd5e1' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleOpenQuickEvolution(previewItem)}
                  style={{ borderRadius: '999px', padding: '0.55rem 1.05rem', fontSize: '0.82rem', border: '1.5px solid #94a3b8' }}
                >
                  <Plus size={15} /> Registrar Evolução Rápida
                </button>

                <Link
                  href={`/admin/prontuarios/${previewItem.clientId}`}
                  className="btn btn-primary"
                  style={{ borderRadius: '999px', padding: '0.55rem 1.2rem', fontSize: '0.82rem', border: '1.5px solid #163242' }}
                >
                  Abrir Prontuário Completo <ChevronRight size={15} />
                </Link>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL 2: REGISTRO RÁPIDO DE EVOLUÇÃO CLÍNICA / SESSÃO
      ══════════════════════════════════════════════════════════ */}
      {quickEvolutionItem && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !savingEvolution) setQuickEvolutionItem(null);
          }}
        >
          <section
            className="modal client-modal-enhanced"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-evo-title"
            style={{ maxWidth: '650px', width: '95%', overflow: 'hidden', border: '2px solid #64748b', borderRadius: '22px' }}
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
                <span className="eyebrow">Registro Rápido de Sessão</span>
                <h2 id="quick-evo-title" style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800, color: '#0f172a' }}>
                  Nova Evolução: {quickEvolutionItem.name}
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setQuickEvolutionItem(null)}
                disabled={savingEvolution}
                aria-label="Fechar"
                style={{ border: '1.5px solid #94a3b8', background: '#ffffff' }}
              >
                <X size={19} />
              </button>
            </div>

            <form
              onSubmit={handleSaveQuickEvolution}
              className="modal-body"
              style={{
                maxHeight: 'calc(86vh - 130px)',
                overflowY: 'auto',
                marginRight: '4px',
                padding: '1.2rem 1.45rem',
              }}
            >
              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">Data da Sessão *</span>
                  <input
                    type="date"
                    className="form-input"
                    required
                    value={evoForm.sessionDate}
                    onChange={(e) => setEvoForm({ ...evoForm, sessionDate: e.target.value })}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">Título da Sessão *</span>
                  <input
                    className="form-input"
                    required
                    placeholder="Ex: Sessão 01 - Anamnese e Indução"
                    value={evoForm.title}
                    onChange={(e) => setEvoForm({ ...evoForm, title: e.target.value })}
                  />
                </label>
              </div>

              <label className="form-group">
                <span className="form-label">Relato Clínico / Evolução da Sessão *</span>
                <textarea
                  className="form-textarea"
                  rows={4}
                  required
                  placeholder="Descreva o estado emocional do paciente, conteúdos trabalhados na sessão, ressignificações e respostas observadas..."
                  value={evoForm.evolutionText}
                  onChange={(e) => setEvoForm({ ...evoForm, evolutionText: e.target.value })}
                />
              </label>

              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">Método de Indução (Hipnoterapia)</span>
                  <input
                    className="form-input"
                    placeholder="Ex: Indução de Dave Elman, Relaxamento Progressivo..."
                    value={evoForm.inductionMethod}
                    onChange={(e) => setEvoForm({ ...evoForm, inductionMethod: e.target.value })}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">Intervenções / Técnicas Utilizadas</span>
                  <input
                    className="form-input"
                    placeholder="Ex: Regressão de causa, Lugar Seguro, RPD..."
                    value={evoForm.interventions}
                    onChange={(e) => setEvoForm({ ...evoForm, interventions: e.target.value })}
                  />
                </label>
              </div>

              <label className="form-group" style={{ marginBottom: 0 }}>
                <span className="form-label">Tarefas Terapêuticas / Auto-hipnose Recomendada</span>
                <input
                  className="form-input"
                  placeholder="Ex: Escutar áudio de auto-hipnose antes de dormir por 7 dias..."
                  value={evoForm.homeworkTasks}
                  onChange={(e) => setEvoForm({ ...evoForm, homeworkTasks: e.target.value })}
                />
              </label>

              <div className="modal-actions" style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '2px solid #cbd5e1', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setQuickEvolutionItem(null)}
                  disabled={savingEvolution}
                  style={{ borderRadius: '999px', border: '1.5px solid #94a3b8' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEvolution}
                  style={{ borderRadius: '999px', padding: '0.55rem 1.25rem', border: '1.5px solid #163242' }}
                >
                  {savingEvolution ? 'Registrando…' : 'Salvar Evolução no Prontuário'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL 3: NOVO PACIENTE & ABERTURA DE PRONTUÁRIO
      ══════════════════════════════════════════════════════════ */}
      {newPatientOpen && (
        <div
          className="modal-layer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !savingPatient) setNewPatientOpen(false);
          }}
        >
          <section
            className="modal client-modal-enhanced"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-prontuario-title"
            style={{ maxWidth: '620px', width: '95%', overflow: 'hidden', border: '2px solid #64748b', borderRadius: '22px' }}
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
                <span className="eyebrow">Abertura Imediata de Prontuário</span>
                <h2 id="new-prontuario-title" style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800, color: '#0f172a' }}>
                  Cadastrar Paciente & Ficha Inicial
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setNewPatientOpen(false)}
                disabled={savingPatient}
                aria-label="Fechar"
                style={{ border: '1.5px solid #94a3b8', background: '#ffffff' }}
              >
                <X size={19} />
              </button>
            </div>

            <form
              onSubmit={handleCreateNewPatientAndRecord}
              className="modal-body"
              style={{
                maxHeight: 'calc(86vh - 130px)',
                overflowY: 'auto',
                marginRight: '4px',
                padding: '1.2rem 1.45rem',
              }}
            >
              <label className="form-group">
                <span className="form-label">Nome Completo do Paciente *</span>
                <input
                  className="form-input"
                  required
                  minLength={3}
                  placeholder="Ex: Maria Clara Oliveira"
                  value={patientForm.name}
                  onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
                  autoFocus
                />
              </label>

              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">WhatsApp com DDD *</span>
                  <input
                    className="form-input"
                    type="tel"
                    required
                    placeholder="(00) 00000-0000"
                    value={patientForm.phone}
                    onChange={(e) => setPatientForm({ ...patientForm, phone: maskPhone(e.target.value) })}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">CPF (opcional)</span>
                  <input
                    className="form-input"
                    placeholder="000.000.000-00"
                    value={patientForm.cpf}
                    onChange={(e) => setPatientForm({ ...patientForm, cpf: maskCpf(e.target.value) })}
                  />
                </label>
              </div>

              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">Data de Nascimento</span>
                  <input
                    type="date"
                    className="form-input"
                    value={patientForm.birthDate}
                    onChange={(e) => setPatientForm({ ...patientForm, birthDate: e.target.value })}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">Profissão / Ocupação</span>
                  <input
                    className="form-input"
                    placeholder="Ex: Professora, Empresária..."
                    value={patientForm.occupation}
                    onChange={(e) => setPatientForm({ ...patientForm, occupation: e.target.value })}
                  />
                </label>
              </div>

              <label className="form-group" style={{ marginBottom: 0 }}>
                <span className="form-label">Queixa Principal / Motivo Inicial da Consulta</span>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Descreva brevemente o motivo da busca pelo atendimento (já ficará salvo na Ficha Inicial do Prontuário)..."
                  value={patientForm.chiefComplaint}
                  onChange={(e) => setPatientForm({ ...patientForm, chiefComplaint: e.target.value })}
                />
              </label>

              <div className="modal-actions" style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '2px solid #cbd5e1', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setNewPatientOpen(false)}
                  disabled={savingPatient}
                  style={{ borderRadius: '999px', border: '1.5px solid #94a3b8' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingPatient}
                  style={{ borderRadius: '999px', padding: '0.55rem 1.25rem', border: '1.5px solid #163242' }}
                >
                  {savingPatient ? 'Criando…' : 'Criar Paciente & Prontuário'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  CalendarRange,
  Plus,
  Search,
  Clock,
  MapPin,
  Video,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  UserX,
  MessageCircle,
  Sparkles,
  Eye,
  EyeOff,
  Copy,
  Check,
  LayoutGrid,
  List,
  Volume2,
  Upload,
  Infinity as InfinityIcon,
  Home,
  Layers,
  DollarSign,
  FileDown,
  Printer,
} from 'lucide-react';
import type { GroupSession, GroupSessionEnrollment, GroupSessionStatus } from '@/lib/domain';
import { formatCurrency, maskCurrency, finalizeCurrency, maskCpf, maskPhone } from '@/lib/utils';
import { ServiceAudioPlayer } from '@/components/service-audio-player';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { WhatsappIcon } from '@/components/whatsapp-icon';
import { getInstantCache, setInstantCache } from '@/lib/client-cache';

const CAPACITY_PRESETS = [5, 8, 10, 12, 15, 20, 30, 50];

type SessionFormState = {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  unlimitedSpots: boolean;
  maxParticipants: number;
  showRemainingSpots: boolean;
  customRemainingSpotsRaw: string;
  showOnHome: boolean;
  priceRaw: string;
  priceVisible: boolean;
  modality: 'presencial' | 'online';
  locationNotes: string;
  status: GroupSessionStatus;
  published: boolean;
  audioUrl: string | null;
  audioName: string | null;
};

function todayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts();
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function parsePriceToCents(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  if (!cleaned || isNaN(Number(cleaned))) return null;
  const num = parseFloat(cleaned);
  if (num < 0) return null;
  return Math.round(num * 100);
}

function centsToRaw(cents: number | null): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDatePtBr(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

function formatCalculatedDuration(startTime: string, endTime: string): string | null {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  const diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) return null;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
}

function getEffectiveRemainingSpots(session: GroupSession): number | null {
  if (session.customRemainingSpots != null) {
    return Math.max(0, session.customRemainingSpots);
  }
  if (session.maxParticipants > 0) {
    return Math.max(0, session.maxParticipants - (session.currentParticipants || 0));
  }
  return null;
}

const INITIAL_FORM: SessionFormState = {
  title: '',
  description: '',
  date: todayIso(),
  startTime: '19:00',
  endTime: '20:30',
  unlimitedSpots: false,
  maxParticipants: 10,
  showRemainingSpots: true,
  customRemainingSpotsRaw: '',
  showOnHome: true,
  priceRaw: '',
  priceVisible: true,
  modality: 'presencial',
  locationNotes: '',
  status: 'ativo',
  published: true,
  audioUrl: null,
  audioName: null,
};

export default function AdminSessoesGrupoPage() {
  const initialCached = getInstantCache<GroupSession[]>('admin_group_sessions', []);
  const [sessions, setSessions] = useState<GroupSession[]>(() => initialCached);
  const [loading, setLoading] = useState(() => initialCached.length === 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'ativo' | 'encerrado' | 'cancelado'>('todos');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [expandedDescIds, setExpandedDescIds] = useState<Record<string, boolean>>({});

  // Create / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<GroupSession | null>(null);
  const [form, setForm] = useState<SessionFormState>(INITIAL_FORM);
  const [formError, setFormError] = useState('');

  // Delete Modal
  const [deletingSession, setDeletingSession] = useState<GroupSession | null>(null);

  // Participants Modal
  const [participantsSession, setParticipantsSession] = useState<GroupSession | null>(null);
  const [enrollments, setEnrollments] = useState<GroupSessionEnrollment[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [manualParticipant, setManualParticipant] = useState({
    name: '',
    phone: '',
    email: '',
    paymentMethod: 'pix' as 'pix' | 'dinheiro' | 'cartao',
    notes: '',
  });
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [copiedList, setCopiedList] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const { confirmDialog, alertDialog, dialogNode } = useConfirmDialog();

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/group-sessions', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao carregar sessões em grupo.');
      const list = data.sessions ?? [];
      setSessions(list);
      setInstantCache('admin_group_sessions', list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar sessões em grupo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadEnrollments = useCallback(async (sessionId: string) => {
    setLoadingEnrollments(true);
    try {
      const res = await fetch(`/api/admin/group-sessions/${sessionId}/enrollments`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setEnrollments(data.enrollments ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingEnrollments(false);
    }
  }, []);

  function handleOpenCreate() {
    setEditingSession(null);
    setForm({ ...INITIAL_FORM, date: todayIso() });
    setFormError('');
    setIsModalOpen(true);
  }

  function handleOpenEdit(session: GroupSession) {
    setEditingSession(session);
    const isUnlimited = session.maxParticipants === 0;
    setForm({
      title: session.title,
      description: session.description ?? '',
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime ?? '',
      unlimitedSpots: isUnlimited,
      maxParticipants: isUnlimited ? 10 : session.maxParticipants,
      showRemainingSpots: session.showRemainingSpots !== false,
      customRemainingSpotsRaw:
        session.customRemainingSpots != null ? String(session.customRemainingSpots) : '',
      showOnHome: session.showOnHome !== false,
      priceRaw: centsToRaw(session.priceCents),
      priceVisible: session.priceVisible,
      modality: session.modality,
      locationNotes: session.locationNotes ?? '',
      status: session.status,
      published: session.published,
      audioUrl: session.audioUrl ?? null,
      audioName: session.audioName ?? null,
    });
    setFormError('');
    setIsModalOpen(true);
  }

  function handleOpenParticipants(session: GroupSession) {
    setParticipantsSession(session);
    setShowAddParticipant(false);
    setManualParticipant({ name: '', phone: '', email: '', paymentMethod: 'pix', notes: '' });
    loadEnrollments(session.id);
  }

  function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setFormError('O arquivo de áudio deve ter no máximo 15 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({
          ...prev,
          audioUrl: reader.result as string,
          audioName: file.name,
        }));
        setFormError('');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleSaveSession(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.title.trim()) return setFormError('Informe o título da sessão em grupo.');
    if (!form.date) return setFormError('Informe a data de realização da sessão.');
    if (!form.startTime) return setFormError('Informe o horário de início.');
    if (!form.unlimitedSpots && form.maxParticipants < 2) {
      return setFormError('O limite de participantes deve ser de pelo menos 2 pessoas (ou selecione Vagas Ilimitadas).');
    }

    setSaving(true);
    try {
      const customSpots =
        form.customRemainingSpotsRaw.trim() !== '' && !Number.isNaN(Number(form.customRemainingSpotsRaw))
          ? Math.max(0, Number(form.customRemainingSpotsRaw))
          : null;

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime.trim() || null,
        maxParticipants: form.unlimitedSpots ? 0 : Number(form.maxParticipants) || 10,
        showRemainingSpots: form.showRemainingSpots,
        customRemainingSpots: customSpots,
        showOnHome: form.showOnHome,
        priceCents: parsePriceToCents(form.priceRaw),
        priceVisible: form.priceVisible,
        modality: form.modality,
        locationNotes: form.locationNotes.trim() || null,
        status: form.status,
        published: form.published,
        audioUrl: form.audioUrl,
        audioName: form.audioName,
      };

      const url = editingSession
        ? `/api/admin/group-sessions/${editingSession.id}`
        : '/api/admin/group-sessions';
      const method = editingSession ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar sessão em grupo.');

      setIsModalOpen(false);
      setSuccessMsg(editingSession ? 'Sessão em grupo atualizada com sucesso!' : 'Nova sessão em grupo criada com sucesso!');
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadSessions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar sessão.');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingSession) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/group-sessions/${deletingSession.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Não foi possível excluir a sessão.');
      setDeletingSession(null);
      setSuccessMsg('Sessão em grupo excluída com sucesso.');
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir sessão.');
      setDeletingSession(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddManualParticipant(e: FormEvent) {
    e.preventDefault();
    if (!participantsSession) return;
    if (manualParticipant.name.trim().length < 2 || manualParticipant.phone.replace(/\D/g, '').length < 10) {
      setError('Preencha o nome e o WhatsApp do participante.');
      return;
    }
    setAddingParticipant(true);
    try {
      const res = await fetch(`/api/admin/group-sessions/${participantsSession.id}/enrollments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualParticipant),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Não foi possível inscrever o participante.');
      setManualParticipant({ name: '', phone: '', email: '', paymentMethod: 'pix', notes: '' });
      setShowAddParticipant(false);
      await loadEnrollments(participantsSession.id);
      await loadSessions();
      setParticipantsSession((prev) =>
        prev ? { ...prev, currentParticipants: prev.currentParticipants + 1 } : null
      );
    } catch (err) {
      await alertDialog({
        title: 'Erro ao inscrever participante',
        description: err instanceof Error ? err.message : 'Erro ao inscrever participante.',
        variant: 'error',
      });
    } finally {
      setAddingParticipant(false);
    }
  }

  async function handleCancelEnrollment(enrollmentId: string, clientName: string) {
    if (!participantsSession) return;
    const { confirmed } = await confirmDialog({
      title: 'Cancelar inscrição no grupo',
      description: 'Deseja realmente cancelar esta inscrição? A vaga será liberada automaticamente na sessão em grupo.',
      highlightText: `${clientName} — ${participantsSession.title}`,
      confirmLabel: 'Sim, cancelar inscrição',
      cancelLabel: 'Manter inscrição',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/admin/group-sessions/${participantsSession.id}/enrollments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId }),
      });
      if (res.ok) {
        await loadEnrollments(participantsSession.id);
        await loadSessions();
        setParticipantsSession((prev) =>
          prev ? { ...prev, currentParticipants: Math.max(0, prev.currentParticipants - 1) } : null
        );
      }
    } catch {
      // ignore
    }
  }

  function handleCopyParticipantList() {
    if (!participantsSession) return;
    const activeList = enrollments.filter((e) => e.status !== 'cancelado');
    const capLabel =
      participantsSession.maxParticipants === 0
        ? `${activeList.length} (Vagas Ilimitadas)`
        : `${activeList.length}/${participantsSession.maxParticipants}`;
    const lines = [
      `📋 LISTA DE PARTICIPANTES — ${participantsSession.title}`,
      `📅 Data: ${formatDatePtBr(participantsSession.date)} às ${participantsSession.startTime}${participantsSession.endTime ? ` até ${participantsSession.endTime}` : ''}`,
      `👥 Inscritos: ${capLabel}`,
      `----------------------------------------`,
      ...activeList.map((e, idx) => `${idx + 1}. ${e.clientName} — ${e.clientPhone}${e.paymentMethod ? ` (${e.paymentMethod.toUpperCase()})` : ''}`),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedList(true);
    setTimeout(() => setCopiedList(false), 2500);
  }

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (filterStatus !== 'todos' && s.status !== filterStatus) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = s.title.toLowerCase().includes(q);
        const matchDesc = (s.description ?? '').toLowerCase().includes(q);
        const matchDate = formatDatePtBr(s.date).includes(q) || s.date.includes(q);
        if (!matchTitle && !matchDesc && !matchDate) return false;
      }
      return true;
    });
  }, [sessions, filterStatus, search]);

  const kpis = useMemo(() => {
    const active = sessions.filter((s) => s.status === 'ativo').length;
    const totalEnrolled = sessions.reduce((acc, s) => acc + (s.currentParticipants || 0), 0);
    const hasUnlimited = sessions.some((s) => s.status === 'ativo' && s.maxParticipants === 0);
    const totalCapacity = sessions
      .filter((s) => s.status === 'ativo' && s.maxParticipants > 0)
      .reduce((acc, s) => acc + Math.max(0, s.maxParticipants - (s.currentParticipants || 0)), 0);
    const estimatedRevenue = sessions.reduce(
      (acc, s) => acc + (s.currentParticipants || 0) * (s.priceCents || 0),
      0
    );
    return { total: sessions.length, active, totalEnrolled, totalCapacity, hasUnlimited, estimatedRevenue };
  }, [sessions]);

  function renderPaymentBadge(method: string | null) {
    if (!method) return <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>—</span>;
    const m = method.toLowerCase();
    if (m.includes('pix')) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700, fontSize: '0.78rem', color: '#0f766e', background: '#f0fdfa', padding: '3px 9px', borderRadius: '999px', border: '1px solid #99f6e4' }}>
          <img width={14} height={14} src="https://img.icons8.com/fluency/48/pix.png" alt="pix" />
          PIX
        </span>
      );
    }
    if (m.includes('cartao') || m.includes('cartão')) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700, fontSize: '0.78rem', color: '#1d4ed8', background: '#eff6ff', padding: '3px 9px', borderRadius: '999px', border: '1px solid #bfdbfe' }}>
          <img width={14} height={14} src="https://img.icons8.com/color/48/bank-card-back-side.png" alt="cartao" />
          Cartão
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700, fontSize: '0.78rem', color: '#15803d', background: '#f0fdf4', padding: '3px 9px', borderRadius: '999px', border: '1px solid #bbfdb0' }}>
        <img width={14} height={14} src="https://img.icons8.com/offices/30/money.png" alt="dinheiro" />
        Dinheiro
      </span>
    );
  }

  return (
    <div>
      <style>{`
        .grp-page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.85rem;
          margin-bottom: 0.9rem;
          flex-wrap: wrap;
        }
        .grp-page-header h1 {
          font-size: 1.45rem;
          line-height: 1.2;
          margin: 0.15rem 0 0.25rem;
        }
        .grp-page-header p {
          font-size: 0.84rem;
          color: var(--color-text-secondary);
          margin: 0;
          line-height: 1.4;
        }
        .grp-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .grp-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.65rem;
          margin-bottom: 0.9rem;
        }
        .grp-kpi-card {
          background: #ffffff;
          border: 1.5px solid #94a3b8;
          border-radius: 14px;
          padding: 0.65rem 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.7rem;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
        }
        .grp-kpi-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .grp-kpi-info {
          min-width: 0;
          flex: 1;
        }
        .grp-kpi-value {
          font-size: 1.22rem;
          font-weight: 800;
          line-height: 1.1;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .grp-kpi-label {
          font-size: 0.73rem;
          font-weight: 600;
          color: #475569;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }
        .grp-toolbar {
          background: #ffffff;
          border: 1.5px solid #94a3b8;
          border-radius: 14px;
          padding: 0.65rem 0.75rem;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.6rem;
          flex-wrap: wrap;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
        }
        .grp-search-field {
          flex: 1 1 220px;
          min-width: 0 !important;
          margin: 0;
        }
        .grp-filters-wrap {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .grp-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
          gap: 1rem;
        }
        .grp-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 1.15rem;
          border: 2px solid #94a3b8;
          border-radius: 18px;
          background: #ffffff;
          box-shadow: 0 8px 20px -6px rgba(15, 23, 42, 0.1), 0 2px 6px -1px rgba(15, 23, 42, 0.05);
          transition: all 0.2s ease;
          overflow: hidden;
        }
        .grp-modal-shell {
          background: #ffffff;
          border-radius: 22px;
          border: 2px solid #64748b;
          box-shadow: 0 25px 60px -15px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(15, 23, 42, 0.08);
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          padding: 1.35rem;
        }
        .grp-modal-date-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .grp-modal-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 768px) {
          .grp-page-header {
            margin-bottom: 0.7rem;
            gap: 0.6rem;
          }
          .grp-page-header h1 {
            font-size: 1.22rem;
          }
          .grp-page-header p {
            font-size: 0.78rem;
          }
          .grp-header-actions {
            width: 100%;
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 6px;
          }
          .grp-header-actions .btn {
            padding: 8px 12px;
            font-size: 0.78rem;
            justify-content: center;
            white-space: nowrap;
          }
          .grp-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.5rem;
            margin-bottom: 0.75rem;
          }
          .grp-kpi-card {
            padding: 0.55rem 0.65rem;
            gap: 0.55rem;
            border-radius: 12px;
          }
          .grp-kpi-icon {
            width: 30px;
            height: 30px;
            border-radius: 8px;
          }
          .grp-kpi-value {
            font-size: 1.04rem;
          }
          .grp-kpi-label {
            font-size: 0.69rem;
          }
          .grp-toolbar {
            padding: 0.55rem;
            gap: 0.5rem;
            margin-bottom: 0.85rem;
          }
          .grp-search-field {
            flex: 1 1 100%;
            width: 100%;
          }
          .grp-filters-wrap {
            width: 100%;
            justify-content: space-between;
            gap: 0.4rem;
          }
          .grp-filters-wrap .filter-tabs {
            flex: 1 1 auto;
            display: flex;
            overflow-x: auto;
            padding: 3px;
          }
          .grp-filters-wrap .filter-tabs button {
            flex: 1;
            padding: 5px 8px;
            font-size: 0.72rem;
            white-space: nowrap;
          }
          .grp-card {
            padding: 1rem;
            border-radius: 16px;
          }
          .grp-modal-shell {
            padding: 1rem;
            border-radius: 18px;
            max-height: 92vh;
          }
          .grp-modal-date-grid {
            grid-template-columns: 1fr 1fr;
          }
          .grp-modal-date-grid > label:first-child {
            grid-column: 1 / -1;
          }
          .grp-modal-two-col {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* ── TOPO DA PÁGINA COMPACTO (MESMO MODELO DE SERVIÇOS) ── */}
      <div className="grp-page-header">
        <div>
          <span className="eyebrow">Agendamento em Grupo & Vivências</span>
          <h1>Sessões em Grupo & Turmas</h1>
          <p>Gerencie turmas coletivas, horários, limite de vagas e participantes inscritos.</p>
        </div>
        <div className="grp-header-actions">
          <Link
            href="/admin/servicos"
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '999px',
              textDecoration: 'none',
              border: '1.5px solid #94a3b8',
              fontWeight: 700,
            }}
          >
            <Layers size={15} /> Serviços
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenCreate}
            style={{ borderRadius: '999px', fontWeight: 700 }}
          >
            <Plus size={16} /> Nova Sessão em Grupo
          </button>
        </div>
      </div>

      {/* ── CARDS DE ESTATÍSTICAS RÁPIDAS (2x2 COMPACTO NO MOBILE) ── */}
      <div className="grp-kpi-grid">
        <div className="grp-kpi-card">
          <div className="grp-kpi-icon" style={{ background: '#f0f9ff', color: 'var(--color-primary)', border: '1px solid #bae6fd' }}>
            <CalendarRange size={17} />
          </div>
          <div className="grp-kpi-info">
            <div className="grp-kpi-value">{kpis.active} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>/ {kpis.total}</span></div>
            <div className="grp-kpi-label">Turmas Ativas</div>
          </div>
        </div>

        <div className="grp-kpi-card">
          <div className="grp-kpi-icon" style={{ background: '#ecfdf5', color: 'var(--color-success)', border: '1px solid #a7f3d0' }}>
            <Users size={17} />
          </div>
          <div className="grp-kpi-info">
            <div className="grp-kpi-value" style={{ color: '#21577a' }}>{kpis.totalEnrolled}</div>
            <div className="grp-kpi-label">Inscritos Confirmados</div>
          </div>
        </div>

        <div className="grp-kpi-card">
          <div className="grp-kpi-icon" style={{ background: '#f0fdf4', color: '#047857', border: '1px solid #bbf7d0' }}>
            <Sparkles size={17} />
          </div>
          <div className="grp-kpi-info">
            <div className="grp-kpi-value" style={{ color: '#047857' }}>
              {kpis.hasUnlimited ? '♾️ Livres' : kpis.totalCapacity}
            </div>
            <div className="grp-kpi-label">
              {kpis.hasUnlimited ? 'Vagas Ilimitadas' : 'Vagas Disponíveis'}
            </div>
          </div>
        </div>

        <div className="grp-kpi-card">
          <div className="grp-kpi-icon" style={{ background: '#fefce8', color: '#a16207', border: '1px solid #fde047' }}>
            <DollarSign size={17} />
          </div>
          <div className="grp-kpi-info">
            <div className="grp-kpi-value">{formatCurrency(kpis.estimatedRevenue)}</div>
            <div className="grp-kpi-label">Receita Prevista</div>
          </div>
        </div>
      </div>

      {/* ── BARRA DE FERRAMENTAS / FILTROS COMPACTA ── */}
      <div className="grp-toolbar">
        <label className="search-field grp-search-field">
          <Search size={16} />
          <span className="sr-only">Buscar sessão em grupo</span>
          <input
            type="text"
            placeholder="Buscar sessão por nome, descrição ou data..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="grp-filters-wrap">
          <div className="filter-tabs" role="group" aria-label="Filtrar por status da turma">
            {([
              { id: 'todos', label: 'Todas' },
              { id: 'ativo', label: 'Ativas' },
              { id: 'encerrado', label: 'Encerradas' },
              { id: 'cancelado', label: 'Canceladas' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={filterStatus === tab.id ? 'active' : ''}
                onClick={() => setFilterStatus(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="filter-tabs" role="group" aria-label="Modo de visualização" style={{ flex: '0 0 auto' }}>
            <button
              type="button"
              className={viewMode === 'cards' ? 'active' : ''}
              onClick={() => setViewMode('cards')}
              title="Visualização em Cards"
              style={{ padding: '5px 9px', display: 'inline-flex', alignItems: 'center' }}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              className={viewMode === 'table' ? 'active' : ''}
              onClick={() => setViewMode('table')}
              title="Visualização em Tabela"
              style={{ padding: '5px 9px', display: 'inline-flex', alignItems: 'center' }}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── FEEDBACK ALERTS ── */}
      {error && (
        <div className="form-alert page-alert" role="alert" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Fechar"><X size={16} /></button>
        </div>
      )}
      {successMsg && (
        <div className="form-alert form-alert-success page-alert" role="status" style={{ marginBottom: '1rem' }}>
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg('')} aria-label="Fechar"><X size={16} /></button>
        </div>
      )}

      {/* ── LISTAGEM DE SESSÕES EM GRUPO (MESMO MODELO DA ABA DE SERVIÇOS) ── */}
      {loading ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', border: '2px solid #94a3b8', borderRadius: '18px' }}>
          Carregando sessões em grupo...
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="card empty-state" style={{ padding: '2.5rem 1.25rem', textAlign: 'center', border: '2px solid #94a3b8', borderRadius: '18px' }}>
          <Users size={32} style={{ margin: '0 auto 0.75rem', color: 'var(--color-primary-light)' }} />
          <h3>Nenhuma sessão em grupo encontrada</h3>
          <p style={{ maxWidth: '440px', margin: '0.4rem auto 1.25rem', color: 'var(--color-text-secondary)', fontSize: '0.86rem' }}>
            Crie sua primeira sessão em grupo informando a data de início, horário de início/término e se terá vagas limitadas ou ilimitadas.
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="btn btn-primary"
            style={{ borderRadius: '999px' }}
          >
            <Plus size={16} /> Criar Sessão em Grupo
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grp-cards-grid">
          {filteredSessions.map((session) => {
            const isUnlimited = session.maxParticipants === 0;
            const remaining = getEffectiveRemainingSpots(session);
            const pct = isUnlimited
              ? 35
              : Math.min(100, Math.round(((session.currentParticipants || 0) / Math.max(1, session.maxParticipants)) * 100));
            const isFull = remaining !== null && remaining <= 0;

            return (
              <article
                key={session.id}
                className="grp-card"
                style={{
                  borderLeft:
                    session.status === 'ativo'
                      ? '5px solid #1a3a4a'
                      : session.status === 'encerrado'
                      ? '5px solid #94a3b8'
                      : '5px solid #dc2626',
                }}
              >
                <div>
                  {/* Header do Card: Título + Status da Turma */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.06rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.25, margin: 0 }}>
                      {session.title}
                    </h2>
                    <span
                      style={{
                        flexShrink: 0,
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        fontSize: '0.71rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        background:
                          session.status === 'ativo'
                            ? '#ecfdf5'
                            : session.status === 'encerrado'
                            ? '#f1f5f9'
                            : '#fef2f2',
                        color:
                          session.status === 'ativo'
                            ? '#047857'
                            : session.status === 'encerrado'
                            ? '#475569'
                            : '#b91c1c',
                        border: `1.5px solid ${
                          session.status === 'ativo'
                            ? '#86efac'
                            : session.status === 'encerrado'
                            ? '#cbd5e1'
                            : '#fecaca'
                        }`,
                      }}
                    >
                      {session.status === 'ativo' ? '● Turma Aberta' : session.status === 'encerrado' ? 'Encerrada' : 'Cancelada'}
                    </span>
                  </div>

                  {/* Descrição com expandir/recolher */}
                  {session.description && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.82rem',
                          color: 'var(--color-text-secondary)',
                          lineHeight: 1.45,
                          whiteSpace: expandedDescIds[session.id] ? 'pre-line' : 'normal',
                          ...(expandedDescIds[session.id]
                            ? { maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }
                            : {
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }),
                        }}
                      >
                        {session.description}
                      </p>
                      {session.description.length > 105 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDescIds((prev) => ({
                              ...prev,
                              [session.id]: !prev[session.id],
                            }))
                          }
                          style={{
                            marginTop: '3px',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            color: '#21577a',
                            cursor: 'pointer',
                          }}
                        >
                          {expandedDescIds[session.id] ? 'Mostrar menos ▴' : 'Ler mais ▾'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Linha Única Proporcional de Metadados: Data + Horário + Modalidade + Home + Publicação */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '0.8rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 9px',
                        borderRadius: '8px',
                        background: '#f0f9ff',
                        border: '1.5px solid #bae6fd',
                        color: '#0369a1',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      <CalendarRange size={13} />
                      <span>{formatDatePtBr(session.date)}</span>
                    </span>

                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 9px',
                        borderRadius: '8px',
                        background: '#f8fafc',
                        border: '1.5px solid #cbd5e1',
                        color: '#1e293b',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      <Clock size={13} style={{ color: '#21577a' }} />
                      <span>{session.startTime}{session.endTime ? ` às ${session.endTime}` : ''}</span>
                    </span>

                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 9px',
                        borderRadius: '8px',
                        background: session.modality === 'online' ? '#faf5ff' : '#f0fdf4',
                        border: session.modality === 'online' ? '1.5px solid #e9d5ff' : '1.5px solid #bbf7d0',
                        color: session.modality === 'online' ? '#7e22ce' : '#166534',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {session.modality === 'online' ? <Video size={13} /> : <MapPin size={13} />}
                      <span>{session.modality === 'online' ? 'Online' : 'Presencial'}</span>
                    </span>

                    {session.showOnHome && session.published && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          borderRadius: '8px',
                          background: '#fef3c7',
                          border: '1.5px solid #fde68a',
                          color: '#b45309',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                      >
                        <Home size={12} /> Na Home
                      </span>
                    )}

                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        background: session.published ? '#f8fafc' : '#fffbeb',
                        border: session.published ? '1px solid #cbd5e1' : '1px solid #fde68a',
                        color: session.published ? '#475569' : '#92400e',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                      }}
                    >
                      {session.published ? <><Eye size={12} style={{ color: '#16a34a' }} /> Publicada</> : <><EyeOff size={12} /> Oculta</>}
                    </span>
                  </div>

                  {/* Quadro Estruturado de Ocupação e Vagas (Mesmo Padrão da Caixa de Pacotes em Serviços) */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '0.65rem 0.75rem',
                      marginBottom: session.audioUrl ? '0.65rem' : '0.4rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={12} style={{ color: '#21577a' }} />
                        Ocupação da Turma
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: isFull ? '#fef2f2' : '#ecfdf5',
                          color: isFull ? '#dc2626' : '#047857',
                          border: `1px solid ${isFull ? '#fecaca' : '#a7f3d0'}`,
                        }}
                      >
                        {isFull
                          ? 'Esgotada'
                          : remaining !== null
                          ? `Restam ${remaining} ${remaining === 1 ? 'vaga' : 'vagas'}`
                          : '♾️ Vagas Ilimitadas'}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '6px 9px',
                        borderRadius: '8px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.79rem',
                      }}
                    >
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        {isUnlimited
                          ? session.customRemainingSpots != null
                            ? `${session.currentParticipants} inscritos (Ilimitada)`
                            : `${session.currentParticipants} participantes inscritos`
                          : `${session.currentParticipants} de ${session.maxParticipants} vagas preenchidas`}
                      </span>
                      <strong style={{ fontWeight: 800, color: '#21577a', whiteSpace: 'nowrap', fontSize: '0.76rem' }}>
                        {isUnlimited ? 'Sem limite' : `${pct}%`}
                      </strong>
                    </div>

                    {!isUnlimited && (
                      <div style={{ width: '100%', height: '6px', borderRadius: '999px', background: '#e2e8f0', overflow: 'hidden', marginTop: '6px' }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            borderRadius: '999px',
                            background: isFull ? '#dc2626' : pct >= 75 ? '#d97706' : '#059669',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Player de Áudio Explicativo (quando cadastrado) */}
                  {session.audioUrl && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <ServiceAudioPlayer
                        audioUrl={session.audioUrl}
                        serviceName={session.title}
                        audioName={session.audioName}
                        compact
                      />
                    </div>
                  )}
                </div>

                {/* Rodapé Proporcional do Card: Valor da Inscrição + Ações (Idêntico a Serviços) */}
                <div
                  style={{
                    borderTop: '1.5px solid #e2e8f0',
                    paddingTop: '0.8rem',
                    marginTop: '0.35rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.67rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>
                      Valor da Inscrição
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
                      <strong style={{ fontSize: '1.12rem', color: '#0f172a', fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {session.priceCents != null && session.priceCents > 0
                          ? formatCurrency(session.priceCents)
                          : 'Sob consulta'}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleOpenParticipants(session)}
                      className="btn btn-primary btn-sm"
                      style={{
                        padding: '7px 11px',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <Users size={14} /> Inscritos ({session.currentParticipants})
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(session)}
                      className="btn btn-secondary btn-sm"
                      title="Editar Sessão"
                      style={{
                        border: '1.5px solid #94a3b8',
                        fontWeight: 700,
                        padding: '7px 11px',
                        borderRadius: '10px',
                        fontSize: '0.78rem',
                      }}
                    >
                      <Pencil size={14} /> Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingSession(session)}
                      className="btn btn-ghost btn-sm"
                      title="Excluir Sessão"
                      style={{
                        color: 'var(--color-danger)',
                        border: '1.5px solid #fca5a5',
                        background: '#fef2f2',
                        padding: '7px 9px',
                        borderRadius: '10px',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div style={{ background: '#ffffff', borderRadius: '18px', border: '2px solid #94a3b8', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: '640px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1', textAlign: 'left', color: '#475569', fontSize: '0.73rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px' }}>Sessão em Grupo</th>
                <th style={{ padding: '12px 16px' }}>Data e Horário</th>
                <th style={{ padding: '12px 16px' }}>Modalidade</th>
                <th style={{ padding: '12px 16px' }}>Vagas</th>
                <th style={{ padding: '12px 16px' }}>Valor</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((session) => (
                <tr key={session.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>{session.title}</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>
                    {formatDatePtBr(session.date)} · {session.startTime}{session.endTime ? ` às ${session.endTime}` : ''}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {session.modality === 'online' ? 'Online' : 'Presencial'}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                    {session.maxParticipants === 0
                      ? `${session.currentParticipants} / ♾️ Ilimitadas`
                      : `${session.currentParticipants} / ${session.maxParticipants}`}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                    {session.priceCents ? formatCurrency(session.priceCents) : 'Sob consulta'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontWeight: 700, color: session.status === 'ativo' ? '#047857' : '#64748b' }}>
                      {session.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenParticipants(session)}
                      className="btn btn-primary btn-sm"
                      style={{ borderRadius: '8px', padding: '5px 10px', fontSize: '0.76rem' }}
                    >
                      <Users size={13} /> Inscritos ({session.currentParticipants})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(session)}
                      className="btn btn-secondary btn-sm"
                      style={{ borderRadius: '8px', padding: '5px 10px', fontSize: '0.76rem', border: '1.5px solid #94a3b8' }}
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Group Session Modal */}
      {isModalOpen && (
        <div
          className="modal-layer"
          onClick={() => !saving && setIsModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.58)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
          }}
        >
          <div
            className="grp-modal-shell"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '640px' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '2px solid #cbd5e1' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#21577a', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {editingSession ? 'Editar Turma / Sessão Coletiva' : 'Novo Agendamento em Grupo'}
                </span>
                <h2 style={{ margin: '2px 0 0', fontSize: '1.22rem', fontWeight: 800, color: '#0f172a' }}>
                  {editingSession ? 'Editar Sessão em Grupo' : 'Criar Sessão em Grupo'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1.5px solid #cbd5e1', background: '#f8fafc', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <X size={17} />
              </button>
            </div>

            {formError && (
              <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '12px', background: '#fef2f2', border: '1.5px solid #fecaca', color: '#b91c1c', fontSize: '0.83rem', fontWeight: 600 }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveSession} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label className="form-group" style={{ margin: 0 }}>
                <span className="form-label">Nome / Título da Sessão em Grupo *</span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex.: Sessão em Grupo de Hipnose Clínica & Relaxamento Profundo"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </label>

              <label className="form-group" style={{ margin: 0 }}>
                <span className="form-label">Descrição e orientações para os participantes (opcional)</span>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Explique como funciona a sessão em grupo, para quem é indicada e o que esperar..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>

              {/* Audio MP3 Upload */}
              <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '12px 14px', border: '1.5px solid #cbd5e1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Volume2 size={18} style={{ color: '#21577a', flexShrink: 0 }} />
                    <div>
                      <strong style={{ fontSize: '0.84rem', color: '#0f172a', display: 'block' }}>
                        Áudio Explicativo da Sessão (MP3 opcional)
                      </strong>
                      <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Aparece na página inicial e no agendamento para os clientes ouvirem
                      </span>
                    </div>
                  </div>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '999px',
                      background: '#ffffff',
                      border: '1.5px solid #94a3b8',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      color: '#1e293b',
                      cursor: 'pointer',
                    }}
                  >
                    <Upload size={14} />
                    {form.audioUrl ? 'Trocar MP3' : 'Enviar MP3'}
                    <input type="file" accept="audio/*" onChange={handleAudioUpload} style={{ display: 'none' }} />
                  </label>
                </div>

                {form.audioUrl && (
                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '180px' }}>
                      <ServiceAudioPlayer
                        audioUrl={form.audioUrl}
                        serviceName={form.title || 'Sessão em Grupo'}
                        audioName={form.audioName}
                        compact
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, audioUrl: null, audioName: null })}
                      style={{ padding: '6px 10px', borderRadius: '999px', border: '1.5px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>

              {/* Date and Time */}
              <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '12px 14px', border: '1.5px solid #cbd5e1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>
                    📅 Data de Início e Horário da Sessão
                  </span>
                  {formatCalculatedDuration(form.startTime, form.endTime) && (
                    <span style={{ padding: '2px 9px', borderRadius: '999px', background: '#e0f2fe', color: '#0369a1', fontSize: '0.72rem', fontWeight: 800 }}>
                      ⏱ {formatCalculatedDuration(form.startTime, form.endTime)}
                    </span>
                  )}
                </div>
                <div className="grp-modal-date-grid">
                  <label className="form-group" style={{ margin: 0 }}>
                    <span className="form-label">Data da Sessão *</span>
                    <input
                      type="date"
                      className="form-input"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      required
                    />
                  </label>
                  <label className="form-group" style={{ margin: 0 }}>
                    <span className="form-label">Horário de Início *</span>
                    <input
                      type="time"
                      className="form-input"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      required
                    />
                  </label>
                  <label className="form-group" style={{ margin: 0 }}>
                    <span className="form-label">Horário de Término</span>
                    <input
                      type="time"
                      className="form-input"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              {/* Capacity & Price */}
              <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '12px 14px', border: '1.5px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="grp-modal-two-col">
                  <div>
                    <span className="form-label" style={{ display: 'block', marginBottom: '6px' }}>
                      Controle de Vagas da Turma *
                    </span>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '6px',
                        background: '#e2e8f0',
                        padding: '4px',
                        borderRadius: '12px',
                        marginBottom: '10px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, unlimitedSpots: false })}
                        style={{
                          padding: '7px 8px',
                          borderRadius: '9px',
                          border: 'none',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: !form.unlimitedSpots ? '#ffffff' : 'transparent',
                          color: !form.unlimitedSpots ? '#1a3a4a' : '#475569',
                          boxShadow: !form.unlimitedSpots ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                        }}
                      >
                        🔢 Com Limite
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, unlimitedSpots: true })}
                        style={{
                          padding: '7px 8px',
                          borderRadius: '9px',
                          border: 'none',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: form.unlimitedSpots ? '#ffffff' : 'transparent',
                          color: form.unlimitedSpots ? '#047857' : '#475569',
                          boxShadow: form.unlimitedSpots ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                        }}
                      >
                        <InfinityIcon size={14} /> Ilimitadas
                      </button>
                    </div>

                    {!form.unlimitedSpots ? (
                      <>
                        <input
                          type="number"
                          min={2}
                          max={500}
                          className="form-input"
                          value={form.maxParticipants}
                          onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value) })}
                          required
                        />
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
                          {CAPACITY_PRESETS.map((cap) => (
                            <button
                              key={cap}
                              type="button"
                              onClick={() => setForm({ ...form, maxParticipants: cap })}
                              style={{
                                padding: '3px 9px',
                                borderRadius: '999px',
                                border: form.maxParticipants === cap ? '1.5px solid #21577a' : '1px solid #cbd5e1',
                                background: form.maxParticipants === cap ? '#21577a' : '#ffffff',
                                color: form.maxParticipants === cap ? '#ffffff' : '#475569',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {cap} vagas
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: '10px',
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          color: '#065f46',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          lineHeight: 1.4,
                        }}
                      >
                        ♾️ <strong>Sem limite máximo:</strong> qualquer número de participantes poderá se inscrever até você encerrar a turma.
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="form-group" style={{ margin: 0 }}>
                      <span className="form-label">Valor por Participante (R$)</span>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ex.: 150,00 (vazio p/ sob consulta)"
                        value={form.priceRaw}
                        onChange={(e) => setForm({ ...form, priceRaw: maskCurrency(e.target.value) })}
                        onBlur={(e) => setForm({ ...form, priceRaw: finalizeCurrency(e.target.value) })}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '0.79rem', color: '#475569', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.priceVisible}
                        onChange={(e) => setForm({ ...form, priceVisible: e.target.checked })}
                      />
                      Mostrar valor publicamente no agendamento
                    </label>
                  </div>
                </div>

                {/* Vagas Restantes & Exibição no Site */}
                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '10px' }} className="grp-modal-two-col">
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.81rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.showRemainingSpots}
                        onChange={(e) => setForm({ ...form, showRemainingSpots: e.target.checked })}
                      />
                      Mostrar vagas restantes na Home e Agendamento
                    </label>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: '2px', paddingLeft: '24px' }}>
                      Exibe o selo de vagas disponíveis para incentivar a inscrição
                    </span>
                  </div>

                  {form.showRemainingSpots && (
                    <label className="form-group" style={{ margin: 0 }}>
                      <span className="form-label" style={{ fontSize: '0.76rem' }}>
                        Forçar nº de vagas restantes exibidas (opcional)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={500}
                        className="form-input"
                        placeholder={
                          form.unlimitedSpots
                            ? 'Ex.: 5 (ou deixe vazio p/ "Vagas Abertas")'
                            : 'Automático (Limite - Inscritos)'
                        }
                        value={form.customRemainingSpotsRaw}
                        onChange={(e) => setForm({ ...form, customRemainingSpotsRaw: e.target.value })}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Modality & Location */}
              <div className="grp-modal-two-col">
                <div>
                  <span className="form-label" style={{ display: 'block', marginBottom: '6px' }}>Modalidade da Sessão *</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {(['presencial', 'online'] as const).map((mod) => {
                      const active = form.modality === mod;
                      return (
                        <button
                          key={mod}
                          type="button"
                          onClick={() => setForm({ ...form, modality: mod })}
                          style={{
                            padding: '9px',
                            borderRadius: '10px',
                            border: active ? '2px solid #1a3a4a' : '1.5px solid #cbd5e1',
                            background: active ? 'rgba(26,58,74,0.06)' : '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            color: '#1a3a4a',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          {mod === 'online' ? <Video size={15} /> : <MapPin size={15} />}
                          {mod === 'online' ? 'Online' : 'Presencial'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Local ou Observação de Acesso (opcional)</span>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={form.modality === 'online' ? 'Ex.: Link enviado via WhatsApp' : 'Ex.: Sala Coletiva - Clínica Camila Machado'}
                    value={form.locationNotes}
                    onChange={(e) => setForm({ ...form, locationNotes: e.target.value })}
                  />
                </label>
              </div>

              {/* Status & Visibility on Public Home */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', padding: '12px 14px', background: '#f8fafc', borderRadius: '14px', border: '1.5px solid #cbd5e1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.published}
                      onChange={(e) => setForm({ ...form, published: e.target.checked })}
                    />
                    Publicar para agendamento online dos clientes
                  </label>

                  {editingSession && (
                    <select
                      className="form-input"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as GroupSessionStatus })}
                      style={{ width: 'auto', height: '34px', padding: '0 10px', fontSize: '0.8rem', fontWeight: 700 }}
                    >
                      <option value="ativo">Status: Turma Ativa</option>
                      <option value="encerrado">Status: Encerrada</option>
                      <option value="cancelado">Status: Cancelada</option>
                    </select>
                  )}
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 700, color: '#1a3a4a', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.showOnHome}
                    onChange={(e) => setForm({ ...form, showOnHome: e.target.checked })}
                  />
                  Destacar esta Sessão em Grupo diretamente na Home Pública
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px', paddingTop: '10px', borderTop: '1.5px solid #cbd5e1' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ borderRadius: '999px', padding: '9px 18px', border: '1.5px solid #94a3b8' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ borderRadius: '999px', padding: '9px 20px' }}
                >
                  {saving ? 'Salvando...' : editingSession ? 'Salvar Alterações' : 'Criar Sessão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Participants Modal */}
      {participantsSession && (
        <div
          className="modal-layer"
          onClick={() => setParticipantsSession(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.58)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
          }}
        >
          <div
            className="grp-modal-shell"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '680px' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '2px solid #cbd5e1' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#21577a', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Lista de Presença & Inscritos
                </span>
                <h2 style={{ margin: '2px 0 3px', fontSize: '1.18rem', fontWeight: 800, color: '#0f172a' }}>
                  {participantsSession.title}
                </h2>
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                  📅 {formatDatePtBr(participantsSession.date)} às {participantsSession.startTime}
                  {participantsSession.endTime ? ` até ${participantsSession.endTime}` : ''} ·{' '}
                  <strong>
                    {participantsSession.maxParticipants === 0
                      ? `${participantsSession.currentParticipants} inscritos (Ilimitada)`
                      : `${participantsSession.currentParticipants} de ${participantsSession.maxParticipants} vagas`}
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setParticipantsSession(null)}
                style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1.5px solid #cbd5e1', background: '#f8fafc', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <X size={17} />
              </button>
            </div>

            {/* Action bar inside modal */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setShowAddParticipant((v) => !v)}
                className="btn btn-primary btn-sm"
                style={{ borderRadius: '999px', padding: '8px 14px', fontSize: '0.78rem', fontWeight: 700 }}
              >
                <UserPlus size={14} />
                {showAddParticipant ? 'Fechar Formulário' : 'Inscrever Participante'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <a
                  href={`/api/admin/group-sessions/${participantsSession.id}/pdf`}
                  download
                  className="btn btn-secondary btn-sm"
                  style={{
                    borderRadius: '999px',
                    padding: '8px 13px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    background: '#ecfdf5',
                    color: '#065f46',
                    border: '1.5px solid #a7f3d0',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                  title="Baixar Lista Oficial de Presença em arquivo PDF"
                >
                  <FileDown size={14} /> Baixar PDF
                </a>

                <button
                  type="button"
                  onClick={() => setPrintModalOpen(true)}
                  className="btn btn-secondary btn-sm"
                  style={{
                    borderRadius: '999px',
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    background: '#f8fafc',
                    color: '#1e293b',
                    border: '1.5px solid #94a3b8',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: 'pointer',
                  }}
                  title="Visualizar documento oficial no formato A4 e imprimir ou salvar em PDF"
                >
                  <Printer size={14} /> Imprimir / A4
                </button>

                <button
                  type="button"
                  onClick={handleCopyParticipantList}
                  className="btn btn-secondary btn-sm"
                  style={{
                    borderRadius: '999px',
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    border: '1.5px solid #94a3b8',
                  }}
                >
                  {copiedList ? <><Check size={14} /> Lista Copiada!</> : <><Copy size={14} /> Copiar Lista</>}
                </button>
              </div>
            </div>

            {/* Manual add form */}
            {showAddParticipant && (
              <form
                onSubmit={handleAddManualParticipant}
                style={{
                  background: '#f8fafc',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  border: '1.5px solid #94a3b8',
                  marginBottom: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <strong style={{ fontSize: '0.84rem', color: '#0f172a' }}>Adicionar participante na turma</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Nome completo *"
                    value={manualParticipant.name}
                    onChange={(e) => setManualParticipant({ ...manualParticipant, name: e.target.value })}
                    required
                  />
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="WhatsApp (11) 99999-9999 *"
                    value={manualParticipant.phone}
                    onChange={(e) => setManualParticipant({ ...manualParticipant, phone: maskPhone(e.target.value) })}
                    required
                  />
                  <select
                    className="form-input"
                    value={manualParticipant.paymentMethod}
                    onChange={(e) =>
                      setManualParticipant({
                        ...manualParticipant,
                        paymentMethod: e.target.value as 'pix' | 'dinheiro' | 'cartao',
                      })
                    }
                  >
                    <option value="pix">Forma Pagto: PIX</option>
                    <option value="cartao">Forma Pagto: Cartão</option>
                    <option value="dinheiro">Forma Pagto: Dinheiro</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="submit"
                    disabled={addingParticipant}
                    className="btn btn-primary btn-sm"
                    style={{ borderRadius: '999px', padding: '7px 16px', fontSize: '0.78rem' }}
                  >
                    {addingParticipant ? 'Adicionando...' : 'Confirmar Vaga'}
                  </button>
                </div>
              </form>
            )}

            {/* List */}
            {loadingEnrollments ? (
              <div style={{ padding: '28px', textAlign: 'center', color: '#64748b' }}>Carregando participantes...</div>
            ) : enrollments.length === 0 ? (
              <div style={{ padding: '28px', textAlign: 'center', background: '#f8fafc', borderRadius: '14px', border: '1.5px dashed #cbd5e1', color: '#64748b', fontSize: '0.84rem' }}>
                Ainda não há participantes inscritos nesta sessão em grupo.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {enrollments.map((enr, index) => {
                  const isCancelled = enr.status === 'cancelado';
                  const cleanDigits = enr.clientPhone.replace(/\D/g, '');
                  const waHref = `https://wa.me/${cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`}`;
                  return (
                    <div
                      key={enr.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background: isCancelled ? '#f8fafc' : '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        opacity: isCancelled ? 0.65 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: isCancelled ? '#e2e8f0' : '#e0f2fe',
                            color: isCancelled ? '#64748b' : '#0369a1',
                            fontWeight: 800,
                            fontSize: '0.76rem',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {index + 1}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ fontSize: '0.86rem', color: '#0f172a', display: 'block', textDecoration: isCancelled ? 'line-through' : 'none' }}>
                            {enr.clientName}
                          </strong>
                          <span style={{ fontSize: '0.76rem', color: '#64748b', display: 'block' }}>
                            {enr.clientPhone}{enr.clientEmail ? ` · ${enr.clientEmail}` : ''}
                          </span>
                          {(enr.clientCpf || enr.clientBirthDate) && (
                            <span style={{ fontSize: '0.72rem', color: '#475569', display: 'block', marginTop: '1px' }}>
                              {enr.clientCpf ? `CPF: ${maskCpf(enr.clientCpf)}` : ''}
                              {enr.clientCpf && enr.clientBirthDate ? ' · ' : ''}
                              {enr.clientBirthDate ? `Nasc.: ${formatDatePtBr(enr.clientBirthDate)}` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {renderPaymentBadge(enr.paymentMethod)}

                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: isCancelled ? '#fef2f2' : '#ecfdf5',
                            color: isCancelled ? '#b91c1c' : '#047857',
                            border: `1px solid ${isCancelled ? '#fecaca' : '#a7f3d0'}`,
                          }}
                        >
                          {isCancelled ? 'Cancelado' : 'Confirmado'}
                        </span>

                        {!isCancelled && (
                          <>
                            <a
                              href={waHref}
                              target="_blank"
                              rel="noreferrer"
                              title="Chamar no WhatsApp"
                              style={{
                                padding: '5px 11px',
                                borderRadius: '999px',
                                background: '#dcfce7',
                                color: '#15803d',
                                border: '1.5px solid #86efac',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <WhatsappIcon size={17} /> WhatsApp
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCancelEnrollment(enr.id, enr.clientName)}
                              title="Cancelar inscrição e liberar vaga"
                              style={{
                                padding: '5px 9px',
                                borderRadius: '999px',
                                border: '1px solid #fecaca',
                                background: '#fef2f2',
                                color: '#dc2626',
                                fontSize: '0.73rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <UserX size={12} /> Cancelar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Visualização & Impressão A4 da Lista de Presença */}
      {printModalOpen && participantsSession && (
        <div
          id="group-session-print-modal-backdrop"
          onClick={() => setPrintModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(5px)',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '20px 14px',
            overflowY: 'auto',
          }}
        >
          {/* Barra Superior de Ações (Oculta na Impressão) */}
          <div
            className="no-print"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '850px',
              background: '#0f172a',
              color: '#ffffff',
              borderRadius: '16px',
              padding: '14px 20px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
            }}
          >
            <div>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                Visualização Oficial para Impressão & PDF (A4)
              </span>
              <strong style={{ fontSize: '0.96rem', color: '#ffffff' }}>
                Lista de Presença — {participantsSession.title}
              </strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '9px 18px',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
                }}
              >
                <Printer size={15} /> Imprimir / Salvar como PDF
              </button>

              <a
                href={`/api/admin/group-sessions/${participantsSession.id}/pdf`}
                download
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: '999px',
                  padding: '9px 16px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FileDown size={15} /> Baixar Arquivo PDF (.pdf)
              </a>

              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '34px',
                  height: '34px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Folha Oficial A4 */}
          <div
            id="printable-group-attendance"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '850px',
              background: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 16px 45px rgba(0,0,0,0.25)',
              padding: '36px 40px',
              color: '#0f172a',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              marginBottom: '40px',
            }}
          >
            {/* Cabeçalho Oficial */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-camila-machado.png"
                  alt="Camila Machado"
                  style={{ height: '46px', maxWidth: '140px', objectFit: 'contain' }}
                  onError={(e) => {
                    // fallback se a imagem falhar
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <h1 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#1a3a4a', margin: 0, letterSpacing: '-0.01em' }}>
                    CAMILA MACHADO
                  </h1>
                  <p style={{ fontSize: '0.72rem', color: '#b8892a', fontWeight: 700, margin: '2px 0 0', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Hipnose Clínica Multidimensional Integrativa
                  </p>
                  <span style={{ fontSize: '0.68rem', color: '#64748b' }}>CRT-SBHP/SC 805</span>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                  Documento Oficial
                </span>
                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1a3a4a' }}>
                  LISTA DE PRESENÇA
                </span>
                <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>
                  Sessão em Grupo Integrativa
                </span>
              </div>
            </div>

            <div style={{ height: '2px', background: 'linear-gradient(90deg, #b8892a 0%, #1a3a4a 100%)', margin: '8px 0 16px' }} />

            {/* Informações da Sessão */}
            <div
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '10px',
              }}
            >
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>
                  Nome da Sessão:
                </span>
                <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>
                  {participantsSession.title}
                </strong>
              </div>

              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>
                  Data & Horário:
                </span>
                <strong style={{ fontSize: '0.88rem', color: '#b8892a' }}>
                  {formatDatePtBr(participantsSession.date)} às {participantsSession.startTime}
                  {participantsSession.endTime ? ` até ${participantsSession.endTime}` : ''}
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '4px' }}>
                  ({participantsSession.durationMinutes} min)
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>
                  Modalidade & Local:
                </span>
                <span style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 600 }}>
                  {participantsSession.modality === 'online' ? '🌐 Online (Ao Vivo)' : '📍 Presencial'} —{' '}
                  {participantsSession.locationNotes || 'Espaço Terapêutico Camila Machado — Urussanga / SC'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block' }}>
                  Participantes & Ocupação:
                </span>
                <strong style={{ fontSize: '0.84rem', color: '#15803d' }}>
                  {enrollments.filter((e) => e.status !== 'cancelado').length} inscritos confirmados
                  {participantsSession.maxParticipants > 0 ? ` (de ${participantsSession.maxParticipants} vagas)` : ' (Vagas Ilimitadas)'}
                </strong>
              </div>
            </div>

            {/* Tabela de Participantes */}
            <div style={{ overflowX: 'auto', marginBottom: '18px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: '#1a3a4a', color: '#ffffff', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px', borderRadius: '6px 0 0 0', width: '32px' }}>#</th>
                    <th style={{ padding: '8px 10px' }}>Nome do Participante</th>
                    <th style={{ padding: '8px 10px' }}>CPF</th>
                    <th style={{ padding: '8px 10px' }}>WhatsApp</th>
                    <th style={{ padding: '8px 10px' }}>E-mail</th>
                    <th style={{ padding: '8px 10px' }}>Nascimento</th>
                    <th style={{ padding: '8px 10px' }}>Pagto</th>
                    <th style={{ padding: '8px 10px', borderRadius: '0 6px 0 0', width: '150px' }}>Rubrica / Assinatura</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.filter((e) => e.status !== 'cancelado').length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        Nenhum participante inscrito nesta sessão até o momento.
                      </td>
                    </tr>
                  ) : (
                    enrollments
                      .filter((e) => e.status !== 'cancelado')
                      .map((enr, idx) => (
                        <tr
                          key={enr.id}
                          style={{
                            background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                          }}
                        >
                          <td style={{ padding: '8px 10px', fontWeight: 800, color: '#0f172a' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>{enr.clientName}</td>
                          <td style={{ padding: '8px 10px', color: '#475569', whiteSpace: 'nowrap' }}>
                            {enr.clientCpf ? maskCpf(enr.clientCpf) : '-'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#0f172a', whiteSpace: 'nowrap' }}>
                            {enr.clientPhone ? maskPhone(enr.clientPhone) : '-'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '0.73rem' }}>
                            {enr.clientEmail || '-'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#475569', whiteSpace: 'nowrap' }}>
                            {enr.clientBirthDate ? formatDatePtBr(enr.clientBirthDate) : '-'}
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#15803d' }}>
                            {(enr.paymentMethod || 'PIX').toUpperCase()}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ borderBottom: '1px dotted #94a3b8', height: '18px', width: '100%' }} />
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Cancelados (se houver) */}
            {enrollments.some((e) => e.status === 'cancelado') && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px' }}>
                <strong style={{ fontSize: '0.74rem', color: '#991b1b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Inscrições Canceladas / Desistências ({enrollments.filter((e) => e.status === 'cancelado').length}):
                </strong>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#b91c1c', lineHeight: 1.4 }}>
                  {enrollments
                    .filter((e) => e.status === 'cancelado')
                    .map((c) => `${c.clientName} (${maskPhone(c.clientPhone)})`)
                    .join(' · ')}
                </p>
              </div>
            )}

            {/* Rodapé com Assinatura da Terapeuta */}
            <div style={{ marginTop: '30px', paddingTop: '16px', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>
                  Total de Presentes Confirmados: _______ de {enrollments.filter((e) => e.status !== 'cancelado').length}
                </span>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                  Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div style={{ textAlign: 'center', minWidth: '220px' }}>
                <div style={{ width: '100%', height: '1px', background: '#1a3a4a', marginBottom: '6px' }} />
                <strong style={{ fontSize: '0.84rem', color: '#1a3a4a', display: 'block' }}>
                  Camila Machado
                </strong>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  Terapeuta Responsável — CRT-SBHP/SC 805
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.65rem', color: '#94a3b8' }}>
              Camila Machado · Hipnose Clínica Multidimensional Integrativa · Documento Confidencial (Lei Geral de Proteção de Dados - LGPD)
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSession && (
        <div
          className="modal-layer"
          onClick={() => !saving && setDeletingSession(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.58)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '14px',
          }}
        >
          <div
            className="grp-modal-shell"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '420px' }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1.12rem', fontWeight: 800, color: '#0f172a' }}>
              Excluir Sessão em Grupo?
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
              Tem certeza que deseja excluir <strong>{deletingSession.title}</strong>? Caso já tenha participantes inscritos, recomendamos alterar o status para Cancelada.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setDeletingSession(null)}
                className="btn btn-secondary"
                style={{ borderRadius: '999px', border: '1.5px solid #94a3b8' }}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={saving}
                style={{
                  padding: '9px 18px',
                  borderRadius: '999px',
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
      {dialogNode}
    </div>
  );
}

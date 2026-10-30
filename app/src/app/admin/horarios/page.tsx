'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  CalendarRange,
  Clock,
  Clock3,
  Check,
  Plus,
  Trash2,
  Lock,
  Zap,
  AlertTriangle,
  CalendarOff,
  Sparkles,
  Info,
  Calendar,
  X,
  LoaderCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Sun,
  Coffee,
  HeartPulse,
  Plane,
} from 'lucide-react';
import { formatCurrency, maskPhone } from '@/lib/utils';
import type { UnifiedScheduleBlock } from '@/app/api/admin/schedule-blocks/route';

type BookingConfirmationMode = 'manual' | 'automatico';

type AgendaSettingsPayload = {
  settings: {
    bookingConfirmationMode: BookingConfirmationMode;
    minimumNoticeMinutes: number;
  };
  workingHours: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
    publicBooking: boolean;
  }>;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    intervalMinutes: number;
  }>;
  holidays: Array<{
    id?: string;
    date: string;
    name: string;
  }>;
};

const WEEK_DAYS = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

function formatDatePtBr(isoDate: string): string {
  if (!isoDate) return '-';
  const cleanStr = isoDate.split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return isoDate;
}

function getClinicTodayStr(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export default function HorariosPage() {
  const [activeTab, setActiveTab] = useState<'grade' | 'bloqueios' | 'feriados'>('grade');
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Settings State
  const [settings, setSettings] = useState<AgendaSettingsPayload | null>(null);

  // Blocks State
  const [blocksPeriod, setBlocksPeriod] = useState<'hoje' | '7dias' | '30dias'>('7dias');
  const [blocksKindFilter, setBlocksKindFilter] = useState<'all' | 'manual' | 'automatico'>('all');
  const [blocks, setBlocks] = useState<UnifiedScheduleBlock[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  // New Block Modal
  const [isNewBlockModalOpen, setIsNewBlockModalOpen] = useState(false);
  const [blockForm, setBlockForm] = useState({
    startDate: getClinicTodayStr(),
    endDate: getClinicTodayStr(),
    allDay: false,
    startTime: '12:00',
    endTime: '13:30',
    reason: 'Almoço / Intervalo',
  });
  const [submittingBlock, setSubmittingBlock] = useState(false);

  // Holiday Modal
  const [holidayForm, setHolidayForm] = useState({ date: getClinicTodayStr(), name: '' });

  // Load initial settings
  async function loadSettings() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/agenda-settings');
      if (!res.ok) throw new Error('Não foi possível carregar os horários.');
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Erro ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  }

  // Load schedule blocks
  async function loadBlocks() {
    setLoadingBlocks(true);
    try {
      const today = getClinicTodayStr();
      let to = today;
      if (blocksPeriod === '7dias') {
        const d = new Date(`${today}T12:00:00-03:00`);
        d.setDate(d.getDate() + 7);
        to = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(d);
      } else if (blocksPeriod === '30dias') {
        const d = new Date(`${today}T12:00:00-03:00`);
        d.setDate(d.getDate() + 30);
        to = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(d);
      }

      const res = await fetch(`/api/admin/schedule-blocks?from=${today}&to=${to}&kind=${blocksKindFilter}`);
      if (!res.ok) throw new Error('Não foi possível carregar os bloqueios.');
      const data = await res.json();
      setBlocks(data.blocks || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBlocks(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'bloqueios') {
      loadBlocks();
    }
  }, [activeTab, blocksPeriod, blocksKindFilter]);

  // Working Hours Manipulation
  function handleAddShift(weekday: number) {
    if (!settings) return;
    const newShift = {
      weekday,
      startTime: '14:00',
      endTime: '18:00',
      publicBooking: true,
    };
    setSettings({
      ...settings,
      workingHours: [...settings.workingHours, newShift].sort((a, b) =>
        a.weekday === b.weekday ? a.startTime.localeCompare(b.startTime) : a.weekday - b.weekday
      ),
    });
  }

  function handleRemoveShift(indexToRemove: number) {
    if (!settings) return;
    setSettings({
      ...settings,
      workingHours: settings.workingHours.filter((_, idx) => idx !== indexToRemove),
    });
  }

  function handleUpdateShift(indexToUpdate: number, field: string, value: any) {
    if (!settings) return;
    const updated = settings.workingHours.map((shift, idx) => {
      if (idx !== indexToUpdate) return shift;
      return { ...shift, [field]: value };
    });
    setSettings({ ...settings, workingHours: updated });
  }

  // Save Settings
  async function handleSaveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    setSaveSuccessNotice(null);
    setErrorNotice(null);
    try {
      const res = await fetch('/api/admin/agenda-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            bookingConfirmationMode: settings.settings.bookingConfirmationMode,
            minimumNoticeMinutes: settings.settings.minimumNoticeMinutes,
          },
          workingHours: settings.workingHours,
          holidays: settings.holidays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar configurações.');
      setSaveSuccessNotice('Horários e parâmetros de atendimento salvos com sucesso!');
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Erro ao salvar alterações.');
    } finally {
      setSavingSettings(false);
    }
  }

  // Create Manual Block
  async function handleCreateBlock(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingBlock(true);
    setErrorNotice(null);
    try {
      const payload: any = {
        allDay: blockForm.allDay,
        startDate: blockForm.startDate,
        endDate: blockForm.endDate,
        reason: blockForm.reason.trim() || 'Bloqueio de Agenda',
      };
      if (!blockForm.allDay) {
        payload.date = blockForm.startDate;
        payload.startTime = blockForm.startTime;
        payload.endTime = blockForm.endTime;
      }

      const res = await fetch('/api/admin/time-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar bloqueio.');

      setIsNewBlockModalOpen(false);
      setSaveSuccessNotice('Horário bloqueado com sucesso na agenda!');
      setTimeout(() => setSaveSuccessNotice(null), 4000);
      loadBlocks();
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'Erro ao criar bloqueio de horário.');
    } finally {
      setSubmittingBlock(false);
    }
  }

  // Delete Manual Block (Unblock)
  async function handleDeleteBlock(blockId: string, reason: string) {
    if (!confirm(`Deseja realmente desbloquear o horário: "${reason}"?`)) return;
    try {
      const res = await fetch(`/api/admin/time-blocks/${blockId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Não foi possível desbloquear o horário.');
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
      setSaveSuccessNotice('Horário desbloqueado com sucesso!');
      setTimeout(() => setSaveSuccessNotice(null), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao desbloquear horário.');
    }
  }

  // Holiday management
  function handleAddHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!settings || !holidayForm.name.trim() || !holidayForm.date) return;
    const exists = settings.holidays.some((h) => h.date === holidayForm.date);
    if (exists) {
      alert('Já existe um recesso cadastrado para esta data.');
      return;
    }
    setSettings({
      ...settings,
      holidays: [...settings.holidays, { date: holidayForm.date, name: holidayForm.name.trim() }].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    });
    setHolidayForm({ date: getClinicTodayStr(), name: '' });
  }

  function handleRemoveHoliday(date: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      holidays: settings.holidays.filter((h) => h.date !== date),
    });
  }

  const manualBlocksCount = useMemo(() => blocks.filter((b) => b.kind === 'manual').length, [blocks]);
  const autoBlocksCount = useMemo(() => blocks.filter((b) => b.kind === 'automatico').length, [blocks]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
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
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.72rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                background: '#e0f2fe',
                color: '#0369a1',
                padding: '3px 9px',
                borderRadius: '999px',
              }}
            >
              <Clock size={12} />
              Gestão de Expediente & Disponibilidade
            </span>
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 850, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
            Horários de Atendimento & Bloqueios
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: '#64748b' }}>
            Configure o expediente semanal da clínica e acompanhe os horários bloqueados automaticamente por agendamentos e manualmente por você.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setIsNewBlockModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '999px',
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <Lock size={15} /> + Bloquear Horário Manual
          </button>

          <Link
            href="/admin/agenda"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '999px',
              background: '#ffffff',
              color: '#1e293b',
              border: '1.5px solid #cbd5e1',
              fontSize: '0.82rem',
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <CalendarDays size={15} /> Ver na Agenda <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      {/* Alertas e Notificações */}
      {saveSuccessNotice && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '10px 14px',
            borderRadius: '12px',
            background: '#ecfdf5',
            color: '#065f46',
            border: '1.5px solid #a7f3d0',
            fontSize: '0.82rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Check size={16} color="#059669" />
          {saveSuccessNotice}
        </div>
      )}

      {errorNotice && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '10px 14px',
            borderRadius: '12px',
            background: '#fef2f2',
            color: '#991b1b',
            border: '1.5px solid #fca5a5',
            fontSize: '0.82rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={16} color="#dc2626" />
          {errorNotice}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TABS DE NAVEGAÇÃO PRINCIPAL
      ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: '#f1f5f9',
          padding: '5px',
          borderRadius: '16px',
          marginBottom: '1.5rem',
          border: '1px solid #e2e8f0',
          width: 'fit-content',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('grade')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '9px 18px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.84rem',
            fontWeight: 800,
            cursor: 'pointer',
            background: activeTab === 'grade' ? '#ffffff' : 'transparent',
            color: activeTab === 'grade' ? '#0f172a' : '#64748b',
            boxShadow: activeTab === 'grade' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Clock size={16} /> Grade de Atendimento (Expediente)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bloqueios')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '9px 18px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.84rem',
            fontWeight: 800,
            cursor: 'pointer',
            background: activeTab === 'bloqueios' ? '#ffffff' : 'transparent',
            color: activeTab === 'bloqueios' ? '#0f172a' : '#64748b',
            boxShadow: activeTab === 'bloqueios' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Lock size={16} /> Bloqueios de Horário (Manuais & Automáticos)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('feriados')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '9px 18px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.84rem',
            fontWeight: 800,
            cursor: 'pointer',
            background: activeTab === 'feriados' ? '#ffffff' : 'transparent',
            color: activeTab === 'feriados' ? '#0f172a' : '#64748b',
            boxShadow: activeTab === 'feriados' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <CalendarOff size={16} /> Feriados & Recessos
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          <LoaderCircle size={28} className="animate-spin" style={{ margin: '0 auto 8px' }} />
          <p style={{ margin: 0, fontWeight: 600 }}>Carregando dados da clínica...</p>
        </div>
      ) : activeTab === 'grade' && settings ? (
        /* ══════════════════════════════════════════════════════════
           TAB 1: GRADE SEMANAL DE EXPEDIENTE
        ══════════════════════════════════════════════════════════ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Card: Regras Gerais de Confirmação & Bloqueio Imediato */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '1.25rem 1.5rem',
              border: '1.5px solid #cbd5e1',
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: '#fef3c7',
                  color: '#b45309',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Zap size={18} />
              </div>
              <div>
                <strong style={{ fontSize: '1rem', color: '#0f172a', display: 'block' }}>
                  Regra de Bloqueio Automático & Antecedência
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Como o sistema reage na hora em que um cliente escolhe um horário no site
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Modo de Agendamento Online
                </label>
                <select
                  className="form-input"
                  value={settings.settings.bookingConfirmationMode}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      settings: {
                        ...settings.settings,
                        bookingConfirmationMode: e.target.value as BookingConfirmationMode,
                      },
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                  }}
                >
                  <option value="automatico">⚡ Bloqueio & Confirmação Automática Imediata (Recomendado)</option>
                  <option value="manual">🛡️ Solicitação Manual (Entra como solicitado e aguarda aprovação)</option>
                </select>
                <p style={{ margin: '6px 0 0', fontSize: '0.74rem', color: '#64748b', lineHeight: 1.35 }}>
                  No modo automático, assim que o cliente confirma o dia e hora no site, o sistema bloqueia aquele horário instantaneamente na grade para impedir qualquer duplicidade.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Antecedência Mínima para Agendamento
                </label>
                <select
                  className="form-input"
                  value={settings.settings.minimumNoticeMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      settings: {
                        ...settings.settings,
                        minimumNoticeMinutes: Number(e.target.value),
                      },
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                  }}
                >
                  <option value={30}>30 minutos de antecedência</option>
                  <option value={60}>1 hora de antecedência</option>
                  <option value={120}>2 horas de antecedência</option>
                  <option value={240}>4 horas de antecedência</option>
                  <option value={720}>12 horas de antecedência</option>
                  <option value={1440}>24 horas (1 dia de antecedência)</option>
                  <option value={2880}>48 horas (2 dias de antecedência)</option>
                </select>
                <p style={{ margin: '6px 0 0', fontSize: '0.74rem', color: '#64748b', lineHeight: 1.35 }}>
                  Tempo mínimo entre o momento atual e o horário da consulta no site para você se preparar.
                </p>
              </div>
            </div>
          </div>

          {/* Grade Semanal: Segunda a Domingo */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '1.5rem',
              border: '1.5px solid #cbd5e1',
              boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              <div>
                <strong style={{ fontSize: '1.05rem', color: '#0f172a', display: 'block' }}>
                  Expediente de Segunda a Domingo
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Defina os turnos de atendimento da terapeuta. Você pode criar múltiplos turnos (ex: manhã e tarde) para deixar o almoço livre.
                </span>
              </div>

              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 20px',
                  borderRadius: '999px',
                  background: '#15803d',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: savingSettings ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(21, 128, 61, 0.25)',
                }}
              >
                {savingSettings ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
                {savingSettings ? 'Salvando...' : 'Salvar Grade Semanal'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {WEEK_DAYS.map((day) => {
                const dayShifts = settings.workingHours
                  .map((shift, originalIndex) => ({ shift, originalIndex }))
                  .filter(({ shift }) => shift.weekday === day.value);

                const isOpen = dayShifts.length > 0;

                return (
                  <div
                    key={day.value}
                    style={{
                      border: '1.5px solid ' + (isOpen ? '#cbd5e1' : '#e2e8f0'),
                      borderRadius: '16px',
                      padding: '14px 18px',
                      background: isOpen ? '#ffffff' : '#f8fafc',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: isOpen ? '#16a34a' : '#cbd5e1',
                          }}
                        />
                        <strong style={{ fontSize: '0.94rem', color: isOpen ? '#0f172a' : '#64748b', minWidth: '130px' }}>
                          {day.label}
                        </strong>
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: isOpen ? '#ecfdf5' : '#f1f5f9',
                            color: isOpen ? '#047857' : '#64748b',
                            border: `1px solid ${isOpen ? '#a7f3d0' : '#cbd5e1'}`,
                          }}
                        >
                          {isOpen ? `${dayShifts.length} turno(s) configurado(s)` : 'Sem expediente (Fechado)'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddShift(day.value)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: '999px',
                          border: '1px solid #94a3b8',
                          background: '#ffffff',
                          color: '#334155',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={13} /> Adicionar Turno
                      </button>
                    </div>

                    {/* Lista de Turnos do Dia */}
                    {isOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #e2e8f0' }}>
                        {dayShifts.map(({ shift, originalIndex }, shiftIdx) => (
                          <div
                            key={originalIndex}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '10px',
                              background: '#f8fafc',
                              padding: '8px 12px',
                              borderRadius: '12px',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b' }}>
                                Turno {shiftIdx + 1}:
                              </span>
                              <input
                                type="time"
                                value={shift.startTime}
                                onChange={(e) => handleUpdateShift(originalIndex, 'startTime', e.target.value)}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '8px',
                                  border: '1px solid #cbd5e1',
                                  fontSize: '0.82rem',
                                  fontWeight: 700,
                                }}
                              />
                              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>até</span>
                              <input
                                type="time"
                                value={shift.endTime}
                                onChange={(e) => handleUpdateShift(originalIndex, 'endTime', e.target.value)}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '8px',
                                  border: '1px solid #cbd5e1',
                                  fontSize: '0.82rem',
                                  fontWeight: 700,
                                }}
                              />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={shift.publicBooking}
                                  onChange={(e) => handleUpdateShift(originalIndex, 'publicBooking', e.target.checked)}
                                />
                                Agendamento online permitido
                              </label>

                              <button
                                type="button"
                                onClick={() => handleRemoveShift(originalIndex)}
                                title="Remover turno"
                                style={{
                                  background: '#fee2e2',
                                  border: '1px solid #fca5a5',
                                  color: '#dc2626',
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '8px',
                                  display: 'grid',
                                  placeItems: 'center',
                                  cursor: 'pointer',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 24px',
                  borderRadius: '999px',
                  background: '#15803d',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  cursor: savingSettings ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(21, 128, 61, 0.3)',
                }}
              >
                {savingSettings ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
                {savingSettings ? 'Salvando alterações...' : 'Salvar Grade Semanal'}
              </button>
            </div>
          </div>
        </div>
      ) : activeTab === 'bloqueios' ? (
        /* ══════════════════════════════════════════════════════════
           TAB 2: CENTRAL DE BLOQUEIOS (MANUAIS & AUTOMÁTICOS)
        ══════════════════════════════════════════════════════════ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Box de explicação */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
              borderRadius: '20px',
              padding: '1.25rem 1.5rem',
              border: '1.5px solid #a7f3d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
            }}
          >
            <div style={{ maxWidth: '780px' }}>
              <strong style={{ fontSize: '0.96rem', color: '#065f46', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={18} color="#059669" />
                Como funcionam os Bloqueios Automáticos e Manuais
              </strong>
              <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#166534', lineHeight: 1.45 }}>
                • <strong>⚡ Bloqueios Automáticos:</strong> O sistema bloqueia imediatamente o horário quando um cliente agenda pelo site ou internamente. Esse horário fica indisponível para novos pacientes.<br />
                • <strong>🔒 Bloqueios Manuais:</strong> Bloqueios criados por você para almoço, descanso, consultas médicas, reuniões ou viagens. Você pode desbloquear a qualquer momento.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsNewBlockModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 18px',
                borderRadius: '999px',
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
              }}
            >
              <Lock size={15} /> + Criar Bloqueio Manual
            </button>
          </div>

          {/* KPIs dos Bloqueios */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            <div
              style={{
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: '16px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#f1f5f9',
                  color: '#334155',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Clock size={20} />
              </div>
              <div>
                <span style={{ fontSize: '1.35rem', fontWeight: 850, color: '#0f172a', display: 'block', lineHeight: 1 }}>
                  {blocks.length}
                </span>
                <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>
                  Total de Horários Bloqueados
                </span>
              </div>
            </div>

            <div
              style={{
                background: '#ffffff',
                border: '1.5px solid #fca5a5',
                borderRadius: '16px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#fef2f2',
                  color: '#dc2626',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Lock size={20} />
              </div>
              <div>
                <span style={{ fontSize: '1.35rem', fontWeight: 850, color: '#dc2626', display: 'block', lineHeight: 1 }}>
                  {manualBlocksCount}
                </span>
                <span style={{ fontSize: '0.74rem', color: '#991b1b', fontWeight: 700 }}>
                  Bloqueios Manuais Ativos
                </span>
              </div>
            </div>

            <div
              style={{
                background: '#ffffff',
                border: '1.5px solid #a7f3d0',
                borderRadius: '16px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#ecfdf5',
                  color: '#059669',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Zap size={20} />
              </div>
              <div>
                <span style={{ fontSize: '1.35rem', fontWeight: 850, color: '#059669', display: 'block', lineHeight: 1 }}>
                  {autoBlocksCount}
                </span>
                <span style={{ fontSize: '0.74rem', color: '#047857', fontWeight: 700 }}>
                  Bloqueios Automáticos (Agendamentos)
                </span>
              </div>
            </div>
          </div>

          {/* Filtros de Tipo e Período */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              background: '#ffffff',
              padding: '12px 16px',
              borderRadius: '16px',
              border: '1.5px solid #cbd5e1',
            }}
          >
            {/* Tipo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>Tipo:</span>
              {(['all', 'manual', 'automatico'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setBlocksKindFilter(k)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '999px',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: blocksKindFilter === k ? '#0f172a' : '#f1f5f9',
                    color: blocksKindFilter === k ? '#ffffff' : '#475569',
                  }}
                >
                  {k === 'all'
                    ? `Todos (${blocks.length})`
                    : k === 'manual'
                    ? `🔒 Manuais (${manualBlocksCount})`
                    : `⚡ Automáticos (${autoBlocksCount})`}
                </button>
              ))}
            </div>

            {/* Período */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>Período:</span>
              {(['hoje', '7dias', '30dias'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBlocksPeriod(p)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '999px',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: blocksPeriod === p ? '#2563eb' : '#f1f5f9',
                    color: blocksPeriod === p ? '#ffffff' : '#475569',
                  }}
                >
                  {p === 'hoje' ? 'Hoje' : p === '7dias' ? 'Próximos 7 Dias' : 'Próximos 30 Dias'}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Bloqueios */}
          {loadingBlocks ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              <LoaderCircle size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Carregando horários bloqueados...</p>
            </div>
          ) : blocks.length === 0 ? (
            <div
              style={{
                padding: '3rem',
                textAlign: 'center',
                background: '#ffffff',
                borderRadius: '18px',
                border: '1.5px dashed #cbd5e1',
                color: '#64748b',
              }}
            >
              <Clock size={32} style={{ margin: '0 auto 8px', color: '#94a3b8' }} />
              <strong style={{ fontSize: '0.96rem', color: '#0f172a', display: 'block' }}>
                Nenhum horário bloqueado para o período selecionado
              </strong>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
                Os agendamentos confirmados e os bloqueios manuais aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {blocks.map((block) => {
                const isManual = block.kind === 'manual';

                return (
                  <div
                    key={block.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '16px',
                      padding: '14px 18px',
                      border: '1.5px solid ' + (isManual ? '#fca5a5' : '#cbd5e1'),
                      borderLeft: '5px solid ' + (isManual ? '#dc2626' : '#059669'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '12px',
                          background: isManual ? '#fef2f2' : '#ecfdf5',
                          color: isManual ? '#dc2626' : '#059669',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isManual ? <Lock size={20} /> : <Zap size={20} />}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: isManual ? '#fee2e2' : '#dcfce7',
                              color: isManual ? '#991b1b' : '#15803d',
                              border: `1px solid ${isManual ? '#fca5a5' : '#86efac'}`,
                            }}
                          >
                            {isManual ? '🔒 Bloqueio Manual' : '⚡ Bloqueio Automático (Agendamento)'}
                          </span>

                          <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>
                            📅 {formatDatePtBr(block.date)} às {block.startTime} – {block.endTime}
                          </strong>

                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            ({block.durationMinutes} min)
                          </span>
                        </div>

                        <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                          {block.reason}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isManual ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteBlock(block.id, block.reason)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fca5a5',
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={13} /> Desbloquear Horário
                        </button>
                      ) : (
                        <Link
                          href={`/admin/agenda?date=${block.date}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            background: '#f1f5f9',
                            color: '#0f172a',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                          }}
                        >
                          Ver na Agenda <ChevronRight size={13} />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : activeTab === 'feriados' && settings ? (
        /* ══════════════════════════════════════════════════════════
           TAB 3: FERIADOS & RECESSOS DA CLÍNICA
        ══════════════════════════════════════════════════════════ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '1.5rem',
              border: '1.5px solid #cbd5e1',
            }}
          >
            <strong style={{ fontSize: '1rem', color: '#0f172a', display: 'block' }}>
              Adicionar Dia de Recesso ou Feriado
            </strong>
            <p style={{ margin: '4px 0 14px', fontSize: '0.78rem', color: '#64748b' }}>
              Nestes dias a clínica estará fechada e nenhum horário será disponibilizado para agendamento online.
            </p>

            <form
              onSubmit={handleAddHoliday}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
                background: '#f8fafc',
                padding: '12px 16px',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
              }}
            >
              <input
                type="date"
                value={holidayForm.date}
                onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                required
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                }}
              />

              <input
                type="text"
                placeholder="Nome do feriado ou motivo (Ex: Recesso de Carnaval)"
                value={holidayForm.name}
                onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                required
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  flex: 1,
                  minWidth: '220px',
                }}
              />

              <button
                type="submit"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 18px',
                  borderRadius: '999px',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <Plus size={15} /> Adicionar Recesso
              </button>
            </form>

            <div style={{ marginTop: '20px' }}>
              <strong style={{ fontSize: '0.88rem', color: '#334155', display: 'block', marginBottom: '8px' }}>
                Feriados e Recessos Cadastrados ({settings.holidays.length}):
              </strong>

              {settings.holidays.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                  Nenhum feriado cadastrado.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                  {settings.holidays.map((h) => (
                    <div
                      key={h.date}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '12px',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.84rem', color: '#0f172a', display: 'block' }}>
                          📅 {formatDatePtBr(h.date)}
                        </strong>
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{h.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveHoliday(h.date)}
                        style={{
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          color: '#dc2626',
                          borderRadius: '8px',
                          width: '28px',
                          height: '28px',
                          display: 'grid',
                          placeItems: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 20px',
                  borderRadius: '999px',
                  background: '#15803d',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: savingSettings ? 'not-allowed' : 'pointer',
                }}
              >
                {savingSettings ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
                Salvar Feriados & Recessos
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════════
          MODAL: NOVO BLOQUEIO MANUAL DE HORÁRIO
      ══════════════════════════════════════════════════════════ */}
      {isNewBlockModalOpen && (
        <div
          onClick={() => !submittingBlock && setIsNewBlockModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '18px 20px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '12px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Lock size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                    Bloquear Horário Manualmente
                  </h3>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Indisponibiliza o horário na agenda
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewBlockModalOpen(false)}
                disabled={submittingBlock}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: '#64748b',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateBlock} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Presets Rápidos */}
              <div>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                  Atalhos Rápidos:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    { label: '🥗 Almoço', reason: 'Almoço', start: '12:00', end: '13:30', allDay: false },
                    { label: '☕ Pausa / Café', reason: 'Intervalo / Pausa', start: '15:30', end: '16:00', allDay: false },
                    { label: '🩺 Médico / Exame', reason: 'Consulta Médica', start: '09:00', end: '11:00', allDay: false },
                    { label: '🏖️ Folga / Férias', reason: 'Folga / Férias', start: '08:00', end: '19:00', allDay: true },
                    { label: '📚 Curso / Estudo', reason: 'Curso de Especialização', start: '14:00', end: '18:00', allDay: false },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setBlockForm({
                          ...blockForm,
                          reason: preset.reason,
                          startTime: preset.start,
                          endTime: preset.end,
                          allDay: preset.allDay,
                        })
                      }
                      style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: '#f1f5f9',
                        color: '#334155',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Data Inicial *
                  </label>
                  <input
                    type="date"
                    value={blockForm.startDate}
                    onChange={(e) => setBlockForm({ ...blockForm, startDate: e.target.value, endDate: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Data Final *
                  </label>
                  <input
                    type="date"
                    value={blockForm.endDate}
                    onChange={(e) => setBlockForm({ ...blockForm, endDate: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                    }}
                  />
                </div>
              </div>

              {/* Tipo: Horário Específico vs Dia Inteiro */}
              <div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={blockForm.allDay}
                    onChange={(e) => setBlockForm({ ...blockForm, allDay: e.target.checked })}
                  />
                  Bloquear o dia inteiro (sem horário específico)
                </label>
              </div>

              {!blockForm.allDay && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                      Horário Início *
                    </label>
                    <input
                      type="time"
                      value={blockForm.startTime}
                      onChange={(e) => setBlockForm({ ...blockForm, startTime: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                      Horário Fim *
                    </label>
                    <input
                      type="time"
                      value={blockForm.endTime}
                      onChange={(e) => setBlockForm({ ...blockForm, endTime: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Motivo */}
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Motivo do Bloqueio *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Almoço, Consulta Médica, Folga..."
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.84rem',
                  }}
                />
              </div>

              {/* Rodapé do Modal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => setIsNewBlockModalOpen(false)}
                  disabled={submittingBlock}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '999px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={submittingBlock}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 20px',
                    borderRadius: '999px',
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: submittingBlock ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                  }}
                >
                  {submittingBlock ? <LoaderCircle size={15} className="animate-spin" /> : <Lock size={15} />}
                  {submittingBlock ? 'Bloqueando...' : 'Confirmar Bloqueio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

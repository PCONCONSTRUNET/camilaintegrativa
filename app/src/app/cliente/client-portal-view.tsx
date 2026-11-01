'use client';

import { type CSSProperties, FormEvent, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Clock3,
  CreditCard,
  FileText,
  LogOut,
  MapPin,
  Menu,
  Monitor,
  Package,
  PlusCircle,
  Receipt,
  Save,
  ShieldCheck,
  Sparkles,
  User,
  UserCheck,
  Video,
  X,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  Download,
  Target,
  ChevronRight,
  CalendarPlus,
  MessageCircle,
  Info,
  QrCode,
  Copy,
  Check,
  Bell,
  BellRing,
  Share2,
  PlusSquare,
  Smartphone,
} from 'lucide-react';
import {
  getOneSignalPushStatus,
  requestOneSignalPushPermission,
} from '@/components/onesignal-init';
import type { AppointmentSummary } from '@/lib/domain';
import { formatCurrency, maskCpf, maskPhone } from '@/lib/utils';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { WhatsappIcon } from '@/components/whatsapp-icon';
import {
  generatePixCopiaECola,
  getPixQrCodeImageUrl,
  CLINIC_PIX_CONFIG,
  type ClinicPixConfig,
} from '@/lib/pix';

function getPortalMethodInfo(m: string) {
  const clean = (m || 'pix').toLowerCase();
  if (clean.includes('cartao') || clean.includes('cartão')) {
    return {
      label: 'Cartão',
      imgUrl: 'https://img.icons8.com/color/48/bank-card-back-side.png',
      alt: 'bank-card-back-side',
    };
  }
  if (clean.includes('dinheiro')) {
    return {
      label: 'Dinheiro',
      imgUrl: 'https://img.icons8.com/offices/30/money.png',
      alt: 'money',
    };
  }
  return {
    label: 'PIX',
    imgUrl: 'https://img.icons8.com/fluency/48/pix.png',
    alt: 'pix',
  };
}

function PortalMethodBadge({ method, size = 14 }: { method: string; size?: number }) {
  const info = getPortalMethodInfo(method);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: '#0f172a' }}>
      <img
        width={size}
        height={size}
        src={info.imgUrl}
        alt={info.alt}
        style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle' }}
      />
      <span>{info.label}</span>
    </span>
  );
}

function getAppointmentDurationMinutes(startAt: string, endAt: string) {
  try {
    const s = new Date(startAt).getTime();
    const e = new Date(endAt).getTime();
    if (isNaN(s) || isNaN(e) || e <= s) return 60;
    return Math.round((e - s) / (1000 * 60));
  } catch {
    return 60;
  }
}

function formatDurationLabel(minutes: number | null) {
  if (!minutes || minutes <= 0) return '60 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function formatFullDate(iso: string) {
  try {
    const d = new Date(iso);
    const dateFormatted = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(d);
    return dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
  } catch {
    return iso;
  }
}

function formatTimeOnly(iso: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function formatTimeRange(startIso: string, endIso: string) {
  try {
    const start = formatTimeOnly(startIso);
    const end = formatTimeOnly(endIso);
    if (!end || end === start) return start;
    return `${start} às ${end}`;
  } catch {
    return '';
  }
}

function getGoogleCalendarUrl(apt: AppointmentSummary) {
  try {
    const start = new Date(apt.startAt);
    const durMin = getAppointmentDurationMinutes(apt.startAt, apt.endAt) || 60;
    const end = apt.endAt ? new Date(apt.endAt) : new Date(start.getTime() + durMin * 60 * 1000);

    const toGCalIso = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    const title = `${apt.serviceName} - Camila Machado`;
    const location =
      apt.modality === 'online'
        ? 'Online / Videochamada'
        : 'Espaço Camila Machado, Urussanga - SC';
    const lines = [
      `Atendimento com Camila Machado (CRT-SBHP/SC 805)`,
      `Modalidade: ${apt.modality === 'online' ? 'Online (Videochamada)' : 'Presencial (Espaço Camila Machado, Urussanga - SC)'}`,
      `Situação: ${apt.status === 'confirmado' ? 'Confirmado' : 'Solicitado'}`,
      apt.sessionNumber ? `Sessão nº ${apt.sessionNumber}` : '',
      `WhatsApp da Clínica: (48) 99691-5303`,
    ].filter(Boolean);

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      title
    )}&dates=${toGCalIso(start)}/${toGCalIso(end)}&details=${encodeURIComponent(
      lines.join('\n')
    )}&location=${encodeURIComponent(location)}`;
  } catch {
    return '#';
  }
}

function getAppointmentWhatsAppUrl(apt: AppointmentSummary) {
  const fullDate = formatFullDate(apt.startAt);
  const time = formatTimeOnly(apt.startAt);
  const text = `Olá Camila! Gostaria de falar sobre o meu agendamento de *${apt.serviceName}* no dia *${fullDate}* às *${time}*.`;
  return `https://wa.me/5548996915303?text=${encodeURIComponent(text)}`;
}

function getPackageWhatsAppUrl(pkgName: string) {
  const text = `Olá Camila! Gostaria de tirar uma dúvida sobre o meu pacote *${pkgName}*.`;
  return `https://wa.me/5548996915303?text=${encodeURIComponent(text)}`;
}

export type AnamneseData = {
  fullName: string;
  cpf: string | null;
  rg: string | null;
  birthDate: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  consultationReason: string | null;
  hasHealthConditions: boolean;
  healthConditionsDetails: string | null;
  hasPsychCare: boolean;
  psychCareDetails: string | null;
  hasEpilepsyHistory?: boolean;
  consentAgreed: boolean;
  consentAgreedAt: string | null;
  isCompleted: boolean;
};

type ClientRecord = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
  cpf: string | null;
  rg?: string | null;
  birthDate: string | null;
  gender: string | null;
  occupation: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
};

type PaymentItem = {
  id: string;
  description: string;
  serviceName?: string | null;
  category?: string;
  chargeType?: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  amountCents: number;
  grossAmountCents?: number;
  discountCents?: number;
  paidAmountCents?: number;
  remainingAmountCents?: number;
  paymentMethod: string;
  status: string;
  isOverdue?: boolean;
  paidAt: string | null;
  dueAt: string | null;
  receiptUrl: string | null;
  notes: string | null;
  transactions?: Array<{
    id: string;
    amountCents: number;
    paymentMethod: string;
    paidAt: string;
    notes: string | null;
  }>;
  createdAt: string;
};

type PackageItem = {
  id: string;
  serviceId?: string | null;
  packageName: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions?: number;
  completedSessions?: number;
  scheduledSessions?: number;
  remainingToSchedule?: number;
  priceCents: number | null;
  status: string;
  createdAt: string;
  bookingMode?: 'sequencial' | 'livre';
  pendingSession?: { id: string; sessionNumber: number | null; startAt: string } | null;
};

export type PortalData = {
  client: ClientRecord;
  anamnese?: AnamneseData;
  appointments: AppointmentSummary[];
  documents: Array<{
    id: string;
    title: string;
    documentType: string;
    documentTypeLabel: string | null;
    status: string;
    fileName: string | null;
    createdAt: string;
  }>;
  payments: PaymentItem[];
  packages: PackageItem[];
  pixConfig?: ClinicPixConfig;
  goals?: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    progressPct: number;
    targetDate: string | null;
    achievedAt: string | null;
    createdAt: string;
  }>;
};

type PeriodId = 'todos' | 'futuros' | '30d' | '90d' | 'ano' | 'custom';
type SortId = 'recentes' | 'antigos';
type FilterOption = { value: string; label: string };

const PERIOD_LABELS: Record<PeriodId, string> = {
  todos: 'Todos',
  futuros: 'Próximos',
  '30d': '30 dias',
  '90d': '3 meses',
  ano: 'Este ano',
  custom: 'Personalizado',
};

function spDateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
}

function matchesPeriod(iso: string, period: PeriodId, from: string, to: string) {
  if (period === 'todos') return true;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return true;
  const now = new Date();
  const key = spDateKey(date);
  const todayKey = spDateKey(now);

  if (period === 'futuros') return key >= todayKey;
  if (period === '30d' || period === '90d') {
    const days = period === '30d' ? 30 : 90;
    const startKey = spDateKey(new Date(now.getTime() - days * 86_400_000));
    return key >= startKey && key <= todayKey;
  }
  if (period === 'ano') return key.slice(0, 4) === todayKey.slice(0, 4);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

const filterFieldStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  height: '34px',
  padding: '0 8px',
  fontSize: '0.78rem',
  color: '#1a3a4a',
  background: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontFamily: 'inherit',
};

const filterLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.66rem',
  fontWeight: 700,
  color: '#64748b',
  marginBottom: '2px',
  textTransform: 'uppercase',
};

function FilterBar(props: {
  periods: PeriodId[];
  period: PeriodId;
  onPeriod: (value: PeriodId) => void;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  statusOptions: FilterOption[];
  status: string;
  onStatus: (value: string) => void;
  sort: SortId;
  onSort: (value: SortId) => void;
  count: number;
  total: number;
  onClear: () => void;
}) {
  const active = props.period !== 'todos' || props.status !== 'todos' || props.sort !== 'recentes';

  return (
    <div
      style={{
        marginTop: '10px',
        padding: '10px 12px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Período em pílulas compactas que cabem na tela */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
        {props.periods.map((id) => {
          const selected = props.period === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => props.onPeriod(id)}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                border: selected ? '1px solid #1a3a4a' : '1px solid #cbd5e1',
                background: selected ? '#1a3a4a' : '#ffffff',
                color: selected ? '#ffffff' : '#475569',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {PERIOD_LABELS[id]}
            </button>
          );
        })}
      </div>

      {/* Datas personalizadas */}
      {props.period === 'custom' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <label>
            <span style={filterLabelStyle}>De</span>
            <input
              type="date"
              value={props.from}
              max={props.to || undefined}
              onChange={(e) => props.onFrom(e.target.value)}
              style={filterFieldStyle}
            />
          </label>
          <label>
            <span style={filterLabelStyle}>Até</span>
            <input
              type="date"
              value={props.to}
              min={props.from || undefined}
              onChange={(e) => props.onTo(e.target.value)}
              style={filterFieldStyle}
            />
          </label>
        </div>
      )}

      {/* Status, ordenação e contador compactos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <label>
          <span style={filterLabelStyle}>Situação</span>
          <select value={props.status} onChange={(e) => props.onStatus(e.target.value)} style={filterFieldStyle}>
            {props.statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={filterLabelStyle}>Ordenar</span>
          <select value={props.sort} onChange={(e) => props.onSort(e.target.value as SortId)} style={filterFieldStyle}>
            <option value="recentes">Mais recentes</option>
            <option value="antigos">Mais antigos</option>
          </select>
        </label>
      </div>

      {active && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748b' }}>
          <span>
            {props.count} de {props.total} {props.total === 1 ? 'registro' : 'registros'}
          </span>
          <button
            type="button"
            onClick={props.onClear}
            style={{
              background: 'none',
              border: 'none',
              color: '#b8892a',
              fontWeight: 700,
              fontSize: '0.72rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}

function NoFilterResults({ onClear }: { onClear: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: '#5a7a8a' }}>
      <p style={{ margin: '0 0 10px', fontSize: '0.9rem' }}>Nenhum resultado para os filtros escolhidos.</p>
      <button
        type="button"
        onClick={onClear}
        style={{
          background: '#1a3a4a',
          color: '#fff',
          border: 'none',
          borderRadius: '50px',
          padding: '9px 18px',
          fontSize: '0.82rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Limpar filtros
      </button>
    </div>
  );
}

export default function ClientPortalView({ initialData }: { initialData: PortalData }) {
  const router = useRouter();
  const [data, setData] = useState<PortalData>(initialData);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Active Tab (com persistência em URL ?tab= e localStorage ao dar F5)
  const [activeTab, setActiveTabState] = useState<'inicio' | 'anamnese' | 'objetivos' | 'agendamentos' | 'pagamentos' | 'perfil'>('inicio');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const validTabs = ['inicio', 'anamnese', 'objetivos', 'agendamentos', 'pagamentos', 'perfil'] as const;
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    const savedTab = window.localStorage.getItem('clinica_client_portal_tab');
    const chosen = [urlTab, savedTab].find((t): t is typeof validTabs[number] =>
      Boolean(t && (validTabs as readonly string[]).includes(t))
    );
    if (chosen) {
      setActiveTabState(chosen);
    }
  }, []);

  function setActiveTab(tab: 'inicio' | 'anamnese' | 'objetivos' | 'agendamentos' | 'pagamentos' | 'perfil') {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('clinica_client_portal_tab', tab);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    }
  }

  // Sidebar Drawer Mobile
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Anamnese Digital Form State (8 campos simplificados)
  const [anamneseFullName, setAnamneseFullName] = useState(
    initialData.anamnese?.fullName || initialData.client.name || ''
  );
  const [anamneseCpf, setAnamneseCpf] = useState(
    initialData.anamnese?.cpf || initialData.client.cpf || ''
  );
  const [anamneseRg, setAnamneseRg] = useState(
    initialData.anamnese?.rg || initialData.client.rg || ''
  );
  const [anamneseBirthDate, setAnamneseBirthDate] = useState(
    initialData.anamnese?.birthDate || initialData.client.birthDate || ''
  );
  const [anamneseEmergName, setAnamneseEmergName] = useState(
    initialData.anamnese?.emergencyContactName || initialData.client.emergencyContactName || ''
  );
  const [anamneseEmergPhone, setAnamneseEmergPhone] = useState(
    initialData.anamnese?.emergencyContactPhone || initialData.client.emergencyContactPhone || ''
  );
  const [anamneseEmergRel, setAnamneseEmergRel] = useState(
    initialData.anamnese?.emergencyContactRelationship || initialData.client.emergencyContactRelationship || ''
  );
  const [anamneseReason, setAnamneseReason] = useState(
    initialData.anamnese?.consultationReason || ''
  );
  const [anamneseHasHealth, setAnamneseHasHealth] = useState(
    Boolean(initialData.anamnese?.hasHealthConditions)
  );
  const [anamneseHealthDetails, setAnamneseHealthDetails] = useState(
    initialData.anamnese?.healthConditionsDetails || ''
  );
  const [anamneseHasPsych, setAnamneseHasPsych] = useState(
    Boolean(initialData.anamnese?.hasPsychCare)
  );
  const [anamnesePsychDetails, setAnamnesePsychDetails] = useState(
    initialData.anamnese?.psychCareDetails || ''
  );
  const [anamneseEpilepsy, setAnamneseEpilepsy] = useState(
    Boolean(initialData.anamnese?.hasEpilepsyHistory)
  );
  const [anamneseConsent, setAnamneseConsent] = useState(
    Boolean(initialData.anamnese?.consentAgreed)
  );

  const [savingAnamnese, setSavingAnamnese] = useState(false);
  const [anamneseSuccessMsg, setAnamneseSuccessMsg] = useState('');
  const [anamneseErrorMsg, setAnamneseErrorMsg] = useState('');

  // Edit Profile Form State
  const [profileName, setProfileName] = useState(initialData.client.name || '');
  const [profileEmail, setProfileEmail] = useState(initialData.client.email || '');
  const [profileCpf, setProfileCpf] = useState(initialData.client.cpf || '');
  const [profileBirthDate, setProfileBirthDate] = useState(initialData.client.birthDate || '');
  const [profileGender, setProfileGender] = useState(initialData.client.gender || '');
  const [profileOccupation, setProfileOccupation] = useState(initialData.client.occupation || '');
  const [profileEmergName, setProfileEmergName] = useState(initialData.client.emergencyContactName || '');
  const [profileEmergPhone, setProfileEmergPhone] = useState(initialData.client.emergencyContactPhone || '');
  const [profileEmergRel, setProfileEmergRel] = useState(initialData.client.emergencyContactRelationship || '');

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  // OneSignal Push Notification State (PWA & Web)
  const [pushStatus, setPushStatus] = useState<{
    supported: boolean;
    permission: boolean;
  }>({ supported: false, permission: false });
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSuccessMsg, setPushSuccessMsg] = useState<string | null>(null);
  const [pushErrorMsg, setPushErrorMsg] = useState<string | null>(null);
  const [showPushModal, setShowPushModal] = useState(false);
  const [showIosPwaModal, setShowIosPwaModal] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('clinica_pwa_portal', 'cliente');
    } catch {}
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem('clinica_client_push_dismissed') === 'true';
    } catch {}

    void getOneSignalPushStatus().then((status) => {
      setPushStatus(status);
      if (!status.permission && !dismissed) {
        const timer = setTimeout(() => {
          setShowPushModal(true);
        }, 1400);
        return () => clearTimeout(timer);
      }
    });
  }, []);

  async function checkClientPushStatus() {
    try {
      const status = await getOneSignalPushStatus();
      setPushStatus(status);
      return status.permission;
    } catch {
      return false;
    }
  }

  async function handleEnablePush() {
    setPushLoading(true);
    setPushSuccessMsg(null);
    setPushErrorMsg(null);
    try {
      const res = await requestOneSignalPushPermission({
        role: 'client',
        userId: data.client.id,
        name: data.client.name,
      });

      if (res.needsIosPwa) {
        setShowPushModal(false);
        setShowIosPwaModal(true);
        setPushLoading(false);
        return;
      }

      if (res.denied) {
        setPushErrorMsg('As notificações estão bloqueadas nas configurações do seu navegador ou celular. Permita o envio nas configurações do site.');
        setPushLoading(false);
        return;
      }

      if (res.granted) {
        setPushStatus({ supported: true, permission: true });
        setShowPushModal(false);
        setPushSuccessMsg('✓ Notificações Push ativadas com sucesso neste aparelho!');
        try {
          window.localStorage.setItem('clinica_client_push_granted', 'true');
        } catch {}
        try {
          await fetch('/api/client/push-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
        } catch {}
      } else {
        setPushErrorMsg('A permissão para notificações não foi autorizada.');
      }
    } catch (err) {
      console.error('Erro ao ativar push no cliente:', err);
      setPushErrorMsg('Ocorreu um erro ao tentar ativar notificações.');
    } finally {
      setPushLoading(false);
    }
  }

  function handleDismissPushModal() {
    setShowPushModal(false);
    try {
      window.localStorage.setItem('clinica_client_push_dismissed', 'true');
    } catch {}
  }

  async function handleLogout() {
    await fetch('/api/client/auth/logout', { method: 'POST' });
    router.replace('/cliente/entrar');
    router.refresh();
  }

  async function handleSaveAnamnese(e: FormEvent) {
    e.preventDefault();
    setSavingAnamnese(true);
    setAnamneseErrorMsg('');
    setAnamneseSuccessMsg('');

    if (!anamneseConsent) {
      setAnamneseErrorMsg('É necessário assinalar o consentimento informado para continuar.');
      setSavingAnamnese(false);
      return;
    }

    try {
      const res = await fetch('/api/client/anamnese', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: anamneseFullName,
          cpf: anamneseCpf,
          rg: anamneseRg,
          birthDate: anamneseBirthDate,
          emergencyContactName: anamneseEmergName || null,
          emergencyContactPhone: anamneseEmergPhone || null,
          emergencyContactRelationship: anamneseEmergRel || null,
          consultationReason: anamneseReason,
          hasHealthConditions: anamneseHasHealth,
          healthConditionsDetails: anamneseHasHealth ? anamneseHealthDetails : null,
          hasPsychCare: anamneseHasPsych,
          psychCareDetails: anamneseHasPsych ? anamnesePsychDetails : null,
          epilepsyHistory: anamneseEpilepsy,
          consentAgreed: anamneseConsent,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Erro ao salvar a ficha de anamnese.');
      }

      setAnamneseSuccessMsg('Ficha de Anamnese salva e assinada com sucesso! Fechando...');
      router.refresh();
      setTimeout(() => {
        setAnamneseSuccessMsg('');
        setActiveTab('inicio');
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 1200);
      setData((prev) => ({
        ...prev,
        client: {
          ...prev.client,
          name: anamneseFullName,
          cpf: anamneseCpf,
          rg: anamneseRg,
          birthDate: anamneseBirthDate,
          emergencyContactName: anamneseEmergName || prev.client.emergencyContactName,
          emergencyContactPhone: anamneseEmergPhone || prev.client.emergencyContactPhone,
          emergencyContactRelationship: anamneseEmergRel || prev.client.emergencyContactRelationship,
        },
        anamnese: {
          fullName: anamneseFullName,
          cpf: anamneseCpf,
          rg: anamneseRg,
          birthDate: anamneseBirthDate,
          emergencyContactName: anamneseEmergName || null,
          emergencyContactPhone: anamneseEmergPhone || null,
          emergencyContactRelationship: anamneseEmergRel || null,
          consultationReason: anamneseReason,
          hasHealthConditions: anamneseHasHealth,
          healthConditionsDetails: anamneseHasHealth ? anamneseHealthDetails : null,
          hasPsychCare: anamneseHasPsych,
          psychCareDetails: anamneseHasPsych ? anamnesePsychDetails : null,
          hasEpilepsyHistory: anamneseEpilepsy,
          consentAgreed: true,
          consentAgreedAt: new Date().toISOString(),
          isCompleted: true,
        },
      }));
    } catch (err: unknown) {
      setAnamneseErrorMsg(err instanceof Error ? err.message : 'Falha ao salvar a anamnese.');
    } finally {
      setSavingAnamnese(false);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccessMsg('');
    setProfileErrorMsg('');

    try {
      const res = await fetch('/api/client/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName,
          email: profileEmail,
          cpf: profileCpf,
          birthDate: profileBirthDate,
          gender: profileGender,
          occupation: profileOccupation,
          emergencyContactName: profileEmergName,
          emergencyContactPhone: profileEmergPhone,
          emergencyContactRelationship: profileEmergRel,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || 'Erro ao salvar perfil.');

      setProfileSuccessMsg('Dados atualizados com sucesso!');
      router.refresh();
      setData({
        ...data,
        client: {
          ...data.client,
          name: profileName,
          email: profileEmail || null,
          cpf: profileCpf || null,
          birthDate: profileBirthDate || null,
          gender: profileGender || null,
          occupation: profileOccupation || null,
          emergencyContactName: profileEmergName || null,
          emergencyContactPhone: profileEmergPhone || null,
          emergencyContactRelationship: profileEmergRel || null,
        },
      });
    } catch (err: unknown) {
      setProfileErrorMsg(err instanceof Error ? err.message : 'Erro ao atualizar dados.');
    } finally {
      setSavingProfile(false);
    }
  }

  const upcomingAppointments = (data.appointments || []).filter(
    (a) => a.status === 'confirmado' || a.status === 'solicitado' || a.status === 'em_atendimento'
  );
  const nextAppointment = upcomingAppointments[0];

  // ===== Filtros: Agendamentos =====
  const [aptPeriod, setAptPeriod] = useState<PeriodId>('todos');
  const [aptFrom, setAptFrom] = useState('');
  const [aptTo, setAptTo] = useState('');
  const [aptStatus, setAptStatus] = useState('todos');
  const [aptSort, setAptSort] = useState<SortId>('recentes');

  const filteredAppointments = (data.appointments || [])
    .filter((a) => matchesPeriod(a.startAt, aptPeriod, aptFrom, aptTo))
    .filter((a) => aptStatus === 'todos' || a.status === aptStatus)
    .sort((a, b) =>
      aptSort === 'recentes'
        ? new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
        : new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );

  function clearAppointmentFilters() {
    setAptPeriod('todos');
    setAptFrom('');
    setAptTo('');
    setAptStatus('todos');
    setAptSort('recentes');
  }

  // ===== Filtros: Pagamentos =====
  const [payPeriod, setPayPeriod] = useState<PeriodId>('todos');
  const [payFrom, setPayFrom] = useState('');
  const [payTo, setPayTo] = useState('');
  const [payStatus, setPayStatus] = useState('todos');
  const [paySort, setPaySort] = useState<SortId>('recentes');
  const [portalReceiptModal, setPortalReceiptModal] = useState<PaymentItem | null>(null);
  const [portalPixModal, setPortalPixModal] = useState<PaymentItem | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixKeyCopied, setPixKeyCopied] = useState(false);
  const [selectedAptModal, setSelectedAptModal] = useState<AppointmentSummary | null>(null);
  const [selectedPkgModal, setSelectedPkgModal] = useState<PackageItem | null>(null);
  const [portalPayMethod, setPortalPayMethod] = useState<'pix' | 'cartao_credito'>('pix');
  const [portalPayLoading, setPortalPayLoading] = useState(false);
  const [portalActionNotice, setPortalActionNotice] = useState<string | null>(null);
  const [cancelingAptId, setCancelingAptId] = useState<string | null>(null);
  const { confirmDialog, alertDialog, dialogNode } = useConfirmDialog();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedAptModal(null);
        setSelectedPkgModal(null);
        setPortalPixModal(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function handleClientCancelAppointment(aptId: string, serviceName: string) {
    const { confirmed, reason } = await confirmDialog({
      title: 'Cancelar agendamento',
      description: 'Tem certeza que deseja cancelar este atendimento? O horário será liberado na agenda da clínica.',
      highlightText: serviceName,
      confirmLabel: 'Sim, cancelar',
      cancelLabel: 'Manter horário',
      variant: 'danger',
      showReasonInput: true,
      reasonLabel: 'Motivo do cancelamento (opcional)',
      reasonPlaceholder: 'Ex.: imprevisto no trabalho, gostaria de remarcar...',
    });
    if (!confirmed) return;

    setCancelingAptId(aptId);
    setPortalActionNotice(null);
    try {
      const res = await fetch(`/api/client/appointments/${aptId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason || 'Cancelado pelo cliente na Área do Cliente',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao cancelar agendamento.');

      setData((prev) => ({
        ...prev,
        appointments: (prev.appointments || []).map((a) =>
          a.id === aptId ? { ...a, status: 'cancelado' } : a
        ),
      }));
      setSelectedAptModal((prev) => (prev && prev.id === aptId ? { ...prev, status: 'cancelado' } : prev));
      setPortalActionNotice('Agendamento cancelado com sucesso. Enviamos a confirmação para o seu WhatsApp.');
      router.refresh();
    } catch (err) {
      await alertDialog({
        title: 'Não foi possível cancelar',
        description: err instanceof Error ? err.message : 'Erro ao cancelar agendamento.',
        variant: 'error',
      });
    } finally {
      setCancelingAptId(null);
    }
  }

  async function handleClientPayInvoice(pay: PaymentItem, customNotes?: string) {
    const remCents =
      pay.remainingAmountCents ??
      (pay.status === 'pendente' || pay.status === 'parcial'
        ? Math.max(0, pay.amountCents - (pay.paidAmountCents ?? 0))
        : 0);
    if (remCents <= 0) return;

    setPortalPayLoading(true);
    setPortalActionNotice(null);
    try {
      const res = await fetch(`/api/client/payments/${pay.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: remCents,
          paymentMethod: 'pix',
          notes: customNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao processar pagamento.');

      const nowIso = new Date().toISOString();
      const updatedPay: PaymentItem = {
        ...pay,
        paidAmountCents: json.paidAmountCents ?? pay.amountCents,
        remainingAmountCents: json.remainingAmountCents ?? 0,
        status: json.status ?? 'pago',
        paymentMethod: 'pix',
        paidAt: nowIso,
        transactions: [
          ...(pay.transactions || []),
          {
            id: json.transactionId || String(Date.now()),
            amountCents: remCents,
            paymentMethod: 'pix',
            paidAt: nowIso,
            notes: customNotes || 'Pagamento realizado na Área do Cliente',
          },
        ],
      };

      setData((prev) => ({
        ...prev,
        payments: (prev.payments || []).map((item) => (item.id === pay.id ? updatedPay : item)),
      }));
      setPortalPixModal(null);
      setPortalReceiptModal(updatedPay);
      setPortalActionNotice(
        `✅ Pagamento de ${formatCurrency(remCents)} identificado com sucesso! O comprovante foi enviado automaticamente para o seu WhatsApp.`
      );
      router.refresh();
    } catch (err) {
      await alertDialog({
        title: 'Erro no pagamento',
        description: err instanceof Error ? err.message : 'Erro ao confirmar pagamento.',
        variant: 'error',
      });
    } finally {
      setPortalPayLoading(false);
    }
  }

  async function handleSendComprovanteWhatsappAndConfirm(pay: PaymentItem) {
    const remCents =
      pay.remainingAmountCents ??
      (pay.status === 'pendente' || pay.status === 'parcial'
        ? Math.max(0, pay.amountCents - (pay.paidAmountCents ?? 0))
        : 0);
    const formattedVal = formatCurrency(remCents);
    const clientName = data.client?.name || 'Cliente';
    const desc = pay.description || 'Atendimento Clínico';

    const waText =
      `Olá, Camila! Acabei de realizar o pagamento da fatura:\n\n` +
      `👤 *Cliente:* ${clientName}\n` +
      `🧾 *Atendimento:* ${desc}\n` +
      `💰 *Valor Pago:* ${formattedVal}\n` +
      `💠 *Forma:* PIX\n\n` +
      `Segue o comprovante do pagamento em anexo. 📄✨`;

    const waUrl = `https://wa.me/${CLINIC_PIX_CONFIG.whatsappNumber}?text=${encodeURIComponent(waText)}`;

    // Abre o WhatsApp imediatamente em nova aba
    window.open(waUrl, '_blank');

    // Registra a baixa e dispara o lembrete de identificação oficial no sistema
    await handleClientPayInvoice(pay, 'Comprovante PIX enviado pelo cliente via WhatsApp');
  }

  const allPayments = data.payments || [];

  const openPayments = allPayments.filter((p) => {
    if (p.status === 'cancelado') return false;
    const rem = p.remainingAmountCents ?? (p.status === 'pendente' || p.status === 'parcial' ? p.amountCents : 0);
    return rem > 0 || p.status === 'pendente' || p.status === 'parcial';
  });

  const filteredPayments = allPayments
    .filter((p) => matchesPeriod(p.paidAt || p.dueAt || p.createdAt, payPeriod, payFrom, payTo))
    .filter((p) => {
      if (payStatus === 'todos') return true;
      if (payStatus === 'em_aberto') {
        const rem = p.remainingAmountCents ?? (p.status === 'pendente' || p.status === 'parcial' ? p.amountCents : 0);
        return (rem > 0 || p.status === 'pendente' || p.status === 'parcial') && p.status !== 'cancelado';
      }
      return p.status === payStatus;
    })
    .sort((a, b) => {
      const da = new Date(a.paidAt || a.dueAt || a.createdAt).getTime();
      const db = new Date(b.paidAt || b.dueAt || b.createdAt).getTime();
      return paySort === 'recentes' ? db - da : da - db;
    });

  const paidTotalCents = filteredPayments.reduce((sum, p) => {
    if (p.status === 'cancelado') return sum;
    const paid = p.paidAmountCents ?? (p.status === 'pago' ? p.amountCents : 0);
    return sum + paid;
  }, 0);

  const openTotalCents = filteredPayments.reduce((sum, p) => {
    if (p.status === 'cancelado') return sum;
    const rem = p.remainingAmountCents ?? (p.status === 'pendente' || p.status === 'parcial' ? p.amountCents : 0);
    return sum + rem;
  }, 0);

  const totalDiscountCents = filteredPayments.reduce((sum, p) => {
    if (p.status === 'cancelado') return sum;
    return sum + (p.discountCents ?? 0);
  }, 0);

  function clearPaymentFilters() {
    setPayPeriod('todos');
    setPayFrom('');
    setPayTo('');
    setPayStatus('todos');
    setPaySort('recentes');
  }

  const navItems: Array<{
    id: 'inicio' | 'anamnese' | 'objetivos' | 'agendamentos' | 'pagamentos' | 'perfil';
    label: string;
    icon: typeof Sparkles;
    badge?: string | number;
  }> = [
    { id: 'inicio', label: 'Visão Geral', icon: Sparkles },
    {
      id: 'anamnese',
      label: 'Ficha de Anamnese',
      icon: ClipboardList,
      badge: data.anamnese?.isCompleted ? undefined : 'Pendente',
    },
    { id: 'objetivos', label: 'Meus Objetivos', icon: Target, badge: data.goals?.length || undefined },
    { id: 'agendamentos', label: 'Meus Agendamentos', icon: CalendarDays, badge: data.appointments.length },
    {
      id: 'pagamentos',
      label: 'Pagamentos & Recibos',
      icon: CreditCard,
      badge: openPayments.length > 0 ? `${openPayments.length} aberto(s)` : (data.payments?.length ?? 0),
    },
    { id: 'perfil', label: 'Meu Perfil', icon: User },
  ];

  return (
    <div className="client-portal-wrapper" style={{ paddingBottom: '90px' }}>
      
      {/* ================= BARRA LATERAL ESQUERDA (SIDEBAR DRAWER) ================= */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 100,
            display: 'flex',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '280px',
              maxWidth: '85vw',
              background: '#ffffff',
              height: '100%',
              boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '24px 18px',
              animation: 'slideInLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div>
              {/* Topo Sidebar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <Image
                  src="/logo-camila-machado.png"
                  alt="Camila Machado"
                  width={140}
                  height={45}
                  priority
                  style={{ height: 'auto', maxWidth: '130px' }}
                />
                <button
                  onClick={() => setSidebarOpen(false)}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Info Cliente */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 14px', marginBottom: '20px' }}>
                <strong style={{ fontSize: '0.92rem', color: '#0f172a', display: 'block' }}>
                  {data.client.name}
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  {data.client.phone}
                </span>
              </div>

              {/* Links de Navegação */}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {navItems.map(({ id, label, icon: Icon, badge }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setActiveTab(id);
                        setSidebarOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: 'none',
                        background: active ? '#f4ede2' : 'transparent',
                        color: active ? '#1a3a4a' : '#5a6a7a',
                        fontWeight: active ? 700 : 500,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <Icon size={18} color={active ? '#b8892a' : '#7a8a99'} />
                      <span>{label}</span>
                      {badge ? (
                        <span
                          style={{
                            marginLeft: 'auto',
                            background: active ? '#ffffff' : '#f4ede2',
                            color: '#8a6a1f',
                            padding: '2px 9px',
                            borderRadius: '10px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                          }}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>

              <hr style={{ border: 'none', borderTop: '1px solid #eee5d8', margin: '18px 0' }} />

              {/* Ação principal */}
              <Link
                href="/agendar?from=cliente"
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: '#1a3a4a',
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <PlusCircle size={16} /> Agendar Nova Sessão
              </Link>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid #fee2e2',
                background: '#fef2f2',
                color: '#dc2626',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <LogOut size={16} /> Sair da Conta
            </button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="client-portal-header">
        <div className="client-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Botão Menu Hambúrguer (Abre Barra Lateral) */}
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                width: '38px',
                height: '38px',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: '#245d80',
              }}
              aria-label="Abrir menu lateral"
            >
              <Menu size={20} />
            </button>

            <Link href="/" className="client-brand">
              <Image
                src="/logo-camila-machado.png"
                alt="Camila Machado"
                width={150}
                height={48}
                priority
              />
            </Link>
          </div>

          <div className="client-user-badge">
            <div className="client-avatar">
              <UserCheck size={18} />
            </div>
            <div className="client-user-info desktop-only">
              <strong>{data.client.name.split(' ')[0]}</strong>
              <span>{data.client.phone}</span>
            </div>
            <button
              onClick={handleLogout}
              className="btn btn-ghost btn-sm client-logout-btn"
              title="Sair da conta"
            >
              <LogOut size={16} />
              <span className="desktop-only">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="client-portal-main">
        {portalActionNotice && (
          <div
            style={{
              background: '#ecfdf5',
              border: '1.5px solid #6ee7b7',
              color: '#065f46',
              borderRadius: '14px',
              padding: '12px 16px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '0.86rem',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)',
            }}
          >
            <span>{portalActionNotice}</span>
            <button
              type="button"
              onClick={() => setPortalActionNotice(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#065f46',
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ================= ABA 1: VISÃO GERAL ================= */}
        {activeTab === 'inicio' && (
          <>
            {/* Cartão de Boas-vindas — design acolhedor, humano */}
            <section
              style={{
                background: 'linear-gradient(135deg, #fdf8f0 0%, #fef9f4 60%, #f0f7fb 100%)',
                border: '1px solid #eedfc5',
                borderRadius: '20px',
                padding: '26px 24px 22px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Ornamento circular decorativo — canto direito */}
              <div style={{
                position: 'absolute',
                top: '-40px',
                right: '-40px',
                width: '160px',
                height: '160px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(212,168,67,0.12) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute',
                bottom: '-30px',
                right: '60px',
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(36,93,128,0.07) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />

              {/* Texto principal */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#b8892a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: '4px',
                }}>
                  Bem-vinda(o) ao seu espaço
                </p>
                <h1 style={{
                  fontSize: '1.6rem',
                  fontWeight: 800,
                  color: '#1a3a4a',
                  letterSpacing: '-0.03em',
                  margin: '0 0 8px 0',
                  lineHeight: 1.2,
                }}>
                  Olá, {data.client.name.split(' ')[0]} 👋
                </h1>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#5a7a8a',
                  lineHeight: 1.6,
                  maxWidth: '480px',
                  margin: '0 0 20px 0',
                }}>
                  É muito bom ter você aqui. Acompanhe seus horários, sessões e tudo que precisar com calma.
                </p>

                {/* Botões de ação */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <Link
                    href="/agendar?from=cliente"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      background: '#1a3a4a',
                      color: '#ffffff',
                      padding: '11px 20px',
                      borderRadius: '50px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      boxShadow: '0 4px 14px rgba(26,58,74,0.25)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <PlusCircle size={15} />
                    Agendar Sessão
                  </Link>

                  <a
                    href="https://wa.me/5548996915303?text=Ol%C3%A1%2C%20Camila!%20Sou%20cliente%20e%20gostaria%20de%20tirar%20uma%20d%C3%BAvida."
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      background: '#ffffff',
                      color: '#1a3a4a',
                      border: '1.5px solid #d4b896',
                      padding: '10px 18px',
                      borderRadius: '50px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <WhatsappIcon size={16} />
                    Falar no WhatsApp
                  </a>
                </div>
              </div>
            </section>

            {/* Notificação de Sucesso Push */}
            {pushSuccessMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#ecfdf5',
                  color: '#065f46',
                  padding: '12px 18px',
                  borderRadius: '14px',
                  fontSize: '0.88rem',
                  border: '1.5px solid #a7f3d0',
                  boxShadow: '0 2px 8px rgba(6,95,70,0.06)',
                }}
              >
                <CheckCircle2 size={18} color="#059669" />
                <span>{pushSuccessMsg}</span>
              </div>
            )}

            {/* Status da Ficha de Anamnese Digital (some quando já preenchida; fica na aba "Ficha de Anamnese" do menu) */}
            {!data.anamnese?.isCompleted && (
            <section
              style={{
                background: data.anamnese?.isCompleted
                  ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)'
                  : 'linear-gradient(135deg, #fffbeb 0%, #fef8ee 100%)',
                border: data.anamnese?.isCompleted
                  ? '1.5px solid #86efac'
                  : '1.5px solid #e0c89c',
                borderRadius: '18px',
                padding: '20px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', maxWidth: '520px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: data.anamnese?.isCompleted ? '#dcfce7' : '#fef3c7',
                    color: data.anamnese?.isCompleted ? '#16a34a' : '#b45309',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {data.anamnese?.isCompleted ? <CheckCircle2 size={22} /> : <ClipboardList size={22} />}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                      Ficha de Anamnese Digital – Hipnose Clínica
                    </h3>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '20px',
                        background: data.anamnese?.isCompleted ? '#bbf7d0' : '#fde68a',
                        color: data.anamnese?.isCompleted ? '#15803d' : '#92400e',
                      }}
                    >
                      {data.anamnese?.isCompleted ? 'Preenchida & Assinada' : 'Pendente'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                    {data.anamnese?.isCompleted
                      ? 'Sua ficha clínica e consentimento informado estão registrados. Você pode revisar ou atualizar as informações sempre que necessário.'
                      : 'Por gentileza, complete sua ficha rápida de acolhimento (apenas 8 itens) antes da sua sessão para um atendimento seguro e individualizado.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('anamnese')}
                style={{
                  background: data.anamnese?.isCompleted ? '#ffffff' : '#1a3a4a',
                  color: data.anamnese?.isCompleted ? '#1a3a4a' : '#ffffff',
                  border: data.anamnese?.isCompleted ? '1.5px solid #cbd5e1' : 'none',
                  padding: '10px 20px',
                  borderRadius: '50px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  boxShadow: data.anamnese?.isCompleted ? 'none' : '0 4px 12px rgba(26,58,74,0.25)',
                  whiteSpace: 'nowrap',
                }}
              >
                <ClipboardList size={15} />
                Preencher Ficha Agora
              </button>
            </section>
            )}

            {/* Next Appointment Spotlight */}
            {nextAppointment ? (
              <section
                className="client-next-spotlight"
                onClick={() => setSelectedAptModal(nextAppointment)}
                style={{ cursor: 'pointer' }}
                title="Clique para ver os detalhes completos deste agendamento"
              >
                <div className="next-spotlight-badge">
                  <CalendarDays size={18} />
                  <span>Próximo Atendimento</span>
                </div>
                <div className="next-spotlight-content">
                  <div>
                    <h2>{nextAppointment.serviceName}</h2>
                    <div className="next-meta-row">
                      <span className="next-meta-item">
                        <CalendarDays size={15} />
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'full',
                          timeZone: 'America/Sao_Paulo',
                        }).format(new Date(nextAppointment.startAt))}
                      </span>
                      <span className="next-meta-item">
                        <Clock3 size={15} />
                        {new Intl.DateTimeFormat('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'America/Sao_Paulo',
                        }).format(new Date(nextAppointment.startAt))}
                      </span>
                      <span className="next-meta-item modality-pill">
                        {nextAppointment.modality === 'online' ? (
                          <>
                            <Monitor size={15} /> Online
                          </>
                        ) : (
                          <>
                            <MapPin size={15} /> Presencial (Urussanga - SC)
                          </>
                        )}
                      </span>
                      <span className={`status-pill status-${nextAppointment.status}`}>
                        {nextAppointment.status === 'confirmado' ? 'Confirmado' : 'Aguardando Confirmação'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAptModal(nextAppointment);
                        }}
                        style={{
                          background: 'rgba(255, 255, 255, 0.22)',
                          color: '#ffffff',
                          border: '1px solid rgba(255, 255, 255, 0.45)',
                          borderRadius: '999px',
                          padding: '4px 12px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        Ver detalhes <ChevronRight size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={cancelingAptId === nextAppointment.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClientCancelAppointment(nextAppointment.id, nextAppointment.serviceName);
                        }}
                        style={{
                          background: 'rgba(254, 226, 226, 0.18)',
                          color: '#fecaca',
                          border: '1px solid rgba(252, 165, 165, 0.45)',
                          borderRadius: '999px',
                          padding: '4px 12px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {cancelingAptId === nextAppointment.id ? 'Cancelando...' : 'Cancelar sessão'}
                      </button>
                    </div>
                  </div>

                  {nextAppointment.modality === 'online' && (
                    <div className="next-online-card">
                      <Video size={20} />
                      <div>
                        <strong>Sala de Teleatendimento</strong>
                        <p>O link seguro será disponibilizado 15 minutos antes da sessão.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section
                style={{
                  background: '#ffffff',
                  border: '1px solid #e8ddd0',
                  borderRadius: '18px',
                  padding: '32px 24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: '#fdf4e7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '4px',
                }}>
                  <CalendarDays size={26} color="#c49a3a" />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a3a4a', margin: 0 }}>
                  Nenhuma sessão agendada
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#7a8f9a', maxWidth: '280px', lineHeight: 1.5, margin: 0 }}>
                  Quando quiser marcar um horário, é só clicar abaixo.
                </p>
                <Link
                  href="/agendar?from=cliente"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    marginTop: '6px',
                    background: '#1a3a4a',
                    color: '#fff',
                    padding: '10px 22px',
                    borderRadius: '50px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <PlusCircle size={15} /> Agendar agora
                </Link>
              </section>
            )}

            {/* Quick Status Cards (Pacotes & Resumos) — Compacto */}
            {(data.packages || []).length > 0 && (
              <section className="client-card-block" style={{ padding: '14px 16px' }}>
                <div className="client-block-header" style={{ marginBottom: '10px', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Package size={16} className="text-primary" />
                    <h3 style={{ fontSize: '0.95rem', margin: 0 }}>Meus Pacotes de Sessões</h3>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                  {data.packages.map((pkg) => {
                    const remainingToSchedule = pkg.remainingToSchedule ?? Math.max(0, pkg.totalSessions - pkg.usedSessions);
                    const isSequential = pkg.bookingMode === 'sequencial';
                    return (
                      <div
                        key={pkg.id}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '11px 13px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>
                              {pkg.packageName}
                            </strong>
                            {pkg.totalSessions > 1 && (
                              <span
                                style={{
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  padding: '1px 7px',
                                  borderRadius: '999px',
                                  background: isSequential ? '#fefce8' : '#eff6ff',
                                  border: isSequential ? '1px solid #fde047' : '1px solid #bfdbfe',
                                  color: isSequential ? '#854d0e' : '#1d4ed8',
                                }}
                              >
                                {isSequential ? '🔒 1 por vez' : '🔓 Livre'}
                              </span>
                            )}
                          </div>
                          <strong style={{ fontSize: '0.82rem', color: remainingToSchedule > 0 ? '#b8892a' : '#16a34a', fontWeight: 800 }}>
                            {remainingToSchedule}/{pkg.totalSessions} disp.
                          </strong>
                        </div>

                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', fontSize: '0.68rem' }}>
                          <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '1px 6px', fontWeight: 600 }}>
                            ✓ {pkg.completedSessions ?? 0} realizada(s)
                          </span>
                          <span style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 6px', fontWeight: 600 }}>
                            ⏳ {pkg.scheduledSessions ?? (pkg.pendingSession ? 1 : 0)} agendada(s)
                          </span>
                          <span style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px', fontWeight: 700 }}>
                            📦 {remainingToSchedule} em haver
                          </span>
                        </div>

                        <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, Math.round(((pkg.completedSessions ?? 0) / pkg.totalSessions) * 100))}%`,
                              height: '100%',
                              background: '#245d80',
                              borderRadius: '4px',
                            }}
                          />
                        </div>

                        {isSequential && pkg.pendingSession && (
                          <span style={{ fontSize: '0.69rem', color: '#854d0e', lineHeight: 1.3 }}>
                            ⏳ {pkg.pendingSession.sessionNumber ? `${pkg.pendingSession.sessionNumber}ª` : 'Próxima'} sessão agendada — novas vagas liberam após concluir.
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Situação Financeira & Pagamentos no Dashboard */}
            <section className="client-card-block">
              <div className="client-block-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={18} style={{ color: '#245d80' }} />
                  <h3>Meus Pagamentos & Faturas</h3>
                  <span className="badge-count">{allPayments.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('pagamentos')}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '999px',
                    padding: '5px 12px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#1a3a4a',
                    cursor: 'pointer',
                  }}
                >
                  Ver todos os pagamentos →
                </button>
              </div>

              {allPayments.length === 0 ? (
                <div className="client-docs-empty">
                  <Receipt size={28} className="text-muted" />
                  <p>Seus lançamentos financeiros, sessões em aberto e recibos aparecerão aqui automaticamente.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                  {/* Resumo rápido de saldo */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                    <div style={{ background: openPayments.length > 0 ? '#fffbeb' : '#f8fafc', border: `1px solid ${openPayments.length > 0 ? '#fde68a' : '#e2e8f0'}`, borderRadius: '12px', padding: '10px 12px' }}>
                      <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: openPayments.length > 0 ? '#92400e' : '#64748b', textTransform: 'uppercase' }}>
                        Em Aberto / Pendente
                      </span>
                      <strong style={{ fontSize: '1.05rem', color: openPayments.length > 0 ? '#b45309' : '#0f172a', fontWeight: 800 }}>
                        {formatCurrency(
                          allPayments.reduce((acc, p) => {
                            if (p.status === 'cancelado') return acc;
                            const rem = p.remainingAmountCents ?? (p.status === 'pendente' || p.status === 'parcial' ? p.amountCents : 0);
                            return acc + rem;
                          }, 0)
                        )}
                      </strong>
                    </div>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '10px 12px' }}>
                      <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                        Total Já Pago
                      </span>
                      <strong style={{ fontSize: '1.05rem', color: '#15803d', fontWeight: 800 }}>
                        {formatCurrency(
                          allPayments.reduce((acc, p) => {
                            if (p.status === 'cancelado') return acc;
                            const paid = p.paidAmountCents ?? (p.status === 'pago' ? p.amountCents : 0);
                            return acc + paid;
                          }, 0)
                        )}
                      </strong>
                    </div>
                  </div>

                  {/* Lista resumida priorizando em aberto/pendente/parcial */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[...openPayments, ...allPayments.filter((p) => !openPayments.some((op) => op.id === p.id))]
                      .slice(0, 4)
                      .map((pay) => {
                        const remCents = pay.remainingAmountCents ?? (pay.status === 'pendente' || pay.status === 'parcial' ? pay.amountCents : 0);
                        const paidCents = pay.paidAmountCents ?? (pay.status === 'pago' ? pay.amountCents : 0);
                        const discCents = pay.discountCents ?? 0;
                        const isPartial = pay.status === 'parcial' || (paidCents > 0 && remCents > 0);
                        const isPending = (pay.status === 'pendente' || remCents > 0) && !isPartial;
                        const isPaid = pay.status === 'pago' && remCents === 0;
                        const methodLabel =
                          pay.paymentMethod === 'pix'
                            ? 'PIX'
                            : pay.paymentMethod === 'cartao' || pay.paymentMethod.startsWith('cartao')
                            ? 'Cartão'
                            : pay.paymentMethod === 'dinheiro'
                            ? 'Dinheiro'
                            : pay.paymentMethod.toUpperCase();

                        return (
                          <div
                            key={pay.id}
                            onClick={() => setActiveTab('pagamentos')}
                            style={{
                              background: isPartial || isPending ? '#fffdf9' : '#f8fafc',
                              border: `1px solid ${pay.isOverdue ? '#fca5a5' : isPartial || isPending ? '#fcd34d' : '#e2e8f0'}`,
                              borderRadius: '12px',
                              padding: '12px 14px',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                              <div>
                                <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>
                                  {pay.description}
                                </strong>
                                <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                  <span>Forma:</span>
                                  <PortalMethodBadge method={pay.paymentMethod} size={14} />
                                  {pay.installmentNumber && pay.totalInstallments && pay.totalInstallments > 1
                                    ? <span>• Parcela {pay.installmentNumber}/{pay.totalInstallments}</span>
                                    : null}
                                  {pay.dueAt && (isPending || isPartial)
                                    ? <span>• Vencimento: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(pay.dueAt))}</span>
                                    : null}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  padding: '3px 9px',
                                  borderRadius: '999px',
                                  whiteSpace: 'nowrap',
                                  background: pay.isOverdue
                                    ? '#fef2f2'
                                    : isPaid
                                    ? '#dcfce7'
                                    : isPartial
                                    ? '#fef3c7'
                                    : '#ffedd5',
                                  color: pay.isOverdue
                                    ? '#b91c1c'
                                    : isPaid
                                    ? '#166534'
                                    : isPartial
                                    ? '#92400e'
                                    : '#c2410c',
                                  border: `1px solid ${
                                    pay.isOverdue ? '#fecaca' : isPaid ? '#bbf7d0' : isPartial ? '#fde68a' : '#fed7aa'
                                  }`,
                                }}
                              >
                                {pay.isOverdue
                                  ? '⚠️ Vencido'
                                  : isPaid
                                  ? '✓ Pago'
                                  : isPartial
                                  ? '⏳ Parcial (Entrada Paga)'
                                  : '🕒 Pendente / Em Aberto'}
                              </span>
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '8px',
                                paddingTop: '6px',
                                borderTop: '1px dashed #e2e8f0',
                                fontSize: '0.78rem',
                              }}
                            >
                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: '#475569' }}>
                                <span>
                                  Valor Final: <strong style={{ color: '#0f172a' }}>{formatCurrency(pay.amountCents)}</strong>
                                </span>
                                {discCents > 0 && (
                                  <span style={{ color: '#16a34a', fontWeight: 600 }}>
                                    (Desc: -{formatCurrency(discCents)})
                                  </span>
                                )}
                                {paidCents > 0 && remCents > 0 && (
                                  <span style={{ color: '#15803d', fontWeight: 700 }}>
                                    Entrada paga: {formatCurrency(paidCents)}
                                  </span>
                                )}
                              </div>
                              {remCents > 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ color: '#b45309', fontWeight: 800 }}>
                                    Falta: {formatCurrency(remCents)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPortalPixModal(pay);
                                    }}
                                    style={{
                                      padding: '3px 10px',
                                      borderRadius: '999px',
                                      background: '#16a34a',
                                      color: '#ffffff',
                                      border: 'none',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                                    }}
                                  >
                                    <QrCode size={11} /> Pagar PIX
                                  </button>
                                </div>
                              ) : (
                                <span style={{ color: '#15803d', fontWeight: 800 }}>
                                  Quitado ({formatCurrency(paidCents)})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </section>

            {/* Documents & Orientações */}
            <section className="client-card-block">
              <div className="client-block-header">
                <h3>Documentos & Orientações</h3>
                <span className="badge-count">{data.documents.length}</span>
              </div>
              {data.documents.length === 0 ? (
                <div className="client-docs-empty">
                  <ShieldCheck size={28} className="text-muted" />
                  <p>Termos de consentimento e orientações serão compartilhados aqui pela profissional.</p>
                </div>
              ) : (
                <div className="client-history-list">
                  {data.documents.map((doc) => (
                    <div key={doc.id} className="client-history-item">
                      <div className="history-item-left">
                        <div className="history-doc-title">
                          <FileText size={16} />
                          <strong>{doc.title}</strong>
                        </div>
                        <span className="history-date">
                          {doc.documentTypeLabel || doc.documentType} •{' '}
                          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(doc.createdAt))}
                        </span>
                      </div>
                      <div className="history-item-right" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="status-pill status-concluido">Disponível</span>
                        {doc.documentType === 'termo_consentimento' && (
                          <>
                            <a href="/api/client/anamnese/pdf" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a3a4a', textDecoration: 'underline' }}>
                              Visualizar
                            </a>
                            <a href="/api/client/anamnese/pdf?download=1" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a3a4a', textDecoration: 'underline' }}>
                              Baixar PDF
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* ================= ABA DE OBJETIVOS (cadastrados pela terapeuta) ================= */}
        {activeTab === 'objetivos' && (
          <section className="client-card-block" style={{ padding: '24px 28px' }}>
            <div className="client-block-header" style={{ marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Target size={22} color="#b8892a" />
                  <h3 style={{ fontSize: '1.25rem', color: '#1a3a4a', margin: 0 }}>Meus Objetivos</h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                  Metas definidas em conjunto com a sua terapeuta para o seu acompanhamento.
                </p>
              </div>
            </div>

            {(data.goals || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#fdf4e7', display: 'grid', placeItems: 'center' }}>
                  <Target size={24} color="#c49a3a" />
                </div>
                <p style={{ fontSize: '0.88rem', color: '#5a7a8a', margin: 0, maxWidth: '300px', lineHeight: 1.5 }}>
                  Seus objetivos terapêuticos aparecerão aqui assim que forem definidos com a sua terapeuta.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {(data.goals || []).map((goal) => {
                  const achieved = goal.status === 'alcancado';
                  const statusMap: Record<string, { label: string; bg: string; color: string }> = {
                    em_andamento: { label: 'Em andamento', bg: '#dbeafe', color: '#1d4ed8' },
                    alcancado: { label: 'Alcançado', bg: '#dcfce7', color: '#15803d' },
                    ajustado: { label: 'Ajustado', bg: '#fef3c7', color: '#92400e' },
                    pausado: { label: 'Pausado', bg: '#f1f5f9', color: '#475569' },
                  };
                  const st = statusMap[goal.status] ?? statusMap.em_andamento;
                  const pct = Math.max(0, Math.min(100, goal.progressPct));
                  return (
                    <div
                      key={goal.id}
                      style={{
                        background: achieved ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)' : '#fdfbf7',
                        border: achieved ? '1.5px solid #86efac' : '1px solid #ebdcc5',
                        borderRadius: '16px',
                        padding: '16px 18px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '1rem', color: '#1a3a4a', lineHeight: 1.35, flex: 1, minWidth: '180px' }}>
                          {achieved ? '✓ ' : ''}{goal.title}
                        </strong>
                        <span style={{ background: st.bg, color: st.color, fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
                          {st.label}
                        </span>
                      </div>
                      {goal.description && (
                        <p style={{ fontSize: '0.86rem', color: '#5a6b77', lineHeight: 1.55, margin: '8px 0 0' }}>{goal.description}</p>
                      )}
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b', marginBottom: '4px' }}>
                          <span>Progresso</span>
                          <strong style={{ color: '#1a3a4a' }}>{pct}%</strong>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: '#e8dfd0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: achieved ? '#16a34a' : '#b8892a', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '10px', fontSize: '0.76rem', color: '#7a8a99' }}>
                        {goal.targetDate && (
                          <span>Meta para: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(goal.targetDate))}</span>
                        )}
                        {achieved && goal.achievedAt && (
                          <span style={{ color: '#15803d' }}>
                            Alcançado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date(goal.achievedAt))}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ================= ABA DE ANAMNESE DIGITAL ================= */}
        {activeTab === 'anamnese' && (
          <section className="client-card-block" style={{ padding: '24px 28px' }}>
            <div className="client-block-header" style={{ marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardList size={22} color="#b8892a" />
                  <h3 style={{ fontSize: '1.25rem', color: '#1a3a4a', margin: 0 }}>
                    Ficha de Anamnese Digital – Hipnose Clínica
                  </h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                  Acolhimento & Histórico Clínico Integrativo. Preenchimento rápido em 8 itens para o seu atendimento seguro.
                </p>
              </div>
              {data.anamnese?.isCompleted && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: '#dcfce7',
                    color: '#15803d',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  <CheckCircle2 size={13} /> Preenchida
                </span>
              )}
            </div>

            {data.anamnese?.isCompleted && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <a
                  href="/api/client/anamnese/pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '50px', border: '1.5px solid #cbd5e1', background: '#fff', color: '#1a3a4a', fontSize: '0.84rem', fontWeight: 600, textDecoration: 'none' }}
                >
                  <FileText size={15} /> Visualizar PDF
                </a>
                <a
                  href="/api/client/anamnese/pdf?download=1"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: '50px', border: 'none', background: '#1a3a4a', color: '#fff', fontSize: '0.84rem', fontWeight: 600, textDecoration: 'none' }}
                >
                  <Download size={15} /> Baixar PDF
                </a>
              </div>
            )}

            {anamneseSuccessMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '20px',
                  fontSize: '0.88rem',
                }}
              >
                <CheckCircle2 size={18} color="#10b981" />
                <span>{anamneseSuccessMsg}</span>
              </div>
            )}

            {anamneseErrorMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '20px',
                  fontSize: '0.88rem',
                }}
              >
                <AlertCircle size={18} color="#ef4444" />
                <span>{anamneseErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveAnamnese} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              
              {/* Grid 1: Identificação (Campos 1 a 4) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                
                {/* 1. Nome completo */}
                <label className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span className="form-label" style={{ margin: 0, fontWeight: 600 }}>1. Nome completo</span>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                      Automático do cadastro
                    </span>
                  </div>
                  <input
                    className="form-input"
                    type="text"
                    value={anamneseFullName}
                    readOnly
                    disabled
                    style={{ background: '#f8fafc', color: '#475569', cursor: 'not-allowed' }}
                  />
                </label>

                {/* 2. CPF */}
                <label className="form-group">
                  <span className="form-label" style={{ fontWeight: 600 }}>2. CPF</span>
                  <input
                    className="form-input"
                    type="text"
                    required
                    value={anamneseCpf}
                    onChange={(e) => setAnamneseCpf(maskCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </label>

                {/* 3. RG */}
                <label className="form-group">
                  <span className="form-label" style={{ fontWeight: 600 }}>3. RG</span>
                  <input
                    className="form-input"
                    type="text"
                    required
                    value={anamneseRg}
                    onChange={(e) => setAnamneseRg(e.target.value)}
                    placeholder="Número do documento (Ex: SSP/SC)"
                  />
                </label>

                {/* 4. Data de nascimento */}
                <label className="form-group">
                  <span className="form-label" style={{ fontWeight: 600 }}>4. Data de nascimento</span>
                  <input
                    className="form-input"
                    type="date"
                    required
                    value={anamneseBirthDate}
                    onChange={(e) => setAnamneseBirthDate(e.target.value)}
                  />
                </label>
              </div>

              {/* Contato de Emergência */}
              <div style={{ background: '#fdfbf7', border: '1px solid #ebdcc5', borderRadius: '14px', padding: '16px' }}>
                <span className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '10px', color: '#1a3a4a' }}>
                  Contato de Emergência
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <label className="form-group" style={{ margin: 0 }}>
                    <span className="form-label" style={{ fontSize: '0.8rem' }}>Nome do Contato</span>
                    <input
                      className="form-input"
                      type="text"
                      value={anamneseEmergName}
                      onChange={(e) => setAnamneseEmergName(e.target.value)}
                      placeholder="Ex: Maria (Mãe / Cônjuge)"
                    />
                  </label>
                  <label className="form-group" style={{ margin: 0 }}>
                    <span className="form-label" style={{ fontSize: '0.8rem' }}>Telefone de Emergência</span>
                    <input
                      className="form-input"
                      type="tel"
                      value={anamneseEmergPhone}
                      onChange={(e) => setAnamneseEmergPhone(maskPhone(e.target.value))}
                      placeholder="(00) 00000-0000"
                    />
                  </label>
                  <label className="form-group" style={{ margin: 0 }}>
                    <span className="form-label" style={{ fontSize: '0.8rem' }}>Parentesco / Relação</span>
                    <input
                      className="form-input"
                      type="text"
                      value={anamneseEmergRel}
                      onChange={(e) => setAnamneseEmergRel(e.target.value)}
                      placeholder="Ex: Cônjuge, Mãe, Irmão..."
                    />
                  </label>
                </div>
              </div>

              {/* 5. Qual o motivo da consulta? */}
              <label className="form-group" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="form-label" style={{ margin: 0, fontWeight: 600 }}>
                    5. Qual o motivo da consulta? <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span>
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    {anamneseReason.length}/500 caracteres
                  </span>
                </div>
                <textarea
                  className="form-input"
                  rows={3}
                  maxLength={500}
                  placeholder="Conte com suas palavras o que você busca transformar ou superar (máx. 500 caracteres)..."
                  value={anamneseReason}
                  onChange={(e) => setAnamneseReason(e.target.value)}
                  style={{ resize: 'vertical', minHeight: '80px', lineHeight: 1.5 }}
                />
              </label>

              {/* 6. Possui alguma condição de saúde ou utiliza medicamentos? */}
              <div style={{ background: '#fdfbf7', border: '1px solid #ebdcc5', borderRadius: '14px', padding: '16px' }}>
                <span className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '10px', color: '#1a3a4a' }}>
                  6. Possui alguma condição de saúde ou utiliza medicamentos?
                </span>
                <div style={{ display: 'flex', gap: '10px', marginBottom: anamneseHasHealth ? '12px' : 0 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setAnamneseHasHealth(false);
                      setAnamneseHealthDetails('');
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: !anamneseHasHealth ? '2px solid #1a3a4a' : '1px solid #cbd5e1',
                      background: !anamneseHasHealth ? '#1a3a4a' : '#ffffff',
                      color: !anamneseHasHealth ? '#ffffff' : '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Não
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnamneseHasHealth(true)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: anamneseHasHealth ? '2px solid #1a3a4a' : '1px solid #cbd5e1',
                      background: anamneseHasHealth ? '#1a3a4a' : '#ffffff',
                      color: anamneseHasHealth ? '#ffffff' : '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Sim
                  </button>
                </div>

                {anamneseHasHealth && (
                  <div style={{ marginTop: '12px' }}>
                    <span className="form-label" style={{ fontSize: '0.82rem', color: '#5a6b77', marginBottom: '4px', display: 'block' }}>
                      Especifique condições de saúde, diagnósticos ou medicamentos em uso:
                    </span>
                    <input
                      className="form-input"
                      type="text"
                      required={anamneseHasHealth}
                      placeholder="Ex: Hipertensão, uso de ansiolítico/antidepressivo, etc."
                      value={anamneseHealthDetails}
                      onChange={(e) => setAnamneseHealthDetails(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* 7. Faz acompanhamento psicológico ou psiquiátrico? */}
              <div style={{ background: '#fdfbf7', border: '1px solid #ebdcc5', borderRadius: '14px', padding: '16px' }}>
                <span className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '10px', color: '#1a3a4a' }}>
                  7. Faz acompanhamento psicológico ou psiquiátrico?
                </span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setAnamneseHasPsych(false)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: !anamneseHasPsych ? '2px solid #1a3a4a' : '1px solid #cbd5e1',
                      background: !anamneseHasPsych ? '#1a3a4a' : '#ffffff',
                      color: !anamneseHasPsych ? '#ffffff' : '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Não
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnamneseHasPsych(true)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: anamneseHasPsych ? '2px solid #1a3a4a' : '1px solid #cbd5e1',
                      background: anamneseHasPsych ? '#1a3a4a' : '#ffffff',
                      color: anamneseHasPsych ? '#ffffff' : '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Sim
                  </button>
                </div>
                {anamneseHasPsych && (
                  <input
                    className="form-input"
                    type="text"
                    placeholder="(Opcional) Com quem faz acompanhamento / há quanto tempo?"
                    value={anamnesePsychDetails}
                    onChange={(e) => setAnamnesePsychDetails(e.target.value)}
                    style={{ marginTop: '12px' }}
                  />
                )}
              </div>

              {/* Triagem de segurança: Histórico de Epilepsia ou Convulsão (protocolo SBHP) */}
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '14px', padding: '16px' }}>
                <span className="form-label" style={{ display: 'block', fontWeight: 600, marginBottom: '4px', color: '#1a3a4a' }}>
                  Histórico de Epilepsia ou Convulsão?
                </span>
                <span style={{ display: 'block', fontSize: '0.78rem', color: '#7f5a5a', marginBottom: '10px', lineHeight: 1.45 }}>
                  Informação de segurança: se houver histórico, a profissional avalia a conduta antes de qualquer indução (protocolo SBHP).
                </span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[false, true].map((val) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => setAnamneseEpilepsy(val)}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: anamneseEpilepsy === val ? '2px solid #1a3a4a' : '1px solid #cbd5e1',
                        background: anamneseEpilepsy === val ? '#1a3a4a' : '#ffffff',
                        color: anamneseEpilepsy === val ? '#ffffff' : '#334155',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {val ? 'Sim' : 'Não'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 8. Está ciente e concorda com o atendimento? (Consentimento Informado & LGPD) */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '14px',
                  padding: '18px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <ShieldCheck size={20} color="#245d80" />
                  <strong style={{ fontSize: '0.94rem', color: '#1a3a4a' }}>
                    8. Termo de Ciência e Consentimento Informado (LGPD)
                  </strong>
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#475569',
                    lineHeight: 1.6,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '14px',
                    maxHeight: '140px',
                    overflowY: 'auto',
                    marginBottom: '14px',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0' }}>
                    <strong>Sobre o Atendimento:</strong> A hipnose clínica é uma prática integrativa e complementar baseada em atenção concentrada e relaxamento direcionado. O cliente permanece consciente, desperto e no pleno controle de sua vontade durante toda a sessão, podendo interromper o processo no momento que desejar. A hipnose não substitui tratamentos médicos ou psiquiátricos convencionais.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Privacidade & LGPD:</strong> Em cumprimento à Lei Geral de Proteção de Dados (Lei nº 13.709/2018), seus dados pessoais e de saúde são estritamente sigilosos, tratados exclusivamente para fins de acompanhamento terapêutico individual e nunca compartilhados com terceiros sem seu consentimento expresso.
                  </p>
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    required
                    checked={anamneseConsent}
                    onChange={(e) => setAnamneseConsent(e.target.checked)}
                    style={{
                      width: '20px',
                      height: '20px',
                      marginTop: '2px',
                      accentColor: '#1a3a4a',
                      cursor: 'pointer',
                    }}
                  />
                  <span style={{ fontSize: '0.86rem', color: '#1e293b', lineHeight: 1.5 }}>
                    <strong>Está ciente e concorda com o atendimento?</strong> Declaro que li, compreendi e concordo com as orientações do atendimento de Hipnose Clínica e autorizo o tratamento seguro dos meus dados para fins terapêuticos.
                  </span>
                </label>
                {data.anamnese?.consentAgreedAt && (
                  <span style={{ display: 'block', fontSize: '0.74rem', color: '#15803d', marginTop: '8px', marginLeft: '32px' }}>
                    ✓ Termo assinado digitalmente em{' '}
                    {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(data.anamnese.consentAgreedAt))}
                  </span>
                )}
              </div>

              {/* Botão de Salvar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="submit"
                  disabled={savingAnamnese}
                  className="btn btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: '220px',
                    justifyContent: 'center',
                    padding: '12px 26px',
                    borderRadius: '50px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    background: '#1a3a4a',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(26,58,74,0.25)',
                  }}
                >
                  <Save size={18} />
                  {savingAnamnese ? 'Salvando...' : (data.anamnese?.isCompleted ? 'Atualizar Ficha de Anamnese' : 'Salvar e Confirmar Anamnese')}
                </button>
              </div>

            </form>
          </section>
        )}

        {/* ================= ABA 2: AGENDAMENTOS ================= */}
        {activeTab === 'agendamentos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* 1º NO TOPO: Lista de agendamentos + Filtro (sempre visível em cima) */}
            <section className="client-card-block" style={{ padding: '16px 18px' }}>
              <div className="client-block-header" style={{ marginBottom: '8px', paddingBottom: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '1.02rem', margin: 0 }}>Meus Agendamentos</h3>
                  <p style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px', marginBottom: 0 }}>
                    Histórico completo de atendimentos presenciais e online
                  </p>
                </div>
              </div>

              {data.appointments.length > 0 && (
                <FilterBar
                  periods={['todos', 'futuros', '30d', '90d', 'ano', 'custom']}
                  period={aptPeriod}
                  onPeriod={setAptPeriod}
                  from={aptFrom}
                  to={aptTo}
                  onFrom={setAptFrom}
                  onTo={setAptTo}
                  statusOptions={[
                    { value: 'todos', label: 'Todas' },
                    { value: 'confirmado', label: 'Confirmado' },
                    { value: 'solicitado', label: 'Solicitado' },
                    { value: 'concluido', label: 'Concluído' },
                    { value: 'cancelado', label: 'Cancelado' },
                    { value: 'nao_compareceu', label: 'Falta' },
                  ]}
                  status={aptStatus}
                  onStatus={setAptStatus}
                  sort={aptSort}
                  onSort={setAptSort}
                  count={filteredAppointments.length}
                  total={data.appointments.length}
                  onClear={clearAppointmentFilters}
                />
              )}

              {data.appointments.length > 0 && filteredAppointments.length === 0 ? (
                <NoFilterResults onClear={clearAppointmentFilters} />
              ) : data.appointments.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '28px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: '#fdf4e7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <CalendarDays size={20} color="#c49a3a" />
                  </div>
                  <p style={{ fontSize: '0.84rem', color: '#5a7a8a', margin: 0 }}>
                    Você ainda não possui atendimentos registrados.
                  </p>
                </div>
              ) : (
                <div className="client-history-list" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredAppointments.map((apt) => {
                    const durMin = getAppointmentDurationMinutes(apt.startAt, apt.endAt);
                    const durLabel = formatDurationLabel(durMin);
                    const dateFull = formatFullDate(apt.startAt);
                    const timeRange = formatTimeRange(apt.startAt, apt.endAt);

                    return (
                      <div
                        key={apt.id}
                        onClick={() => setSelectedAptModal(apt)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedAptModal(apt);
                          }
                        }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '14px 16px',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '14px',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          gap: '12px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Lado Esquerdo: Ícone + Título + Data/Hora */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '240px', flex: '1 1 auto' }}>
                          <div
                            style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '12px',
                              background: apt.modality === 'online' ? '#eff6ff' : '#fef3c7',
                              color: apt.modality === 'online' ? '#2563eb' : '#b45309',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {apt.modality === 'online' ? <Monitor size={20} /> : <CalendarDays size={20} />}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.94rem', color: '#0f172a', fontWeight: 700 }}>
                                {apt.serviceName}
                              </strong>
                              {apt.sessionNumber && (
                                <span
                                  style={{
                                    fontSize: '0.67rem',
                                    fontWeight: 700,
                                    padding: '1px 7px',
                                    borderRadius: '999px',
                                    background: '#fdf4e7',
                                    border: '1px solid #fde68a',
                                    color: '#92400e',
                                  }}
                                >
                                  {apt.sessionNumber}ª Sessão
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.78rem', color: '#64748b' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500, color: '#334155' }}>
                                <CalendarDays size={13} color="#64748b" />
                                {dateFull}
                              </span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#0f172a' }}>
                                <Clock3 size={13} color="#64748b" />
                                {timeRange} {durLabel ? `• ${durLabel}` : ''}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Lado Direito: Modalidade + Status + Ações */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: '8px',
                              background: apt.modality === 'online' ? '#eff6ff' : '#f1f5f9',
                              color: apt.modality === 'online' ? '#1e40af' : '#475569',
                              border: apt.modality === 'online' ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            {apt.modality === 'online' ? <Monitor size={12} /> : <MapPin size={12} />}
                            {apt.modality === 'online' ? 'Online' : 'Presencial (Urussanga)'}
                          </span>

                          <span className={`status-pill status-${apt.status}`}>
                            {apt.status === 'confirmado' && 'Confirmado'}
                            {apt.status === 'solicitado' && 'Solicitado'}
                            {apt.status === 'concluido' && 'Concluído'}
                            {apt.status === 'cancelado' && 'Cancelado'}
                            {apt.status === 'nao_compareceu' && 'Falta'}
                            {apt.status === 'em_atendimento' && 'Em andamento'}
                          </span>

                          {(apt.status === 'confirmado' || apt.status === 'solicitado') && (
                            <button
                              type="button"
                              disabled={cancelingAptId === apt.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClientCancelAppointment(apt.id, apt.serviceName);
                              }}
                              style={{
                                background: '#fef2f2',
                                color: '#b91c1c',
                                border: '1px solid #fecaca',
                                borderRadius: '999px',
                                padding: '3px 9px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {cancelingAptId === apt.id ? 'Cancelando...' : 'Cancelar'}
                            </button>
                          )}

                          <span
                            style={{
                              fontSize: '0.73rem',
                              fontWeight: 700,
                              color: '#2563eb',
                              background: '#eff6ff',
                              border: '1px solid #dbeafe',
                              padding: '4px 9px',
                              borderRadius: '999px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                          >
                            Ver detalhes <ChevronRight size={13} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 2º ABAIXO: Pacotes ativos com sessões em haver */}
            {(data.packages || []).filter(pkg =>
              pkg.totalSessions > 1 && pkg.status === 'ativo'
            ).map(pkg => {
              const remainingToSchedule = pkg.remainingToSchedule ?? Math.max(0, pkg.totalSessions - pkg.usedSessions);
              const isSequential = pkg.bookingMode === 'sequencial';
              const nextSessionNumber = (pkg.completedSessions ?? 0) + (pkg.scheduledSessions ?? (pkg.pendingSession ? 1 : 0)) + 1;
              const completedCount = pkg.completedSessions ?? 0;
              const scheduledCount = pkg.scheduledSessions ?? (pkg.pendingSession ? 1 : 0);
              const pctCompleted = Math.min(100, Math.round((completedCount / pkg.totalSessions) * 100));
              const pctScheduled = Math.min(100 - pctCompleted, Math.round((scheduledCount / pkg.totalSessions) * 100));

              return (
                <div
                  key={pkg.id}
                  onClick={() => setSelectedPkgModal(pkg)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPkgModal(pkg);
                    }
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #ffffff 0%, #fffdfa 45%, #fefcf5 100%)',
                    border: '1.5px solid #e7d5be',
                    borderRadius: '16px',
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(184, 137, 42, 0.08)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Linha 1: Cabeçalho com título, regra e contagem de sessões */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.67rem',
                          fontWeight: 800,
                          color: '#9a6b18',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          padding: '3px 8px',
                          borderRadius: '7px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Sparkles size={12} color="#b45309" />
                        Pacote Ativo
                      </span>
                      <strong style={{ fontSize: '0.96rem', color: '#1a3a4a', fontWeight: 800 }}>
                        {pkg.packageName}
                      </strong>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: isSequential ? '#fefce8' : '#eff6ff',
                          border: isSequential ? '1px solid #fde047' : '1px solid #bfdbfe',
                          color: isSequential ? '#854d0e' : '#1d4ed8',
                        }}
                      >
                        {isSequential ? '🔒 1 por vez (sequencial)' : '🔓 Livre'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
                      Em haver: <strong style={{ color: remainingToSchedule > 0 ? '#b8892a' : '#16a34a', fontSize: '1rem', fontWeight: 800 }}>{remainingToSchedule} de {pkg.totalSessions}</strong> sessões
                    </div>
                  </div>

                  {/* Barra de Progresso visual elegante */}
                  <div style={{ width: '100%', height: '7px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                    <div
                      style={{
                        width: `${pctCompleted}%`,
                        background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                        height: '100%',
                        transition: 'width 0.4s ease',
                      }}
                      title={`${completedCount} concluída(s)`}
                    />
                    <div
                      style={{
                        width: `${pctScheduled}%`,
                        background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
                        height: '100%',
                        transition: 'width 0.4s ease',
                      }}
                      title={`${scheduledCount} agendada(s)`}
                    />
                  </div>

                  {/* Linha 2: Pílulas de status + Próxima sessão / Ação */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '0.72rem' }}>
                      <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '2px 8px', fontWeight: 600 }}>
                        ✓ {completedCount} concluída(s)
                      </span>
                      <span style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px', padding: '2px 8px', fontWeight: 600 }}>
                        ⏳ {scheduledCount} agendada(s)
                      </span>
                      <span style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', fontWeight: 700 }}>
                        📦 {remainingToSchedule} em haver
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {isSequential && pkg.pendingSession ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: '#fffbeb',
                            color: '#92400e',
                            border: '1px solid #fde68a',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}
                        >
                          <Clock3 size={13} color="#b45309" />
                          {pkg.pendingSession.sessionNumber ? `${pkg.pendingSession.sessionNumber}ª` : 'Sessão'} em{' '}
                          {new Intl.DateTimeFormat('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'America/Sao_Paulo',
                          }).format(new Date(pkg.pendingSession.startAt))}{' '}
                          (próxima libera após concluir)
                        </span>
                      ) : remainingToSchedule > 0 ? (
                        <Link
                          href={`/agendar?from=cliente&packageId=${pkg.id}${pkg.serviceId ? `&serviceId=${pkg.serviceId}` : ''}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: '#1a3a4a',
                            color: '#ffffff',
                            padding: '5px 13px',
                            borderRadius: '999px',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <PlusCircle size={14} /> Agendar {nextSessionNumber}ª sessão
                        </Link>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>
                          ✓ Pacote Completo
                        </span>
                      )}

                      <span
                        style={{
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          color: '#b8892a',
                          background: '#fffdf5',
                          border: '1px solid #f9e2b8',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        Ver sessões <ChevronRight size={13} />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ================= ABA 3: PAGAMENTOS ================= */}
        {activeTab === 'pagamentos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <section className="client-card-block">
              <div className="client-block-header">
                <div>
                  <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Pagamentos & Recibos</h3>
                  <p style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
                    Histórico de faturas, entradas parciais e comprovantes
                  </p>
                </div>
              </div>

              {allPayments.length > 0 && (
                <>
                  {/* Resumo compacto em uma única linha (2 ou 3 colunas lado a lado) */}
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'grid',
                      gridTemplateColumns: totalDiscountCents > 0 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 10px',
                        background: openTotalCents > 0 ? '#fffbeb' : '#f8fafc',
                        border: `1px solid ${openTotalCents > 0 ? '#fcd34d' : '#e2e8f0'}`,
                        borderRadius: '10px',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: '0.64rem', color: openTotalCents > 0 ? '#92400e' : '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                        ⏳ Em Aberto
                      </span>
                      <strong style={{ fontSize: '0.94rem', color: openTotalCents > 0 ? '#b45309' : '#0f172a', fontWeight: 800 }}>
                        {formatCurrency(openTotalCents)}
                      </strong>
                    </div>

                    <div
                      style={{
                        padding: '8px 10px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '10px',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: '0.64rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                        ✓ Já Pago
                      </span>
                      <strong style={{ fontSize: '0.94rem', color: '#15803d', fontWeight: 800 }}>
                        {formatCurrency(paidTotalCents)}
                      </strong>
                    </div>

                    {totalDiscountCents > 0 && (
                      <div
                        style={{
                          padding: '8px 10px',
                          background: '#fdf4e7',
                          border: '1px solid #f0e0c2',
                          borderRadius: '10px',
                        }}
                      >
                        <span style={{ display: 'block', fontSize: '0.64rem', color: '#8a6a1f', fontWeight: 700, textTransform: 'uppercase' }}>
                          ✨ Descontos
                        </span>
                        <strong style={{ fontSize: '0.94rem', color: '#1a3a4a', fontWeight: 800 }}>
                          {formatCurrency(totalDiscountCents)}
                        </strong>
                      </div>
                    )}
                  </div>

                  <FilterBar
                    periods={['todos', '30d', '90d', 'ano', 'custom']}
                    period={payPeriod}
                    onPeriod={setPayPeriod}
                    from={payFrom}
                    to={payTo}
                    onFrom={setPayFrom}
                    onTo={setPayTo}
                    statusOptions={[
                      { value: 'todos', label: 'Todos' },
                      { value: 'em_aberto', label: 'Em Aberto' },
                      { value: 'pendente', label: 'Pendente' },
                      { value: 'parcial', label: 'Parcial' },
                      { value: 'pago', label: 'Quitado' },
                    ]}
                    status={payStatus}
                    onStatus={setPayStatus}
                    sort={paySort}
                    onSort={setPaySort}
                    count={filteredPayments.length}
                    total={allPayments.length}
                    onClear={clearPaymentFilters}
                  />
                </>
              )}

              {allPayments.length > 0 && filteredPayments.length === 0 ? (
                <NoFilterResults onClear={clearPaymentFilters} />
              ) : allPayments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                  <Receipt size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                  <h4>Nenhum pagamento registrado até o momento</h4>
                  <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                    Assim que uma sessão ou pacote for registrado para o seu CPF, você poderá acompanhar os valores pagos, descontos e saldos em aberto aqui.
                  </p>
                </div>
              ) : (
                <div className="client-history-list" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredPayments.map((pay) => {
                    const grossCents = pay.grossAmountCents ?? pay.amountCents + (pay.discountCents ?? 0);
                    const discCents = pay.discountCents ?? 0;
                    const netCents = pay.amountCents;
                    const paidCents = pay.paidAmountCents ?? (pay.status === 'pago' ? netCents : 0);
                    const remCents = pay.remainingAmountCents ?? (pay.status === 'pendente' || pay.status === 'parcial' ? Math.max(0, netCents - paidCents) : 0);
                    const isPartial = pay.status === 'parcial' || (paidCents > 0 && remCents > 0);
                    const isPending = (pay.status === 'pendente' || remCents > 0) && !isPartial;
                    const isPaid = pay.status === 'pago' && remCents === 0;
                    const isCanceled = pay.status === 'cancelado';
                    const paidPct = netCents > 0 ? Math.min(100, Math.round((paidCents / netCents) * 100)) : 0;

                    const fmtMethod = (m: string) =>
                      m === 'pix'
                        ? 'PIX'
                        : m === 'cartao' || m.startsWith('cartao')
                        ? 'Cartão'
                        : m === 'dinheiro'
                        ? 'Dinheiro'
                        : m.toUpperCase();

                    const methodLabel = fmtMethod(pay.paymentMethod);
                    const txCount = pay.transactions?.length || 0;

                    return (
                      <div
                        key={pay.id}
                        onClick={() => setPortalReceiptModal(pay)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '14px',
                          background: '#ffffff',
                          border: `1px solid ${
                            pay.isOverdue
                              ? '#fca5a5'
                              : isPartial || isPending
                              ? '#fcd34d'
                              : isPaid
                              ? '#bbf7d0'
                              : '#e2e8f0'
                          }`,
                          borderLeft: `4px solid ${
                            pay.isOverdue
                              ? '#dc2626'
                              : isPartial || isPending
                              ? '#d97706'
                              : isPaid
                              ? '#16a34a'
                              : '#94a3b8'
                          }`,
                          boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        {/* Linha 1: Título + Status compacto */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <strong style={{ fontSize: '0.9rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {pay.description}
                            </strong>
                            {pay.installmentNumber && pay.totalInstallments && pay.totalInstallments > 1 && (
                              <span
                                style={{
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: '999px',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  flexShrink: 0,
                                }}
                              >
                                {pay.installmentNumber}/{pay.totalInstallments}
                              </span>
                            )}
                          </div>

                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '999px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                              background: isCanceled
                                ? '#f1f5f9'
                                : pay.isOverdue
                                ? '#fef2f2'
                                : isPaid
                                ? '#dcfce7'
                                : '#fef3c7',
                              color: isCanceled
                                ? '#64748b'
                                : pay.isOverdue
                                ? '#b91c1c'
                                : isPaid
                                ? '#166534'
                                : '#92400e',
                            }}
                          >
                            {isCanceled
                              ? 'Cancelado'
                              : pay.isOverdue
                              ? '⚠️ Vencido'
                              : isPaid
                              ? '✓ Quitado'
                              : isPartial
                              ? `⏳ Parcial (${paidPct}%)`
                              : '🕒 Pendente'}
                          </span>
                        </div>

                        {/* Linha 2: Resumo de valores em 1 linha compacta */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px',
                            background: '#f8fafc',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '0.78rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ color: '#15803d', fontWeight: 700 }}>
                              Pago: <strong>{formatCurrency(paidCents)}</strong>
                            </span>
                            {remCents > 0 && (
                              <span style={{ color: '#b45309', fontWeight: 700 }}>
                                Falta: <strong>{formatCurrency(remCents)}</strong>
                              </span>
                            )}
                          </div>
                          <span style={{ color: '#475569', fontSize: '0.75rem' }}>
                            Total: <strong style={{ color: '#0f172a' }}>{formatCurrency(netCents)}</strong>
                            {discCents > 0 && (
                              <span style={{ color: '#16a34a', marginLeft: '4px', fontWeight: 600 }}>
                                (-{formatCurrency(discCents)})
                              </span>
                            )}
                            {grossCents < 0 ? '' : ''}
                          </span>
                        </div>

                        {/* Barra fina de progresso se for parcial */}
                        {isPartial && (
                          <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ width: `${paidPct}%`, height: '100%', background: '#16a34a', borderRadius: '999px' }} />
                          </div>
                        )}

                        {/* Linha 3: Rodapé compacto com data + botão */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', color: '#64748b' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                            <PortalMethodBadge method={pay.paymentMethod} size={14} />
                            <span>• {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(pay.paidAt || pay.createdAt))}</span>
                            {txCount > 1 ? <span>• {txCount} pagamentos</span> : null}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {remCents > 0 && !isCanceled && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPortalPixModal(pay);
                                }}
                                style={{
                                  fontSize: '0.73rem',
                                  fontWeight: 700,
                                  padding: '4px 12px',
                                  borderRadius: '999px',
                                  background: '#16a34a',
                                  color: '#ffffff',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                                }}
                              >
                                <QrCode size={12} /> Pagar com PIX
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPortalReceiptModal(pay);
                              }}
                              style={{
                                fontSize: '0.73rem',
                                fontWeight: 700,
                                padding: '4px 10px',
                                borderRadius: '999px',
                                background: '#1a3a4a',
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Receipt size={12} /> Detalhes / PDF
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================= ABA 4: MEU PERFIL (EDITAR DADOS) ================= */}
        {activeTab === 'perfil' && (
          <section className="client-card-block">
            <div className="client-block-header">
              <div>
                <h3>Meu Perfil Cadastral</h3>
                <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                  Mantenha suas informações pessoais e de emergência atualizadas para o seu atendimento
                </p>
              </div>
            </div>

            {/* Atalho: Ficha de Anamnese (salva direto no prontuário) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                background: data.anamnese?.isCompleted ? '#f0fdf4' : '#fffbeb',
                border: data.anamnese?.isCompleted ? '1px solid #86efac' : '1px solid #e0c89c',
                borderRadius: '14px',
                padding: '14px 16px',
                marginTop: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {data.anamnese?.isCompleted ? (
                  <CheckCircle2 size={22} color="#16a34a" />
                ) : (
                  <ClipboardList size={22} color="#b45309" />
                )}
                <div>
                  <strong style={{ fontSize: '0.92rem', color: '#1e293b', display: 'block' }}>
                    Ficha de Anamnese {data.anamnese?.isCompleted ? '(preenchida)' : '(pendente)'}
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Ao salvar, ela fica registrada no seu prontuário com a profissional.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('anamnese')}
                style={{
                  background: '#1a3a4a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '50px',
                  padding: '9px 18px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {data.anamnese?.isCompleted ? 'Ver / Atualizar Anamnese' : 'Preencher Anamnese'}
              </button>
            </div>

            {/* Notificações Push do Aparelho (PWA / Web) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                background: pushStatus.permission ? '#f0fdf4' : '#f8fafc',
                border: pushStatus.permission ? '1.5px solid #86efac' : '1.5px solid #cbd5e1',
                borderRadius: '16px',
                padding: '18px 20px',
                marginTop: '16px',
                marginBottom: '16px',
                boxShadow: pushStatus.permission ? '0 4px 14px rgba(22,163,74,0.08)' : '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', maxWidth: '580px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: pushStatus.permission
                      ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                      : 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                    color: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    boxShadow: pushStatus.permission
                      ? '0 4px 10px rgba(22,163,74,0.25)'
                      : '0 4px 10px rgba(13,148,136,0.25)',
                  }}
                >
                  <BellRing size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
                    <strong style={{ fontSize: '0.96rem', color: '#0f172a' }}>
                      Notificações Push (PWA & Aparelho)
                    </strong>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        padding: '3px 10px',
                        borderRadius: '20px',
                        background: pushStatus.permission ? '#dcfce7' : '#f1f5f9',
                        color: pushStatus.permission ? '#15803d' : '#64748b',
                        border: pushStatus.permission ? '1px solid #86efac' : '1px solid #e2e8f0',
                      }}
                    >
                      {pushStatus.permission ? '✓ Ativada' : 'Não ativada'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.82rem', color: '#475569', display: 'block', lineHeight: 1.45 }}>
                    {pushStatus.permission
                      ? 'Notificações ativadas! Seu aparelho está autorizado a receber avisos de confirmação e lembretes da clínica na tela.'
                      : 'Receba lembretes de consultas e avisos de confirmação direto na tela do seu celular ou computador.'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {pushStatus.permission ? (
                  <button
                    type="button"
                    onClick={handleEnablePush}
                    disabled={pushLoading}
                    style={{
                      background: '#ffffff',
                      color: '#15803d',
                      border: '1.5px solid #86efac',
                      borderRadius: '50px',
                      padding: '9px 18px',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: pushLoading ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(22,163,74,0.1)',
                    }}
                  >
                    <Bell size={16} />
                    {pushLoading ? 'Enviando...' : 'Testar Notificação'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEnablePush}
                    disabled={pushLoading}
                    style={{
                      background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '50px',
                      padding: '10px 20px',
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      cursor: pushLoading ? 'wait' : 'pointer',
                      boxShadow: '0 4px 12px rgba(13,148,136,0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Bell size={16} />
                    {pushLoading ? 'Ativando...' : 'Ativar Notificações no Meu Aparelho'}
                  </button>
                )}
              </div>
            </div>

            {pushSuccessMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#ecfdf5',
                  color: '#065f46',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontSize: '0.88rem',
                  border: '1.5px solid #a7f3d0',
                  boxShadow: '0 2px 8px rgba(6,95,70,0.06)',
                  marginBottom: '14px',
                }}
              >
                <CheckCircle2 size={18} color="#059669" />
                <span>{pushSuccessMsg}</span>
              </div>
            )}

            {pushErrorMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#fef2f2',
                  color: '#991b1b',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontSize: '0.88rem',
                  border: '1.5px solid #fecaca',
                  marginBottom: '14px',
                }}
              >
                <AlertCircle size={18} color="#dc2626" />
                <span>{pushErrorMsg}</span>
              </div>
            )}

            {profileSuccessMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ecfdf5', color: '#065f46', padding: '12px 16px', borderRadius: '10px', fontSize: '0.9rem', marginBottom: '16px', border: '1px solid #a7f3d0' }}>
                <CheckCircle2 size={18} />
                <span>{profileSuccessMsg}</span>
              </div>
            )}

            {profileErrorMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fef2f2', color: '#991b1b', padding: '12px 16px', borderRadius: '10px', fontSize: '0.9rem', marginBottom: '16px', border: '1px solid #fecaca' }}>
                <AlertCircle size={18} />
                <span>{profileErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>
              
              {/* Seção 1: Dados Pessoais */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#245d80', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                  1. Informações Básicas
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                  
                  <label className="form-group">
                    <span className="form-label">Nome Completo *</span>
                    <input
                      className="form-input"
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      required
                    />
                  </label>

                  <label className="form-group">
                    <span className="form-label">WhatsApp / Telefone (Cadastrado)</span>
                    <input
                      className="form-input"
                      type="text"
                      value={formatPhone(data.client.phone)}
                      disabled
                      style={{ background: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
                      title="Para alterar seu telefone principal, contate a administração."
                    />
                  </label>

                  <label className="form-group">
                    <span className="form-label">E-mail</span>
                    <input
                      className="form-input"
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      placeholder="seuemail@exemplo.com"
                    />
                  </label>

                  <label className="form-group">
                    <span className="form-label">CPF</span>
                    <input
                      className="form-input"
                      type="text"
                      value={profileCpf}
                      onChange={(e) => setProfileCpf(maskCpf(e.target.value))}
                      placeholder="000.000.000-00"
                    />
                  </label>

                  <label className="form-group">
                    <span className="form-label">Data de Nascimento</span>
                    <input
                      className="form-input"
                      type="date"
                      value={profileBirthDate}
                      onChange={(e) => setProfileBirthDate(e.target.value)}
                    />
                  </label>

                  <label className="form-group">
                    <span className="form-label">Gênero</span>
                    <select
                      className="form-input"
                      value={profileGender}
                      onChange={(e) => setProfileGender(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      <option value="Feminino">Feminino</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Outro">Outro</option>
                      <option value="Prefiro não informar">Prefiro não informar</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Seção 2: Contato de Emergência */}
              <div style={{ marginTop: '8px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#245d80', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                  2. Contato de Emergência (Requisito de Segurança Terapêutica)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                  
                  <label className="form-group">
                    <span className="form-label">Nome do Contato</span>
                    <input
                      className="form-input"
                      type="text"
                      value={profileEmergName}
                      onChange={(e) => setProfileEmergName(e.target.value)}
                      placeholder="Ex: Maria (Esposa / Mãe)"
                    />
                  </label>

                  <label className="form-group">
                    <span className="form-label">Telefone do Contato</span>
                    <input
                      className="form-input"
                      type="tel"
                      value={profileEmergPhone}
                      onChange={(e) => setProfileEmergPhone(maskPhone(e.target.value))}
                      placeholder="(00) 00000-0000"
                    />
                  </label>

                  <label className="form-group">
                    <span className="form-label">Grau de Parentesco / Relação</span>
                    <input
                      className="form-input"
                      type="text"
                      value={profileEmergRel}
                      onChange={(e) => setProfileEmergRel(e.target.value)}
                      placeholder="Ex: Cônjuge, Pai, Amigo próximo..."
                    />
                  </label>
                </div>
              </div>

              {/* Botão Salvar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: '160px', justifyContent: 'center' }}
                >
                  <Save size={17} />
                  {savingProfile ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>

            </form>
          </section>
        )}

      </main>

      {/* ================= BARRA INFERIOR FLUTUANTE (BOTTOM NAV BAR) ================= */}
      <nav
        style={{
          position: 'fixed',
          bottom: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 28px)',
          maxWidth: '460px',
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          borderRadius: '24px',
          padding: '6px 10px',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.04)',
          zIndex: 50,
        }}
      >
        {/* Botão 1: Início */}
        <button
          onClick={() => setActiveTab('inicio')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            background: 'none',
            border: 'none',
            padding: '6px 10px',
            cursor: 'pointer',
            color: activeTab === 'inicio' ? '#1a3a4a' : '#94a3b8',
            transition: 'all 0.2s ease',
          }}
        >
          <Sparkles size={20} strokeWidth={activeTab === 'inicio' ? 2.5 : 1.8} />
          <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'inicio' ? 700 : 500 }}>
            Início
          </span>
        </button>

        {/* Botão 2: Sessões */}
        <button
          onClick={() => setActiveTab('agendamentos')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            background: 'none',
            border: 'none',
            padding: '6px 10px',
            cursor: 'pointer',
            position: 'relative',
            color: activeTab === 'agendamentos' ? '#245d80' : '#94a3b8',
            transition: 'all 0.2s ease',
          }}
        >
          <CalendarDays size={20} strokeWidth={activeTab === 'agendamentos' ? 2.5 : 1.8} />
          <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'agendamentos' ? 700 : 500 }}>
            Sessões
          </span>
          {data.appointments.length > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '2px',
                right: '12px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#245d80',
              }}
            />
          )}
        </button>

        {/* Botão 3: Agendar (Destaque Central) */}
        <Link
          href="/agendar?from=cliente"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1a3a4a 0%, #0f2430 100%)',
            color: '#ffffff',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 6px 16px rgba(26, 58, 74, 0.40)',
            textDecoration: 'none',
            marginTop: '-14px',
            border: '3px solid #ffffff',
          }}
          title="Agendar nova sessão"
        >
          <PlusCircle size={22} />
        </Link>

        {/* Botão 4: Financeiro */}
        <button
          onClick={() => setActiveTab('pagamentos')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            background: 'none',
            border: 'none',
            padding: '6px 10px',
            cursor: 'pointer',
            color: activeTab === 'pagamentos' ? '#245d80' : '#94a3b8',
            transition: 'all 0.2s ease',
          }}
        >
          <CreditCard size={20} strokeWidth={activeTab === 'pagamentos' ? 2.5 : 1.8} />
          <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'pagamentos' ? 700 : 500 }}>
            Faturas
          </span>
        </button>

        {/* Botão 5: Perfil */}
        <button
          onClick={() => setActiveTab('perfil')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            background: 'none',
            border: 'none',
            padding: '6px 10px',
            cursor: 'pointer',
            color: activeTab === 'perfil' ? '#245d80' : '#94a3b8',
            transition: 'all 0.2s ease',
          }}
        >
          <User size={20} strokeWidth={activeTab === 'perfil' ? 2.5 : 1.8} />
          <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'perfil' ? 700 : 500 }}>
            Perfil
          </span>
        </button>
      </nav>

      {/* ================= MODAL DE COMPROVANTE / PDF NO PORTAL DO CLIENTE ================= */}
      {portalReceiptModal && (() => {
        const netCents = portalReceiptModal.amountCents;
        const discCents = portalReceiptModal.discountCents ?? 0;
        const grossCents = portalReceiptModal.grossAmountCents ?? netCents + discCents;
        const paidCents = portalReceiptModal.paidAmountCents ?? (portalReceiptModal.status === 'pago' ? netCents : 0);
        const remCents =
          portalReceiptModal.remainingAmountCents ??
          (portalReceiptModal.status === 'pendente' || portalReceiptModal.status === 'parcial'
            ? Math.max(0, netCents - paidCents)
            : 0);
        const isPartialReceipt = portalReceiptModal.status === 'parcial' || (paidCents > 0 && remCents > 0);
        const isPendingReceipt = paidCents === 0 && remCents > 0;

        const fmtMethod = (m: string) =>
          m === 'pix'
            ? 'PIX'
            : m === 'cartao' || m.startsWith('cartao')
            ? 'Cartão'
            : m === 'dinheiro'
            ? 'Dinheiro'
            : m.toUpperCase();

        const sortedTxs = [...(portalReceiptModal.transactions || [])].sort(
          (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
        );
        const txSum = sortedTxs.reduce((acc, t) => acc + (t.amountCents || 0), 0);
        const missingInit = Math.max(0, paidCents - txSum);

        const itemizedList: Array<{ label: string; method: string; dateStr: string; amountCents: number }> = [];
        if (missingInit > 0) {
          itemizedList.push({
            label: sortedTxs.length > 0 ? 'Entrada / Pagamento Inicial' : isPartialReceipt ? 'Pagamento Parcial / Entrada' : 'Pagamento Recebido',
            method: fmtMethod(portalReceiptModal.paymentMethod),
            dateStr: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
              new Date(portalReceiptModal.createdAt || portalReceiptModal.paidAt || new Date().toISOString())
            ),
            amountCents: missingInit,
          });
        }
        sortedTxs.forEach((tx, idx) => {
          const stepNum = itemizedList.length + 1;
          const rawClean = (tx.notes || '').trim();
          const isGeneric =
            !rawClean ||
            rawClean === 'Entrada / Pagamento parcial registrado' ||
            rawClean === 'Baixa parcial de saldo' ||
            rawClean === 'Quitação total de saldo' ||
            rawClean === 'Pagamento à vista liquidado' ||
            rawClean === 'Pagamento registrado';
          const defLabel = !isGeneric
            ? rawClean.replace(/^Entrada parcial:\s*/i, '')
            : stepNum === 1 && (isPartialReceipt || sortedTxs.length > 1)
            ? 'Entrada Inicial'
            : idx === sortedTxs.length - 1 && remCents === 0 && sortedTxs.length > 1
            ? 'Quitação do Saldo'
            : stepNum > 1
            ? `${stepNum}º Pagamento Parcial`
            : isPartialReceipt
            ? 'Entrada Inicial'
            : 'Pagamento Integral';
          itemizedList.push({
            label: defLabel,
            method: fmtMethod(tx.paymentMethod),
            dateStr: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
              new Date(tx.paidAt)
            ),
            amountCents: tx.amountCents,
          });
        });

        const statusLabel = isPartialReceipt
          ? 'Pagamento Parcial (Com Saldo em Aberto)'
          : isPendingReceipt
          ? 'Pendente / Em Aberto'
          : itemizedList.length > 1
          ? `Quitado Integralmente (${itemizedList.length} pagamentos realizados)`
          : 'Quitado Integralmente (À Vista)';

        return (
          <div
            onClick={() => setPortalReceiptModal(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.55)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 120,
              padding: '12px',
            }}
          >
            <div
              id="printable-portal-receipt"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: '18px',
                maxWidth: '410px',
                width: '100%',
                maxHeight: '88vh',
                overflowY: 'auto',
                padding: '18px',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
                position: 'relative',
              }}
            >
              <button
                type="button"
                className="no-print-portal"
                onClick={() => setPortalReceiptModal(null)}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                <X size={15} />
              </button>

              <div style={{ textAlign: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#1a3a4a', margin: 0 }}>Camila Machado</h2>
                <span style={{ fontSize: '0.68rem', color: '#b8892a', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  Hipnose Clínica Multidimensional Integrativa
                </span>
              </div>

              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                  {isPartialReceipt
                    ? 'Comprovante de Pagamento Parcial'
                    : isPendingReceipt
                    ? 'Demonstrativo de Cobrança'
                    : 'Comprovante de Pagamento'}
                </span>
                <strong style={{ display: 'block', fontSize: '1.4rem', color: '#1a3a4a', marginTop: '2px' }}>
                  {formatCurrency(paidCents > 0 ? paidCents : netCents)}
                </strong>
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    padding: '2px 10px',
                    borderRadius: '999px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    background: isPartialReceipt ? '#fef3c7' : isPendingReceipt ? '#ffedd5' : '#dcfce7',
                    color: isPartialReceipt ? '#92400e' : isPendingReceipt ? '#c2410c' : '#166534',
                  }}
                >
                  {isPartialReceipt
                    ? `⏳ Pago Parcialmente • Falta ${formatCurrency(remCents)}`
                    : isPendingReceipt
                    ? '🕒 Aguardando Pagamento'
                    : '✓ Pagamento Quitado'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', color: '#334155', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ color: '#64748b' }}>Cliente:</span>
                  <strong style={{ textAlign: 'right' }}>{data.client.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ color: '#64748b' }}>Serviço:</span>
                  <strong style={{ textAlign: 'right' }}>{portalReceiptModal.description}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ color: '#64748b' }}>Situação:</span>
                  <strong style={{ color: isPartialReceipt ? '#b45309' : '#0f172a', textAlign: 'right' }}>{statusLabel}</strong>
                </div>

                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {discCents > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                        <span>Valor Original:</span>
                        <span style={{ textDecoration: 'line-through' }}>{formatCurrency(grossCents)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', fontWeight: 600 }}>
                        <span>Desconto Aplicado:</span>
                        <span>- {formatCurrency(discCents)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0f172a' }}>
                    <span>Valor Total da Fatura:</span>
                    <strong>{formatCurrency(netCents)}</strong>
                  </div>
                </div>

                {itemizedList.length > 0 && (
                  <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                      Pagamentos Realizados ({itemizedList.length})
                    </span>
                    {itemizedList.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderLeft: '3px solid #16a34a',
                          borderRadius: '8px',
                          padding: '6px 8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '0.75rem', color: '#0f172a', display: 'block' }}>
                            {itemizedList.length > 1 ? `${idx + 1}º • ` : ''}{item.label}
                          </strong>
                          <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                            <PortalMethodBadge method={item.method} size={13} />
                            <span>• {item.dateStr}</span>
                          </span>
                        </div>
                        <strong style={{ fontSize: '0.8rem', color: '#059669', whiteSpace: 'nowrap' }}>
                          {formatCurrency(item.amountCents)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '2px', display: 'grid', gridTemplateColumns: remCents > 0 ? '1fr 1fr' : '1fr', gap: '6px' }}>
                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '6px 8px', borderRadius: '8px' }}>
                    <span style={{ display: 'block', fontSize: '0.66rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                      ✓ Total Pago
                    </span>
                    <strong style={{ fontSize: '0.88rem', color: '#059669' }}>{formatCurrency(paidCents)}</strong>
                  </div>
                  {remCents > 0 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', padding: '6px 8px', borderRadius: '8px' }}>
                      <span style={{ display: 'block', fontSize: '0.66rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>
                        ⏳ Falta Pagar
                      </span>
                      <strong style={{ fontSize: '0.88rem', color: '#b45309' }}>{formatCurrency(remCents)}</strong>
                    </div>
                  )}
                </div>
              </div>

              <style>{`
                @media print {
                  body * { visibility: hidden !important; }
                  #printable-portal-receipt, #printable-portal-receipt * { visibility: visible !important; }
                  #printable-portal-receipt { position: absolute !important; left: 0; top: 0; width: 100% !important; max-width: 100% !important; max-height: none !important; overflow: visible !important; box-shadow: none !important; }
                  .no-print-portal, .no-print-portal * { display: none !important; }
                }
              `}</style>
              {remCents > 0 && portalReceiptModal.status !== 'cancelado' && (
                <div
                  className="no-print-portal"
                  style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    border: '1.5px solid #86efac',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    marginBottom: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                      💳 Quitar Fatura Online
                    </span>
                    <strong style={{ fontSize: '0.9rem', color: '#15803d' }}>
                      {formatCurrency(remCents)}
                    </strong>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const pay = portalReceiptModal;
                      setPortalReceiptModal(null);
                      setPortalPixModal(pay);
                    }}
                    style={{
                      width: '100%',
                      padding: '11px 16px',
                      borderRadius: '12px',
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                    }}
                  >
                    <QrCode size={16} />
                    Pagar com PIX (QR Code & Copia e Cola)
                  </button>
                </div>
              )}

              <div className="no-print-portal" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setPortalReceiptModal(null)}
                  style={{
                    background: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    borderRadius: '999px',
                    padding: '8px 16px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    background: '#1a3a4a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '8px 16px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Download size={14} /> Imprimir / PDF
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= MODAL DE CHECKOUT PIX ================= */}
      {portalPixModal && (() => {
        const netCents = portalPixModal.amountCents;
        const paidCents = portalPixModal.paidAmountCents ?? (portalPixModal.status === 'pago' ? netCents : 0);
        const remCents =
          portalPixModal.remainingAmountCents ??
          (portalPixModal.status === 'pendente' || portalPixModal.status === 'parcial'
            ? Math.max(0, netCents - paidCents)
            : 0);
        const amountReais = remCents / 100;
        const currentPix = data.pixConfig || CLINIC_PIX_CONFIG;
        const pixPayload = generatePixCopiaECola({
          key: currentPix.key,
          keyType: currentPix.keyType,
          name: currentPix.recipientName,
          city: currentPix.city,
          amount: amountReais,
          txid: '***',
        });
        const qrCodeUrl = getPixQrCodeImageUrl(pixPayload, 260);

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              background: 'rgba(15, 23, 42, 0.72)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !portalPayLoading) {
                setPortalPixModal(null);
              }
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: '24px',
                width: '100%',
                maxWidth: '460px',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Header do Modal */}
              <div
                style={{
                  padding: '18px 20px 14px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
                  borderRadius: '24px 24px 0 0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '12px',
                      background: '#dcfce7',
                      color: '#16a34a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <QrCode size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                      Pagamento via PIX
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b' }}>
                      QR Code e PIX Copia e Cola
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={portalPayLoading}
                  onClick={() => setPortalPixModal(null)}
                  style={{
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '999px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Corpo do Modal */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Card de Valor */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ minWidth: 0, paddingRight: '10px' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      Atendimento
                    </span>
                    <strong style={{ display: 'block', fontSize: '0.84rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {portalPixModal.description || 'Atendimento Clínico'}
                    </strong>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>
                      Valor a Pagar
                    </span>
                    <strong style={{ display: 'block', fontSize: '1.25rem', color: '#15803d', fontWeight: 900 }}>
                      {formatCurrency(remCents)}
                    </strong>
                  </div>
                </div>

                {/* QR Code */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '14px',
                    background: '#ffffff',
                    border: '2px dashed #bbf7d0',
                    borderRadius: '18px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      padding: '8px',
                      background: '#ffffff',
                      borderRadius: '12px',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <img
                      src={qrCodeUrl}
                      alt="QR Code PIX"
                      width={190}
                      height={190}
                      style={{ display: 'block', borderRadius: '6px' }}
                    />
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: '0.74rem', fontWeight: 600, color: '#475569' }}>
                    Abra o app do seu banco e aponte a câmera para o QR Code
                  </p>
                </div>

                {/* Código PIX Copia e Cola */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                      PIX Copia e Cola
                    </span>
                    {pixCopied && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Check size={12} /> Código copiado!
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '8px 10px',
                      fontSize: '0.68rem',
                      fontFamily: 'monospace',
                      color: '#334155',
                      maxHeight: '40px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      userSelect: 'all',
                    }}
                  >
                    {pixPayload}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pixPayload);
                        setPixCopied(true);
                        setTimeout(() => setPixCopied(false), 3000);
                      } catch {
                        // fallback
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      background: pixCopied ? '#15803d' : '#f1f5f9',
                      color: pixCopied ? '#ffffff' : '#1e293b',
                      border: pixCopied ? '1px solid #15803d' : '1px solid #cbd5e1',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {pixCopied ? <Check size={14} /> : <Copy size={14} />}
                    {pixCopied ? 'Código Copiado com Sucesso!' : 'Copiar Código PIX'}
                  </button>
                </div>

                {/* Dados da Chave PIX (Opção Alternativa) */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    fontSize: '0.73rem',
                  }}
                >
                  <div>
                    <span style={{ display: 'block', color: '#64748b' }}>
                      Chave PIX: <strong style={{ color: '#0f172a' }}>{currentPix.keyDisplay || currentPix.key}</strong> ({currentPix.keyType})
                    </span>
                    <span style={{ display: 'block', color: '#64748b' }}>
                      Favorecida: <strong style={{ color: '#0f172a' }}>{currentPix.recipientName}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(currentPix.key);
                        setPixKeyCopied(true);
                        setTimeout(() => setPixKeyCopied(false), 3000);
                      } catch {
                        // fallback
                      }
                    }}
                    style={{
                      flexShrink: 0,
                      padding: '5px 9px',
                      borderRadius: '8px',
                      background: pixKeyCopied ? '#15803d' : '#ffffff',
                      color: pixKeyCopied ? '#ffffff' : '#334155',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {pixKeyCopied ? 'Copiada!' : 'Copiar Chave'}
                  </button>
                </div>

                {/* Bloco de Envio do Comprovante via WhatsApp */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    border: '1.5px solid #86efac',
                    borderRadius: '16px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534', lineHeight: 1.4 }}>
                    <strong>Após pagar no banco:</strong> Clique no botão abaixo para enviar o comprovante no WhatsApp. O sistema identificará o pagamento e enviará a confirmação.
                  </p>

                  <button
                    type="button"
                    disabled={portalPayLoading}
                    onClick={() => handleSendComprovanteWhatsappAndConfirm(portalPixModal)}
                    style={{
                      width: '100%',
                      padding: '13px 18px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      cursor: portalPayLoading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
                      opacity: portalPayLoading ? 0.7 : 1,
                    }}
                  >
                    <WhatsappIcon size={18} color="#ffffff" />
                    {portalPayLoading ? 'Identificando pagamento...' : 'Enviar Comprovante no WhatsApp'}
                  </button>
                </div>
              </div>

              {/* Rodapé do Modal */}
              <div
                style={{
                  padding: '10px 20px 14px',
                  borderTop: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <button
                  type="button"
                  disabled={portalPayLoading}
                  onClick={() => setPortalPixModal(null)}
                  style={{
                    background: '#f1f5f9',
                    color: '#64748b',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '8px 20px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Pagar mais tarde / Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= MODAL DE DETALHES DO AGENDAMENTO ================= */}
      {selectedAptModal && (() => {
        const durMin = getAppointmentDurationMinutes(selectedAptModal.startAt, selectedAptModal.endAt);
        const durLabel = formatDurationLabel(durMin);
        const dateFull = formatFullDate(selectedAptModal.startAt);
        const timeRange = formatTimeRange(selectedAptModal.startAt, selectedAptModal.endAt);
        const gCalUrl = getGoogleCalendarUrl(selectedAptModal);
        const waUrl = getAppointmentWhatsAppUrl(selectedAptModal);
        const isPresencial = selectedAptModal.modality !== 'online';

        const linkedPackage = selectedAptModal.clientPackageId
          ? (data.packages || []).find((p) => p.id === selectedAptModal.clientPackageId)
          : (data.packages || []).find((p) => selectedAptModal.serviceId && p.serviceId === selectedAptModal.serviceId);

        return (
          <div
            onClick={() => setSelectedAptModal(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(5px)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 130,
              padding: '16px',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: '22px',
                maxWidth: '490px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '24px',
                boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.35)',
                position: 'relative',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Botão Fechar X */}
              <button
                type="button"
                onClick={() => setSelectedAptModal(null)}
                aria-label="Fechar"
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                  transition: 'background 0.2s',
                }}
              >
                <X size={18} />
              </button>

              {/* Topo: Ícone + Título do Serviço + Badges */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', paddingRight: '36px' }}>
                <div
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '16px',
                    background: isPresencial
                      ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
                      : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                    color: isPresencial ? '#b45309' : '#1d4ed8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: isPresencial
                      ? '0 4px 12px rgba(245, 158, 11, 0.2)'
                      : '0 4px 12px rgba(37, 99, 235, 0.2)',
                  }}
                >
                  {isPresencial ? <CalendarDays size={26} /> : <Monitor size={26} />}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span className={`status-pill status-${selectedAptModal.status}`}>
                      {selectedAptModal.status === 'confirmado' && '✓ Confirmado'}
                      {selectedAptModal.status === 'solicitado' && '⏳ Aguardando Confirmação'}
                      {selectedAptModal.status === 'concluido' && '✓ Concluído'}
                      {selectedAptModal.status === 'cancelado' && '✕ Cancelado'}
                      {selectedAptModal.status === 'nao_compareceu' && 'Não Compareceu'}
                      {selectedAptModal.status === 'em_atendimento' && 'Em Atendimento'}
                    </span>

                    {selectedAptModal.sessionNumber && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: '#fdf4e7',
                          border: '1px solid #fde68a',
                          color: '#92400e',
                        }}
                      >
                        Sessão {selectedAptModal.sessionNumber} do Pacote
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.3 }}>
                    {selectedAptModal.serviceName}
                  </h3>
                </div>
              </div>

              {/* Bloco 1: Data, Horário e Duração */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2563eb',
                      flexShrink: 0,
                    }}
                  >
                    <CalendarDays size={19} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
                      Data do Atendimento
                    </span>
                    <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a' }}>
                      {dateFull}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0891b2',
                      flexShrink: 0,
                    }}
                  >
                    <Clock3 size={19} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
                      Horário e Duração
                    </span>
                    <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a' }}>
                      {timeRange}{' '}
                      <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 500 }}>
                        ({durLabel} de duração)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloco 2: Modalidade & Local / Sala Online */}
              <div
                style={{
                  background: isPresencial ? '#fffdf7' : '#f0f9ff',
                  border: isPresencial ? '1px solid #fed7aa' : '1px solid #bae6fd',
                  borderRadius: '16px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  {isPresencial ? <MapPin size={17} color="#ea580c" /> : <Monitor size={17} color="#0284c7" />}
                  <strong style={{ fontSize: '0.88rem', color: isPresencial ? '#9a3412' : '#0369a1' }}>
                    {isPresencial ? 'Atendimento Presencial' : 'Atendimento Online (Teleatendimento)'}
                  </strong>
                </div>

                <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.45 }}>
                  {isPresencial ? (
                    <>
                      <strong>Local:</strong> Espaço Camila Machado — Urussanga / SC.<br />
                      <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                        Recomendamos chegar com 5 a 10 minutos de antecedência para sua recepção acolhedora e tranquila.
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>Plataforma:</strong> Sala Virtual Segura.<br />
                      <span style={{ color: '#0369a1', fontSize: '0.76rem' }}>
                        O link da videochamada é enviado via WhatsApp e liberado aqui antes do início da sessão. Utilize fones de ouvido para melhor imersão.
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Bloco 3: Profissional Responsável */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      background: '#e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#475569',
                      flexShrink: 0,
                    }}
                  >
                    <User size={17} />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.85rem', color: '#0f172a', display: 'block' }}>
                      Camila Machado
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Terapeuta Integrativa • CRT-SBHP/SC 805
                    </span>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: '#059669',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  Profissional Titular
                </span>
              </div>

              {/* Bloco 4: Pacote Vinculado (se houver) */}
              {linkedPackage && (
                <div
                  style={{
                    background: '#fefcf8',
                    border: '1px solid #fed7aa',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.68rem', color: '#9a3412', fontWeight: 700, textTransform: 'uppercase' }}>
                      Pacote Vinculado
                    </span>
                    <strong style={{ display: 'block', fontSize: '0.85rem', color: '#1a3a4a' }}>
                      {linkedPackage.packageName}
                    </strong>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const pkgToOpen = linkedPackage;
                      setSelectedAptModal(null);
                      setSelectedPkgModal(pkgToOpen);
                    }}
                    style={{
                      background: '#fffdf5',
                      border: '1px solid #f9e2b8',
                      color: '#b8892a',
                      borderRadius: '999px',
                      padding: '4px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Ver Pacote →
                  </button>
                </div>
              )}

              {/* Botões de Ação */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <a
                    href={gCalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                      padding: '9px 12px',
                      borderRadius: '12px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                      textAlign: 'center',
                    }}
                  >
                    <CalendarPlus size={16} />
                    Google Agenda
                  </a>

                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: '#f0fdf4',
                      color: '#15803d',
                      border: '1px solid #bbf7d0',
                      padding: '9px 12px',
                      borderRadius: '12px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                      textAlign: 'center',
                    }}
                  >
                    <WhatsappIcon size={17} />
                    WhatsApp
                  </a>
                </div>

                {(selectedAptModal.status === 'confirmado' || selectedAptModal.status === 'solicitado') && (
                  <button
                    type="button"
                    disabled={cancelingAptId === selectedAptModal.id}
                    onClick={async () => {
                      const aptId = selectedAptModal.id;
                      const aptName = selectedAptModal.serviceName;
                      await handleClientCancelAppointment(aptId, aptName);
                    }}
                    style={{
                      background: '#ffffff',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      padding: '8px 14px',
                      borderRadius: '12px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {cancelingAptId === selectedAptModal.id ? 'Cancelando...' : 'Cancelar este agendamento'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedAptModal(null)}
                  style={{
                    background: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= MODAL DE DETALHES DO PACOTE ================= */}
      {selectedPkgModal && (() => {
        const pkg = selectedPkgModal;
        const isSequential = pkg.bookingMode === 'sequencial';
        const remainingToSchedule = pkg.remainingToSchedule ?? Math.max(0, pkg.totalSessions - pkg.usedSessions);
        const completedCount = pkg.completedSessions ?? 0;
        const scheduledCount = pkg.scheduledSessions ?? (pkg.pendingSession ? 1 : 0);
        const nextSessionNumber = completedCount + scheduledCount + 1;
        const waPkgUrl = getPackageWhatsAppUrl(pkg.packageName);

        // Find all client appointments matching this package
        const pkgAppointments = (data.appointments || [])
          .filter(
            (a) =>
              (a.clientPackageId && a.clientPackageId === pkg.id) ||
              (pkg.serviceId && a.serviceId === pkg.serviceId) ||
              (pkg.pendingSession && a.id === pkg.pendingSession.id)
          )
          .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

        // Build list of all session slots from 1 to pkg.totalSessions
        const sessionSlots = Array.from({ length: pkg.totalSessions }, (_, i) => {
          const sessionIndex = i + 1;
          const matchedApt = pkgAppointments.find(a => a.sessionNumber === sessionIndex) || pkgAppointments[i] || null;
          return {
            sessionNumber: sessionIndex,
            apt: matchedApt,
          };
        });

        return (
          <div
            onClick={() => setSelectedPkgModal(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(5px)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 130,
              padding: '16px',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: '22px',
                maxWidth: '510px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '24px',
                boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.35)',
                position: 'relative',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Botão Fechar X */}
              <button
                type="button"
                onClick={() => setSelectedPkgModal(null)}
                aria-label="Fechar"
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                  transition: 'background 0.2s',
                }}
              >
                <X size={18} />
              </button>

              {/* Cabeçalho do Pacote */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', paddingRight: '36px' }}>
                <div
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                    color: '#b45309',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)',
                  }}
                >
                  <Package size={26} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '0.67rem',
                        fontWeight: 800,
                        color: '#9a6b18',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      Pacote Ativo
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: isSequential ? '#fefce8' : '#eff6ff',
                        border: isSequential ? '1px solid #fde047' : '1px solid #bfdbfe',
                        color: isSequential ? '#854d0e' : '#1d4ed8',
                      }}
                    >
                      {isSequential ? '🔒 1 por vez (sequencial)' : '🔓 Livre'}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1a3a4a', margin: 0, lineHeight: 1.3 }}>
                    {pkg.packageName}
                  </h3>
                </div>
              </div>

              {/* Grid de 3 Contadores + Barra de Progresso */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #fdfbf7 0%, #f8fafc 100%)',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '8px 6px' }}>
                    <span style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 600, display: 'block' }}>Concluídas</span>
                    <strong style={{ fontSize: '1.15rem', color: '#15803d', fontWeight: 800 }}>{completedCount}</strong>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #fde68a', borderRadius: '12px', padding: '8px 6px' }}>
                    <span style={{ fontSize: '0.68rem', color: '#92400e', fontWeight: 600, display: 'block' }}>Agendadas</span>
                    <strong style={{ fontSize: '1.15rem', color: '#b45309', fontWeight: 800 }}>{scheduledCount}</strong>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '8px 6px' }}>
                    <span style={{ fontSize: '0.68rem', color: '#1e40af', fontWeight: 600, display: 'block' }}>Em Haver</span>
                    <strong style={{ fontSize: '1.15rem', color: '#1d4ed8', fontWeight: 800 }}>{remainingToSchedule}</strong>
                  </div>
                </div>

                <div style={{ width: '100%', height: '7px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.round((completedCount / pkg.totalSessions) * 100))}%`,
                      background: '#10b981',
                      height: '100%',
                    }}
                  />
                  <div
                    style={{
                      width: `${Math.min(100, Math.round((scheduledCount / pkg.totalSessions) * 100))}%`,
                      background: '#f59e0b',
                      height: '100%',
                    }}
                  />
                </div>
              </div>

              {/* Explicação da Regra Sequencial */}
              {isSequential && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                  }}
                >
                  <Info size={17} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.78rem', color: '#92400e', lineHeight: 1.45 }}>
                    <strong>Como funciona o agendamento sequencial:</strong><br />
                    Para assegurar a evolução adequada e o tempo de assimilação terapêutica entre as sessões, cada nova consulta fica liberada para agendamento logo após a realização e conclusão da sessão agendada.
                  </div>
                </div>
              )}

              {/* Cronograma das Sessões do Pacote */}
              <div>
                <h4 style={{ fontSize: '0.84rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                  Cronograma das Sessões ({pkg.totalSessions} no total)
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sessionSlots.map(({ sessionNumber, apt }) => {
                    if (apt) {
                      const durMin = getAppointmentDurationMinutes(apt.startAt, apt.endAt);
                      const durLabel = formatDurationLabel(durMin);
                      const dateFull = formatFullDate(apt.startAt);
                      const timeRange = formatTimeRange(apt.startAt, apt.endAt);
                      const isOnline = apt.modality === 'online';

                      return (
                        <div
                          key={apt.id || sessionNumber}
                          onClick={() => {
                            setSelectedPkgModal(null);
                            setSelectedAptModal(apt);
                          }}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 12px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            gap: '10px',
                            flexWrap: 'wrap',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: apt.status === 'concluido' ? '#dcfce7' : '#fef3c7',
                                color: apt.status === 'concluido' ? '#15803d' : '#b45309',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.74rem',
                                fontWeight: 800,
                              }}
                            >
                              {sessionNumber}ª
                            </div>
                            <div>
                              <strong style={{ fontSize: '0.84rem', color: '#0f172a', display: 'block' }}>
                                {dateFull}
                              </strong>
                              <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                                {timeRange} ({durLabel}) • {isOnline ? 'Online' : 'Presencial'}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className={`status-pill status-${apt.status}`}>
                              {apt.status === 'confirmado' && 'Confirmado'}
                              {apt.status === 'solicitado' && 'Solicitado'}
                              {apt.status === 'concluido' && 'Concluído'}
                              {apt.status === 'cancelado' && 'Cancelado'}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>
                              Ver <ChevronRight size={12} />
                            </span>
                          </div>
                        </div>
                      );
                    }

                    // Se não tiver agendamento para esta sessão
                    const isNextToSchedule = sessionNumber === nextSessionNumber;
                    const canScheduleNow = isNextToSchedule && (!isSequential || !pkg.pendingSession);

                    return (
                      <div
                        key={sessionNumber}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          background: canScheduleNow ? '#f0fdf4' : '#fafafa',
                          border: canScheduleNow ? '1px dashed #86efac' : '1px dashed #e2e8f0',
                          borderRadius: '12px',
                          gap: '10px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: canScheduleNow ? '#dcfce7' : '#f1f5f9',
                              color: canScheduleNow ? '#15803d' : '#94a3b8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.74rem',
                              fontWeight: 800,
                            }}
                          >
                            {sessionNumber}ª
                          </div>
                          <div>
                            <strong style={{ fontSize: '0.84rem', color: canScheduleNow ? '#15803d' : '#64748b', display: 'block' }}>
                              {canScheduleNow ? 'Sessão liberada para agendamento!' : `Sessão ${sessionNumber} em haver`}
                            </strong>
                            <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>
                              {canScheduleNow
                                ? 'Você já pode escolher o seu próximo horário'
                                : isSequential
                                ? 'Ficará disponível após concluir a sessão anterior'
                                : 'Aguardando agendamento'}
                            </span>
                          </div>
                        </div>

                        {canScheduleNow && (
                          <Link
                            href={`/agendar?from=cliente&packageId=${pkg.id}${pkg.serviceId ? `&serviceId=${pkg.serviceId}` : ''}`}
                            onClick={() => setSelectedPkgModal(null)}
                            style={{
                              background: '#15803d',
                              color: '#ffffff',
                              padding: '5px 12px',
                              borderRadius: '999px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              textDecoration: 'none',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Agendar agora
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Botões do Rodapé do Modal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <a
                  href={waPkgUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: '#f0fdf4',
                    color: '#15803d',
                    border: '1px solid #bbf7d0',
                    padding: '9px 12px',
                    borderRadius: '12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}
                >
                  <WhatsappIcon size={17} />
                  Tirar dúvidas sobre o pacote no WhatsApp
                </a>

                <button
                  type="button"
                  onClick={() => setSelectedPkgModal(null)}
                  style={{
                    background: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pop-up Modal de Ativação de Notificações Push */}
      {showPushModal && !pushStatus.permission && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={handleDismissPushModal}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              padding: '28px 24px',
              maxWidth: '430px',
              width: '100%',
              boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.25)',
              border: '1.5px solid #e2e8f0',
              position: 'relative',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleDismissPushModal}
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
                color: '#64748b',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>

            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #0d9488 0%, #115e59 100%)',
                color: '#ffffff',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 16px auto',
                boxShadow: '0 8px 20px rgba(13, 148, 136, 0.35)',
              }}
            >
              <BellRing size={32} />
            </div>

            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: '#0f172a',
                marginBottom: '8px',
              }}
            >
              Lembretes de Consultas
            </h3>

            <p
              style={{
                fontSize: '0.9rem',
                color: '#475569',
                lineHeight: 1.55,
                marginBottom: '24px',
              }}
            >
              Deseja ativar as notificações para receber avisos sobre seu horário, confirmações de atendimento e recados da terapeuta Camila direto na tela do seu aparelho?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={pushLoading}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: pushLoading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(13, 148, 136, 0.35)',
                }}
              >
                <Bell size={18} />
                {pushLoading ? 'Ativando...' : 'Ativar Notificações Agora'}
              </button>

              <button
                type="button"
                onClick={handleDismissPushModal}
                style={{
                  width: '100%',
                  padding: '11px 20px',
                  borderRadius: '14px',
                  background: 'transparent',
                  color: '#64748b',
                  border: '1px solid transparent',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Educativo: Adicionar à Tela de Início no iPhone (iOS Safari) */}
      {showIosPwaModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowIosPwaModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              padding: '26px 22px',
              maxWidth: '430px',
              width: '100%',
              boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.3)',
              border: '1.5px solid #cbd5e1',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowIosPwaModal(false)}
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
                color: '#64748b',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 12px auto',
                  boxShadow: '0 6px 16px rgba(2, 132, 199, 0.3)',
                }}
              >
                <Smartphone size={28} />
              </div>
              <h3 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                Ativar no seu iPhone (iOS)
              </h3>
              <p style={{ fontSize: '0.84rem', color: '#64748b', margin: 0, lineHeight: 1.45 }}>
                A Apple exige que aplicativos no iPhone sejam adicionados à Tela de Início para poder enviar notificações de lembrete:
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: '#e0f2fe',
                    color: '#0284c7',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div>
                  <strong style={{ fontSize: '0.88rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Toque em Compartilhar <Share2 size={16} color="#0284c7" />
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4, display: 'block', marginTop: '2px' }}>
                    No Safari, clique no botão de compartilhar (ícone com quadrado e seta para cima na barra inferior).
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: '#e0f2fe',
                    color: '#0284c7',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div>
                  <strong style={{ fontSize: '0.88rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Adicionar à Tela de Início <PlusSquare size={16} color="#0284c7" />
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4, display: 'block', marginTop: '2px' }}>
                    Role as opções para baixo e selecione <b>Adicionar à Tela de Início</b>.
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: '#dcfce7',
                    color: '#16a34a',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div>
                  <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                    Abra pelo ícone e ative
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4, display: 'block', marginTop: '2px' }}>
                    Abra o aplicativo pelo novo ícone na tela do seu iPhone. As notificações funcionarão normalmente!
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosPwaModal(false)}
              style={{
                width: '100%',
                padding: '13px 20px',
                borderRadius: '14px',
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.92rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Entendi, vou adicionar
            </button>
          </div>
        </div>
      )}

      {dialogNode}
    </div>
  );
}

function formatPhone(phoneStr: string) {
  if (!phoneStr) return '';
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phoneStr;
}

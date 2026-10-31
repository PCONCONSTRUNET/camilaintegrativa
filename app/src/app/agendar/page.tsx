'use client';

import { Fragment, FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Monitor,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import type { GroupSession, Service } from '@/lib/domain';
import { formatCurrency, maskCpf, maskPhone } from '@/lib/utils';
import { ServiceAudioPlayer } from '@/components/service-audio-player';
import { generatePixCopiaECola, getPixQrCodeImageUrl, CLINIC_PIX_CONFIG } from '@/lib/pix';

type Slot = { time: string; startAt: string };
type Step = 'servico' | 'horario' | 'dados' | 'revisao' | 'sucesso';
type GroupStep = 'turma' | 'dados' | 'revisao' | 'sucesso';
type BookingResultStatus = 'solicitado' | 'confirmado';

function clinicToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts();
  const result = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${result.year}-${result.month}-${result.day}`;
}

const STEPS: Array<{ id: Exclude<Step, 'sucesso'>; label: string }> = [
  { id: 'servico', label: 'Serviço' },
  { id: 'horario', label: 'Horário' },
  { id: 'dados', label: 'Seus dados' },
  { id: 'revisao', label: 'Revisão' },
];

const GROUP_STEPS: Array<{ id: Exclude<GroupStep, 'sucesso'>; label: string }> = [
  { id: 'turma', label: 'Sessão em Grupo' },
  { id: 'dados', label: 'Seus dados' },
  { id: 'revisao', label: 'Revisão' },
];

function AgendarContent() {
  const searchParams = useSearchParams();
  const fromCliente = searchParams.get('from') === 'cliente';
  const packageIdParam = searchParams.get('packageId') || '';
  const serviceIdParam = searchParams.get('serviceId') || '';
  const tabParam = searchParams.get('tab') || '';
  const groupSessionIdParam = searchParams.get('groupSessionId') || '';

  const [bookingMode, setBookingMode] = useState<'individual' | 'grupo'>(
    tabParam === 'grupo' || Boolean(groupSessionIdParam) ? 'grupo' : 'individual'
  );

  // Individual booking state
  const [services, setServices] = useState<Service[]>([]);
  const [step, setStep] = useState<Step>('servico');
  const [serviceId, setServiceId] = useState('');
  const [selectedTierId, setSelectedTierId] = useState('');
  const [modality, setModality] = useState<'presencial' | 'online'>('presencial');
  const [date, setDate] = useState(clinicToday());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [time, setTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [bookingStatus, setBookingStatus] = useState<BookingResultStatus | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    cpf: '',
    birthDate: '',
    email: '',
    notes: '',
    privacyAccepted: false,
  });
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'dinheiro' | 'cartao' | ''>('');
  const [copiedPix, setCopiedPix] = useState(false);
  const [copiedPixKey, setCopiedPixKey] = useState(false);
  const [activePackage, setActivePackage] = useState<{
    id: string;
    serviceId: string | null;
    packageName: string;
    totalSessions: number;
    usedSessions: number;
  } | null>(null);

  // Group session booking state
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([]);
  const [groupStep, setGroupStep] = useState<GroupStep>('turma');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groupSessionIdParam);
  const [expandedDescIds, setExpandedDescIds] = useState<Record<string, boolean>>({});

  const service = useMemo(() => services.find((item) => item.id === serviceId), [services, serviceId]);
  const selectedGroup = useMemo(
    () => groupSessions.find((g) => g.id === selectedGroupId) ?? null,
    [groupSessions, selectedGroupId]
  );

  const selectedTier = useMemo(() => {
    if (activePackage) return null;
    if (!service?.pricingTiers || service.pricingTiers.length === 0) return null;
    return service.pricingTiers.find((t) => t.id === selectedTierId) || service.pricingTiers[0];
  }, [service, selectedTierId, activePackage]);

  const currentStep = Math.max(0, STEPS.findIndex((item) => item.id === step));
  const currentGroupStep = Math.max(0, GROUP_STEPS.findIndex((item) => item.id === groupStep));

  useEffect(() => {
    Promise.all([
      fetch('/api/public/services').then((r) => r.json()).catch(() => ({ services: [] })),
      fetch('/api/group-sessions').then((r) => r.json()).catch(() => ({ sessions: [] })),
      fromCliente ? fetch('/api/client/portal').then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
    ])
      .then(([servicesBody, groupBody, portalBody]) => {
        const list: Service[] = servicesBody.services ?? [];
        const groups: GroupSession[] = groupBody.sessions ?? [];
        setServices(list);
        setGroupSessions(groups);

        if (groupSessionIdParam && groups.some((g) => g.id === groupSessionIdParam)) {
          setBookingMode('grupo');
          setSelectedGroupId(groupSessionIdParam);
        }

        if (portalBody?.client) {
          setForm((prev) => ({
            ...prev,
            name: portalBody.client.name || prev.name,
            phone: portalBody.client.phone ? maskPhone(portalBody.client.phone) : prev.phone,
            cpf: portalBody.client.cpf ? maskCpf(portalBody.client.cpf) : prev.cpf,
            birthDate: portalBody.client.birthDate || portalBody.client.birth_date || prev.birthDate,
            email: portalBody.client.email || prev.email,
            privacyAccepted: true,
          }));
        }

        if (packageIdParam && portalBody?.packages) {
          const pkg = portalBody.packages.find((p: { id: string }) => p.id === packageIdParam);
          if (pkg) {
            setActivePackage(pkg);
            const targetSvcId = pkg.serviceId || serviceIdParam || list[0]?.id || '';
            const targetSvc = list.find((s) => s.id === targetSvcId) || list[0];
            if (targetSvc) {
              setServiceId(targetSvc.id);
              setModality(targetSvc.modalities[0]);
              setStep('horario');
            }
          }
        } else if (serviceIdParam) {
          const targetSvc = list.find((s) => s.id === serviceIdParam);
          if (targetSvc) {
            setServiceId(targetSvc.id);
            setModality(targetSvc.modalities[0]);
          }
        }
      })
      .catch(() => setError('Não foi possível carregar os serviços.'))
      .finally(() => setLoading(false));
  }, [fromCliente, packageIdParam, serviceIdParam, groupSessionIdParam]);

  useEffect(() => {
    if (bookingMode !== 'individual' || !serviceId || !date || step !== 'horario') return;
    fetch(`/api/public/availability?serviceId=${serviceId}&date=${date}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setSlots(body.slots ?? []);
      })
      .catch(() => setError('Não foi possível consultar os horários.'))
      .finally(() => setLoading(false));
  }, [bookingMode, serviceId, date, step]);

  function chooseService(item: Service) {
    setServiceId(item.id);
    setModality(item.modalities[0]);
    if (item.pricingTiers && item.pricingTiers.length > 0) {
      setSelectedTierId(item.pricingTiers[0].id);
    } else {
      setSelectedTierId('');
    }
  }

  function nextFromService() {
    if (!service) return setError('Escolha um serviço.');
    if (service.pricingTiers && service.pricingTiers.length > 0 && !selectedTier) {
      return setError('Selecione uma opção ou pacote para continuar.');
    }
    setError('');
    setLoading(true);
    setTime('');
    setStep('horario');
  }

  function submitClient(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim().length < 3 || form.phone.replace(/\D/g, '').length < 10) {
      return setError('Preencha nome e WhatsApp corretamente.');
    }
    if (form.cpf.replace(/\D/g, '').length !== 11) {
      return setError('Informe um CPF válido com 11 dígitos.');
    }
    if (!form.birthDate) {
      return setError('Informe sua data de nascimento.');
    }
    setError('');
    if (bookingMode === 'grupo') {
      setGroupStep('revisao');
    } else {
      setStep('revisao');
    }
  }

  async function confirm() {
    setSubmitting(true);
    setError('');

    const formattedNotes = [
      selectedTier ? `Opção selecionada: ${selectedTier.name} (${formatCurrency(selectedTier.priceCents)})` : '',
      activePackage ? `Sessão ${activePackage.usedSessions + 1} de ${activePackage.totalSessions} do pacote ${activePackage.packageName}` : '',
      form.notes.trim()
    ].filter(Boolean).join('\n\n');

    const response = await fetch('/api/public/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId,
        tierId: selectedTier?.id || undefined,
        packageId: activePackage?.id || undefined,
        modality,
        date,
        time,
        name: form.name,
        phone: form.phone,
        cpf: form.cpf,
        birthDate: form.birthDate,
        email: form.email,
        notes: formattedNotes,
        paymentMethod: activePackage ? undefined : paymentMethod,
        privacyAccepted: form.privacyAccepted,
      }),
    });
    const body = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      setError(body.error ?? 'Não foi possível enviar o agendamento.');
      if (response.status === 409) setStep('horario');
      return;
    }
    setReference(body.appointment.id.slice(0, 8).toUpperCase());
    setBookingStatus(body.appointment.status === 'confirmado' ? 'confirmado' : 'solicitado');
    setStep('sucesso');
  }

  async function confirmGroupEnrollment() {
    if (!selectedGroup) return;
    setSubmitting(true);
    setError('');

    const response = await fetch(`/api/group-sessions/${selectedGroup.id}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone,
        cpf: form.cpf,
        birthDate: form.birthDate,
        email: form.email || null,
        notes: form.notes.trim() || null,
        paymentMethod,
      }),
    });
    const body = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      setError(body.error ?? 'Não foi possível confirmar sua vaga na sessão em grupo.');
      return;
    }
    setReference(body.reference || (body.enrollmentId ? String(body.enrollmentId).slice(0, 8).toUpperCase() : 'GRUPO'));
    setGroupStep('sucesso');
  }

  function back() {
    setError('');
    if (bookingMode === 'grupo') {
      if (groupStep === 'dados') setGroupStep('turma');
      if (groupStep === 'revisao') setGroupStep('dados');
      return;
    }
    if (step === 'horario') setStep('servico');
    if (step === 'dados') setStep('horario');
    if (step === 'revisao') setStep('dados');
  }

  if (bookingMode === 'grupo' && groupStep === 'sucesso' && selectedGroup) {
    const groupPriceReais = (selectedGroup.priceCents || 0) / 100;
    const groupPixPayload =
      paymentMethod === 'pix' && groupPriceReais > 0
        ? generatePixCopiaECola({ amount: groupPriceReais, txid: reference || 'GRUPO' })
        : null;
    const groupPixQr = groupPixPayload ? getPixQrCodeImageUrl(groupPixPayload, 220) : null;

    return (
      <main className="booking-page">
        <BookingHeader />
        <section className="booking-success">
          <div className="booking-success-head">
            <span className="success-seal"><Check size={22} /></span>
            <div>
              <span className="eyebrow">Inscrição registrada</span>
              <h1>Vaga reservada no grupo!</h1>
            </div>
          </div>
          <p className="booking-success-sub">
            Sua vaga está reservada. O pedido já entrou no sistema com status <strong>Pendente</strong>.
          </p>

          <div className="booking-success-summary">
            <div className="summary-row">
              <strong>Evento / Sessão</strong>
              <span>{selectedGroup.title}</span>
            </div>
            <div className="summary-row">
              <strong>Data e Horário</strong>
              <span>
                {selectedGroup.date.split('-').reverse().join('/')} · {selectedGroup.startTime}
                {selectedGroup.endTime ? ` às ${selectedGroup.endTime}` : ''}
              </span>
            </div>
            <div className="summary-row">
              <strong>Modalidade</strong>
              <span>
                {selectedGroup.modality === 'online' ? 'Online' : 'Presencial'}
                {selectedGroup.locationNotes ? ` (${selectedGroup.locationNotes})` : ''}
              </span>
            </div>
            {selectedGroup.priceCents != null && selectedGroup.priceCents > 0 && (
              <div className="summary-row">
                <strong>Valor</strong>
                <span style={{ fontWeight: 800, color: '#0f766e' }}>{formatCurrency(selectedGroup.priceCents)}</span>
              </div>
            )}
            <div className="summary-row">
              <strong>Status do Pagamento</strong>
              <span style={{ color: '#d97706', fontWeight: 800 }}>⏳ Pendente de Confirmação</span>
            </div>
            <div className="summary-row">
              <strong>Código do Pedido</strong>
              <span className="summary-code">#{reference}</span>
            </div>
          </div>

          {/* CARD DE PAGAMENTO PIX */}
          {groupPixPayload && groupPixQr && (
            <div
              style={{
                marginTop: '18px',
                padding: '20px',
                borderRadius: '16px',
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 800, fontSize: '0.92rem' }}>
                <QrCode size={20} /> Pague via PIX para Garantir sua Vaga
              </div>
              <p style={{ fontSize: '0.82rem', color: '#15803d', margin: 0, maxWidth: '420px', lineHeight: 1.4 }}>
                Escaneie o QR Code abaixo no app do seu banco ou use a chave PIX / Copia e Cola:
              </p>

              {/* QR Code */}
              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={groupPixQr}
                  alt="QR Code PIX"
                  width={200}
                  height={200}
                  style={{ display: 'block', borderRadius: '8px' }}
                />
              </div>

              {/* Botão Copiar Código PIX Copia e Cola */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(groupPixPayload);
                  setCopiedPix(true);
                  setTimeout(() => setCopiedPix(false), 3000);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '11px 18px',
                  borderRadius: '10px',
                  background: copiedPix ? '#15803d' : '#0f766e',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  maxWidth: '380px',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)',
                }}
              >
                {copiedPix ? <Check size={16} /> : <Copy size={16} />}
                {copiedPix ? '✓ Código PIX Copiado!' : 'Copiar Código PIX (Copia e Cola)'}
              </button>

              {/* Chave PIX Alternativa */}
              <div style={{ fontSize: '0.78rem', color: '#334155', background: '#ffffff', padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', maxWidth: '380px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><strong>Chave Celular:</strong> {CLINIC_PIX_CONFIG.keyDisplay} (Camila Machado)</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(CLINIC_PIX_CONFIG.key);
                    setCopiedPixKey(true);
                    setTimeout(() => setCopiedPixKey(false), 2500);
                  }}
                  style={{ background: 'none', border: 'none', color: '#0f766e', cursor: 'pointer', fontWeight: 800, fontSize: '0.74rem' }}
                >
                  {copiedPixKey ? '✓ Copiada' : 'Copiar'}
                </button>
              </div>

              <span style={{ fontSize: '0.74rem', color: '#166534', fontStyle: 'italic' }}>
                💡 Assim que a Camila confirmar o recebimento pelo painel, você receberá a notificação de confirmação no WhatsApp e por Push!
              </span>
            </div>
          )}

          <div className="button-row booking-success-actions">
            <Link href="/" className="btn btn-secondary">Voltar ao início</Link>
            <Link href="/cliente?tab=agendamentos" className="btn btn-primary">
              Ver meu agendamento <ChevronRight size={15} />
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (step === 'sucesso') {
    const confirmed = bookingStatus === 'confirmado';
    const indPriceCents = selectedTier?.priceCents ?? service?.priceCents ?? 0;
    const indPriceReais = indPriceCents / 100;
    const indPixPayload =
      paymentMethod === 'pix' && indPriceReais > 0
        ? generatePixCopiaECola({ amount: indPriceReais, txid: reference || 'SESSAO' })
        : null;
    const indPixQr = indPixPayload ? getPixQrCodeImageUrl(indPixPayload, 220) : null;

    return (
      <main className="booking-page">
        <BookingHeader />
        <section className="booking-success">
          <div className="booking-success-head">
            <span className="success-seal"><Check size={22} /></span>
            <div>
              <span className="eyebrow">{confirmed ? 'Agendamento confirmado' : 'Solicitação enviada'}</span>
              <h1>{confirmed ? 'Horário confirmado!' : 'Reserva recebida!'}</h1>
            </div>
          </div>
          <p className="booking-success-sub">
            {confirmed
              ? 'Seu atendimento foi confirmado. Acompanhe tudo pelo Portal do Cliente.'
              : 'Sua reserva entrou no sistema. O status atual do pagamento é Pendente.'}
          </p>

          {selectedTier && selectedTier.isPackage && selectedTier.sessionCount && selectedTier.sessionCount > 1 && (
            <div className="booking-success-package">
              <div className="booking-success-package-title">
                <Sparkles size={15} />
                <span>Pacote de {selectedTier.sessionCount} Sessões Ativado!</span>
              </div>
              <p>
                <strong>1ª sessão:</strong> {date.split('-').reverse().join('/')} às {time}. As outras{' '}
                <strong>{selectedTier.sessionCount - 1} sessões</strong> ficam disponíveis no seu portal para agendar quando preferir.
              </p>
            </div>
          )}

          <div className="booking-success-summary">
            <div className="summary-row">
              <strong>Serviço</strong>
              <span>
                {service?.name}
                {selectedTier ? ` (${selectedTier.name} · ${formatCurrency(selectedTier.priceCents)})` : ''}
              </span>
            </div>
            <div className="summary-row">
              <strong>Data e Horário</strong>
              <span>{date.split('-').reverse().join('/')} às {time} ({modality === 'online' ? 'Online' : 'Presencial'})</span>
            </div>
            {indPriceCents > 0 && (
              <div className="summary-row">
                <strong>Valor Total</strong>
                <span style={{ fontWeight: 800, color: '#0f766e' }}>{formatCurrency(indPriceCents)}</span>
              </div>
            )}
            <div className="summary-row">
              <strong>Status do Pagamento</strong>
              <span style={{ color: '#d97706', fontWeight: 800 }}>⏳ Pendente de Confirmação</span>
            </div>
            <div className="summary-row">
              <strong>Código do Agendamento</strong>
              <span className="summary-code">#{reference}</span>
            </div>
          </div>

          {/* CARD DE PAGAMENTO PIX */}
          {indPixPayload && indPixQr && (
            <div
              style={{
                marginTop: '18px',
                padding: '20px',
                borderRadius: '16px',
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 800, fontSize: '0.92rem' }}>
                <QrCode size={20} /> Pague via PIX para Confirmar o Atendimento
              </div>
              <p style={{ fontSize: '0.82rem', color: '#15803d', margin: 0, maxWidth: '420px', lineHeight: 1.4 }}>
                Escaneie o QR Code abaixo no app do seu banco ou use a chave PIX / Copia e Cola:
              </p>

              {/* QR Code */}
              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={indPixQr}
                  alt="QR Code PIX"
                  width={200}
                  height={200}
                  style={{ display: 'block', borderRadius: '8px' }}
                />
              </div>

              {/* Botão Copiar Código PIX Copia e Cola */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(indPixPayload);
                  setCopiedPix(true);
                  setTimeout(() => setCopiedPix(false), 3000);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '11px 18px',
                  borderRadius: '10px',
                  background: copiedPix ? '#15803d' : '#0f766e',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  maxWidth: '380px',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)',
                }}
              >
                {copiedPix ? <Check size={16} /> : <Copy size={16} />}
                {copiedPix ? '✓ Código PIX Copiado!' : 'Copiar Código PIX (Copia e Cola)'}
              </button>

              {/* Chave PIX Alternativa */}
              <div style={{ fontSize: '0.78rem', color: '#334155', background: '#ffffff', padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', maxWidth: '380px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><strong>Chave Celular:</strong> {CLINIC_PIX_CONFIG.keyDisplay} (Camila Machado)</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(CLINIC_PIX_CONFIG.key);
                    setCopiedPixKey(true);
                    setTimeout(() => setCopiedPixKey(false), 2500);
                  }}
                  style={{ background: 'none', border: 'none', color: '#0f766e', cursor: 'pointer', fontWeight: 800, fontSize: '0.74rem' }}
                >
                  {copiedPixKey ? '✓ Copiada' : 'Copiar'}
                </button>
              </div>

              <span style={{ fontSize: '0.74rem', color: '#166534', fontStyle: 'italic' }}>
                💡 Assim que a Camila confirmar o recebimento pelo painel, você receberá a notificação de confirmação no WhatsApp e por Push!
              </span>
            </div>
          )}

          <div className="button-row booking-success-actions">
            <Link href="/" className="btn btn-secondary">Voltar ao início</Link>
            <Link href="/cliente?tab=agendamentos" className="btn btn-primary">
              Ver meu agendamento <ChevronRight size={15} />
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="booking-page">
      <BookingHeader />
      <section className="booking-shell">
        <div className="booking-card card">
          {/* Segmented Switcher: Individual vs Sessão em Grupo */}
          {!activePackage && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
                background: '#f1f5f9',
                padding: '5px',
                borderRadius: '14px',
                marginBottom: '20px',
                border: '1px solid #e2e8f0',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setBookingMode('individual');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: bookingMode === 'individual' ? '#ffffff' : 'transparent',
                  color: bookingMode === 'individual' ? '#1a3a4a' : '#64748b',
                  boxShadow: bookingMode === 'individual' ? '0 2px 6px rgba(15,23,42,0.08)' : 'none',
                  transition: 'all 0.18s ease',
                }}
              >
                <UserRound size={15} />
                <span>Sessão Individual</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setError('');
                  setBookingMode('grupo');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: bookingMode === 'grupo' ? '#ffffff' : 'transparent',
                  color: bookingMode === 'grupo' ? '#1a3a4a' : '#64748b',
                  boxShadow: bookingMode === 'grupo' ? '0 2px 6px rgba(15,23,42,0.08)' : 'none',
                  transition: 'all 0.18s ease',
                }}
              >
                <Users size={15} />
                <span>Sessão em Grupo</span>
                {groupSessions.length > 0 && (
                  <span
                    style={{
                      padding: '1px 7px',
                      borderRadius: '999px',
                      background: bookingMode === 'grupo' ? '#1a3a4a' : '#0284c7',
                      color: '#ffffff',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                    }}
                  >
                    {groupSessions.length}
                  </span>
                )}
              </button>
            </div>
          )}

          {bookingMode === 'grupo' ? (
            <>
              <ol className="stepper">
                {GROUP_STEPS.map((item, index) => (
                  <li key={item.id} className={index === currentGroupStep ? 'active' : index < currentGroupStep ? 'done' : ''}>
                    <span>{index < currentGroupStep ? <Check size={13} /> : index + 1}</span>
                    <small>{item.label}</small>
                  </li>
                ))}
              </ol>

              {groupStep !== 'turma' && (
                <button className="back-link booking-back" onClick={back}>
                  <ArrowLeft size={15} /> Voltar
                </button>
              )}
              {error && <div className="form-alert" role="alert">{error}</div>}

              {groupStep === 'turma' && (
                <section>
                  <div className="booking-heading">
                    <span>Etapa 1 de 3</span>
                    <h2>Escolha a Sessão em Grupo</h2>
                  </div>

                  {loading ? (
                    <div className="loading-row">
                      <LoaderCircle className="spin" size={20} /> Carregando sessões em grupo…
                    </div>
                  ) : groupSessions.length === 0 ? (
                    <div className="empty-state compact" style={{ padding: '36px 20px' }}>
                      <Users size={28} />
                      <h3>Nenhuma sessão em grupo aberta no momento</h3>
                      <p>Você pode agendar uma sessão individual clicando na aba acima.</p>
                    </div>
                  ) : (
                    <div className="service-options">
                      {groupSessions.map((gs) => {
                        const isUnlimited = gs.maxParticipants === 0;
                        const spotsLeft =
                          gs.customRemainingSpots != null
                            ? Math.max(0, gs.customRemainingSpots)
                            : !isUnlimited
                            ? Math.max(0, gs.maxParticipants - (gs.currentParticipants || 0))
                            : null;
                        const isFull = spotsLeft !== null && spotsLeft <= 0;
                        const isSelected = selectedGroupId === gs.id;
                        const pct = isUnlimited
                          ? 0
                          : Math.min(
                              100,
                              Math.round(((gs.currentParticipants || 0) / Math.max(1, gs.maxParticipants)) * 100)
                            );

                        return (
                          <button
                            key={gs.id}
                            type="button"
                            disabled={isFull}
                            className={`service-option${isSelected ? ' selected' : ''}`}
                            onClick={() => !isFull && setSelectedGroupId(gs.id)}
                            style={{ opacity: isFull ? 0.6 : 1, cursor: isFull ? 'not-allowed' : 'pointer' }}
                          >
                            <span className="service-radio">
                              {isSelected && <Check size={14} />}
                            </span>
                            <div className="service-content" style={{ width: '100%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                <strong>{gs.title}</strong>
                                {gs.showRemainingSpots !== false && (
                                  <span
                                    style={{
                                      padding: '3px 9px',
                                      borderRadius: '999px',
                                      fontSize: '0.72rem',
                                      fontWeight: 800,
                                      background: isFull ? '#fef2f2' : '#ecfdf5',
                                      color: isFull ? '#dc2626' : '#047857',
                                      border: `1px solid ${isFull ? '#fecaca' : '#a7f3d0'}`,
                                    }}
                                  >
                                    {isFull
                                      ? 'Vagas esgotadas'
                                      : spotsLeft !== null
                                      ? !isUnlimited && gs.customRemainingSpots == null
                                        ? `Restam ${spotsLeft} de ${gs.maxParticipants} vagas`
                                        : `Restam ${spotsLeft} vagas`
                                      : 'Vagas abertas'}
                                  </span>
                                )}
                              </div>
                              {gs.description && (
                                <div style={{ marginBottom: '4px' }}>
                                  <p
                                    style={{
                                      margin: '4px 0 0',
                                      whiteSpace: expandedDescIds[gs.id] ? 'pre-line' : 'normal',
                                      ...(expandedDescIds[gs.id]
                                        ? { maxHeight: '220px', overflowY: 'auto', paddingRight: '6px' }
                                        : {
                                            display: '-webkit-box',
                                            WebkitLineClamp: 3,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                          }),
                                    }}
                                  >
                                    {gs.description}
                                  </p>
                                  {gs.description.length > 130 && (
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedDescIds((prev) => ({
                                          ...prev,
                                          [gs.id]: !prev[gs.id],
                                        }));
                                      }}
                                      style={{
                                        display: 'inline-block',
                                        marginTop: '4px',
                                        fontSize: '0.78rem',
                                        fontWeight: 800,
                                        color: '#21577a',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {expandedDescIds[gs.id] ? 'Ler menos ▴' : 'Ler mais ▾'}
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="service-badges-list">
                                <span className="badge-pill badge-pill-duration" title="Data de início">
                                  <CalendarDays size={12} />
                                  <span>Data: {gs.date.split('-').reverse().join('/')}</span>
                                </span>

                                <span className="badge-pill badge-pill-duration" title="Horário da sessão">
                                  <Clock3 size={12} />
                                  <span>
                                    {gs.startTime}
                                    {gs.endTime ? ` às ${gs.endTime}` : ''}
                                  </span>
                                </span>

                                {gs.modality === 'presencial' ? (
                                  <span className="badge-pill badge-pill-presencial">
                                    <MapPin size={12} />
                                    <span>Presencial</span>
                                  </span>
                                ) : (
                                  <span className="badge-pill badge-pill-online">
                                    <Monitor size={12} />
                                    <span>Online</span>
                                  </span>
                                )}

                                {gs.priceVisible && gs.priceCents != null && gs.priceCents > 0 ? (
                                  <span className="badge-pill badge-pill-price">
                                    <Sparkles size={12} />
                                    <span>{formatCurrency(gs.priceCents)}</span>
                                  </span>
                                ) : (
                                  <span className="badge-pill badge-pill-consult">
                                    <Sparkles size={12} />
                                    <span>Valor sob consulta</span>
                                  </span>
                                )}
                              </div>

                              {/* Visual spots progress bar */}
                              {!isUnlimited && gs.showRemainingSpots !== false && (
                                <div style={{ marginTop: '10px', width: '100%', height: '6px', borderRadius: '999px', background: '#e2e8f0', overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      width: `${pct}%`,
                                      height: '100%',
                                      borderRadius: '999px',
                                      background: isFull ? '#dc2626' : '#059669',
                                    }}
                                  />
                                </div>
                              )}

                              {gs.audioUrl && (
                                <div style={{ marginTop: '10px' }} onClick={(e) => e.stopPropagation()}>
                                  <ServiceAudioPlayer
                                    audioUrl={gs.audioUrl}
                                    serviceName={gs.title}
                                    audioName={gs.audioName}
                                    compact
                                  />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <button
                    className="btn btn-primary btn-lg booking-next"
                    disabled={!selectedGroup}
                    onClick={() => {
                      setError('');
                      setGroupStep('dados');
                    }}
                  >
                    Continuar <ChevronRight size={17} />
                  </button>
                </section>
              )}

              {groupStep === 'dados' && (
                <form onSubmit={submitClient} className="booking-compact-form">
                  <div className="booking-heading">
                    <span>Etapa 2 de 3</span>
                    <h2>Seus dados para inscrição</h2>
                  </div>
                  <label className="form-group">
                    <span className="form-label"><UserRound size={13} /> Nome completo *</span>
                    <input
                      className="form-input"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      required
                      minLength={3}
                      autoComplete="name"
                      placeholder="Seu nome completo"
                    />
                  </label>
                  <div className="form-row form-row-2">
                    <label className="form-group">
                      <span className="form-label">CPF *</span>
                      <input
                        className="form-input"
                        type="text"
                        inputMode="numeric"
                        value={form.cpf}
                        onChange={(event) => setForm({ ...form, cpf: maskCpf(event.target.value) })}
                        required
                        placeholder="000.000.000-00"
                        maxLength={14}
                      />
                    </label>
                    <label className="form-group">
                      <span className="form-label"><CalendarDays size={13} /> Nascimento *</span>
                      <input
                        className="form-input"
                        type="date"
                        value={form.birthDate}
                        onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
                        required
                        max={clinicToday()}
                      />
                    </label>
                  </div>
                  <div className="form-row form-row-2">
                    <label className="form-group">
                      <span className="form-label"><Phone size={13} /> WhatsApp *</span>
                      <input
                        className="form-input"
                        type="tel"
                        value={form.phone}
                        onChange={(event) => setForm({ ...form, phone: maskPhone(event.target.value) })}
                        required
                        autoComplete="tel"
                        placeholder="(11) 99999-9999"
                      />
                    </label>
                    <label className="form-group">
                      <span className="form-label">E-mail</span>
                      <input
                        className="form-input"
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm({ ...form, email: event.target.value })}
                        autoComplete="email"
                        placeholder="opcional"
                      />
                    </label>
                  </div>
                  <label className="form-group">
                    <span className="form-label">Observação (opcional)</span>
                    <textarea
                      className="form-textarea"
                      value={form.notes}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      rows={2}
                      maxLength={500}
                      placeholder="Ex.: minha primeira vez participando em grupo"
                    />
                  </label>
                  <button className="btn btn-primary btn-lg booking-next">
                    Revisar inscrição <ChevronRight size={17} />
                  </button>
                </form>
              )}

              {groupStep === 'revisao' && selectedGroup && (
                <section>
                  <div className="booking-heading">
                    <span>Etapa 3 de 3</span>
                    <h2>Revise sua inscrição</h2>
                  </div>
                  <dl className="review-list">
                    <div>
                      <dt>Sessão em Grupo</dt>
                      <dd>
                        <span>{selectedGroup.title}</span>
                        {selectedGroup.priceVisible && selectedGroup.priceCents != null && selectedGroup.priceCents > 0 && (
                          <small style={{ color: 'var(--color-primary)', fontWeight: 600, marginTop: '2px' }}>
                            Valor individual: {formatCurrency(selectedGroup.priceCents)}
                          </small>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Modalidade</dt>
                      <dd>
                        {selectedGroup.modality === 'online' ? 'Online' : 'Presencial'}
                        {selectedGroup.locationNotes ? ` (${selectedGroup.locationNotes})` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Data e horário</dt>
                      <dd>
                        {selectedGroup.date.split('-').reverse().join('/')} às {selectedGroup.startTime}
                        {selectedGroup.endTime ? ` (até ${selectedGroup.endTime})` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>Participante</dt>
                      <dd>
                        {form.name}
                        <small>
                          CPF: {form.cpf} · Nasc.: {form.birthDate ? form.birthDate.split('-').reverse().join('/') : '—'}
                        </small>
                        <small>{form.phone}{form.email ? ` · ${form.email}` : ''}</small>
                      </dd>
                    </div>
                  </dl>

                  <div style={{ margin: '12px 0' }}>
                    <span className="form-label" style={{ display: 'block', marginBottom: '6px' }}>Forma de pagamento *</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      {([
                        { key: 'pix', label: 'PIX', imgUrl: 'https://img.icons8.com/fluency/48/pix.png', alt: 'pix' },
                        { key: 'dinheiro', label: 'Dinheiro', imgUrl: 'https://img.icons8.com/offices/30/money.png', alt: 'money' },
                        { key: 'cartao', label: 'Cartão', imgUrl: 'https://img.icons8.com/color/48/bank-card-back-side.png', alt: 'bank-card-back-side' },
                      ] as const).map((opt) => {
                        const active = paymentMethod === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setPaymentMethod(opt.key)}
                            style={{
                              padding: '10px 6px',
                              borderRadius: '10px',
                              border: active ? '2px solid var(--color-primary, #1a3a4a)' : '1.5px solid #e2e8f0',
                              background: active ? 'rgba(26,58,74,0.06)' : '#ffffff',
                              fontWeight: 700,
                              fontSize: '0.84rem',
                              color: '#1a3a4a',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <img
                              width={24}
                              height={24}
                              src={opt.imgUrl}
                              alt={opt.alt}
                              style={{ width: 24, height: 24, objectFit: 'contain', display: 'block' }}
                            />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="privacy-check">
                    <input
                      type="checkbox"
                      checked={form.privacyAccepted}
                      onChange={(event) => setForm({ ...form, privacyAccepted: event.target.checked })}
                    />
                    <span>Li e concordo que meus dados sejam usados para administrar minha inscrição. *</span>
                  </label>

                  <button
                    className="btn btn-primary btn-lg booking-next"
                    disabled={!form.privacyAccepted || submitting || !paymentMethod}
                    onClick={confirmGroupEnrollment}
                  >
                    {submitting ? (
                      <><LoaderCircle className="spin" size={17} /> Reservando sua vaga…</>
                    ) : (
                      <><Check size={17} /> Confirmar vaga na sessão em grupo</>
                    )}
                  </button>
                </section>
              )}
            </>
          ) : (
            <>
              <ol className="stepper">{STEPS.map((item, index) => <li key={item.id} className={index === currentStep ? 'active' : index < currentStep ? 'done' : ''}><span>{index < currentStep ? <Check size={13} /> : index + 1}</span><small>{item.label}</small></li>)}</ol>
              {step !== 'servico' && <button className="back-link booking-back" onClick={back}><ArrowLeft size={15} /> Voltar</button>}
              {error && <div className="form-alert" role="alert">{error}</div>}

              {step === 'servico' && (
                <section>
                  <div className="booking-heading">
                    <span>Etapa 1 de 4</span>
                    <h2>Qual serviço você procura?</h2>
                  </div>
                  {loading ? (
                    <div className="loading-row">
                      <LoaderCircle className="spin" size={20} /> Carregando serviços…
                    </div>
                  ) : (
                    <div className="service-options">
                      {services.map((item) => (
                        <Fragment key={item.id}>
                        <button
                          type="button"
                          className={`service-option${serviceId === item.id ? ' selected' : ''}`}
                          onClick={() => chooseService(item)}
                        >
                          <span className="service-radio">
                            {serviceId === item.id && <Check size={14} />}
                          </span>
                          <div className="service-content">
                            <strong>{item.name}</strong>
                            <p>{item.description}</p>
                            <div className="service-badges-list">
                              <span className="badge-pill badge-pill-duration" title="Duração estimada">
                                <Clock3 size={12} />
                                <span>{item.durationMinutes} min</span>
                              </span>

                              {item.modalities.includes('presencial') && (
                                <span className="badge-pill badge-pill-presencial" title="Atendimento presencial na clínica">
                                  <MapPin size={12} />
                                  <span>Presencial</span>
                                </span>
                              )}

                              {item.modalities.includes('online') && (
                                <span className="badge-pill badge-pill-online" title="Atendimento online via videochamada">
                                  <Monitor size={12} />
                                  <span>Online</span>
                                </span>
                              )}

                              {item.pricingTiers && item.pricingTiers.length > 0 ? (
                                <span className="badge-pill badge-pill-price" title="Opções disponíveis">
                                  <Sparkles size={12} />
                                  <span>
                                    {item.pricingTiers.length === 1
                                      ? formatCurrency(item.pricingTiers[0].priceCents)
                                      : `${item.pricingTiers.length} opções · a partir de ${formatCurrency(Math.min(...item.pricingTiers.map(t => t.priceCents)))}`}
                                  </span>
                                </span>
                              ) : item.priceVisible && item.priceCents !== null ? (
                                <span className="badge-pill badge-pill-price" title="Valor da sessão">
                                  <Sparkles size={12} />
                                  <span>{formatCurrency(item.priceCents)}</span>
                                </span>
                              ) : (
                                <span className="badge-pill badge-pill-consult" title="Consulte as condições com a clínica">
                                  <Sparkles size={12} />
                                  <span>Valor sob consulta</span>
                                </span>
                              )}
                            </div>
                            {item.audioUrl && (
                              <div style={{ marginTop: '8px' }} onClick={(e) => e.stopPropagation()}>
                                <ServiceAudioPlayer
                                  audioUrl={item.audioUrl}
                                  serviceName={item.name}
                                  audioName={item.audioName}
                                  compact
                                />
                              </div>
                            )}
                          </div>
                        </button>

                        {serviceId === item.id && item.pricingTiers && item.pricingTiers.length > 0 && (
                          <div className="tier-selection-group">
                            <div className="tier-selection-title">
                              <Sparkles size={14} />
                              <span>Escolha a opção / pacote:</span>
                            </div>
                            <div className="tier-options-grid">
                              {item.pricingTiers.map((tier) => {
                                const isSelected = selectedTier?.id === tier.id;
                                const alreadyMentionsSessions = /sess[õo]es|sess[ãa]o/i.test(tier.name);
                                return (
                                  <button
                                    key={tier.id}
                                    type="button"
                                    className={`tier-option-card${isSelected ? ' selected' : ''}`}
                                    onClick={() => setSelectedTierId(tier.id)}
                                  >
                                    <span className="tier-radio">
                                      {isSelected && <Check size={12} />}
                                    </span>
                                    <div className="tier-info">
                                      <span className="tier-name">
                                        {tier.name}
                                        {tier.isPackage && tier.sessionCount && tier.sessionCount > 1 && !alreadyMentionsSessions
                                          ? ` (${tier.sessionCount} sessões)`
                                          : ''}
                                      </span>
                                      <span className="tier-price">{formatCurrency(tier.priceCents)}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {selectedTier && selectedTier.isPackage && selectedTier.sessionCount && selectedTier.sessionCount > 1 && (
                              <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#047857', display: 'flex', alignItems: 'center', gap: '5px', lineHeight: 1.35 }}>
                                <Sparkles size={13} style={{ flexShrink: 0 }} />
                                <span>
                                  Agendando a <strong>1ª sessão</strong>. As outras <strong>{selectedTier.sessionCount - 1} sessões</strong> ficam disponíveis no seu portal.
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        </Fragment>
                      ))}
                    </div>
                  )}

                  {service && (
                    <div className="modality-row">
                      <span>Modalidade</span>
                      {service.modalities.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={modality === item ? 'selected' : ''}
                          onClick={() => setModality(item)}
                        >
                          {item === 'online' ? <Monitor size={16} /> : <MapPin size={16} />}
                          {item === 'online' ? 'Online' : 'Presencial'}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    className="btn btn-primary btn-lg booking-next"
                    onClick={nextFromService}
                    disabled={!service}
                  >
                    Continuar <ChevronRight size={17} />
                  </button>
                </section>
              )}

              {step === 'horario' && <section><div className="booking-heading"><span>Etapa 2 de 4</span><h2>Escolha data e horário</h2></div><label className="date-field"><span className="form-label">Data desejada</span><input className="form-input" type="date" min={clinicToday()} value={date} onChange={(event) => { setLoading(true); setTime(''); setDate(event.target.value); }} /></label><div className="slots-heading"><strong>Horários disponíveis</strong><span>Fuso de São Paulo</span></div>{loading ? <div className="loading-row"><LoaderCircle className="spin" size={20} /> Consultando agenda…</div> : slots.length ? <div className="slot-grid">{slots.map((slot) => <button key={slot.time} className={time === slot.time ? 'selected' : ''} onClick={() => setTime(slot.time)}><Clock3 size={15} /> {slot.time}</button>)}</div> : <div className="empty-state compact"><CalendarDays size={24} /><h3>Sem horários nesta data</h3><p>Tente outro dia útil.</p></div>}<button className="btn btn-primary btn-lg booking-next" disabled={!time} onClick={() => setStep('dados')}>Continuar <ChevronRight size={17} /></button></section>}

              {step === 'dados' && (
                <form onSubmit={submitClient} className="booking-compact-form">
                  <div className="booking-heading">
                    <span>Etapa 3 de 4</span>
                    <h2>Seus dados para reserva</h2>
                  </div>
                  <label className="form-group">
                    <span className="form-label"><UserRound size={13} /> Nome completo *</span>
                    <input className="form-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={3} autoComplete="name" placeholder="Seu nome completo" />
                  </label>
                  <div className="form-row form-row-2">
                    <label className="form-group">
                      <span className="form-label">CPF *</span>
                      <input
                        className="form-input"
                        type="text"
                        inputMode="numeric"
                        value={form.cpf}
                        onChange={(event) => setForm({ ...form, cpf: maskCpf(event.target.value) })}
                        required
                        placeholder="000.000.000-00"
                        maxLength={14}
                      />
                    </label>
                    <label className="form-group">
                      <span className="form-label"><CalendarDays size={13} /> Nascimento *</span>
                      <input
                        className="form-input"
                        type="date"
                        value={form.birthDate}
                        onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
                        required
                        max={clinicToday()}
                      />
                    </label>
                  </div>
                  <div className="form-row form-row-2">
                    <label className="form-group">
                      <span className="form-label"><Phone size={13} /> WhatsApp *</span>
                      <input className="form-input" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: maskPhone(event.target.value) })} required autoComplete="tel" placeholder="(11) 99999-9999" />
                    </label>
                    <label className="form-group">
                      <span className="form-label">E-mail</span>
                      <input className="form-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" placeholder="opcional" />
                    </label>
                  </div>
                  <label className="form-group">
                    <span className="form-label">Observação (opcional)</span>
                    <textarea className="form-textarea" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} maxLength={500} placeholder="Ex.: prefiro contato no período da tarde" />
                  </label>
                  <button className="btn btn-primary btn-lg booking-next">Revisar agendamento <ChevronRight size={17} /></button>
                </form>
              )}

              {step === 'revisao' && (
                <section>
                  <div className="booking-heading">
                    <span>Etapa 4 de 4</span>
                    <h2>Revise seu agendamento</h2>
                  </div>
                  <dl className="review-list">
                    <div>
                      <dt>Serviço</dt>
                      <dd>
                        <span>{service?.name}</span>
                        {selectedTier && (
                          <small style={{ color: 'var(--color-primary)', fontWeight: 600, marginTop: '2px' }}>
                            Pacote / Opção: {selectedTier.name} — {formatCurrency(selectedTier.priceCents)}
                          </small>
                        )}
                      </dd>
                    </div>
                    <div><dt>Modalidade</dt><dd>{modality === 'online' ? 'Online' : 'Presencial'}</dd></div>
                    <div><dt>Data e horário</dt><dd>{date.split('-').reverse().join('/')} às {time}</dd></div>
                    <div>
                      <dt>Contato</dt>
                      <dd>
                        {form.name}
                        <small>
                          CPF: {form.cpf} · Nasc.: {form.birthDate ? form.birthDate.split('-').reverse().join('/') : '—'}
                        </small>
                        <small>{form.phone}{form.email ? ` · ${form.email}` : ''}</small>
                      </dd>
                    </div>
                  </dl>
                  {!activePackage && (
                    <div style={{ margin: '12px 0' }}>
                      <span className="form-label" style={{ display: 'block', marginBottom: '6px' }}>Forma de pagamento *</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {([
                          { key: 'pix', label: 'PIX', imgUrl: 'https://img.icons8.com/fluency/48/pix.png', alt: 'pix' },
                          { key: 'dinheiro', label: 'Dinheiro', imgUrl: 'https://img.icons8.com/offices/30/money.png', alt: 'money' },
                          { key: 'cartao', label: 'Cartão', imgUrl: 'https://img.icons8.com/color/48/bank-card-back-side.png', alt: 'bank-card-back-side' },
                        ] as const).map((opt) => {
                          const active = paymentMethod === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setPaymentMethod(opt.key)}
                              style={{
                                padding: '10px 6px',
                                borderRadius: '10px',
                                border: active ? '2px solid var(--color-primary, #1a3a4a)' : '1.5px solid #e2e8f0',
                                background: active ? 'rgba(26,58,74,0.06)' : '#ffffff',
                                fontWeight: 700,
                                fontSize: '0.84rem',
                                color: '#1a3a4a',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <img
                                width={24}
                                height={24}
                                src={opt.imgUrl}
                                alt={opt.alt}
                                style={{ width: 24, height: 24, objectFit: 'contain', display: 'block' }}
                              />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <span className="form-hint">O pagamento é realizado no dia do atendimento.</span>
                    </div>
                  )}
                  <label className="privacy-check">
                    <input type="checkbox" checked={form.privacyAccepted} onChange={(event) => setForm({ ...form, privacyAccepted: event.target.checked })} />
                    <span>Li e concordo que meus dados sejam usados para administrar este agendamento. *</span>
                  </label>
                  <button className="btn btn-primary btn-lg booking-next" disabled={!form.privacyAccepted || submitting || (!activePackage && !paymentMethod)} onClick={confirm}>
                    {submitting ? <><LoaderCircle className="spin" size={17} /> Verificando horário…</> : <><Check size={17} /> Enviar agendamento</>}
                  </button>
                </section>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function BookingHeader() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const from = searchParams.get('from');

  const backUrl = from === 'cliente' ? '/cliente' : '/';
  const backLabel = from === 'cliente' ? 'Voltar ao Portal' : 'Voltar';

  return (
    <header className="booking-top-header">
      <div className="booking-header-inner">
        <button
          type="button"
          onClick={() => {
            if (from === 'cliente') {
              router.push('/cliente');
            } else if (window.history.length > 1) {
              router.back();
            } else {
              router.push('/');
            }
          }}
          className="booking-back-pill"
          title={backLabel}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ArrowLeft size={16} />
          <span>{backLabel}</span>
        </button>
        <Link href={backUrl} className="booking-logo-center" title="Camila Machado">
          <Image
            src="/logo-camila-machado.png"
            alt="Camila Machado - Hipnose Clínica Multidimensional Integrativa"
            width={210}
            height={60}
            priority
          />
        </Link>
        <div className="booking-header-spacer" />
      </div>
    </header>
  );
}

export default function AgendarPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Carregando agenda...</div>}>
      <AgendarContent />
    </Suspense>
  );
}

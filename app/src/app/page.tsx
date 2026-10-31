'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  HeartHandshake,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Monitor,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import type { GroupSession, Service } from '@/lib/domain';
import { formatCurrency, maskPhone } from '@/lib/utils';
import { ServiceAudioPlayer } from '@/components/service-audio-player';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active drawer/accordion: null | 'servicos' | 'local'
  const [activeDrawer, setActiveDrawer] = useState<'servicos' | 'local' | null>(null);

  // Services list for drawer
  const [services, setServices] = useState<Service[]>([]);
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([]);
  const [expandedDescIds, setExpandedDescIds] = useState<Record<string, boolean>>({});

  // Load Services on Mount
  useEffect(() => {
    fetch('/api/public/services')
      .then((res) => res.json())
      .then((data) => {
        setServices(data.services ?? []);
      })
      .catch(() => {});

    fetch('/api/group-sessions')
      .then((res) => res.json())
      .then((data) => {
        setGroupSessions(data.sessions ?? []);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="linktree-page-wrapper">
      <div className="linktree-ambient-glow" />

      <main className="linktree-container">
        {/* Top bar with status */}
        <div className="linktree-topbar">
          <div className="linktree-chip-status">
            <span className="status-dot-pulse" />
            <span>Agenda Aberta</span>
          </div>
        </div>

        {/* Profile Card */}
        <section className="linktree-profile">
          <div className="linktree-avatar-wrapper">
            <Image
              src="/camila-site.png"
              alt="Camila Machado"
              width={140}
              height={140}
              className="linktree-avatar-img"
              priority
            />
          </div>

          <Image
            src="/logo-camila-machado.png"
            alt="Camila Machado - Hipnose Clínica Multidimensional Integrativa"
            width={320}
            height={95}
            className="linktree-logo-img"
            priority
          />

          <span className="linktree-badge-title">
            <Sparkles size={13} /> Hipnose Clínica Multidimensional Integrativa
          </span>

          <p className="linktree-bio-text">
            Um espaço de escuta, cuidado e presença para sua transformação emocional e autoconhecimento.
          </p>

          {/* Faixa de Credenciais e Modalidades de Atendimento */}
          <div className="linktree-trust-strip">
            <div className="trust-strip-item">
              <div className="trust-strip-icon-box">
                <MapPin size={15} />
              </div>
              <div className="trust-strip-text">
                <span className="trust-strip-title">Presencial</span>
                <span className="trust-strip-subtitle">Urussanga · SC</span>
              </div>
            </div>

            <div className="trust-strip-divider" />

            <div className="trust-strip-item">
              <div className="trust-strip-icon-box">
                <Video size={15} />
              </div>
              <div className="trust-strip-text">
                <span className="trust-strip-title">Online</span>
                <span className="trust-strip-subtitle">Brasil e Exterior</span>
              </div>
            </div>

            <div className="trust-strip-divider" />

            <div className="trust-strip-item">
              <div className="trust-strip-icon-box">
                <ShieldCheck size={15} />
              </div>
              <div className="trust-strip-text">
                <span className="trust-strip-title">Sigilo & LGPD</span>
                <span className="trust-strip-subtitle">100% Protegido</span>
              </div>
            </div>
          </div>
        </section>

        {/* Action Hub / Cards Stack */}
        <section className="linktree-links-stack">
          {/* Card 1: Agendar Atendimento -> Navega na mesma tela (PWA-friendly) */}
          <Link
            href="/agendar"
            className="linktree-card-btn primary-highlight"
            id="agendar"
          >
            <div className="card-btn-left">
              <div className="card-btn-icon">
                <CalendarDays size={22} />
              </div>
              <div className="card-btn-text">
                <h3>Agendar Atendimento</h3>
                <p>Consulte dias e horários livres em tempo real</p>
              </div>
            </div>
            <div className="card-btn-right">
              <ChevronRight size={18} className="card-btn-arrow" />
            </div>
          </Link>

          {/* Card 2: Área do Cliente (Portal) -> Rota externa dedicada */}
          <Link
            href="/cliente/entrar"
            className="linktree-card-btn client-highlight"
          >
            <div className="card-btn-left">
              <div className="card-btn-icon">
                <UserCheck size={22} />
              </div>
              <div className="card-btn-text">
                <h3>Área do Cliente (Portal)</h3>
                <p>Criar conta ou acessar histórico e teleatendimento</p>
              </div>
            </div>
            <div className="card-btn-right">
              <span className="card-btn-badge" style={{ background: '#fdf5e6', color: '#b8860b' }}>
                Portal
              </span>
              <ChevronRight size={18} className="card-btn-arrow" />
            </div>
          </Link>

          {/* Card 3: Nossos Serviços & Abordagens */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'servicos' ? null : 'servicos')}
            className={`linktree-card-btn ${activeDrawer === 'servicos' ? 'active-open' : ''}`}
          >
            <div className="card-btn-left">
              <div className="card-btn-icon">
                <HeartHandshake size={22} />
              </div>
              <div className="card-btn-text">
                <h3>Serviços & Metodologia</h3>
                <p>Conversa inicial, sessões de hipnose e acompanhamento</p>
              </div>
            </div>
            <div className="card-btn-right">
              <ChevronDown
                size={18}
                className="card-btn-arrow"
                style={{ transform: activeDrawer === 'servicos' ? 'rotate(180deg)' : 'none' }}
              />
            </div>
          </button>

          {/* Embedded Drawer: Serviços */}
          {activeDrawer === 'servicos' && (
            <div className="linktree-drawer">
              <div className="drawer-header">
                <div className="drawer-title-row">
                  <HeartHandshake size={18} className="text-primary" />
                  <h2>Serviços Oferecidos</h2>
                </div>
                <button
                  onClick={() => setActiveDrawer(null)}
                  className="drawer-close-btn"
                  aria-label="Fechar serviços"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="services-expand-list">
                {services.map((s) => (
                  <div key={s.id} className="service-expand-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <h3>{s.name}</h3>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#245d80', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {s.pricingTiers && s.pricingTiers.length > 0
                          ? `A partir de ${formatCurrency(Math.min(...s.pricingTiers.map((t) => t.priceCents)))}`
                          : s.priceVisible && s.priceCents
                          ? formatCurrency(s.priceCents)
                          : 'Sob consulta'}
                      </span>
                    </div>
                    <p>{s.description}</p>
                    {s.pricingTiers && s.pricingTiers.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 4px' }}>
                        {s.pricingTiers.map((t) => (
                          <span
                            key={t.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: '#f0fdf4',
                              color: '#166534',
                              border: '1px solid #bbf7d0',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: '6px'
                            }}
                          >
                            ✓ {t.name}: <strong>{formatCurrency(t.priceCents)}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="service-badges-list" style={{ marginTop: '8px' }}>
                      <span className="badge-pill badge-pill-duration">
                        <Clock3 size={12} /> {s.durationMinutes} min
                      </span>
                      {s.modalities.includes('presencial') && (
                        <span className="badge-pill badge-pill-presencial">
                          <MapPin size={12} /> Presencial
                        </span>
                      )}
                      {s.modalities.includes('online') && (
                        <span className="badge-pill badge-pill-online">
                          <Monitor size={12} /> Online
                        </span>
                      )}
                    </div>
                    {s.audioUrl && (
                      <div style={{ marginTop: '12px' }}>
                        <ServiceAudioPlayer
                          audioUrl={s.audioUrl}
                          serviceName={s.name}
                          audioName={s.audioName}
                        />
                      </div>
                    )}
                  </div>
                ))}

                {groupSessions.length > 0 && (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '10px',
                        paddingTop: '12px',
                        borderTop: '1px dashed #cbd5e1',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        color: '#21577a',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      <Users size={15} />
                      <span>Sessões em Grupo com Vagas Abertas</span>
                    </div>

                    {groupSessions.map((gs) => {
                      const isUnlimited = gs.maxParticipants === 0;
                      const spotsLeft =
                        gs.customRemainingSpots != null
                          ? Math.max(0, gs.customRemainingSpots)
                          : !isUnlimited
                          ? Math.max(0, gs.maxParticipants - (gs.currentParticipants || 0))
                          : null;
                      const isFull = spotsLeft !== null && spotsLeft <= 0;
                      return (
                        <div
                          key={gs.id}
                          className="service-expand-item"
                          style={{
                            border: '1.5px solid #bae6fd',
                            background: 'linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <div>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '3px 9px',
                                  borderRadius: '999px',
                                  background: '#0284c7',
                                  color: '#ffffff',
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  marginBottom: '6px',
                                }}
                              >
                                <Users size={11} /> Sessão em Grupo
                              </span>
                              <h3>{gs.title}</h3>
                            </div>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#245d80', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {gs.priceVisible && gs.priceCents != null && gs.priceCents > 0
                                ? formatCurrency(gs.priceCents)
                                : 'Sob consulta'}
                            </span>
                          </div>
                          {gs.description && (
                            <div>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: '0.84rem',
                                  color: '#475569',
                                  lineHeight: 1.5,
                                  whiteSpace: expandedDescIds[`drawer_${gs.id}`] ? 'pre-line' : 'normal',
                                  ...(expandedDescIds[`drawer_${gs.id}`]
                                    ? { maxHeight: '240px', overflowY: 'auto', paddingRight: '6px' }
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
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedDescIds((prev) => ({
                                      ...prev,
                                      [`drawer_${gs.id}`]: !prev[`drawer_${gs.id}`],
                                    }))
                                  }
                                  style={{
                                    marginTop: '4px',
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    fontSize: '0.78rem',
                                    fontWeight: 800,
                                    color: '#21577a',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {expandedDescIds[`drawer_${gs.id}`] ? 'Ler menos ▴' : 'Ler mais ▾'}
                                </button>
                              )}
                            </div>
                          )}
                          <div className="service-badges-list" style={{ marginTop: '8px' }}>
                            <span className="badge-pill badge-pill-duration">
                              <CalendarDays size={12} /> {gs.date.split('-').reverse().join('/')} · {gs.startTime}
                              {gs.endTime ? ` às ${gs.endTime}` : ''}
                            </span>
                            {gs.showRemainingSpots !== false && (
                              <span
                                className="badge-pill"
                                style={{
                                  background: !isFull ? '#ecfdf5' : '#fef2f2',
                                  color: !isFull ? '#047857' : '#b91c1c',
                                  border: `1px solid ${!isFull ? '#a7f3d0' : '#fecaca'}`,
                                }}
                              >
                                <Users size={12} />{' '}
                                {isFull
                                  ? 'Vagas esgotadas'
                                  : spotsLeft !== null
                                  ? !isUnlimited && gs.customRemainingSpots == null
                                    ? `${spotsLeft} de ${gs.maxParticipants} vagas disponíveis`
                                    : `Restam ${spotsLeft} vagas`
                                  : 'Vagas abertas'}
                              </span>
                            )}
                            {gs.modality === 'presencial' ? (
                              <span className="badge-pill badge-pill-presencial">
                                <MapPin size={12} /> Presencial
                              </span>
                            ) : (
                              <span className="badge-pill badge-pill-online">
                                <Monitor size={12} /> Online
                              </span>
                            )}
                          </div>
                          {gs.audioUrl && (
                            <div style={{ marginTop: '12px' }}>
                              <ServiceAudioPlayer
                                audioUrl={gs.audioUrl}
                                serviceName={gs.title}
                                audioName={gs.audioName}
                              />
                            </div>
                          )}
                          {!isFull && (
                            <div style={{ marginTop: '12px' }}>
                              <Link
                                href={`/agendar?tab=grupo&groupSessionId=${gs.id}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '8px 14px',
                                  borderRadius: '999px',
                                  background: '#1a3a4a',
                                  color: '#ffffff',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                }}
                              >
                                <CalendarDays size={13} /> Garantir minha vaga nesta sessão
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              <Link
                href="/agendar"
                className="btn btn-primary w-full mt-4"
              >
                <CalendarDays size={16} /> Ir para o Agendamento
              </Link>
            </div>
          )}

          {/* Card 4: Falar no WhatsApp Oficial */}
          <a
            href="https://wa.me/5511999999999?text=Ol%C3%A1%2C%20Camila!%20Gostaria%20de%20tirar%20uma%20d%C3%BAvida%20sobre%20o%20atendimento."
            target="_blank"
            rel="noopener noreferrer"
            className="linktree-card-btn"
          >
            <div className="card-btn-left">
              <div
                className="card-btn-icon"
                style={{
                  background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                  color: '#ffffff',
                  boxShadow: '0 4px 12px rgba(37, 211, 102, 0.28)',
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div className="card-btn-text">
                <h3>WhatsApp Oficial</h3>
                <p>Tire dúvidas diretamente com a clínica</p>
              </div>
            </div>
            <div className="card-btn-right">
              <ChevronRight size={18} className="card-btn-arrow" />
            </div>
          </a>

          {/* Card 5: Onde Atendemos (Consultório & Teleconsulta) */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'local' ? null : 'local')}
            className={`linktree-card-btn ${activeDrawer === 'local' ? 'active-open' : ''}`}
          >
            <div className="card-btn-left">
              <div className="card-btn-icon">
                <MapPin size={22} />
              </div>
              <div className="card-btn-text">
                <h3>Localização & Atendimento Online</h3>
                <p>Consultório presencial e teleatendimento seguro</p>
              </div>
            </div>
            <div className="card-btn-right">
              <ChevronDown
                size={18}
                className="card-btn-arrow"
                style={{ transform: activeDrawer === 'local' ? 'rotate(180deg)' : 'none' }}
              />
            </div>
          </button>

          {/* Embedded Drawer: Local */}
          {activeDrawer === 'local' && (
            <div className="linktree-drawer">
              <div className="drawer-header">
                <div className="drawer-title-row">
                  <MapPin size={18} className="text-primary" />
                  <h2>Onde Atendemos</h2>
                </div>
                <button
                  onClick={() => setActiveDrawer(null)}
                  className="drawer-close-btn"
                  aria-label="Fechar localização"
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="service-expand-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <MapPin size={18} className="text-primary" />
                    <h3>Consultório Presencial</h3>
                  </div>
                  <p>
                    Espaço acolhedor e privativo, projetado para oferecer o máximo conforto e tranquilidade durante sua sessão de hipnose clínica.
                  </p>
                  <span style={{ fontSize: '0.82rem', color: '#647784' }}>
                    Urussanga - SC • Endereço com orientações enviado após confirmação da sessão.
                  </span>
                </div>

                <div className="service-expand-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Video size={18} className="text-primary" />
                    <h3>Teleatendimento Seguro (Online)</h3>
                  </div>
                  <p>
                    Atendimento de onde você estiver com o mesmo acolhimento, via sala de videoconferência com link criptografado e exclusivo na Área do Cliente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Eventos em Grupo Disponíveis (No Final da Página com Gatilho Pulsante) */}
          {groupSessions.filter((gs) => gs.showOnHome !== false).length > 0 && (
            <div
              className="group-events-home-card"
              style={{
                marginTop: '6px',
                background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                borderRadius: '22px',
                border: '1.5px solid #fde68a',
                padding: '18px',
                boxShadow: '0 10px 30px rgba(180, 83, 9, 0.09)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Banner Gatilho Piscando / Pulsando no Topo */}
              <div
                className="promo-trigger-banner"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '7px 12px',
                  borderRadius: '999px',
                  background: 'linear-gradient(90deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%)',
                  border: '1px solid #f59e0b',
                  color: '#92400e',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.03em',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span className="blinking-dot" />
                  <span>✨ CONDIÇÃO ESPECIAL • VAGAS LIMITADAS</span>
                </span>
                <span
                  className="blinking-badge-pill"
                  style={{
                    background: '#d97706',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '0.66rem',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                  }}
                >
                  🔥 Últimas Vagas
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '11px',
                      background: 'linear-gradient(135deg, #1a3a4a 0%, #21577a 100%)',
                      color: '#ffffff',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Users size={17} />
                  </span>
                  <div>
                    <strong style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', display: 'block' }}>
                      Eventos em Grupo Disponíveis
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Vivências e encontros especiais com data marcada
                    </span>
                  </div>
                </div>
                <Link
                  href="/agendar?tab=grupo"
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    color: '#21577a',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Ver todos →
                </Link>
              </div>

              {groupSessions
                .filter((gs) => gs.showOnHome !== false)
                .map((gs) => {
                  const isUnlimited = gs.maxParticipants === 0;
                  const effectiveRemaining =
                    gs.customRemainingSpots != null
                      ? Math.max(0, gs.customRemainingSpots)
                      : !isUnlimited
                      ? Math.max(0, gs.maxParticipants - (gs.currentParticipants || 0))
                      : null;
                  const isFull = effectiveRemaining !== null && effectiveRemaining <= 0;

                  return (
                    <div
                      key={gs.id}
                      style={{
                        borderRadius: '16px',
                        padding: '14px 16px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                          {gs.title}
                        </h4>
                        <span
                          style={{
                            fontSize: '0.84rem',
                            fontWeight: 800,
                            color: '#047857',
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            padding: '2px 9px',
                            borderRadius: '999px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {gs.priceVisible && gs.priceCents != null && gs.priceCents > 0
                            ? formatCurrency(gs.priceCents)
                            : 'Sob consulta'}
                        </span>
                      </div>

                      {gs.description && (
                        <div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '0.8rem',
                              color: '#475569',
                              lineHeight: 1.5,
                              whiteSpace: expandedDescIds[`home_${gs.id}`] ? 'pre-line' : 'normal',
                              ...(expandedDescIds[`home_${gs.id}`]
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
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDescIds((prev) => ({
                                  ...prev,
                                  [`home_${gs.id}`]: !prev[`home_${gs.id}`],
                                }))
                              }
                              style={{
                                marginTop: '4px',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                fontSize: '0.76rem',
                                fontWeight: 800,
                                color: '#21577a',
                                cursor: 'pointer',
                              }}
                            >
                              {expandedDescIds[`home_${gs.id}`] ? 'Ler menos ▴' : 'Ler mais ▾'}
                            </button>
                          )}
                        </div>
                      )}

                      <div className="service-badges-list" style={{ marginTop: '2px' }}>
                        <span className="badge-pill badge-pill-duration">
                          <CalendarDays size={12} /> {gs.date.split('-').reverse().join('/')} · {gs.startTime}
                          {gs.endTime ? ` às ${gs.endTime}` : ''}
                        </span>

                        {gs.showRemainingSpots !== false && (
                          <span
                            className={`badge-pill ${!isFull ? 'blinking-spots-pill' : ''}`}
                            style={{
                              background: isFull ? '#fef2f2' : '#ecfdf5',
                              color: isFull ? '#dc2626' : '#047857',
                              border: `1px solid ${isFull ? '#fecaca' : '#6ee7b7'}`,
                              fontWeight: 800,
                            }}
                          >
                            <Users size={12} />{' '}
                            {isFull
                              ? 'Vagas esgotadas'
                              : effectiveRemaining !== null
                              ? !isUnlimited && gs.customRemainingSpots == null
                                ? `Restam ${effectiveRemaining} de ${gs.maxParticipants} vagas`
                                : `Restam ${effectiveRemaining} vagas`
                              : 'Vagas abertas'}
                          </span>
                        )}

                        {gs.modality === 'presencial' ? (
                          <span className="badge-pill badge-pill-presencial">
                            <MapPin size={12} /> Presencial
                          </span>
                        ) : (
                          <span className="badge-pill badge-pill-online">
                            <Monitor size={12} /> Online
                          </span>
                        )}
                      </div>

                      {gs.audioUrl && (
                        <div style={{ marginTop: '4px' }}>
                          <ServiceAudioPlayer
                            audioUrl={gs.audioUrl}
                            serviceName={gs.title}
                            audioName={gs.audioName}
                            compact
                          />
                        </div>
                      )}

                      {!isFull && (
                        <Link
                          href={`/agendar?tab=grupo&groupSessionId=${gs.id}`}
                          className="promo-cta-btn"
                          style={{
                            marginTop: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '10px 16px',
                            borderRadius: '999px',
                            background: 'linear-gradient(135deg, #1a3a4a 0%, #245d80 100%)',
                            color: '#ffffff',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            textDecoration: 'none',
                            boxShadow: '0 4px 14px rgba(26, 58, 74, 0.22)',
                          }}
                        >
                          <Sparkles size={14} /> Garantir minha vaga neste evento
                        </Link>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        {/* Footer com Alta Legibilidade e Destaque Refinado */}
        <footer className="landing-footer-card">
          <div className="landing-footer-brand">
            <span className="footer-brand-name">© 2026 Camila Machado</span>
            <span className="footer-brand-sep">•</span>
            <span className="footer-brand-role">Hipnose Clínica Multidimensional Integrativa</span>
          </div>

          <div className="landing-footer-links">
            <Link href="/termos" className="footer-pill-link">
              Termos de Uso
            </Link>
            <span className="footer-dot-sep">•</span>
            <Link href="/privacidade" className="footer-pill-link">
              Política de Privacidade (LGPD)
            </Link>
          </div>

          <p className="landing-footer-security">
            <ShieldCheck size={16} className="footer-security-icon" />
            <span>Ambiente seguro com agendamento online e proteção de dados LGPD. Urussanga - SC.</span>
          </p>

          <div className="landing-footer-dev">
            <a
              href="https://www.instagram.com/pconconstrunet/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-dev-link"
            >
              <span>DESENVOLVIDO POR</span>
              <strong>P-CON CONSTRUNET</strong>
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando…</div>}>
      <HomeContent />
    </Suspense>
  );
}

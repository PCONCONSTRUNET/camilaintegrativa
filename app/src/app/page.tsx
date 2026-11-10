'use client';

import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  HeartHandshake,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Monitor,
  Play,
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

interface HomeVideoPublicItem {
  id: string;
  title: string;
  subtitle: string;
  videoUrl: string;
}

interface HomeVideoPublicSection {
  enabled: boolean;
  sectionTitle: string;
  sectionSubtitle: string;
  videos: HomeVideoPublicItem[];
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active drawer/accordion: null | 'servicos' | 'local'
  const [activeDrawer, setActiveDrawer] = useState<'servicos' | 'local' | null>(null);

  // Services list for drawer
  const [services, setServices] = useState<Service[]>([]);
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([]);
  const [expandedDescIds, setExpandedDescIds] = useState<Record<string, boolean>>({});
  const [homeVideoSection, setHomeVideoSection] = useState<HomeVideoPublicSection>({
    enabled: true,
    sectionTitle: 'SessÃµes & Atendimentos Reais',
    sectionSubtitle:
      'Assista a registros reais de sessÃµes e transformaÃ§Ãµes compartilhadas pela Dra. Camila Machado',
    videos: [],
  });

  // Carrossel de Reels: setas para avanÃ§ar/voltar
  const reelsScrollRef = useRef<HTMLDivElement | null>(null);
  const [reelsCanPrev, setReelsCanPrev] = useState(false);
  const [reelsCanNext, setReelsCanNext] = useState(false);

  const updateReelsArrows = useCallback(() => {
    const el = reelsScrollRef.current;
    if (!el) return;
    setReelsCanPrev(el.scrollLeft > 4);
    setReelsCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scrollReels = useCallback((direction: 1 | -1) => {
    const el = reelsScrollRef.current;
    if (!el) return;
    const firstCard = el.firstElementChild as HTMLElement | null;
    const step = firstCard ? firstCard.offsetWidth + 14 : 264;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    updateReelsArrows();
    window.addEventListener('resize', updateReelsArrows);
    return () => window.removeEventListener('resize', updateReelsArrows);
  }, [homeVideoSection.videos.length, updateReelsArrows]);

  // Redirecionamento inteligente ao abrir PWA instalado (Standalone)
  useEffect(() => {
    try {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        // @ts-expect-error - navigator.standalone especÃ­fico do iOS Safari
        window.navigator.standalone === true;

      if (!isStandalone) return;

      // Se o usuÃ¡rio quer explicitamente ver a landing page pÃºblica dentro do PWA (ex: ?site=1 ou ?home=1)
      const stayOnSite = searchParams.get('site') === '1' || searchParams.get('home') === '1';
      if (stayOnSite) return;

      const hasAdminCookie = document.cookie.includes('clinica_session=');
      const hasClientCookie = document.cookie.includes('clinica_client_session=');
      const preferredPortal = localStorage.getItem('clinica_pwa_portal');

      if (hasAdminCookie || preferredPortal === 'admin') {
        router.replace('/admin');
        return;
      }

      if (hasClientCookie || preferredPortal === 'cliente') {
        router.replace('/cliente');
        return;
      }
    } catch {}
  }, [router, searchParams]);

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

    fetch('/api/public/home-video', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.section) {
          setHomeVideoSection({
            enabled: Boolean(data.section.enabled),
            sectionTitle: data.section.sectionTitle || 'SessÃµes & Atendimentos Reais',
            sectionSubtitle:
              data.section.sectionSubtitle ??
              'Assista a registros reais de sessÃµes e transformaÃ§Ãµes compartilhadas pela Dra. Camila Machado',
            videos: Array.isArray(data.section.videos) ? data.section.videos : [],
          });
        }
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
              src="/camila-home.jpeg"
              alt="Camila Machado"
              width={140}
              height={140}
              className="linktree-avatar-img"
              priority
            />
          </div>

          <Image
            src="/logo-camila-machado.png"
            alt="Camila Machado - Hipnose ClÃ­nica Multidimensional Integrativa"
            width={320}
            height={95}
            className="linktree-logo-img"
            priority
          />

          <span className="linktree-badge-title">
            <Sparkles size={13} /> Hipnose ClÃ­nica Multidimensional Integrativa
          </span>

          <p className="linktree-bio-text">
            Um espaÃ§o de escuta, cuidado e presenÃ§a para sua transformaÃ§Ã£o emocional e autoconhecimento.
          </p>

          {/* Faixa de Contato RÃ¡pido: Apenas Ãcones WhatsApp e Instagram */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              marginTop: '6px',
            }}
          >
            <a
              href="https://wa.me/5548999287685"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              title="WhatsApp"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(37, 211, 102, 0.14)',
                color: '#16a34a',
                border: '1.5px solid rgba(37, 211, 102, 0.38)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.12)',
                transition: 'transform 0.18s ease',
              }}
            >
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
                <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
              </svg>
            </a>

            <a
              href="https://www.instagram.com/eu.camilahipnoseintegrativa/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              title="Instagram"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'rgba(225, 48, 108, 0.12)',
                color: '#e1306c',
                border: '1.5px solid rgba(225, 48, 108, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(225, 48, 108, 0.12)',
                transition: 'transform 0.18s ease',
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
              </svg>
            </a>
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
                <p>Consulte dias e horÃ¡rios livres em tempo real</p>
              </div>
            </div>
            <div className="card-btn-right">
              <ChevronRight size={18} className="card-btn-arrow" />
            </div>
          </Link>

          {/* Card 2: Ãrea do Cliente (Portal) -> Rota externa dedicada */}
          <Link
            href="/cliente/entrar"
            className="linktree-card-btn client-highlight"
          >
            <div className="card-btn-left">
              <div className="card-btn-icon">
                <UserCheck size={22} />
              </div>
              <div className="card-btn-text">
                <h3>Ãrea do Cliente (Portal)</h3>
                <p>Criar conta ou acessar histÃ³rico e teleatendimento</p>
              </div>
            </div>
            <div className="card-btn-right">
              <span className="card-btn-badge" style={{ background: '#fdf5e6', color: '#b8860b' }}>
                Portal
              </span>
              <ChevronRight size={18} className="card-btn-arrow" />
            </div>
          </Link>

          {/* Card 3: Nossos ServiÃ§os & Abordagens */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'servicos' ? null : 'servicos')}
            className={`linktree-card-btn ${activeDrawer === 'servicos' ? 'active-open' : ''}`}
          >
            <div className="card-btn-left">
              <div className="card-btn-icon">
                <HeartHandshake size={22} />
              </div>
              <div className="card-btn-text">
                <h3>ServiÃ§os & Metodologia</h3>
                <p>Conversa inicial, sessÃµes de hipnose e acompanhamento</p>
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

          {/* Embedded Drawer: ServiÃ§os */}
          {activeDrawer === 'servicos' && (
            <div className="linktree-drawer">
              <div className="drawer-header">
                <div className="drawer-title-row">
                  <HeartHandshake size={18} className="text-primary" />
                  <h2>ServiÃ§os Oferecidos</h2>
                </div>
                <button
                  onClick={() => setActiveDrawer(null)}
                  className="drawer-close-btn"
                  aria-label="Fechar serviÃ§os"
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
                    {s.description && (
                      <div style={{ margin: '4px 0 6px' }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '0.85rem',
                            color: '#475569',
                            lineHeight: 1.5,
                            whiteSpace: expandedDescIds[`svc_${s.id}`] ? 'pre-line' : 'normal',
                            ...(expandedDescIds[`svc_${s.id}`]
                              ? { maxHeight: '240px', overflowY: 'auto', paddingRight: '6px' }
                              : {
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }),
                          }}
                        >
                          {s.description}
                        </p>
                        {s.description.length > 80 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDescIds((prev) => ({
                                ...prev,
                                [`svc_${s.id}`]: !prev[`svc_${s.id}`],
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
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            {expandedDescIds[`svc_${s.id}`] ? (
                              <>
                                <span>Recolher</span>
                                <ChevronUp size={13} />
                              </>
                            ) : (
                              <>
                                <span>Ver mais</span>
                                <ChevronDown size={13} />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
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
                            âœ“ {t.name}: <strong>{formatCurrency(t.priceCents)}</strong>
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
                      <span>SessÃµes em Grupo com Vagas Abertas</span>
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
                                <Users size={11} /> SessÃ£o em Grupo
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
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                      }),
                                }}
                              >
                                {gs.description}
                              </p>
                              {gs.description.length > 80 && (
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
                                    fontSize: '0.76rem',
                                    fontWeight: 800,
                                    color: '#21577a',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  {expandedDescIds[`drawer_${gs.id}`] ? (
                                    <>
                                      <span>Recolher</span>
                                      <ChevronUp size={13} />
                                    </>
                                  ) : (
                                    <>
                                      <span>Ver mais</span>
                                      <ChevronDown size={13} />
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                          <div className="service-badges-list" style={{ marginTop: '8px' }}>
                            <span className="badge-pill badge-pill-duration">
                              <CalendarDays size={12} /> {gs.date.split('-').reverse().join('/')} Â· {gs.startTime}
                              {gs.endTime ? ` Ã s ${gs.endTime}` : ''}
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
                                    ? `${spotsLeft} de ${gs.maxParticipants} vagas disponÃ­veis`
                                    : `Restam ${spotsLeft} vagas`
                                  : 'Vagas abertas'}
                              </span>
                            )}
                            {gs.modality === 'presencial' ? (
                              <span className="badge-pill badge-pill-presencial">
                                <MapPin size={12} /> Presencial{gs.locationNotes ? ` Â· ${gs.locationNotes}` : ''}
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
                                <CalendarDays size={13} /> Garantir minha vaga nesta sessÃ£o
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
                <p>Tire dÃºvidas diretamente com a clÃ­nica</p>
              </div>
            </div>
            <div className="card-btn-right">
              <ChevronRight size={18} className="card-btn-arrow" />
            </div>
          </a>

          {/* Card 5: Onde Atendemos (ConsultÃ³rio & Teleconsulta) */}
          <button
            onClick={() => setActiveDrawer(activeDrawer === 'local' ? null : 'local')}
            className={`linktree-card-btn ${activeDrawer === 'local' ? 'active-open' : ''}`}
          >
            <div className="card-btn-left">
              <div className="card-btn-icon">
                <MapPin size={22} />
              </div>
              <div className="card-btn-text">
                <h3>LocalizaÃ§Ã£o & Atendimento Online</h3>
                <p>ConsultÃ³rio presencial e teleatendimento seguro</p>
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
                  aria-label="Fechar localizaÃ§Ã£o"
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="service-expand-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <MapPin size={18} className="text-primary" />
                    <h3>ConsultÃ³rio Presencial</h3>
                  </div>
                  <p>
                    EspaÃ§o acolhedor e privativo, projetado para oferecer o mÃ¡ximo conforto e tranquilidade durante sua sessÃ£o de hipnose clÃ­nica.
                  </p>
                  <span style={{ fontSize: '0.82rem', color: '#647784' }}>
                    Urussanga - SC â€¢ EndereÃ§o com orientaÃ§Ãµes enviado apÃ³s confirmaÃ§Ã£o da sessÃ£o.
                  </span>
                </div>

                <div className="service-expand-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Video size={18} className="text-primary" />
                    <h3>Teleatendimento Seguro (Online)</h3>
                  </div>
                  <p>
                    Atendimento de onde vocÃª estiver com o mesmo acolhimento, via sala de videoconferÃªncia com link criptografado e exclusivo na Ãrea do Cliente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Eventos em Grupo DisponÃ­veis (No Final da PÃ¡gina com Gatilho Pulsante) */}
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
                  <span>âœ¨ CONDIÃ‡ÃƒO ESPECIAL â€¢ VAGAS LIMITADAS</span>
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
                  ðŸ”¥ Ãšltimas Vagas
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
                      Eventos em Grupo DisponÃ­veis
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      VivÃªncias e encontros especiais com data marcada
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
                  Ver todos â†’
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
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }),
                            }}
                          >
                            {gs.description}
                          </p>
                          {gs.description.length > 80 && (
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
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              {expandedDescIds[`home_${gs.id}`] ? (
                                <>
                                  <span>Recolher</span>
                                  <ChevronUp size={13} />
                                </>
                              ) : (
                                <>
                                  <span>Ver mais</span>
                                  <ChevronDown size={13} />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      <div className="service-badges-list" style={{ marginTop: '2px' }}>
                        <span className="badge-pill badge-pill-duration">
                          <CalendarDays size={12} /> {gs.date.split('-').reverse().join('/')} Â· {gs.startTime}
                          {gs.endTime ? ` Ã s ${gs.endTime}` : ''}
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
                            <MapPin size={12} /> Presencial{gs.locationNotes ? ` Â· ${gs.locationNotes}` : ''}
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

        {/* SeÃ§Ã£o de SessÃµes & Atendimentos Reais no Fim da Home (Formato Reels 9:16 Sem Bordas Pretas) */}
        {homeVideoSection.enabled && (
          <section
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.97)',
              borderRadius: '20px',
              padding: '16px',
              border: '1.5px solid rgba(229, 200, 142, 0.55)',
              boxShadow: '0 10px 28px rgba(10, 26, 39, 0.16)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #245d80 0%, #163d57 100%)',
                    color: '#e5c88e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(22, 61, 87, 0.25)',
                  }}
                >
                  <Play size={18} fill="currentColor" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      color: '#b8860b',
                      marginBottom: '2px',
                    }}
                  >
                    Reels Â· SessÃµes na ClÃ­nica
                  </span>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '1.02rem',
                      fontWeight: 800,
                      color: '#123247',
                      lineHeight: 1.25,
                    }}
                  >
                    {homeVideoSection.sectionTitle || 'SessÃµes & Atendimentos Reais'}
                  </h2>
                  {homeVideoSection.sectionSubtitle && (
                    <p
                      style={{
                        margin: '3px 0 0',
                        fontSize: '0.79rem',
                        color: '#475569',
                        lineHeight: 1.38,
                      }}
                    >
                      {homeVideoSection.sectionSubtitle}
                    </p>
                  )}
                </div>
              </div>

              {homeVideoSection.videos.length > 1 && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background: '#f0f9ff',
                    color: '#1b4b6b',
                    border: '1px solid #bae6fd',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {homeVideoSection.videos.length} sessÃµes
                </span>
              )}
            </div>

            {homeVideoSection.videos.length > 0 ? (
              <div style={{ position: 'relative' }}>
              {homeVideoSection.videos.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="VÃ­deo anterior"
                    onClick={() => scrollReels(-1)}
                    disabled={!reelsCanPrev}
                    style={{
                      position: 'absolute',
                      left: '-6px',
                      top: '222px',
                      transform: 'translateY(-50%)',
                      zIndex: 3,
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      border: '1.5px solid rgba(229, 200, 142, 0.7)',
                      background: 'rgba(13, 34, 50, 0.88)',
                      color: '#e5c88e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: reelsCanPrev ? 'pointer' : 'default',
                      opacity: reelsCanPrev ? 1 : 0,
                      pointerEvents: reelsCanPrev ? 'auto' : 'none',
                      boxShadow: '0 6px 16px rgba(0, 0, 0, 0.28)',
                      transition: 'opacity 0.2s ease',
                    }}
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    aria-label="PrÃ³ximo vÃ­deo"
                    onClick={() => scrollReels(1)}
                    disabled={!reelsCanNext}
                    style={{
                      position: 'absolute',
                      right: '-6px',
                      top: '222px',
                      transform: 'translateY(-50%)',
                      zIndex: 3,
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      border: '1.5px solid rgba(229, 200, 142, 0.7)',
                      background: 'rgba(13, 34, 50, 0.88)',
                      color: '#e5c88e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: reelsCanNext ? 'pointer' : 'default',
                      opacity: reelsCanNext ? 1 : 0,
                      pointerEvents: reelsCanNext ? 'auto' : 'none',
                      boxShadow: '0 6px 16px rgba(0, 0, 0, 0.28)',
                      transition: 'opacity 0.2s ease',
                    }}
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}
              <div
                ref={reelsScrollRef}
                onScroll={updateReelsArrows}
                style={{
                  display: 'flex',
                  gap: '14px',
                  overflowX: homeVideoSection.videos.length > 1 ? 'auto' : 'visible',
                  justifyContent: homeVideoSection.videos.length === 1 ? 'center' : 'flex-start',
                  scrollSnapType: 'x mandatory',
                  paddingBottom: homeVideoSection.videos.length > 1 ? '6px' : '0',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'none',
                }}
              >
                {homeVideoSection.videos.map((vid) => (
                  <div
                    key={vid.id}
                    style={{
                      flex:
                        homeVideoSection.videos.length === 1
                          ? '0 1 285px'
                          : '0 0 250px',
                      width: '100%',
                      maxWidth: homeVideoSection.videos.length === 1 ? '285px' : '250px',
                      scrollSnapAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '7px',
                    }}
                  >
                    {/* Moldura 9:16 Pura de Reels â€” Preenche 100% sem bordas pretas */}
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '9 / 16',
                        borderRadius: '18px',
                        overflow: 'hidden',
                        position: 'relative',
                        background: '#0d2232',
                        border: '1.5px solid rgba(229, 200, 142, 0.5)',
                        boxShadow: '0 8px 22px rgba(13, 34, 50, 0.2)',
                      }}
                    >
                      <video
                        src={vid.videoUrl}
                        controls
                        playsInline
                        preload="metadata"
                        onPlay={(e) => {
                          const currentVideo = e.currentTarget;
                          document.querySelectorAll('video').forEach((other) => {
                            if (other !== currentVideo && !other.paused) {
                              other.pause();
                            }
                          });
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    </div>

                    {(vid.title || vid.subtitle) && (
                      <div style={{ padding: '0 4px' }}>
                        {vid.title && (
                          <div
                            style={{
                              fontSize: '0.84rem',
                              fontWeight: 800,
                              color: '#123247',
                              lineHeight: 1.25,
                            }}
                          >
                            {vid.title}
                          </div>
                        )}
                        {vid.subtitle && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#475569',
                              lineHeight: 1.35,
                              marginTop: '2px',
                            }}
                          >
                            {vid.subtitle}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  maxWidth: '270px',
                  aspectRatio: '9 / 16',
                  margin: '0 auto',
                  borderRadius: '18px',
                  padding: '28px 18px',
                  background: 'linear-gradient(145deg, #0f293c 0%, #1b4b6b 100%)',
                  color: '#ffffff',
                  textAlign: 'center',
                  border: '1.5px dashed rgba(229, 200, 142, 0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    background: 'rgba(229, 200, 142, 0.18)',
                    border: '1px solid rgba(229, 200, 142, 0.45)',
                    color: '#e5c88e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Play size={22} fill="currentColor" />
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f8fafc' }}>
                  SessÃµes em Formato Reels
                </div>
                <div
                  style={{
                    fontSize: '0.76rem',
                    color: 'rgba(255,255,255,0.8)',
                    lineHeight: 1.4,
                  }}
                >
                  EspaÃ§o preparado para compartilhar os vÃ­deos das sessÃµes e atendimentos da clÃ­nica.
                </div>
              </div>
            )}
          </section>
        )}

        {/* Footer Normal com Alta Legibilidade */}
        <footer className="landing-footer-normal">
          <p className="footer-brand-line">
            <span className="footer-brand-name">Â© 2026 Camila Machado</span>
            <span className="footer-brand-sep">â€¢</span>
            <span className="footer-brand-role">Hipnose ClÃ­nica Multidimensional Integrativa</span>
          </p>

          <p className="footer-links-line">
            <Link href="/termos" className="footer-text-link">
              Termos de Uso
            </Link>
            <span className="footer-dot-sep">â€¢</span>
            <Link href="/privacidade" className="footer-text-link">
              PolÃ­tica de Privacidade (LGPD)
            </Link>
          </p>

          <p className="footer-security-line">
            <ShieldCheck size={16} className="footer-security-icon" />
            <span>Ambiente seguro com agendamento online e proteÃ§Ã£o de dados LGPD. Urussanga - SC.</span>
          </p>

          <div className="footer-dev-line">
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
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregandoâ€¦</div>}>
      <HomeContent />
    </Suspense>
  );
}

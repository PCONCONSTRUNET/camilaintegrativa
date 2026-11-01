'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Download, Share2, PlusSquare, X, Smartphone, Sparkles, ShieldCheck } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallPrompt() {
  const pathname = usePathname() || '/';
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  const isCliente = pathname.startsWith('/cliente');
  const isAdmin = pathname.startsWith('/admin') || pathname === '/entrar';
  const portalType = isCliente ? 'cliente' : isAdmin ? 'admin' : 'root';

  // Registrar a preferência do portal para inicialização inteligente do PWA
  useEffect(() => {
    try {
      if (isCliente) {
        localStorage.setItem('clinica_pwa_portal', 'cliente');
      } else if (isAdmin) {
        localStorage.setItem('clinica_pwa_portal', 'admin');
      }
    } catch {}
  }, [isCliente, isAdmin]);

  useEffect(() => {
    // Verificar se já está rodando como PWA instalado (Standalone)
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error - navigator.standalone é específico do Safari iOS
      window.navigator.standalone === true;

    if (isStandaloneMode) {
      setIsStandalone(true);
      return;
    }

    // Verificar se foi dispensado recentemente nos últimos 7 dias para este portal
    const dismissKey = `pwa_prompt_dismissed_at_${portalType}`;
    const dismissedAt = localStorage.getItem(dismissKey);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < 7 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // Detectar iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(ua);
    setIsIOS(isIOSDevice);

    // No Android / Chrome / Edge
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // No iOS Safari (não emite beforeinstallprompt), mostrar o aviso suavemente se for mobile
    if (isIOSDevice && !isStandaloneMode) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, [portalType]);

  if (isStandalone || !showPrompt) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn('Erro ao disparar prompt PWA:', err);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSModal(false);
    try {
      localStorage.setItem(`pwa_prompt_dismissed_at_${portalType}`, Date.now().toString());
    } catch {}
  };

  const title = isCliente
    ? 'Instalar Camila Integrativa'
    : isAdmin
    ? 'Instalar Admin Camila'
    : 'Instalar Camila Integrativa';

  const subtitle = isCliente
    ? 'Consultas, sessões e lembretes na sua tela inicial'
    : isAdmin
    ? 'Agenda, prontuários e pacientes na sua tela inicial'
    : 'Acesso rápido e notificações no seu celular';

  const modalTitle = isCliente
    ? 'Instalar Camila Integrativa no iPhone'
    : isAdmin
    ? 'Instalar Admin Camila no iPhone'
    : 'Instalar Camila Integrativa no iPhone';

  const modalSubtitle = isCliente
    ? 'Abra direto seu portal de consultas e receba lembretes de atendimento no celular:'
    : isAdmin
    ? 'Abra direto a agenda do dia, prontuários e gestão da clínica com um toque:'
    : 'Para instalar este aplicativo na sua tela de início e receber notificações instantâneas:';

  return (
    <>
      {/* Barra/Pill Flutuante Discreta de Instalação */}
      <aside
        aria-label="Instalar aplicativo"
        style={{
          position: 'fixed',
          bottom: '18px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9998,
          maxWidth: '430px',
          width: 'calc(100% - 32px)',
          background: isCliente
            ? 'linear-gradient(135deg, #1e4a64 0%, #245D80 100%)'
            : isAdmin
            ? 'linear-gradient(135deg, #0f172a 0%, #182B38 100%)'
            : 'linear-gradient(135deg, #182B38 0%, #245D80 100%)',
          color: '#ffffff',
          borderRadius: '16px',
          padding: '12px 14px',
          boxShadow: '0 12px 32px rgba(24, 43, 56, 0.35), 0 2px 6px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          animation: 'fadeInUp 0.3s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon-192.png"
              alt="Camila Machado"
              style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'contain' }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </p>
            <p style={{ margin: 0, fontSize: '0.70rem', color: '#B8D5E5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleInstallClick}
            style={{
              background: '#D4A843',
              color: '#182B38',
              border: 'none',
              borderRadius: '10px',
              padding: '7px 12px',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            {isIOS ? <Smartphone size={13} /> : <Download size={13} />}
            Instalar
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Fechar"
            style={{
              background: 'transparent',
              color: '#B8D5E5',
              border: 'none',
              padding: '6px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>
      </aside>

      {/* Modal explicativo para iOS Safari */}
      {showIOSModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Como instalar no iPhone"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={handleDismiss}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '420px',
              width: '100%',
              padding: '24px 20px',
              color: '#182B38',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              position: 'relative',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleDismiss}
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
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

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon-192.png"
              alt="Camila Machado"
              style={{ width: '56px', height: '56px', borderRadius: '14px', margin: '0 auto 12px' }}
            />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 6px', color: '#182B38' }}>
              {modalTitle}
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 18px', lineHeight: 1.45 }}>
              {modalSubtitle}
            </p>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px 16px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '0.84rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '6px', borderRadius: '8px' }}>
                  <Share2 size={16} />
                </div>
                <span><strong>1.</strong> Toque no botão <strong>Compartilhar</strong> na barra do Safari.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#fef3c7', color: '#b45309', padding: '6px', borderRadius: '8px' }}>
                  <PlusSquare size={16} />
                </div>
                <span><strong>2.</strong> Role para baixo e selecione <strong>&quot;Adicionar à Tela de Início&quot;</strong>.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', color: '#047857', padding: '6px', borderRadius: '8px' }}>
                  {isCliente ? <Sparkles size={16} /> : <ShieldCheck size={16} />}
                </div>
                <span><strong>3.</strong> Toque em <strong>Adicionar</strong>. O app abrirá direto no seu portal!</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              style={{
                marginTop: '18px',
                width: '100%',
                padding: '11px',
                background: isCliente ? '#245D80' : isAdmin ? '#182B38' : '#245D80',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.86rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}

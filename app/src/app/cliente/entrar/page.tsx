'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, LockKeyhole, UserCheck, UserPlus, ShieldCheck, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { maskCpf, maskPhone } from '@/lib/utils';

function toIsoDate(val: string): string {
  if (!val) return '';
  if (val.includes('-')) return val;
  const parts = val.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return val;
}

function ClientAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<'login' | 'cadastro'>('login');

  // Cadastro
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);

  // CPF Check Status
  const [cpfStatus, setCpfStatus] = useState<{
    searching: boolean;
    foundAnamnese: boolean;
    alreadyHasPassword: boolean;
  }>({
    searching: false,
    foundAnamnese: false,
    alreadyHasPassword: false,
  });

  // Login
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      window.localStorage.setItem('clinica_pwa_portal', 'cliente');
    } catch {}

    const modo = searchParams.get('modo');
    if (modo === 'cadastro') {
      setTab('cadastro');
    } else {
      setTab('login');
    }

    const initialCpf = searchParams.get('cpf');
    if (initialCpf) {
      setCpf(maskCpf(initialCpf));
    }
  }, [searchParams]);

  // Consulta automática de CPF no banco interno para vincular perfil de anamnese
  useEffect(() => {
    if (tab !== 'cadastro') return;
    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf.length === 11) {
      let active = true;
      setCpfStatus({ searching: true, foundAnamnese: false, alreadyHasPassword: false });
      fetch(`/api/public/check-cpf?cpf=${cleanCpf}`)
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (data && data.found) {
            if (data.hasPassword) {
              setCpfStatus({ searching: false, foundAnamnese: false, alreadyHasPassword: true });
            } else {
              setCpfStatus({ searching: false, foundAnamnese: true, alreadyHasPassword: false });
              if (data.name) setName(data.name);
              if (data.phone) setPhone(maskPhone(data.phone));
              if (data.birthDate) setBirthDate(toIsoDate(data.birthDate));
              if (data.email) setEmail(data.email);
            }
          } else {
            setCpfStatus({ searching: false, foundAnamnese: false, alreadyHasPassword: false });
          }
        })
        .catch(() => {
          if (active) setCpfStatus({ searching: false, foundAnamnese: false, alreadyHasPassword: false });
        });
      return () => {
        active = false;
      };
    } else {
      setCpfStatus({ searching: false, foundAnamnese: false, alreadyHasPassword: false });
    }
  }, [cpf, tab]);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!terms) {
      setError('Você precisa concordar com os termos de privacidade para continuar.');
      return;
    }
    setLoading(true);

    try {
      const res = await fetch('/api/client/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          cpf,
          birthDate,
          email: email || null,
          password,
        }),
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.error || 'Erro ao criar conta.');
        return;
      }

      router.push('/cliente');
    } catch {
      setLoading(false);
      setError('Falha de conexão ao criar conta.');
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/client/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginIdentifier,
          password: loginPassword,
        }),
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setError(data.error || 'Identificador ou senha incorretos.');
        return;
      }

      router.push('/cliente');
    } catch {
      setLoading(false);
      setError('Falha de conexão ao entrar.');
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #fdf8f0 0%, #f5f0e8 50%, #edf4f8 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 16px',
    }}>
      
      {/* Botão Voltar */}
      <div style={{ width: '100%', maxWidth: '400px', marginBottom: '12px' }}>
        <Link
          href="/"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#7a6a55', fontWeight: 600, textDecoration: 'none' }}
        >
          <ArrowLeft size={15} /> Voltar à Página Inicial
        </Link>
      </div>

      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: '#ffffff',
        borderRadius: '22px',
        padding: '28px 24px',
        boxShadow: '0 8px 40px rgba(60, 40, 10, 0.08)',
        border: '1px solid #ede4d6',
      }}>
        
        {/* Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <Image
            src="/logo-camila-machado.png"
            alt="Camila Machado"
            width={170}
            height={50}
            priority
            style={{ margin: '0 auto 10px', height: 'auto', maxWidth: '155px' }}
          />
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1a2e3a', margin: '0 0 4px' }}>
            {tab === 'login' ? 'Bem-vindo(a) de volta' : 'Crie sua Conta'}
          </h1>
          <p style={{ fontSize: '0.78rem', color: '#8a9aaa', margin: 0 }}>
            {tab === 'login'
              ? 'Acesse seus agendamentos e histórico de sessões'
              : 'Preencha os dados para acessar seu espaço de cuidado'}
          </p>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', background: '#f4ede2', borderRadius: '50px', padding: '4px', marginBottom: '18px', gap: '4px' }}>
          <button
            type="button"
            onClick={() => { setTab('login'); setError(''); }}
            style={{
              flex: 1,
              padding: '8px 0',
              fontSize: '0.82rem',
              fontWeight: 600,
              borderRadius: '50px',
              border: 'none',
              background: tab === 'login' ? '#1a2e3a' : 'transparent',
              color: tab === 'login' ? '#ffffff' : '#7a6a55',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            <LockKeyhole size={13} /> Entrar
          </button>

          <button
            type="button"
            onClick={() => { setTab('cadastro'); setError(''); }}
            style={{
              flex: 1,
              padding: '8px 0',
              fontSize: '0.82rem',
              fontWeight: 600,
              borderRadius: '50px',
              border: 'none',
              background: tab === 'cadastro' ? '#1a2e3a' : 'transparent',
              color: tab === 'cadastro' ? '#ffffff' : '#7a6a55',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            <UserPlus size={13} /> Criar Conta
          </button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', fontSize: '0.78rem', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        {/* FORMULÁRIO DE LOGIN */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="form-group">
              <span className="form-label" style={{ fontSize: '0.79rem', color: '#5a6a7a', marginBottom: '3px' }}>CPF, WhatsApp ou E-mail</span>
              <input
                className="form-input"
                style={{ padding: '10px 13px', fontSize: '0.875rem', borderRadius: '10px', border: '1.5px solid #ddd5c8', background: '#fdfaf6' }}
                type="text"
                placeholder="CPF, (00) 00000-0000 ou seu@email.com"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                required
              />
            </label>

            <label className="form-group">
              <span className="form-label" style={{ fontSize: '0.79rem', color: '#5a6a7a', marginBottom: '3px' }}>Sua Senha</span>
              <input
                className="form-input"
                style={{ padding: '10px 13px', fontSize: '0.875rem', borderRadius: '10px', border: '1.5px solid #ddd5c8', background: '#fdfaf6' }}
                type="password"
                placeholder="Digite sua senha"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '4px',
                padding: '12px 14px',
                fontSize: '0.9rem',
                fontWeight: 700,
                background: '#1a2e3a',
                color: '#fff',
                border: 'none',
                borderRadius: '50px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                letterSpacing: '0.01em',
              }}
            >
              {loading ? 'Entrando...' : 'Entrar no Portal'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#8a9aaa', marginTop: '2px' }}>
              Não possui uma conta?{' '}
              <button
                type="button"
                onClick={() => { setTab('cadastro'); setError(''); }}
                style={{ color: '#b8892a', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Cadastre-se aqui
              </button>
            </p>
          </form>
        )}

        {/* FORMULÁRIO DE CADASTRO */}
        {tab === 'cadastro' && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
            {cpfStatus.foundAnamnese && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  fontSize: '0.78rem',
                  color: '#166534',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                }}
              >
                <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#16a34a' }} />
                <div>
                  <strong>Ficha de Anamnese localizada!</strong> Preenchemos seus dados cadastrais automaticamente. Agora basta definir sua senha para ativar seu acesso ao portal.
                </div>
              </div>
            )}

            {cpfStatus.alreadyHasPassword && (
              <div
                style={{
                  background: '#eff6ff',
                  border: '1.5px solid #93c5fd',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  fontSize: '0.78rem',
                  color: '#1e40af',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                }}
              >
                <UserCheck size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#2563eb' }} />
                <div>
                  <strong>Você já possui uma conta ativa!</strong> Este CPF já está cadastrado.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setTab('login');
                      setLoginIdentifier(cpf);
                      setError('');
                    }}
                    style={{
                      color: '#1d4ed8',
                      fontWeight: 700,
                      textDecoration: 'underline',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Clique aqui para entrar
                  </button>
                </div>
              </div>
            )}

            <label className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <span className="form-label" style={{ fontSize: '0.79rem', color: '#5a6a7a' }}>CPF *</span>
                {cpfStatus.searching && (
                  <span style={{ fontSize: '0.7rem', color: '#8a9aaa', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Buscando dados...
                  </span>
                )}
              </div>
              <input
                className="form-input"
                style={{
                  padding: '10px 13px',
                  fontSize: '0.875rem',
                  borderRadius: '10px',
                  border: cpfStatus.foundAnamnese ? '1.5px solid #16a34a' : '1.5px solid #ddd5c8',
                  background: cpfStatus.foundAnamnese ? '#f0fdf4' : '#fdfaf6',
                }}
                type="text"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))}
                required
              />
            </label>

            <label className="form-group">
              <span className="form-label" style={{ fontSize: '0.79rem', color: '#5a6a7a', marginBottom: '3px' }}>Nome Completo *</span>
              <input
                className="form-input"
                style={{ padding: '10px 13px', fontSize: '0.875rem', borderRadius: '10px', border: '1.5px solid #ddd5c8', background: '#fdfaf6' }}
                type="text"
                placeholder="Ex: Maria Aparecida"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <label className="form-group">
                <span className="form-label" style={{ fontSize: '0.79rem', color: '#5a6a7a', marginBottom: '3px' }}>WhatsApp com DDD *</span>
                <input
                  className="form-input"
                  style={{ padding: '10px 13px', fontSize: '0.875rem', borderRadius: '10px', border: '1.5px solid #ddd5c8', background: '#fdfaf6' }}
                  type="tel"
                  placeholder="(48) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  required
                />
              </label>

              <label className="form-group">
                <span className="form-label" style={{ fontSize: '0.79rem', color: '#5a6a7a', marginBottom: '3px' }}>Nascimento *</span>
                <input
                  className="form-input"
                  style={{ padding: '10px 13px', fontSize: '0.875rem', borderRadius: '10px', border: '1.5px solid #ddd5c8', background: '#fdfaf6' }}
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <label className="form-group">
                <span className="form-label" style={{ fontSize: '0.79rem', color: '#5a6a7a', marginBottom: '3px' }}>E-mail *</span>
                <input
                  className="form-input"
                  style={{ padding: '10px 13px', fontSize: '0.875rem', borderRadius: '10px', border: '1.5px solid #ddd5c8', background: '#fdfaf6' }}
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label className="form-group">
                <span className="form-label" style={{ fontSize: '0.79rem', color: '#5a6a7a', marginBottom: '3px' }}>Senha (mín. 6) *</span>
                <input
                  className="form-input"
                  style={{ padding: '10px 13px', fontSize: '0.875rem', borderRadius: '10px', border: '1.5px solid #ddd5c8', background: '#fdfaf6' }}
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </label>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.74rem', color: '#7a8a9a', marginTop: '2px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                required
                style={{ marginTop: '2px', accentColor: '#1a2e3a' }}
              />
              <span>
                Li e concordo com os{' '}
                <Link href="/termos" target="_blank" style={{ color: '#b8892a', fontWeight: 600, textDecoration: 'underline' }}>
                  Termos
                </Link>{' '}
                e{' '}
                <Link href="/privacidade" target="_blank" style={{ color: '#b8892a', fontWeight: 600, textDecoration: 'underline' }}>
                  Privacidade (LGPD)
                </Link>.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '4px',
                padding: '12px 14px',
                fontSize: '0.9rem',
                fontWeight: 700,
                background: cpfStatus.foundAnamnese ? '#16a34a' : '#1a2e3a',
                color: '#fff',
                border: 'none',
                borderRadius: '50px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                letterSpacing: '0.01em',
                boxShadow: cpfStatus.foundAnamnese ? '0 4px 14px rgba(22, 163, 74, 0.3)' : undefined,
                transition: 'all 0.2s ease',
              }}
            >
              {loading
                ? 'Concluindo...'
                : cpfStatus.foundAnamnese
                ? 'Ativar Acesso no Portal'
                : 'Concluir Cadastro'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#8a9aaa', marginTop: '2px' }}>
              Já possui conta?{' '}
              <button
                type="button"
                onClick={() => { setTab('login'); setError(''); }}
                style={{ color: '#b8892a', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Fazer login
              </button>
            </p>
          </form>
        )}

      </div>
    </div>
  );
}

export default function ClientAuthPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Carregando...</div>}>
      <ClientAuthContent />
    </Suspense>
  );
}


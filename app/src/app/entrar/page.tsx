'use client';

import { FormEvent, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem('clinica_pwa_portal', 'admin');
    } catch {}
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await response.json();
    setLoading(false);
    if (!response.ok) return setError(body.error ?? 'Não foi possível entrar.');
    router.replace('/admin');
    router.refresh();
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <Link href="/" className="back-link"><ArrowLeft size={16} /> Voltar ao site</Link>
        <Image src="/logo-camila-machado.png" alt="Camila Machado" width={210} height={72} className="login-logo" priority />
        <div className="login-heading">
          <span className="icon-disc"><LockKeyhole size={21} /></span>
          <div><p>Área restrita</p><h1 id="login-title">Acessar painel</h1></div>
        </div>
        <p>Digite seu e-mail e senha exclusivos para acessar o painel da clínica.</p>
        <form onSubmit={submit} className="login-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
          <label className="form-group" style={{ marginBottom: 0 }}><span className="form-label">E-mail</span><input className="form-input" type="email" placeholder="Seu e-mail de acesso" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label className="form-group" style={{ marginBottom: 0 }}><span className="form-label">Senha</span><span className="password-field"><input className="form-input" type={showPassword ? 'text' : 'password'} placeholder="Sua senha" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
          {error && <div className="form-alert" role="alert" style={{ marginBottom: 0 }}>{error}</div>}
          <button className="btn btn-primary btn-lg w-full" style={{ marginTop: '8px' }} disabled={loading}>{loading ? 'Entrando…' : 'Entrar no painel'}</button>
        </form>
      </section>
    </main>
  );
}

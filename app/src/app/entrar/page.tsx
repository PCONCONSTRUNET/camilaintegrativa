'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@clinica.local');
  const [password, setPassword] = useState('clinica-demo');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        <p>Entre com as credenciais administrativas configuradas para esta instalação.</p>
        <form onSubmit={submit} className="login-form">
          <label className="form-group"><span className="form-label">E-mail</span><input className="form-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label className="form-group"><span className="form-label">Senha</span><span className="password-field"><input className="form-input" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
          {error && <div className="form-alert" role="alert">{error}</div>}
          <button className="btn btn-primary btn-lg w-full" disabled={loading}>{loading ? 'Entrando…' : 'Entrar no painel'}</button>
        </form>
        <div className="demo-credentials"><strong>Ambiente local de demonstração</strong><span>admin@clinica.local · clinica-demo</span><small>Troque as credenciais por variáveis de ambiente antes de publicar.</small></div>
      </section>
    </main>
  );
}

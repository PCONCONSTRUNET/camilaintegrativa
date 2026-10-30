'use client';

import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  User,
  Heart,
  ShieldCheck,
  Phone,
  Calendar,
  Lock,
  ArrowRight,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { WhatsappIcon } from '@/components/whatsapp-icon';

export default function PublicAnamnesePage() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    clientId: string;
    clientName: string;
  } | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('Feminino');
  const [occupation, setOccupation] = useState('');
  const [rg, setRg] = useState('');

  // CPF Auto-lookup
  const [cpfAutofilled, setCpfAutofilled] = useState(false);
  const [cpfSearching, setCpfSearching] = useState(false);

  // Emergency contact
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');

  // Clinical Anamnese
  const [consultationReason, setConsultationReason] = useState('');
  const [hasHealthConditions, setHasHealthConditions] = useState(false);
  const [healthConditionsDetails, setHealthConditionsDetails] = useState('');
  const [hasPsychCare, setHasPsychCare] = useState(false);
  const [psychCareDetails, setPsychCareDetails] = useState('');
  const [medications, setMedications] = useState('');
  const [epilepsyHistory, setEpilepsyHistory] = useState(false);
  const [previousHypnosis, setPreviousHypnosis] = useState(false);
  const [previousHypnosisDetails, setPreviousHypnosisDetails] = useState('');
  const [sleepQuality, setSleepQuality] = useState('Boa');
  const [stressLevel, setStressLevel] = useState<number>(5);

  // Consent
  const [consentAgreed, setConsentAgreed] = useState(false);

  // Input masks helpers
  function maskCpfInput(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  function maskPhoneInput(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  function maskDateInput(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  function toBrDate(v: string) {
    if (!v) return '';
    if (v.includes('/')) return v;
    const parts = v.split('-');
    if (parts.length === 3) {
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    return v;
  }

  // Consulta automática de CPF no banco interno
  useEffect(() => {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length === 11) {
      let isMounted = true;
      setCpfSearching(true);
      fetch(`/api/public/check-cpf?cpf=${clean}`)
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) return;
          setCpfSearching(false);
          if (data && data.found) {
            setCpfAutofilled(true);
            if (!name && data.name) setName(data.name);
            if (!phone && data.phone) setPhone(maskPhoneInput(data.phone));
            if (!email && data.email) setEmail(data.email);
            if (!birthDate && data.birthDate) setBirthDate(toBrDate(data.birthDate));
            if (data.gender) setGender(data.gender);
            if (!occupation && data.occupation) setOccupation(data.occupation);
            if (!rg && data.rg) setRg(data.rg);
            if (!emergencyContactName && data.emergencyContactName) setEmergencyContactName(data.emergencyContactName);
            if (!emergencyContactPhone && data.emergencyContactPhone) setEmergencyContactPhone(maskPhoneInput(data.emergencyContactPhone));
            if (!emergencyContactRelationship && data.emergencyContactRelationship) setEmergencyContactRelationship(data.emergencyContactRelationship);
          } else {
            setCpfAutofilled(false);
          }
        })
        .catch(() => {
          if (isMounted) setCpfSearching(false);
        });
      return () => {
        isMounted = false;
      };
    } else {
      setCpfAutofilled(false);
      setCpfSearching(false);
    }
  }, [cpf]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim() || name.trim().length < 3) {
      setErrorMsg('Por favor, informe seu nome completo.');
      return;
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      setErrorMsg('Por favor, informe um CPF válido com 11 dígitos.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErrorMsg('Por favor, informe um número de WhatsApp válido com DDD.');
      return;
    }

    if (!birthDate.trim() || birthDate.replace(/\D/g, '').length < 8) {
      setErrorMsg('Por favor, informe sua data de nascimento completa.');
      return;
    }

    if (!consultationReason.trim() || consultationReason.trim().length < 5) {
      setErrorMsg('Por favor, descreva o motivo principal da sua consulta.');
      return;
    }

    if (!consentAgreed) {
      setErrorMsg('É necessário declarar ciência e concordar com o termo de atendimento para prosseguir.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/public/anamnese', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          cpf: cpf.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          birthDate: birthDate.trim(),
          gender,
          occupation: occupation.trim() || null,
          rg: rg.trim() || null,
          emergencyContactName: emergencyContactName.trim() || null,
          emergencyContactPhone: emergencyContactPhone.trim() || null,
          emergencyContactRelationship: emergencyContactRelationship.trim() || null,
          consultationReason: consultationReason.trim(),
          hasHealthConditions,
          healthConditionsDetails: hasHealthConditions ? healthConditionsDetails.trim() : null,
          hasPsychCare,
          psychCareDetails: hasPsychCare ? psychCareDetails.trim() : null,
          medications: medications.trim() || null,
          epilepsyHistory,
          previousHypnosis,
          previousHypnosisDetails: previousHypnosis ? previousHypnosisDetails.trim() : null,
          sleepQuality,
          stressLevel,
          consentAgreed: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar ficha de anamnese.');

      setSuccessData({
        clientId: data.clientId,
        clientName: data.clientName || name.trim(),
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao enviar formulário.');
    } finally {
      setLoading(false);
    }
  }

  // TELA DE SUCESSO
  if (successData) {
    const firstName = successData.clientName.split(' ')[0];
    const waText = `Olá, Camila! Acabei de preencher minha Ficha de Cadastro & Anamnese Digital no seu sistema. Meu nome é *${successData.clientName}*. ✨`;
    const waUrl = `https://wa.me/5548996915303?text=${encodeURIComponent(waText)}`;

    return (
      <main
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(145deg, #f8fafc 0%, #edf4f2 50%, #e2ece9 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        }}
      >
        <div
          style={{
            maxWidth: '540px',
            width: '100%',
            background: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 25px 60px rgba(47, 117, 103, 0.16)',
            padding: '40px 28px',
            textAlign: 'center',
            border: '1.5px solid #dcfce7',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '999px',
              background: '#dcfce7',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 8px 24px rgba(22, 163, 74, 0.2)',
            }}
          >
            <CheckCircle2 size={40} />
          </div>

          <span
            style={{
              display: 'inline-block',
              fontSize: '0.75rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#15803d',
              background: '#f0fdf4',
              padding: '4px 12px',
              borderRadius: '999px',
              marginBottom: '10px',
            }}
          >
            Cadastro & Anamnese Confirmados
          </span>

          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: '0 0 12px' }}>
            Ficha Recebida com Sucesso!
          </h1>

          <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: 1.5, margin: '0 0 24px' }}>
            Olá, <strong>{firstName}</strong>! Seus dados cadastrais e suas respostas clínicas foram salvos de forma segura e confidencial no consultório de <strong>Camila Machado</strong>.
          </p>

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'left',
              fontSize: '0.82rem',
              color: '#334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div>👤 <strong>Paciente:</strong> {successData.clientName}</div>
            <div>📄 <strong>CPF:</strong> {cpf}</div>
            <div>📱 <strong>WhatsApp:</strong> {phone}</div>
            <div style={{ color: '#16a34a', fontWeight: 700, marginTop: '4px' }}>
              ✓ Ficha vinculada ao seu prontuário clínico oficial
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: '100%',
                padding: '14px 20px',
                borderRadius: '14px',
                background: '#16a34a',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.92rem',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)',
              }}
            >
              <WhatsappIcon size={20} color="#ffffff" />
              Avisar Camila no WhatsApp
            </a>

            <Link
              href={`/cliente/entrar?modo=cadastro&cpf=${encodeURIComponent(cpf.replace(/\D/g, ''))}`}
              style={{
                width: '100%',
                padding: '13px 20px',
                borderRadius: '14px',
                background: '#1a3a4a',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.88rem',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(26, 58, 74, 0.25)',
              }}
            >
              <Lock size={15} /> Ativar Minha Senha no Portal <ArrowRight size={16} />
            </Link>
            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', margin: '-4px 0 2px' }}>
              Para ver recibos, agendamentos e faturas no portal, basta definir sua senha.
            </span>

            <button
              type="button"
              onClick={() => {
                setSuccessData(null);
                setName('');
                setCpf('');
                setPhone('');
                setEmail('');
                setBirthDate('');
                setOccupation('');
                setRg('');
                setEmergencyContactName('');
                setEmergencyContactPhone('');
                setEmergencyContactRelationship('');
                setConsultationReason('');
                setHealthConditionsDetails('');
                setPsychCareDetails('');
                setMedications('');
                setPreviousHypnosisDetails('');
                setConsentAgreed(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '0.8rem',
                fontWeight: 600,
                padding: '8px',
                cursor: 'pointer',
                marginTop: '6px',
              }}
            >
              Preencher nova ficha (Recepção)
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(155deg, #f8fafc 0%, #edf5f3 50%, #e2ece9 100%)',
        padding: '30px 16px 60px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        {/* Cabeçalho de Destaque */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffffff',
              border: '1.5px solid #d4b896',
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '0.74rem',
              fontWeight: 800,
              color: '#855e32',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
              boxShadow: '0 2px 8px rgba(212, 184, 150, 0.2)',
            }}
          >
            <Sparkles size={14} color="#d4b896" />
            Espaço Camila Machado • CRT-SBHP/SC 805
          </div>

          <h1
            style={{
              fontSize: 'clamp(1.5rem, 4vw, 2.1rem)',
              fontWeight: 900,
              color: '#1a3a4a',
              margin: '0 0 10px',
              letterSpacing: '-0.02em',
            }}
          >
            Ficha de Cadastro & Anamnese
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#475569', maxWidth: '520px', margin: '0 auto', lineHeight: 1.5 }}>
            Preencha seus dados abaixo para iniciarmos seu acompanhamento terapêutico de forma personalizada, segura e acolhedora.
          </p>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '12px',
              padding: '6px 12px',
              borderRadius: '10px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              fontSize: '0.75rem',
              color: '#166534',
              fontWeight: 600,
            }}
          >
            <ShieldCheck size={14} />
            Dados confidenciais protegidos pelo sigilo profissional terapêutico
          </div>
        </div>

        {/* Formulário Principal */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 20px 50px rgba(32, 65, 58, 0.1)',
            border: '1.5px solid #e2e8f0',
            overflow: 'hidden',
          }}
        >
          {errorMsg && (
            <div
              style={{
                margin: '20px 20px 0',
                padding: '12px 16px',
                borderRadius: '12px',
                background: '#fef2f2',
                border: '1.5px solid #fca5a5',
                color: '#b91c1c',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              {errorMsg}
            </div>
          )}

          {/* SEÇÃO 1: DADOS PESSOAIS */}
          <div style={{ padding: '24px 24px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: '#f0fdf4',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <User size={18} />
              </div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                1. Seus Dados Pessoais (Cadastro)
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Maria da Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                    CPF * (identificador único)
                  </label>
                  {cpfSearching && (
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Buscando...
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(maskCpfInput(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: cpfAutofilled ? '1.5px solid #16a34a' : '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    outline: 'none',
                    background: cpfAutofilled ? '#f0fdf4' : '#ffffff',
                  }}
                />
                {cpfAutofilled && (
                  <div style={{ marginTop: '5px', fontSize: '0.72rem', color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} color="#15803d" />
                    Identificamos seu cadastro! Dados preenchidos automaticamente.
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  WhatsApp com DDD *
                </label>
                <input
                  type="text"
                  required
                  placeholder="(48) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  E-mail
                </label>
                <input
                  type="email"
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Data de Nascimento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="DD/MM/AAAA"
                  value={birthDate}
                  onChange={(e) => setBirthDate(maskDateInput(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Gênero
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    background: '#ffffff',
                    outline: 'none',
                  }}
                >
                  <option value="Feminino">Feminino</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Não-binário">Não-binário</option>
                  <option value="Outro">Outro</option>
                  <option value="Prefiro não informar">Prefiro não informar</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Profissão / Ocupação
                </label>
                <input
                  type="text"
                  placeholder="Ex: Professora, Arquiteta..."
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.88rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: CONTATO DE EMERGÊNCIA */}
          <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Phone size={17} />
              </div>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  2. Contato de Emergência
                </h2>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
                  Pessoa próxima para contato caso necessário durante o atendimento
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Nome do Contato
                </label>
                <input
                  type="text"
                  placeholder="Ex: Carlos (Cônjuge)"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.84rem',
                    background: '#ffffff',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  placeholder="(48) 99999-9999"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(maskPhoneInput(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.84rem',
                    background: '#ffffff',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Parentesco / Vínculo
                </label>
                <input
                  type="text"
                  placeholder="Ex: Cônjuge, Mãe, Irmão..."
                  value={emergencyContactRelationship}
                  onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.84rem',
                    background: '#ffffff',
                  }}
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: ANAMNESE CLÍNICA */}
          <div style={{ padding: '24px 24px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: '#fef3c7',
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Heart size={18} />
              </div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                3. Ficha de Anamnese & Saúde Integrativa
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                  Qual o principal motivo da sua consulta? O que você busca transformar ou aliviar? *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Descreva com suas palavras o que você vem sentindo (ansiedade, insônia, bloqueios, dores, traumas, fobias, etc.) e qual é o seu objetivo com o atendimento..."
                  value={consultationReason}
                  onChange={(e) => setConsultationReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.86rem',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Condições de Saúde */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Possui algum diagnóstico de saúde ou condição médica prévia?
                </span>
                <div style={{ display: 'flex', gap: '18px', marginBottom: hasHealthConditions ? '10px' : 0 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="health_conditions"
                      checked={hasHealthConditions}
                      onChange={() => setHasHealthConditions(true)}
                    />
                    Sim
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="health_conditions"
                      checked={!hasHealthConditions}
                      onChange={() => setHasHealthConditions(false)}
                    />
                    Não
                  </label>
                </div>
                {hasHealthConditions && (
                  <input
                    type="text"
                    placeholder="Quais condições ou cuidados médicos você possui?"
                    value={healthConditionsDetails}
                    onChange={(e) => setHealthConditionsDetails(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.82rem',
                      background: '#ffffff',
                    }}
                  />
                )}
              </div>

              {/* Acompanhamento Psicológico / Psiquiátrico */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Faz ou já fez acompanhamento com psicólogo(a) ou psiquiatra?
                </span>
                <div style={{ display: 'flex', gap: '18px', marginBottom: hasPsychCare ? '10px' : 0 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="psych_care"
                      checked={hasPsychCare}
                      onChange={() => setHasPsychCare(true)}
                    />
                    Sim
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="psych_care"
                      checked={!hasPsychCare}
                      onChange={() => setHasPsychCare(false)}
                    />
                    Não
                  </label>
                </div>
                {hasPsychCare && (
                  <input
                    type="text"
                    placeholder="Há quanto tempo? Faz uso de algum medicamento prescrito?"
                    value={psychCareDetails}
                    onChange={(e) => setPsychCareDetails(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.82rem',
                      background: '#ffffff',
                    }}
                  />
                )}
              </div>

              {/* Medicamentos */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Medicamentos de uso contínuo (se houver)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Ansiolítico, remédio para tireoide, pressão... ou 'Nenhum'"
                  value={medications}
                  onChange={(e) => setMedications(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.84rem',
                  }}
                />
              </div>

              {/* Histórico de Convulsões / Epilepsia */}
              <div style={{ background: '#fef2f2', padding: '12px 14px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#991b1b', marginBottom: '6px' }}>
                  Possui histórico pessoal de convulsão ou epilepsia?
                </span>
                <p style={{ margin: '0 0 8px', fontSize: '0.72rem', color: '#b91c1c' }}>
                  * Informação clínica indispensável para a adaptação de técnicas de hipnose clínica e relaxamento profundo.
                </p>
                <div style={{ display: 'flex', gap: '18px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', color: '#991b1b' }}>
                    <input
                      type="radio"
                      name="epilepsy"
                      checked={epilepsyHistory}
                      onChange={() => setEpilepsyHistory(true)}
                    />
                    Sim
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', color: '#991b1b' }}>
                    <input
                      type="radio"
                      name="epilepsy"
                      checked={!epilepsyHistory}
                      onChange={() => setEpilepsyHistory(false)}
                    />
                    Não
                  </label>
                </div>
              </div>

              {/* Hipnose prévia */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Já passou por alguma sessão de hipnose clínica ou terapia integrativa antes?
                </span>
                <div style={{ display: 'flex', gap: '18px', marginBottom: previousHypnosis ? '10px' : 0 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="previous_hypnosis"
                      checked={previousHypnosis}
                      onChange={() => setPreviousHypnosis(true)}
                    />
                    Sim
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="previous_hypnosis"
                      checked={!previousHypnosis}
                      onChange={() => setPreviousHypnosis(false)}
                    />
                    Não
                  </label>
                </div>
                {previousHypnosis && (
                  <input
                    type="text"
                    placeholder="Como foi a experiência? O que achou?"
                    value={previousHypnosisDetails}
                    onChange={(e) => setPreviousHypnosisDetails(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.82rem',
                      background: '#ffffff',
                    }}
                  />
                )}
              </div>

              {/* Sono & Estresse */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Como avalia a qualidade do seu sono?
                  </label>
                  <select
                    value={sleepQuality}
                    onChange={(e) => setSleepQuality(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.84rem',
                      background: '#ffffff',
                    }}
                  >
                    <option value="Muito Boa">Muito Boa (dorme rápido e acorda disposto)</option>
                    <option value="Boa">Boa (sono reparador)</option>
                    <option value="Regular">Regular (acorda algumas vezes)</option>
                    <option value="Ruim">Ruim (dificuldade para adormecer)</option>
                    <option value="Insônia Frequente">Insônia Frequente / Cansaço crônico</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Nível de ansiedade / estresse no dia a dia: <strong>{stressLevel}/10</strong>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={stressLevel}
                    onChange={(e) => setStressLevel(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#16a34a' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b' }}>
                    <span>1 (Muito calmo)</span>
                    <span>5 (Moderado)</span>
                    <span>10 (Muito intenso)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 4: TERMO DE CONSENTIMENTO */}
          <div style={{ padding: '20px 24px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <input
                type="checkbox"
                id="consentCheck"
                required
                checked={consentAgreed}
                onChange={(e) => setConsentAgreed(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  marginTop: '2px',
                  accentColor: '#16a34a',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
              <label htmlFor="consentCheck" style={{ fontSize: '0.78rem', color: '#166534', lineHeight: 1.45, cursor: 'pointer' }}>
                <strong>Termo de Consentimento & Ciência Terapêutica: *</strong><br />
                Declaro que as informações acima são verdadeiras e estou ciente de que as sessões constituem terapia integrativa e hipnoterapia clínica voltadas ao bem-estar e desenvolvimento emocional, não substituindo diagnósticos ou tratamentos médicos tradicionais.
              </label>
            </div>
          </div>

          {/* BOTÃO DE ENVIO */}
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                maxWidth: '420px',
                padding: '14px 24px',
                borderRadius: '14px',
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                fontWeight: 900,
                fontSize: '0.98rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(22, 163, 74, 0.35)',
                opacity: loading ? 0.75 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              <ClipboardList size={18} />
              {loading ? 'Gravando e gerando ficha...' : 'Enviar Ficha de Cadastro & Anamnese'}
            </button>
            <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
              Ao clicar, seus dados serão cadastrados e disponibilizados no prontuário da clínica.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}


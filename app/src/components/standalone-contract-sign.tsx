'use client';

import { FormEvent, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Check,
  Download,
  FileText,
  LoaderCircle,
} from 'lucide-react';
import { maskCpf } from '@/lib/utils';
import {
  ContractPreviewModal,
  type ContractTemplatePublic,
} from '@/components/contract-preview-modal';

interface SignedOrPendingContract {
  id: string;
  token: string;
  status: 'pendente' | 'assinado';
  origin: string;
  clientName: string;
  clientCpf: string;
  clientBirthDate: string;
  clientPhone: string;
  clientEmail: string;
  serviceName: string;
  sessionDate: string;
  sessionTime: string;
  modality: string;
  contractTitle: string;
  contractBodySnapshot: string;
  professionalName: string;
  professionalCpf: string;
  professionalCredential: string;
  professionalSignatureData: string;
  acceptedAt: string | null;
}

function formatBirthDateBr(val?: string | null) {
  if (!val) return 'Não informado';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${d}/${m}/${y}`;
  }
  return val;
}

export function StandaloneContractSign({ token }: { token?: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [template, setTemplate] = useState<ContractTemplatePublic | null>(null);
  const [presetInfo, setPresetInfo] = useState<{
    serviceName: string;
    sessionDate: string;
    sessionTime: string;
    modality: string;
  }>({
    serviceName: 'Atendimento Terapêutico',
    sessionDate: '',
    sessionTime: '',
    modality: 'presencial',
  });
  const [signedContract, setSignedContract] = useState<SignedOrPendingContract | null>(null);

  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [accepted, setAccepted] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    fetch(`/api/public/contracts${query}`, { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          throw new Error(data.error || 'Não foi possível localizar este contrato.');
        }
        if (data.template) setTemplate(data.template);
        if (data.contract) {
          const c = data.contract as SignedOrPendingContract;
          if (c.status === 'assinado') {
            setSignedContract(c);
          } else {
            if (c.clientName) setName(c.clientName);
            if (c.clientCpf) setCpf(maskCpf(c.clientCpf));
            if (c.clientBirthDate) setBirthDate(c.clientBirthDate);
            setPresetInfo({
              serviceName: c.serviceName || 'Atendimento Terapêutico',
              sessionDate: c.sessionDate || '',
              sessionTime: c.sessionTime || '',
              modality: c.modality || 'presencial',
            });
          }
        }
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Erro ao carregar instrumento contratual.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError('');

    const cleanCpf = cpf.replace(/\D/g, '');
    if (name.trim().length < 3) {
      setSubmitError('Informe seu nome completo conforme documento oficial.');
      return;
    }
    if (cleanCpf.length !== 11) {
      setSubmitError('Informe um CPF válido contendo 11 dígitos.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setSubmitError('Informe sua data de nascimento.');
      return;
    }
    if (!accepted) {
      setSubmitError('Confirme a leitura e concordância com as cláusulas contratuais para prosseguir.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/public/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token || undefined,
          name: name.trim(),
          cpf: cleanCpf,
          birthDate,
          serviceName: presetInfo.serviceName,
          sessionDate: presetInfo.sessionDate,
          sessionTime: presetInfo.sessionTime,
          modality: presetInfo.modality,
          accepted,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setSubmitError(data.error || 'Não foi possível registrar a assinatura eletrônica.');
        return;
      }
      setSignedContract(data.contract);
    } catch {
      setSubmitError('Falha de comunicação ao registrar assinatura. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  const profName = template?.professionalName || 'Camila Machado';
  const profCred = template?.professionalCredential || 'CRT-SBHP/SC 805';

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    border: '1px solid #cbd2d9',
    borderRadius: '4px',
    padding: '10px 12px',
    fontSize: '0.94rem',
    color: '#111827',
    background: '#ffffff',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    color: '#334155',
    marginBottom: '6px',
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f3f2ee',
        padding: '28px 14px 64px',
        color: '#1e293b',
      }}
    >
      <div style={{ maxWidth: signedContract ? '740px' : '560px', margin: '0 auto' }}>
        {/* Cabeçalho institucional limpo */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            paddingBottom: '14px',
            marginBottom: '18px',
            borderBottom: '1px solid #d8d5cc',
          }}
        >
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <Image
              src="/logo-camila-machado.png"
              alt="Camila Machado"
              width={175}
              height={46}
              priority
              style={{ width: 'auto', height: '36px', objectFit: 'contain' }}
            />
          </Link>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#475569',
              }}
            >
              Documento Eletrônico Oficial
            </div>
            <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
              Registro Profissional {profCred}
            </div>
          </div>
        </header>

        {loading ? (
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #d5d9df',
              borderTop: '4px solid #163042',
              borderRadius: '4px',
              padding: '56px 24px',
              textAlign: 'center',
              color: '#475569',
            }}
          >
            <LoaderCircle className="spin" size={24} style={{ margin: '0 auto 10px' }} />
            <p style={{ margin: 0, fontSize: '0.92rem' }}>Carregando instrumento contratual…</p>
          </div>
        ) : loadError ? (
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2c8c8',
              borderTop: '4px solid #8a2c2c',
              borderRadius: '4px',
              padding: '36px 28px',
            }}
          >
            <h1
              style={{
                margin: '0 0 8px',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '1.25rem',
                color: '#7f1d1d',
              }}
            >
              Link contratual indisponível
            </h1>
            <p style={{ margin: '0 0 20px', color: '#475569', fontSize: '0.92rem' }}>{loadError}</p>
            <Link
              href="/"
              style={{
                display: 'inline-block',
                padding: '9px 18px',
                borderRadius: '4px',
                background: '#163042',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Retornar à página inicial
            </Link>
          </div>
        ) : signedContract ? (
          /* ===================== DOCUMENTO ASSINADO (VIA OFICIAL) ===================== */
          <article
            style={{
              background: '#ffffff',
              border: '1px solid #d2d7dd',
              borderTop: '4px solid #14532d',
              borderRadius: '4px',
              padding: '32px 28px',
              boxShadow: '0 2px 14px rgba(15, 23, 42, 0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '12px',
                paddingBottom: '18px',
                borderBottom: '1px solid #e2e8f0',
                marginBottom: '22px',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#166534',
                    marginBottom: '6px',
                  }}
                >
                  Instrumento Contratual Assinado e Registrado
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    fontSize: '1.35rem',
                    fontWeight: 600,
                    lineHeight: 1.35,
                    color: '#0f172a',
                  }}
                >
                  {signedContract.contractTitle}
                </h1>
              </div>

              <div
                style={{
                  border: '1px solid #bbf7d0',
                  background: '#f0fdf4',
                  color: '#166534',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Check size={14} /> Assinatura Válida
              </div>
            </div>

            {/* Quadro resumo das informações do contratante */}
            <div
              style={{
                border: '1px solid #dce1e7',
                borderRadius: '4px',
                background: '#f8fafc',
                padding: '14px 18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                gap: '12px 18px',
                marginBottom: '22px',
                fontSize: '0.86rem',
              }}
            >
              <div>
                <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Contratante
                </span>
                <strong style={{ color: '#0f172a' }}>{signedContract.clientName}</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  CPF
                </span>
                <strong style={{ color: '#0f172a' }}>{maskCpf(signedContract.clientCpf)}</strong>
              </div>
              {signedContract.clientBirthDate && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                    Data de Nascimento
                  </span>
                  <strong style={{ color: '#0f172a' }}>
                    {formatBirthDateBr(signedContract.clientBirthDate)}
                  </strong>
                </div>
              )}
              <div>
                <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Data e Hora do Aceite
                </span>
                <strong style={{ color: '#0f172a' }}>
                  {signedContract.acceptedAt
                    ? new Date(signedContract.acceptedAt).toLocaleString('pt-BR')
                    : 'Registrado'}
                </strong>
              </div>
            </div>

            {/* Texto integral registrado */}
            <div
              style={{
                border: '1px solid #d5dae0',
                borderRadius: '4px',
                background: '#fcfcfb',
                padding: '20px 22px',
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '0.9rem',
                lineHeight: 1.7,
                color: '#1e293b',
                whiteSpace: 'pre-wrap',
                maxHeight: '340px',
                overflowY: 'auto',
                marginBottom: '22px',
              }}
            >
              {signedContract.contractBodySnapshot}
            </div>

            {/* Assinaturas formais */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
              }}
            >
              <div style={{ border: '1px solid #d8dde3', borderRadius: '4px', padding: '16px', background: '#ffffff' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Contratada (Profissional Responsável)
                </div>
                <div
                  style={{
                    margin: '12px 0 8px',
                    borderBottom: '1px solid #94a3b8',
                    paddingBottom: '6px',
                    minHeight: '40px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {signedContract.professionalSignatureData ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={signedContract.professionalSignatureData}
                      alt={signedContract.professionalName}
                      style={{ maxHeight: '40px', objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.12rem', color: '#0f172a' }}>
                      {signedContract.professionalName}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
                  <strong>{signedContract.professionalName}</strong>
                  <div>CPF nº {signedContract.professionalCpf ? maskCpf(signedContract.professionalCpf) : '084.954.239-10'}</div>
                  <div>{signedContract.professionalCredential}</div>
                </div>
              </div>

              <div style={{ border: '1px solid #d8dde3', borderRadius: '4px', padding: '16px', background: '#ffffff' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Contratante (Assinatura Eletrônica)
                </div>
                <div
                  style={{
                    margin: '12px 0 8px',
                    borderBottom: '1px solid #94a3b8',
                    paddingBottom: '6px',
                    minHeight: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: 'Georgia, serif',
                    fontStyle: 'italic',
                    fontSize: '1.12rem',
                    color: '#0f172a',
                  }}
                >
                  {signedContract.clientName}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
                  <strong>{signedContract.clientName}</strong>
                  <div>CPF nº {maskCpf(signedContract.clientCpf)}</div>
                  {signedContract.clientBirthDate && (
                    <div>Nascimento: {formatBirthDateBr(signedContract.clientBirthDate)}</div>
                  )}
                  {signedContract.acceptedAt && (
                    <div style={{ color: '#166534', marginTop: '2px', fontWeight: 600 }}>
                      Aceite registrado em {new Date(signedContract.acceptedAt).toLocaleString('pt-BR')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
              <a
                href={`/api/public/contracts/${signedContract.id}/pdf?token=${encodeURIComponent(
                  signedContract.token
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '11px 20px',
                  borderRadius: '4px',
                  background: '#163042',
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <Download size={16} /> Baixar Via Assinada (PDF)
              </a>
              <Link
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '11px 18px',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Ir para o site da clínica
              </Link>
            </div>
          </article>
        ) : (
          /* ===================== FORMULÁRIO RÁPIDO E FORMAL ===================== */
          <article
            style={{
              background: '#ffffff',
              border: '1px solid #d2d7dd',
              borderTop: '4px solid #163042',
              borderRadius: '4px',
              padding: '28px 26px',
              boxShadow: '0 2px 12px rgba(15, 23, 42, 0.05)',
            }}
          >
            <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '20px' }}>
              <h1
                style={{
                  margin: '0 0 6px',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: '1.28rem',
                  fontWeight: 600,
                  lineHeight: 1.35,
                  color: '#0f172a',
                }}
              >
                {template?.title ||
                  'Contrato de Prestação de Serviços Terapêuticos, Agendamento, Cancelamento e Reembolso'}
              </h1>
              <p style={{ margin: 0, fontSize: '0.86rem', color: '#475569', lineHeight: 1.5 }}>
                {profName} ({profCred}). Preencha seus dados abaixo para confirmar e assinar.
              </p>
              {(presetInfo.sessionDate || presetInfo.serviceName !== 'Atendimento Terapêutico') && (
                <div
                  style={{
                    marginTop: '10px',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.82rem',
                    color: '#334155',
                  }}
                >
                  <strong>Atendimento:</strong> {presetInfo.serviceName}
                  {presetInfo.sessionDate ? ` · ${formatBirthDateBr(presetInfo.sessionDate)}` : ''}
                  {presetInfo.sessionTime ? ` às ${presetInfo.sessionTime}` : ''}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Nome completo *</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Digite seu nome completo"
                  style={inputStyle}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
                  gap: '14px',
                }}
              >
                <div>
                  <label style={labelStyle}>CPF *</label>
                  <input
                    required
                    inputMode="numeric"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Data de nascimento *</label>
                  <input
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div
                style={{
                  border: '1px solid #cbd5e1',
                  borderLeft: '3px solid #163042',
                  borderRadius: '4px',
                  background: '#f8fafc',
                  padding: '13px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                    color: '#1e293b',
                    lineHeight: 1.45,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: '#163042', flexShrink: 0 }}
                  />
                  <span>
                    Li e <strong>concordo com os termos do contrato</strong>, declarando verdadeiros os dados informados acima. *
                  </span>
                </label>

                <div style={{ paddingLeft: '26px' }}>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#163042',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <FileText size={13} /> Visualizar contrato completo
                  </button>
                </div>
              </div>

              {submitError && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderLeft: '3px solid #991b1b',
                    color: '#991b1b',
                    borderRadius: '4px',
                    padding: '10px 14px',
                    fontSize: '0.86rem',
                  }}
                >
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !accepted}
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '13px 20px',
                  borderRadius: '4px',
                  border: 'none',
                  background: !accepted || submitting ? '#94a3b8' : '#163042',
                  color: '#ffffff',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  cursor: !accepted || submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? (
                  <>
                    <LoaderCircle className="spin" size={16} /> Registrando assinatura…
                  </>
                ) : (
                  'Assinar Contrato'
                )}
              </button>
            </form>
          </article>
        )}
      </div>

      <ContractPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        template={template}
        variables={{
          clientName: name,
          clientCpf: cpf,
          clientBirthDate: birthDate,
          serviceName: presetInfo.serviceName,
          sessionDate: presetInfo.sessionDate,
          sessionTime: presetInfo.sessionTime,
          modality: presetInfo.modality,
        }}
        accepted={accepted}
        onAcceptAndClose={() => {
          setAccepted(true);
          setPreviewOpen(false);
        }}
      />
    </main>
  );
}

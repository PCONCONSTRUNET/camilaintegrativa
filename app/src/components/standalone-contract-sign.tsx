'use client';

import { FormEvent, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  CheckCircle2,
  Download,
  Eye,
  FileSignature,
  LoaderCircle,
  ShieldCheck,
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

  // Somente os 3 campos solicitados para o cliente preencher ao abrir o link
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [accepted, setAccepted] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    fetch(`/api/public/contracts${query}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          throw new Error(data.error || 'Não foi possível carregar este link de contrato.');
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
        setLoadError(err instanceof Error ? err.message : 'Erro ao carregar contrato.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError('');

    const cleanCpf = cpf.replace(/\D/g, '');
    if (name.trim().length < 3) {
      setSubmitError('Por favor, informe seu nome completo.');
      return;
    }
    if (cleanCpf.length !== 11) {
      setSubmitError('Informe um CPF válido com 11 dígitos.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setSubmitError('Informe sua data de nascimento.');
      return;
    }
    if (!accepted) {
      setSubmitError('Marque a opção de concordância com os termos do contrato antes de assinar.');
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
        setSubmitError(data.error || 'Não foi possível concluir a assinatura.');
        return;
      }
      setSignedContract(data.contract);
    } catch {
      setSubmitError('Erro de conexão ao registrar assinatura. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #faf7f2 0%, #f1ece2 100%)',
        padding: '20px 16px 56px',
      }}
    >
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
            gap: '12px',
          }}
        >
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <Image
              src="/logo-camila-machado.png"
              alt="Camila Machado"
              width={170}
              height={46}
              priority
              style={{ width: 'auto', height: '34px', objectFit: 'contain' }}
            />
          </Link>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#17374d',
              background: '#fff',
              border: '1px solid #e3dbd0',
              padding: '6px 12px',
              borderRadius: '999px',
            }}
          >
            <ShieldCheck size={14} /> Assinatura Digital Segura
          </span>
        </header>

        {loading ? (
          <div
            style={{
              background: '#fff',
              borderRadius: '18px',
              padding: '48px 24px',
              textAlign: 'center',
              border: '1px solid #e6dfd3',
              color: '#526575',
            }}
          >
            <LoaderCircle className="spin" size={26} style={{ margin: '0 auto 10px' }} />
            <p style={{ margin: 0 }}>Carregando contrato…</p>
          </div>
        ) : loadError ? (
          <div
            style={{
              background: '#fff',
              borderRadius: '18px',
              padding: '36px 24px',
              textAlign: 'center',
              border: '1px solid #f0c9c9',
            }}
          >
            <h1 style={{ margin: '0 0 8px', fontSize: '1.25rem', color: '#7a2020' }}>
              Link indisponível
            </h1>
            <p style={{ margin: '0 0 20px', color: '#596773' }}>{loadError}</p>
            <Link href="/" className="btn btn-primary btn-sm">
              Ir para o site da clínica
            </Link>
          </div>
        ) : signedContract ? (
          <section
            style={{
              background: '#fff',
              borderRadius: '20px',
              padding: '28px 24px',
              border: '1px solid #dce6df',
              boxShadow: '0 14px 40px rgba(15, 36, 54, 0.07)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: '#e5f5ec',
                  color: '#147a4b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <CheckCircle2 size={24} />
              </div>
              <div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#147a4b',
                  }}
                >
                  Contrato assinado e registrado
                </span>
                <h1 style={{ margin: '2px 0 0', fontSize: '1.25rem', color: '#17374d' }}>
                  {signedContract.contractTitle}
                </h1>
              </div>
            </div>

            <div
              style={{
                background: '#f8fafb',
                border: '1px solid #e3eaef',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '10px',
                marginBottom: '18px',
                fontSize: '0.86rem',
              }}
            >
              <div>
                <span style={{ display: 'block', fontSize: '0.73rem', color: '#617280' }}>Nome</span>
                <strong style={{ color: '#17374d' }}>{signedContract.clientName}</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.73rem', color: '#617280' }}>CPF</span>
                <strong style={{ color: '#17374d' }}>{maskCpf(signedContract.clientCpf)}</strong>
              </div>
              {signedContract.clientBirthDate && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.73rem', color: '#617280' }}>
                    Data de Nascimento
                  </span>
                  <strong style={{ color: '#17374d' }}>
                    {formatBirthDateBr(signedContract.clientBirthDate)}
                  </strong>
                </div>
              )}
              <div>
                <span style={{ display: 'block', fontSize: '0.73rem', color: '#617280' }}>Data / Assinatura</span>
                <strong style={{ color: '#17374d' }}>
                  {signedContract.acceptedAt
                    ? new Date(signedContract.acceptedAt).toLocaleString('pt-BR')
                    : 'Registrado'}
                </strong>
              </div>
            </div>

            <div
              style={{
                background: '#fffdf9',
                border: '1px solid #e6dfd3',
                borderRadius: '12px',
                padding: '16px',
                fontSize: '0.86rem',
                lineHeight: 1.6,
                color: '#2c3d4b',
                whiteSpace: 'pre-wrap',
                maxHeight: '280px',
                overflowY: 'auto',
                marginBottom: '16px',
              }}
            >
              {signedContract.contractBodySnapshot}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              <div style={{ border: '1px solid #e6ddd0', borderRadius: '12px', padding: '14px', background: '#fcf9f3' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7a6850' }}>
                  CONTRATADA (PROPRIETÁRIA)
                </span>
                <div style={{ margin: '8px 0 6px', borderBottom: '1px solid #d5cab8', paddingBottom: '4px', minHeight: '36px', display: 'flex', alignItems: 'center' }}>
                  {signedContract.professionalSignatureData ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={signedContract.professionalSignatureData}
                      alt={signedContract.professionalName}
                      style={{ maxHeight: '38px', objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.08rem', color: '#17374d' }}>
                      {signedContract.professionalName}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#495a67' }}>
                  <strong>{signedContract.professionalName}</strong>
                  <div>CPF: {signedContract.professionalCpf ? maskCpf(signedContract.professionalCpf) : '084.954.239-10'}</div>
                  <div>{signedContract.professionalCredential}</div>
                </div>
              </div>

              <div style={{ border: '1px solid #dce5ec', borderRadius: '12px', padding: '14px', background: '#f7fafc' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#5b7083' }}>
                  CONTRATANTE (CLIENTE)
                </span>
                <div style={{ margin: '10px 0 6px', borderBottom: '1px solid #b8c7d4', paddingBottom: '4px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.05rem', color: '#17374d' }}>
                  {signedContract.clientName}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#394d5c' }}>
                  <strong>{signedContract.clientName}</strong>
                  <div>CPF: {maskCpf(signedContract.clientCpf)}</div>
                  {signedContract.clientBirthDate && (
                    <div>Nascimento: {formatBirthDateBr(signedContract.clientBirthDate)}</div>
                  )}
                  {signedContract.acceptedAt && (
                    <div style={{ color: '#146d43', marginTop: '2px' }}>
                      Assinado em {new Date(signedContract.acceptedAt).toLocaleString('pt-BR')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <a
                href={`/api/public/contracts/${signedContract.id}/pdf?token=${encodeURIComponent(
                  signedContract.token
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <Download size={16} /> Baixar Contrato Assinado (PDF)
              </a>
              <Link href="/" className="btn btn-outline">
                Ir para o site
              </Link>
            </div>
          </section>
        ) : (
          <section
            style={{
              background: '#fff',
              borderRadius: '20px',
              padding: '28px 24px',
              border: '1px solid #e6dfd3',
              boxShadow: '0 14px 40px rgba(15, 36, 54, 0.07)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#17374d',
                  color: '#f7f1e6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FileSignature size={20} />
              </div>
              <div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#8b6e44',
                  }}
                >
                  Assinatura de Termo / Contrato
                </span>
                <h1 style={{ margin: '2px 0 0', fontSize: '1.22rem', color: '#17374d' }}>
                  {template?.title || 'Contrato de Prestação de Serviços Terapêuticos'}
                </h1>
              </div>
            </div>

            <p style={{ margin: '0 0 18px', fontSize: '0.9rem', color: '#536472', lineHeight: 1.5 }}>
              Preencha seu <strong>nome completo</strong>, <strong>CPF</strong> e{' '}
              <strong>data de nascimento</strong> abaixo. Você pode visualizar o contrato completo
              antes de concordar e assinar.
            </p>

            {(presetInfo.sessionDate || presetInfo.serviceName !== 'Atendimento Terapêutico') && (
              <div
                style={{
                  background: '#f7fafc',
                  border: '1px solid #dce6ee',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '0.83rem',
                  color: '#2c4254',
                }}
              >
                <strong>Atendimento vinculado:</strong> {presetInfo.serviceName}
                {presetInfo.sessionDate ? ` · ${formatBirthDateBr(presetInfo.sessionDate)}` : ''}
                {presetInfo.sessionTime ? ` às ${presetInfo.sessionTime}` : ''}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '5px', color: '#263a4a' }}>
                  Nome completo *
                </label>
                <input
                  className="input"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Digite seu nome completo"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '12px',
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '5px', color: '#263a4a' }}>
                    CPF *
                  </label>
                  <input
                    className="input"
                    required
                    inputMode="numeric"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '5px', color: '#263a4a' }}>
                    Data de nascimento *
                  </label>
                  <input
                    className="input"
                    type="date"
                    required
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div
                style={{
                  background: '#faf6ee',
                  border: '1px solid #e6ddd0',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: '#17374d', display: 'block' }}>
                      Contrato de Atendimento Terapêutico
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: '#61717e' }}>
                      Já inclui seus dados informados acima e a assinatura de{' '}
                      {template?.professionalName || 'Camila Machado'}.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setPreviewOpen(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Eye size={15} /> Visualizar Contrato
                  </button>
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                    color: '#203342',
                    lineHeight: 1.45,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    style={{ marginTop: '3px', width: '17px', height: '17px' }}
                  />
                  <span>
                    Li e concordo com os <strong>Termos e Contrato de Atendimento</strong>, declarando
                    verdadeiras as informações preenchidas acima. *
                  </span>
                </label>
              </div>

              {submitError && (
                <div
                  style={{
                    background: '#fff3f3',
                    border: '1px solid #efc7c7',
                    color: '#992222',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '0.86rem',
                  }}
                >
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={submitting || !accepted}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '4px',
                }}
              >
                {submitting ? (
                  <>
                    <LoaderCircle className="spin" size={18} /> Registrando assinatura…
                  </>
                ) : (
                  <>
                    <FileSignature size={18} /> Assinar e Concordar com o Contrato
                  </>
                )}
              </button>
            </form>
          </section>
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

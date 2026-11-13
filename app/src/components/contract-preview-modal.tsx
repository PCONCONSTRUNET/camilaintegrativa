'use client';

import { FileSignature, ShieldCheck, X, Check } from 'lucide-react';
import { formatCpf, formatPhone } from '@/lib/utils';

export interface ContractTemplatePublic {
  title: string;
  body: string;
  professionalName: string;
  professionalCpf: string;
  professionalCredential: string;
  professionalSignatureData: string;
  updatedAt?: string;
}

export interface ContractPreviewVariables {
  clientName?: string | null;
  clientCpf?: string | null;
  clientBirthDate?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  serviceName?: string | null;
  sessionDate?: string | null;
  sessionTime?: string | null;
  modality?: string | null;
  acceptedAt?: string | null;
}

function formatDateBrClient(val?: string | null): string {
  if (!val) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(val);
  if (Number.isNaN(dt.getTime())) return val;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(dt);
}

function formatTimeBrClient(iso?: string | null): string {
  const dt = iso ? new Date(iso) : new Date();
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(dt);
}

export function renderContractPreviewText(
  template: ContractTemplatePublic,
  vars: ContractPreviewVariables
): string {
  const nowIso = vars.acceptedAt || new Date().toISOString();
  const formattedClientCpf = vars.clientCpf ? formatCpf(vars.clientCpf) : 'Não informado';
  const formattedProfCpf = template.professionalCpf ? formatCpf(template.professionalCpf) : 'Não informado';
  const formattedPhone = vars.clientPhone ? formatPhone(vars.clientPhone) : 'Não informado';
  const modalityLabel =
    vars.modality === 'online'
      ? 'Online'
      : vars.modality === 'presencial'
      ? 'Presencial'
      : vars.modality || 'Presencial';

  const replacements: Record<string, string> = {
    '{{NOME_CLIENTE}}': vars.clientName?.trim() || '___________________________',
    '{{CPF_CLIENTE}}': formattedClientCpf,
    '{{DATA_NASCIMENTO}}': vars.clientBirthDate ? formatDateBrClient(vars.clientBirthDate) : 'Não informado',
    '{{TELEFONE_CLIENTE}}': formattedPhone,
    '{{EMAIL_CLIENTE}}': vars.clientEmail?.trim() || 'Não informado',
    '{{SERVICO}}': vars.serviceName?.trim() || 'Atendimento Terapêutico',
    '{{DATA_ATENDIMENTO}}': vars.sessionDate ? formatDateBrClient(vars.sessionDate) : formatDateBrClient(nowIso),
    '{{HORARIO_ATENDIMENTO}}': vars.sessionTime?.trim() || 'A combinar',
    '{{MODALIDADE}}': modalityLabel,
    '{{DATA_ASSINATURA}}': formatDateBrClient(nowIso),
    '{{HORA_ASSINATURA}}': formatTimeBrClient(nowIso),
    '{{CIDADE}}': 'Urussanga / SC',
    '{{NOME_PROFISSIONAL}}': template.professionalName?.trim() || 'Camila Machado',
    '{{CPF_PROFISSIONAL}}': formattedProfCpf,
    '{{REGISTRO_PROFISSIONAL}}': template.professionalCredential?.trim() || 'CRT-SBHP/SC 805',
  };

  let out = template.body;
  for (const [key, val] of Object.entries(replacements)) {
    out = out.split(key).join(val);
  }
  return out;
}

interface ContractPreviewModalProps {
  open: boolean;
  onClose: () => void;
  template: ContractTemplatePublic | null;
  variables: ContractPreviewVariables;
  accepted?: boolean;
  onAcceptAndClose?: () => void;
}

export function ContractPreviewModal({
  open,
  onClose,
  template,
  variables,
  accepted,
  onAcceptAndClose,
}: ContractPreviewModalProps) {
  if (!open || !template) return null;

  const renderedBody = renderContractPreviewText(template, variables);
  const clientName = variables.clientName?.trim() || 'Nome não informado';
  const clientCpf = variables.clientCpf ? formatCpf(variables.clientCpf) : 'CPF não informado';
  const profName = template.professionalName || 'Camila Machado';
  const profCpf = template.professionalCpf ? formatCpf(template.professionalCpf) : 'Não informado';
  const profCred = template.professionalCredential || 'CRT-SBHP/SC 805';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(13, 30, 44, 0.58)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contract-modal-title"
    >
      <div
        style={{
          background: '#fffdf9',
          borderRadius: '18px',
          maxWidth: '760px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(10, 28, 45, 0.25)',
          border: '1px solid #e4ddd1',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '18px 22px',
            borderBottom: '1px solid #e9e2d6',
            background: '#faf6ee',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#17374d',
                color: '#f5efe4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileSignature size={19} />
            </div>
            <div>
              <h3
                id="contract-modal-title"
                style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#17374d' }}
              >
                {template.title}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#61717e' }}>
                Documento preenchido automaticamente com seus dados para conferência
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar visualização do contrato"
            style={{
              background: '#fff',
              border: '1px solid #dfd7ca',
              borderRadius: '8px',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#3e5364',
            }}
          >
            <X size={18} />
          </button>
        </header>

        <div
          style={{
            padding: '22px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e6dfd3',
              borderRadius: '12px',
              padding: '20px',
              fontSize: '0.91rem',
              lineHeight: 1.65,
              color: '#223341',
              whiteSpace: 'pre-wrap',
            }}
          >
            {renderedBody}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '14px',
            }}
          >
            {/* Assinatura da Profissional / Proprietária */}
            <div
              style={{
                border: '1px solid #e6ddd0',
                borderRadius: '12px',
                background: '#fcf9f3',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '132px',
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#7a6850',
                }}
              >
                CONTRATADA (PROPRIETÁRIA)
              </span>
              <div
                style={{
                  margin: '10px 0 8px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid #d5cab8',
                  minHeight: '38px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {template.professionalSignatureData ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={template.professionalSignatureData}
                    alt={`Assinatura de ${profName}`}
                    style={{ maxHeight: '42px', maxWidth: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontStyle: 'italic',
                      fontSize: '1.15rem',
                      color: '#17374d',
                    }}
                  >
                    {profName}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#4c5b66', lineHeight: 1.4 }}>
                <strong style={{ display: 'block', color: '#17374d' }}>{profName}</strong>
                <span>CPF: {profCpf}</span>
                <span style={{ display: 'block', fontSize: '0.72rem', color: '#6b7780' }}>
                  {profCred}
                </span>
              </div>
            </div>

            {/* Assinatura do Cliente */}
            <div
              style={{
                border: '1px solid #dce5ec',
                borderRadius: '12px',
                background: '#f7fafc',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '132px',
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#5b7083',
                }}
              >
                CONTRATANTE (CLIENTE)
              </span>
              <div
                style={{
                  margin: '12px 0 8px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid #b8c7d4',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontStyle: 'italic',
                  fontSize: '1.1rem',
                  color: '#17374d',
                }}
              >
                {clientName}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#394d5c', lineHeight: 1.4 }}>
                <strong style={{ display: 'block', color: '#17374d' }}>{clientName}</strong>
                <span>CPF: {clientCpf}</span>
                {variables.clientBirthDate && (
                  <span style={{ display: 'block' }}>
                    Nascimento: {formatDateBrClient(variables.clientBirthDate)}
                  </span>
                )}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '4px',
                    fontSize: '0.72rem',
                    color: '#1b6f50',
                    fontWeight: 600,
                  }}
                >
                  <ShieldCheck size={13} />
                  {accepted ? 'Concordância marcada (pronto para registrar)' : 'Assinatura eletrônica ao concordar'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <footer
          style={{
            padding: '14px 22px',
            borderTop: '1px solid #e9e2d6',
            background: '#faf6ee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
            Fechar
          </button>
          {onAcceptAndClose && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onAcceptAndClose}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Check size={15} /> Concordo com o contrato
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

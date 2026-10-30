'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  FileCheck2,
  Receipt,
  ShieldCheck,
  X,
  Download,
  Copy,
  Check,
  Calendar,
  Clock,
  User,
  CreditCard,
  ExternalLink,
} from 'lucide-react';

export type QuickDocumentPrefill = {
  clientName?: string | null;
  clientCpf?: string | null;
  clientPhone?: string | null;
  clientBirthDate?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  serviceName?: string | null;
  amountCents?: number | null;
  paymentMethod?: string | null;
};

export type QuickDocumentsModalProps = {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  prefill?: QuickDocumentPrefill;
  initialClientName?: string | null;
  initialClientPhone?: string | null;
  initialClientCpf?: string | null;
  initialDocType?: 'declaracao' | 'recibo' | 'termo';
};

export function QuickDocumentsModal({
  isOpen,
  open,
  onClose,
  prefill,
  initialClientName,
  initialClientPhone,
  initialClientCpf,
  initialDocType = 'declaracao',
}: QuickDocumentsModalProps) {
  const activeOpen = isOpen ?? open ?? false;
  const [docType, setDocType] = useState<'declaracao' | 'recibo' | 'termo'>(initialDocType);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Form states
  const [clientName, setClientName] = useState(prefill?.clientName || initialClientName || '');
  const [clientCpf, setClientCpf] = useState(prefill?.clientCpf || initialClientCpf || '');
  const [clientPhone, setClientPhone] = useState(prefill?.clientPhone || initialClientPhone || '');
  const [clientBirthDate, setClientBirthDate] = useState(prefill?.clientBirthDate || '');
  const [date, setDate] = useState(prefill?.date || new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(prefill?.startTime || '14:00');
  const [endTime, setEndTime] = useState(prefill?.endTime || '15:15');
  const [serviceName, setServiceName] = useState(prefill?.serviceName || 'Hipnose Clínica Multidimensional Integrativa');
  const [amountRaw, setAmountRaw] = useState(
    prefill?.amountCents != null ? (prefill.amountCents / 100).toFixed(2).replace('.', ',') : '380,00'
  );
  const [paymentMethod, setPaymentMethod] = useState(prefill?.paymentMethod || 'PIX');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (activeOpen) {
      if (prefill?.clientName !== undefined) setClientName(prefill.clientName || '');
      else if (initialClientName !== undefined) setClientName(initialClientName || '');

      if (prefill?.clientCpf !== undefined) setClientCpf(prefill.clientCpf || '');
      else if (initialClientCpf !== undefined) setClientCpf(initialClientCpf || '');

      if (prefill?.clientPhone !== undefined) setClientPhone(prefill.clientPhone || '');
      else if (initialClientPhone !== undefined) setClientPhone(initialClientPhone || '');

      if (prefill?.clientBirthDate !== undefined) setClientBirthDate(prefill.clientBirthDate || '');
      if (prefill?.date !== undefined) setDate(prefill.date || new Date().toISOString().slice(0, 10));
      if (prefill?.startTime !== undefined) setStartTime(prefill.startTime || '14:00');
      if (prefill?.endTime !== undefined) setEndTime(prefill.endTime || '15:15');
      if (prefill?.serviceName !== undefined) setServiceName(prefill.serviceName || 'Hipnose Clínica Multidimensional Integrativa');
      if (prefill?.amountCents !== undefined && prefill.amountCents != null) {
        setAmountRaw((prefill.amountCents / 100).toFixed(2).replace('.', ','));
      }
      if (prefill?.paymentMethod !== undefined) setPaymentMethod(prefill.paymentMethod || 'PIX');
      if (initialDocType) setDocType(initialDocType);
    }
  }, [activeOpen, prefill, initialClientName, initialClientCpf, initialClientPhone, initialDocType]);

  if (!activeOpen) return null;

  function parseAmountCents(): number {
    const clean = amountRaw.replace(/\D/g, '');
    return clean ? parseInt(clean, 10) : 0;
  }

  async function handleGeneratePdf(action: 'view' | 'download') {
    setLoading(true);
    setError('');
    try {
      const payload = {
        type: docType,
        clientName: clientName.trim() || 'Paciente',
        clientCpf: clientCpf.trim() || null,
        clientPhone: clientPhone.trim() || null,
        clientBirthDate: clientBirthDate || null,
        date,
        startTime,
        endTime,
        serviceName,
        amountCents: parseAmountCents(),
        paymentMethod,
        notes: notes.trim() || null,
      };

      const response = await fetch('/api/admin/quick-documents/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar o documento PDF.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      if (action === 'view') {
        window.open(url, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docType}-${clientName.toLowerCase().replace(/\s+/g, '-') || 'doc'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar PDF.');
    } finally {
      setLoading(false);
    }
  }

  function handleCopyText() {
    let text = '';
    const dataFmt = date.split('-').reverse().join('/');
    const cpfFmt = clientCpf ? `, CPF nº ${clientCpf}` : '';

    if (docType === 'declaracao') {
      text =
        `DECLARAÇÃO DE COMPARECIMENTO\n\n` +
        `Declaro para os devidos fins que ${clientName}${cpfFmt} compareceu à Clínica Camila Machado no dia ${dataFmt}, das ${startTime} às ${endTime}, para atendimento em ${serviceName}.\n\n` +
        `Camila Machado - CRT-SBHP/SC 805\nUrussanga / SC`;
    } else if (docType === 'recibo') {
      text =
        `RECIBO DE PAGAMENTO\n\n` +
        `Recebi de ${clientName}${cpfFmt} o valor de R$ ${amountRaw} via ${paymentMethod.toUpperCase()}, referente ao atendimento de ${serviceName} realizado em ${dataFmt}.\n\n` +
        `Camila Machado - CRT-SBHP/SC 805\nUrussanga / SC`;
    } else {
      text =
        `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (LGPD)\n\n` +
        `Paciente: ${clientName}${cpfFmt}\nAtendimento: ${serviceName}\nData: ${dataFmt}\n\n` +
        `Declaro que fui informado(a) e concordo com os termos do acompanhamento terapêutico e autorizo o tratamento de dados de saúde conforme a LGPD.\n\n` +
        `Camila Machado - CRT-SBHP/SC 805`;
    }

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div
      className="modal-layer"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '22px',
          border: '2px solid #64748b',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.45)',
          width: '100%',
          maxWidth: '580px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '1.25rem',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '12px', paddingBottom: '10px', borderBottom: '2px solid #cbd5e1' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#21577a', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Documentos & Recibos Clínicos
            </span>
            <h2 style={{ margin: '2px 0 0', fontSize: '1.22rem', fontWeight: 800, color: '#0f172a' }}>
              Gerador de Documentos em PDF
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid #cbd5e1', background: '#f8fafc', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Document Type Selector Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px',
            background: '#f1f5f9',
            padding: '4px',
            borderRadius: '12px',
            marginBottom: '14px',
          }}
        >
          <button
            type="button"
            onClick={() => setDocType('declaracao')}
            style={{
              padding: '8px 6px',
              borderRadius: '9px',
              border: 'none',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
              background: docType === 'declaracao' ? '#ffffff' : 'transparent',
              color: docType === 'declaracao' ? '#1a3a4a' : '#64748b',
              boxShadow: docType === 'declaracao' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            <FileCheck2 size={14} /> Declaração
          </button>

          <button
            type="button"
            onClick={() => setDocType('recibo')}
            style={{
              padding: '8px 6px',
              borderRadius: '9px',
              border: 'none',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
              background: docType === 'recibo' ? '#ffffff' : 'transparent',
              color: docType === 'recibo' ? '#15803d' : '#64748b',
              boxShadow: docType === 'recibo' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            <Receipt size={14} /> Recibo / IRPF
          </button>

          <button
            type="button"
            onClick={() => setDocType('termo')}
            style={{
              padding: '8px 6px',
              borderRadius: '9px',
              border: 'none',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
              background: docType === 'termo' ? '#ffffff' : 'transparent',
              color: docType === 'termo' ? '#7c3aed' : '#64748b',
              boxShadow: docType === 'termo' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            <ShieldCheck size={14} /> Termo LGPD
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '10px', background: '#fef2f2', border: '1.5px solid #fecaca', color: '#b91c1c', fontSize: '0.8rem', fontWeight: 600 }}>
            {error}
          </div>
        )}

        {/* Form Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Client info */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <label className="form-group" style={{ margin: 0 }}>
              <span className="form-label">Nome do(a) Paciente *</span>
              <input
                type="text"
                className="form-input"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ex.: Lucas Pereira de Souza"
                required
              />
            </label>

            <label className="form-group" style={{ margin: 0 }}>
              <span className="form-label">CPF (p/ Recibo ou Declaração)</span>
              <input
                type="text"
                className="form-input"
                value={clientCpf}
                onChange={(e) => setClientCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </label>
          </div>

          {/* Date & Service */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <label className="form-group" style={{ margin: 0 }}>
              <span className="form-label">Data do Atendimento *</span>
              <input
                type="date"
                className="form-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>

            <label className="form-group" style={{ margin: 0 }}>
              <span className="form-label">Procedimento / Serviço</span>
              <input
                type="text"
                className="form-input"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="Ex.: Hipnose Clínica Integrativa"
              />
            </label>
          </div>

          {/* Specific fields for Declaração */}
          {docType === 'declaracao' && (
            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '12px', border: '1.5px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1a3a4a' }}>Horário do Comparecimento</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Início *</span>
                  <input
                    type="time"
                    className="form-input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </label>
                <label className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Término *</span>
                  <input
                    type="time"
                    className="form-input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Specific fields for Recibo */}
          {docType === 'recibo' && (
            <div style={{ background: '#f0fdf4', padding: '10px 12px', borderRadius: '12px', border: '1.5px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#15803d' }}>Dados Financeiros do Recibo</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Valor Quitado (R$) *</span>
                  <input
                    type="text"
                    className="form-input"
                    value={amountRaw}
                    onChange={(e) => setAmountRaw(e.target.value)}
                    placeholder="380,00"
                  />
                </label>
                <label className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">Forma de Pagamento</span>
                  <select
                    className="form-input"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="PIX">PIX</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Transferência">Transferência</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* Specific fields for Termo LGPD */}
          {docType === 'termo' && (
            <div style={{ background: '#faf5ff', padding: '10px 12px', borderRadius: '12px', border: '1.5px solid #e9d5ff', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label className="form-group" style={{ margin: 0 }}>
                <span className="form-label">Nascimento</span>
                <input
                  type="date"
                  className="form-input"
                  value={clientBirthDate}
                  onChange={(e) => setClientBirthDate(e.target.value)}
                />
              </label>
              <label className="form-group" style={{ margin: 0 }}>
                <span className="form-label">WhatsApp</span>
                <input
                  type="tel"
                  className="form-input"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </label>
            </div>
          )}

          {/* Observações */}
          <label className="form-group" style={{ margin: 0 }}>
            <span className="form-label">Observações adicionais (opcional)</span>
            <input
              type="text"
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Paciente necessitou de 15 minutos para repouso pós-sessão."
            />
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1.5px solid #cbd5e1' }}>
          <button
            type="button"
            onClick={handleCopyText}
            className="btn btn-secondary btn-sm"
            style={{ borderRadius: '999px', border: '1.5px solid #94a3b8', fontSize: '0.78rem', fontWeight: 700 }}
          >
            {copied ? <><Check size={14} /> Texto Copiado!</> : <><Copy size={14} /> Copiar Texto</>}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleGeneratePdf('view')}
              className="btn btn-secondary btn-sm"
              style={{ borderRadius: '999px', border: '1.5px solid #94a3b8', fontSize: '0.78rem', fontWeight: 700 }}
            >
              <ExternalLink size={14} /> {loading ? 'Gerando...' : 'Abrir PDF'}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleGeneratePdf('download')}
              className="btn btn-primary btn-sm"
              style={{ borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700 }}
            >
              <Download size={14} /> {loading ? 'Baixando...' : 'Baixar PDF Timbrado'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

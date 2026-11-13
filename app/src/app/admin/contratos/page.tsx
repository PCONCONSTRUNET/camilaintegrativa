'use client';

import { ChangeEvent, FormEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  Eye,
  FileSignature,
  Link2,
  LoaderCircle,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { formatCpf, formatPhone, maskCpf } from '@/lib/utils';

interface ContractTemplate {
  title: string;
  body: string;
  professionalName: string;
  professionalCpf: string;
  professionalCredential: string;
  professionalSignatureData: string;
  updatedAt: string;
}

interface ContractRecord {
  id: string;
  token: string;
  origin: 'agendamento' | 'grupo' | 'avulso';
  status: 'pendente' | 'assinado';
  appointmentId: string | null;
  clientId: string | null;
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
  ipAddress: string | null;
  createdAt: string;
}

const VARIABLE_CHIPS = [
  { key: '{{NOME_CLIENTE}}', label: 'Nome do Cliente' },
  { key: '{{CPF_CLIENTE}}', label: 'CPF do Cliente' },
  { key: '{{DATA_NASCIMENTO}}', label: 'Data de Nascimento' },
  { key: '{{TELEFONE_CLIENTE}}', label: 'WhatsApp do Cliente' },
  { key: '{{SERVICO}}', label: 'Serviço' },
  { key: '{{DATA_ATENDIMENTO}}', label: 'Data' },
  { key: '{{HORARIO_ATENDIMENTO}}', label: 'Horário' },
  { key: '{{MODALIDADE}}', label: 'Modalidade' },
  { key: '{{DATA_ASSINATURA}}', label: 'Data da Assinatura' },
  { key: '{{NOME_PROFISSIONAL}}', label: 'Nome Profissional' },
  { key: '{{CPF_PROFISSIONAL}}', label: 'CPF Profissional' },
  { key: '{{REGISTRO_PROFISSIONAL}}', label: 'Registro Prof.' },
];

const ORIGIN_LABELS: Record<string, string> = {
  agendamento: 'Agendamento',
  grupo: 'Sessão em Grupo',
  avulso: 'Avulso / WhatsApp',
};

export default function AdminContratosPage() {
  const [activeTab, setActiveTab] = useState<'lista' | 'modelo'>('lista');
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [template, setTemplate] = useState<ContractTemplate | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [originFilter, setOriginFilter] = useState('todos');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal visualizar contrato
  const [viewingContract, setViewingContract] = useState<ContractRecord | null>(null);

  // Modal criar link WhatsApp
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [createdContractLink, setCreatedContractLink] = useState<ContractRecord | null>(null);
  const [linkForm, setLinkForm] = useState({
    serviceName: 'Atendimento Terapêutico',
    sessionDate: '',
    sessionTime: '',
    modality: 'presencial',
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form modelo & assinatura
  const [tplTitle, setTplTitle] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplProfName, setTplProfName] = useState('');
  const [tplProfCpf, setTplProfCpf] = useState('');
  const [tplProfCred, setTplProfCred] = useState('');
  const [tplSigData, setTplSigData] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [hasCanvasStroke, setHasCanvasStroke] = useState(false);

  const originBase = typeof window !== 'undefined' ? window.location.origin : '';

  const showFeedback = useCallback((type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  }, []);

  const applyLoadedData = useCallback((data: { contracts?: ContractRecord[]; template?: ContractTemplate }) => {
    setContracts(data.contracts || []);
    if (data.template) {
      const t = data.template;
      setTemplate(t);
      setTplTitle(t.title || '');
      setTplBody(t.body || '');
      setTplProfName(t.professionalName || '');
      setTplProfCpf(t.professionalCpf ? maskCpf(t.professionalCpf) : '');
      setTplProfCred(t.professionalCredential || '');
      setTplSigData(t.professionalSignatureData || '');
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/contracts');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar contratos.');
      applyLoadedData(data);
    } catch (err) {
      showFeedback('err', err instanceof Error ? err.message : 'Erro ao carregar contratos.');
    } finally {
      setLoading(false);
    }
  }, [applyLoadedData, showFeedback]);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/contracts')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao carregar contratos.');
        if (active) applyLoadedData(data);
      })
      .catch((err) => {
        if (active) showFeedback('err', err instanceof Error ? err.message : 'Erro ao carregar contratos.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyLoadedData, showFeedback]);

  const filteredContracts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return contracts.filter((c) => {
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (originFilter !== 'todos' && c.origin !== originFilter) return false;
      if (!q) return true;
      return (
        c.clientName.toLowerCase().includes(q) ||
        c.serviceName.toLowerCase().includes(q) ||
        (digits && c.clientCpf.includes(digits)) ||
        (digits && c.clientPhone.includes(digits))
      );
    });
  }, [contracts, search, statusFilter, originFilter]);

  const stats = useMemo(() => {
    const signed = contracts.filter((c) => c.status === 'assinado').length;
    const pending = contracts.filter((c) => c.status === 'pendente').length;
    return { total: contracts.length, signed, pending };
  }, [contracts]);

  async function copyText(text: string, labelId: string, msg = 'Copiado!') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(labelId);
      setTimeout(() => setCopiedId(null), 2200);
      showFeedback('ok', msg);
    } catch {
      showFeedback('err', 'Não foi possível copiar automaticamente.');
    }
  }

  function buildContractLink(token?: string) {
    return token ? `${originBase}/contrato/${token}` : `${originBase}/contrato`;
  }

  function buildWhatsappUrl(c: ContractRecord) {
    const url = buildContractLink(c.token);
    const firstName = c.clientName ? c.clientName.split(' ')[0] : '';
    const greeting = firstName ? `Olá ${firstName}!` : 'Olá!';
    const text = `${greeting} Segue o link do seu contrato de atendimento para leitura e assinatura digital: ${url}`;
    const phoneDigits = c.clientPhone.replace(/\D/g, '');
    const waPhone = phoneDigits.length >= 10 ? (phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`) : '';
    return `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
  }

  async function handleCreateLink(e: FormEvent) {
    e.preventDefault();
    setCreatingLink(true);
    try {
      const res = await fetch('/api/admin/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_link',
          ...linkForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar link.');
      setCreatedContractLink(data.contract);
      setContracts((prev) => [data.contract, ...prev]);
      showFeedback('ok', 'Link gerado com sucesso!');
    } catch (err) {
      showFeedback('err', err instanceof Error ? err.message : 'Erro ao gerar link.');
    } finally {
      setCreatingLink(false);
    }
  }

  async function handleDeleteContract(id: string) {
    if (!window.confirm('Tem certeza que deseja excluir este registro de contrato?')) return;
    try {
      const res = await fetch(`/api/admin/contracts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir.');
      setContracts((prev) => prev.filter((c) => c.id !== id));
      if (viewingContract?.id === id) setViewingContract(null);
      showFeedback('ok', 'Contrato removido.');
    } catch (err) {
      showFeedback('err', err instanceof Error ? err.message : 'Erro ao excluir contrato.');
    }
  }

  function insertVariable(varKey: string) {
    const el = textareaRef.current;
    if (!el) {
      setTplBody((prev) => `${prev}${prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${varKey}`);
      return;
    }
    const start = el.selectionStart ?? tplBody.length;
    const end = el.selectionEnd ?? tplBody.length;
    const next = tplBody.slice(0, start) + varKey + tplBody.slice(end);
    setTplBody(next);
    setTimeout(() => {
      el.focus();
      const pos = start + varKey.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  }

  // Canvas assinatura
  function getCanvasCoords(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handleCanvasPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getCanvasCoords(e);
    ctx.strokeStyle = '#17374d';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingRef.current = true;
    setHasCanvasStroke(true);
  }

  function handleCanvasPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handleCanvasPointerUp() {
    isDrawingRef.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasCanvasStroke(false);
  }

  function applyDrawnSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !hasCanvasStroke) {
      showFeedback('err', 'Desenhe sua assinatura no quadro antes de aplicar.');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    setTplSigData(dataUrl);
    showFeedback('ok', 'Assinatura desenhada aplicada! Clique em Salvar Modelo para gravar.');
  }

  function handleUploadSignatureImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 500;
        const maxH = 180;
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const ctx = off.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        setTplSigData(off.toDataURL('image/png'));
        showFeedback('ok', 'Imagem da assinatura carregada! Clique em Salvar Modelo.');
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleSaveTemplate(e: FormEvent) {
    e.preventDefault();
    setSavingTemplate(true);
    try {
      const res = await fetch('/api/admin/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_template',
          title: tplTitle,
          body: tplBody,
          professionalName: tplProfName,
          professionalCpf: tplProfCpf.replace(/\D/g, ''),
          professionalCredential: tplProfCred,
          professionalSignatureData: tplSigData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar modelo.');
      setTemplate(data.template);
      showFeedback('ok', 'Modelo de contrato e assinatura salvos com sucesso!');
    } catch (err) {
      showFeedback('err', err instanceof Error ? err.message : 'Erro ao salvar modelo.');
    } finally {
      setSavingTemplate(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: '#8b6e44',
            }}
          >
            Jurídico &amp; Assinatura Eletrônica
          </span>
          <h1 style={{ margin: '2px 0 4px', fontSize: '1.55rem', color: '#17374d' }}>
            Contratos de Atendimento
          </h1>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#5c6f7e' }}>
            Contratos assinados automaticamente no agendamento e links avulsos para envio via WhatsApp.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() =>
              copyText(
                `${originBase}/contrato`,
                'universal',
                'Link universal (/contrato) copiado!'
              )
            }
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {copiedId === 'universal' ? <Check size={15} /> : <Link2 size={15} />}
            Copiar link universal
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setCreatedContractLink(null);
              setLinkForm({
                serviceName: 'Atendimento Terapêutico',
                sessionDate: '',
                sessionTime: '',
                modality: 'presencial',
              });
              setLinkModalOpen(true);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={15} /> Gerar Link WhatsApp
          </button>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '0.88rem',
            fontWeight: 600,
            background: feedback.type === 'ok' ? '#ebfaf2' : '#fff2f2',
            color: feedback.type === 'ok' ? '#146d43' : '#9b2222',
            border: `1px solid ${feedback.type === 'ok' ? '#b7e6cd' : '#f1c2c2'}`,
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* Aviso se CPF da Camila não configurado */}
      {template && !template.professionalCpf && (
        <div
          style={{
            background: '#fff9eb',
            border: '1px solid #efd699',
            borderRadius: '14px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '0.86rem',
            color: '#6e5013',
          }}
        >
          <span>
            <strong>Atenção:</strong> O CPF da Camila e o texto oficial do contrato ainda podem ser
            personalizados na aba <strong>Modelo &amp; Assinatura</strong>.
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setActiveTab('modelo')}
          >
            Configurar Modelo e CPF
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e4ddd1', paddingBottom: '10px' }}>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'lista' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('lista')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ShieldCheck size={15} /> Contratos ({contracts.length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'modelo' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('modelo')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <FileSignature size={15} /> Modelo &amp; Assinatura da Camila
        </button>
      </div>

      {activeTab === 'lista' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Resumo */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '12px',
            }}
          >
            <div style={{ background: '#fff', border: '1px solid #e6dfd3', borderRadius: '14px', padding: '14px 16px' }}>
              <span style={{ fontSize: '0.76rem', color: '#61717e', display: 'block' }}>Total de Contratos</span>
              <strong style={{ fontSize: '1.5rem', color: '#17374d' }}>{stats.total}</strong>
            </div>
            <div style={{ background: '#f3fbf6', border: '1px solid #c9ebd7', borderRadius: '14px', padding: '14px 16px' }}>
              <span style={{ fontSize: '0.76rem', color: '#1b6f47', display: 'block' }}>Assinados</span>
              <strong style={{ fontSize: '1.5rem', color: '#146d43' }}>{stats.signed}</strong>
            </div>
            <div style={{ background: '#fffaf0', border: '1px solid #f2deb0', borderRadius: '14px', padding: '14px 16px' }}>
              <span style={{ fontSize: '0.76rem', color: '#946200', display: 'block' }}>Aguardando Assinatura</span>
              <strong style={{ fontSize: '1.5rem', color: '#8a5900' }}>{stats.pending}</strong>
            </div>
          </div>

          {/* Filtros */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e6dfd3',
              borderRadius: '14px',
              padding: '12px 14px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 240px' }}>
              <Search
                size={15}
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#7a8a97' }}
              />
              <input
                className="form-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, CPF, telefone ou serviço…"
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: 'auto', minWidth: '150px' }}
            >
              <option value="todos">Todos os status</option>
              <option value="assinado">Assinados</option>
              <option value="pendente">Pendentes</option>
            </select>
            <select
              className="form-select"
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value)}
              style={{ width: 'auto', minWidth: '165px' }}
            >
              <option value="todos">Todas as origens</option>
              <option value="agendamento">Agendamento site</option>
              <option value="grupo">Sessão em grupo</option>
              <option value="avulso">Avulso / WhatsApp</option>
            </select>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => void loadData()}
              title="Atualizar"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>

          {/* Lista */}
          {loading ? (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #e6dfd3' }}>
              <LoaderCircle className="spin" size={24} style={{ margin: '0 auto 8px' }} />
              <p style={{ margin: 0, color: '#61717e' }}>Carregando contratos…</p>
            </div>
          ) : filteredContracts.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '42px 24px', textAlign: 'center', border: '1px solid #e6dfd3' }}>
              <FileSignature size={34} style={{ margin: '0 auto 10px', color: '#8a99a6' }} />
              <h3 style={{ margin: '0 0 6px', color: '#17374d' }}>Nenhum contrato encontrado</h3>
              <p style={{ margin: 0, color: '#61717e', fontSize: '0.9rem' }}>
                Os contratos aparecerão aqui automaticamente quando um cliente agendar ou assinar um link avulso.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredContracts.map((c) => {
                const isSigned = c.status === 'assinado';
                return (
                  <article
                    key={c.id}
                    style={{
                      background: '#fff',
                      border: '1px solid #e4ddd1',
                      borderRadius: '14px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ minWidth: '240px', flex: '1 1 320px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '1rem', color: '#17374d' }}>
                          {c.clientName || 'Aguardando preenchimento pelo cliente'}
                        </strong>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: isSigned ? '#e5f6ed' : '#fff4da',
                            color: isSigned ? '#146d43' : '#945d00',
                          }}
                        >
                          {isSigned ? 'Assinado' : 'Pendente'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: '#eef3f7',
                            color: '#345168',
                          }}
                        >
                          {ORIGIN_LABELS[c.origin] || c.origin}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#586a78', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        <span>CPF: {c.clientCpf ? formatCpf(c.clientCpf) : 'A preencher'}</span>
                        {c.clientPhone && <span>WhatsApp: {formatPhone(c.clientPhone)}</span>}
                        <span>Serviço: {c.serviceName}</span>
                        {c.sessionDate && (
                          <span>
                            Sessão: {c.sessionDate.split('-').reverse().join('/')}
                            {c.sessionTime ? ` às ${c.sessionTime}` : ''}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#788896', marginTop: '4px' }}>
                        {isSigned && c.acceptedAt
                          ? `Assinado em ${new Date(c.acceptedAt).toLocaleString('pt-BR')}${c.ipAddress ? ` · IP ${c.ipAddress}` : ''}`
                          : `Link criado em ${new Date(c.createdAt).toLocaleString('pt-BR')}`}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      {!isSigned && (
                        <>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => copyText(buildContractLink(c.token), c.id, 'Link copiado!')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          >
                            {copiedId === c.id ? <Check size={14} /> : <Copy size={14} />}
                            Copiar Link
                          </button>
                          <a
                            href={buildWhatsappUrl(c)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#128c7e' }}
                          >
                            <MessageCircle size={14} /> WhatsApp
                          </a>
                        </>
                      )}
                      {isSigned && (
                        <>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setViewingContract(c)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          >
                            <Eye size={14} /> Ver Contrato
                          </button>
                          <a
                            href={`/api/admin/contracts/${c.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          >
                            <Download size={14} /> PDF
                          </a>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => handleDeleteContract(c.id)}
                        title="Excluir registro"
                        style={{ color: '#a52828' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* TAB MODELO & ASSINATURA */
        <form
          onSubmit={handleSaveTemplate}
          style={{
            background: '#fff',
            border: '1px solid #e6dfd3',
            borderRadius: '18px',
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: '#17374d' }}>
                Título do Contrato
              </label>
              <input
                className="form-input"
                value={tplTitle}
                onChange={(e) => setTplTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: '#17374d' }}>
                Nome da Profissional (Contratada)
              </label>
              <input
                className="form-input"
                value={tplProfName}
                onChange={(e) => setTplProfName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: '#17374d' }}>
                CPF da Camila (Contratada)
              </label>
              <input
                className="form-input"
                value={tplProfCpf}
                onChange={(e) => setTplProfCpf(maskCpf(e.target.value))}
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '5px', color: '#17374d' }}>
                Registro / Credencial
              </label>
              <input
                className="form-input"
                value={tplProfCred}
                onChange={(e) => setTplProfCred(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px', color: '#17374d' }}>
              Texto Completo do Contrato
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {VARIABLE_CHIPS.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => insertVariable(chip.key)}
                  style={{
                    fontSize: '0.73rem',
                    padding: '4px 9px',
                    borderRadius: '999px',
                    background: '#f4efe6',
                    border: '1px solid #e0d6c5',
                    color: '#2b4459',
                    cursor: 'pointer',
                  }}
                  title={`Inserir ${chip.key}`}
                >
                  + {chip.label}
                </button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="form-textarea"
              rows={15}
              value={tplBody}
              onChange={(e) => setTplBody(e.target.value)}
              style={{ fontFamily: 'inherit', lineHeight: 1.55, minHeight: '320px' }}
              required
            />
          </div>

          {/* Assinatura padrão da Camila */}
          <div
            style={{
              background: '#faf6ee',
              border: '1px solid #e6ddd0',
              borderRadius: '14px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.94rem', color: '#17374d', display: 'block' }}>
                Assinatura Padrão da Camila (aparece ao lado do contrato e no PDF)
              </strong>
              <span style={{ fontSize: '0.8rem', color: '#61717e' }}>
                Você pode desenhar abaixo, enviar uma imagem PNG/JPG da assinatura ou deixar a assinatura cursiva padrão.
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '16px',
                alignItems: 'start',
              }}
            >
              {/* Prévia atual */}
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #ded6c8',
                  borderRadius: '12px',
                  padding: '14px',
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#7a6850' }}>
                  Prévia da Assinatura Salva
                </span>
                <div
                  style={{
                    marginTop: '10px',
                    minHeight: '72px',
                    borderBottom: '1px solid #cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingBottom: '6px',
                  }}
                >
                  {tplSigData ? (
                    <img
                      src={tplSigData}
                      alt="Assinatura da profissional"
                      style={{ maxHeight: '64px', maxWidth: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <span
                      style={{
                        fontFamily: 'Georgia, "Times New Roman", serif',
                        fontStyle: 'italic',
                        fontSize: '1.35rem',
                        color: '#17374d',
                      }}
                    >
                      {tplProfName || 'Camila Machado'}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: '6px', textAlign: 'center', fontSize: '0.78rem', color: '#495a67' }}>
                  <strong>{tplProfName || 'Camila Machado'}</strong> · CPF:{' '}
                  {tplProfCpf || 'Não informado'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                  <label
                    className="btn btn-outline btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
                  >
                    <Upload size={14} /> Enviar Imagem
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUploadSignatureImage}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {tplSigData && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setTplSigData('')}
                    >
                      Usar cursiva padrão
                    </button>
                  )}
                </div>
              </div>

              {/* Quadro para desenhar assinatura */}
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #ded6c8',
                  borderRadius: '12px',
                  padding: '14px',
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#7a6850', display: 'block', marginBottom: '8px' }}>
                  Ou Desenhe Aqui (Mouse / Toque)
                </span>
                <canvas
                  ref={canvasRef}
                  width={420}
                  height={130}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerLeave={handleCanvasPointerUp}
                  style={{
                    width: '100%',
                    height: '115px',
                    border: '1px dashed #b9c5cf',
                    borderRadius: '10px',
                    background: '#fcfdff',
                    touchAction: 'none',
                    cursor: 'crosshair',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={clearCanvas}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Eraser size={14} /> Limpar
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={applyDrawnSignature}
                    disabled={!hasCanvasStroke}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Check size={14} /> Aplicar Desenho
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={savingTemplate}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              {savingTemplate ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
              Salvar Modelo e Assinatura
            </button>
          </div>
        </form>
      )}

      {/* Modal Gerar Link WhatsApp */}
      {linkModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 900,
            background: 'rgba(13, 30, 44, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setLinkModalOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '18px',
              maxWidth: '540px',
              width: '100%',
              padding: '22px',
              boxShadow: '0 24px 60px rgba(10, 28, 45, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: '#17374d', fontSize: '1.1rem' }}>
                Gerar Link de Contrato para WhatsApp
              </h3>
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#61717e' }}
              >
                <X size={20} />
              </button>
            </div>

            {!createdContractLink ? (
              <form onSubmit={handleCreateLink} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    background: '#f4f8fb',
                    border: '1px solid #d5e2ec',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '0.84rem',
                    color: '#203b4f',
                    lineHeight: 1.45,
                  }}
                >
                  O próprio cliente preencherá <strong>Nome completo, CPF e Data de nascimento</strong> ao abrir o link. Os campos abaixo são apenas opcionais caso queira deixar o atendimento indicado:
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                    Serviço / Atendimento (opcional)
                  </label>
                  <input
                    className="form-input"
                    value={linkForm.serviceName}
                    onChange={(e) => setLinkForm({ ...linkForm, serviceName: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                      Data (opcional)
                    </label>
                    <input
                      className="form-input"
                      type="date"
                      value={linkForm.sessionDate}
                      onChange={(e) => setLinkForm({ ...linkForm, sessionDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                      Horário (opcional)
                    </label>
                    <input
                      className="form-input"
                      value={linkForm.sessionTime}
                      onChange={(e) => setLinkForm({ ...linkForm, sessionTime: e.target.value })}
                      placeholder="Ex: 14:00"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                      Modalidade
                    </label>
                    <select
                      className="form-select"
                      value={linkForm.modality}
                      onChange={(e) => setLinkForm({ ...linkForm, modality: e.target.value })}
                    >
                      <option value="presencial">Presencial</option>
                      <option value="online">Online</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setLinkModalOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={creatingLink}>
                    {creatingLink ? 'Gerando…' : 'Criar Link para Cliente Preencher'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    background: '#f2fbf6',
                    border: '1px solid #bce8cf',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    fontSize: '0.88rem',
                    color: '#146d43',
                  }}
                >
                  Link exclusivo criado! Envie no WhatsApp para o cliente preencher <strong>Nome, CPF e Data de nascimento</strong> e assinar o contrato.
                </div>

                <div
                  style={{
                    background: '#f7f9fb',
                    border: '1px solid #dce3ea',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '0.84rem',
                    wordBreak: 'break-all',
                    color: '#17374d',
                    fontWeight: 600,
                  }}
                >
                  {buildContractLink(createdContractLink.token)}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      copyText(buildContractLink(createdContractLink.token), 'modal-link', 'Link copiado!')
                    }
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Copy size={14} /> Copiar Link
                  </button>
                  <a
                    href={buildWhatsappUrl(createdContractLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#128c7e' }}
                  >
                    <MessageCircle size={14} /> Enviar no WhatsApp
                  </a>
                  <a
                    href={`/contrato/${createdContractLink.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <ExternalLink size={14} /> Testar Página
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Visualizar Contrato Assinado */}
      {viewingContract && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 900,
            background: 'rgba(13, 30, 44, 0.58)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setViewingContract(null)}
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
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e6dfd3',
                background: '#faf6ee',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: '#17374d', fontSize: '1.02rem' }}>
                  {viewingContract.contractTitle}
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#61717e' }}>
                  {viewingContract.clientName} · CPF {formatCpf(viewingContract.clientCpf)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingContract(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#61717e' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: '#fff',
                  border: '1px solid #e6dfd3',
                  borderRadius: '12px',
                  padding: '18px',
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.88rem',
                  lineHeight: 1.6,
                  color: '#223341',
                }}
              >
                {viewingContract.contractBodySnapshot}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                  gap: '12px',
                }}
              >
                <div style={{ border: '1px solid #e6ddd0', borderRadius: '12px', padding: '14px', background: '#fcf9f3' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7a6850' }}>CONTRATADA (PROPRIETÁRIA)</span>
                  <div style={{ margin: '8px 0 6px', borderBottom: '1px solid #d5cab8', paddingBottom: '4px', minHeight: '36px', display: 'flex', alignItems: 'center' }}>
                    {viewingContract.professionalSignatureData ? (
                      <img
                        src={viewingContract.professionalSignatureData}
                        alt={viewingContract.professionalName}
                        style={{ maxHeight: '38px', objectFit: 'contain' }}
                      />
                    ) : (
                      <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.08rem', color: '#17374d' }}>
                        {viewingContract.professionalName}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#495a67' }}>
                    <strong>{viewingContract.professionalName}</strong>
                    <div>CPF: {viewingContract.professionalCpf ? formatCpf(viewingContract.professionalCpf) : 'Não informado'}</div>
                    <div>{viewingContract.professionalCredential}</div>
                  </div>
                </div>

                <div style={{ border: '1px solid #dce5ec', borderRadius: '12px', padding: '14px', background: '#f7fafc' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#5b7083' }}>CONTRATANTE (CLIENTE)</span>
                  <div style={{ margin: '10px 0 6px', borderBottom: '1px solid #b8c7d4', paddingBottom: '4px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.05rem', color: '#17374d' }}>
                    {viewingContract.clientName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#394d5c' }}>
                    <strong>{viewingContract.clientName}</strong>
                    <div>CPF: {formatCpf(viewingContract.clientCpf)}</div>
                    {viewingContract.clientBirthDate && (
                      <div>
                        Nascimento: {viewingContract.clientBirthDate.split('-').reverse().join('/')}
                      </div>
                    )}
                    {viewingContract.acceptedAt && (
                      <div style={{ color: '#146d43', marginTop: '2px' }}>
                        Assinado em {new Date(viewingContract.acceptedAt).toLocaleString('pt-BR')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid #e6dfd3',
                background: '#faf6ee',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setViewingContract(null)}>
                Fechar
              </button>
              <a
                href={`/api/admin/contracts/${viewingContract.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <Download size={14} /> Baixar PDF
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

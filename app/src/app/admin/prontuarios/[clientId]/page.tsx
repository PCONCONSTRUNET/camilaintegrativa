'use client';

import { use, useCallback, useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  Plus,
  Shield,
  Target,
  User,
  HeartPulse,
  Brain,
  FolderOpen,
  History,
  Printer,
  X,
  Mail,
  Edit3,
  CalendarDays,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Award,
  AlertTriangle,
  Trash2,
  Eye,
  Pencil,
  Download,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';
import {
  PROFESSIONAL_INFO,
  HYPNOTHERAPY_TECHNIQUES,
  HYPNOTHERAPY_DOC_TEMPLATES,
} from '@/lib/domain';
import type {
  ProntuarioFull,
  ClientRecord,
  TreatmentGoal,
  ClinicalEvolution,
  ClinicalTechnique,
  ClientDocument,
  AppointmentSummary,
} from '@/lib/domain';
import { formatPhone, maskPhone } from '@/lib/utils';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { QuickDocumentsModal } from '@/components/quick-documents-modal';
import { uploadImageToStorage, getSafeFileUrl } from '@/lib/image-storage';
import { uploadDocumentToR2Api } from '@/lib/document-upload-client';

type TabKey =
  | 'ficha'
  | 'objetivos'
  | 'sessoes'
  | 'evolucoes'
  | 'tecnicas'
  | 'documentos'
  | 'auditoria';

const TAB_CONFIG: Array<{ key: TabKey; label: string; icon: typeof User }> = [
  { key: 'ficha', label: 'Ficha Inicial', icon: User },
  { key: 'objetivos', label: 'Objetivos', icon: Target },
  { key: 'sessoes', label: 'Sessões', icon: CalendarDays },
  { key: 'evolucoes', label: 'Protocolo de Sessão', icon: FileText },
  { key: 'tecnicas', label: 'Técnicas & Abordagens', icon: Brain },
  { key: 'documentos', label: 'Documentos e Termos', icon: FolderOpen },
  { key: 'auditoria', label: 'Histórico de Acessos', icon: History },
];

/** Botões Sim/Não (mesmo fluxo do portal do cliente). Envia '1'/'0' via input hidden. */
function YesNoPills({
  name,
  defaultValue,
  yesContent,
}: {
  name: string;
  defaultValue: boolean;
  yesContent?: React.ReactNode;
}) {
  const [value, setValue] = useState(defaultValue);
  const pill = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 16px',
    borderRadius: '10px',
    border: active ? '2px solid #1a3a4a' : '1px solid #cbd5e1',
    background: active ? '#1a3a4a' : '#ffffff',
    color: active ? '#ffffff' : '#334155',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  });
  return (
    <div>
      <input type="hidden" name={name} value={value ? '1' : '0'} />
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" style={pill(!value)} onClick={() => setValue(false)}>Não</button>
        <button type="button" style={pill(value)} onClick={() => setValue(true)}>Sim</button>
      </div>
      {value && yesContent ? <div style={{ marginTop: '12px' }}>{yesContent}</div> : null}
    </div>
  );
}

function formatDateBr(isoOrDate: string | null | undefined) {
  if (!isoOrDate) return 'Não informado';
  if (isoOrDate.includes('T')) {
    const d = new Date(isoOrDate);
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  }
  const [year, month, day] = isoOrDate.split('-');
  if (year && month && day) return `${day}/${month}/${year}`;
  return isoOrDate;
}

const prontuarioCache = new Map<string, ProntuarioFull>();

function createInitialProntuario(clientId: string): ProntuarioFull {
  return {
    client: {
      id: clientId,
      name: 'Prontuário Clínico',
      phone: '',
      email: null,
      status: 'ativo',
      nextAppointmentAt: null,
      completedAppointments: 0,
      createdAt: new Date().toISOString(),
    },
    record: null,
    goals: [],
    sessions: [],
    evolutions: [],
    techniques: [],
    documents: [],
    referrals: [],
    logs: [],
    packages: [],
  };
}

export default function ProntuarioDetalhePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = use(params);
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab') as TabKey | null;

  const [data, setData] = useState<ProntuarioFull>(() => prontuarioCache.get(clientId) ?? createInitialProntuario(clientId));
  const [activeTab, setActiveTabState] = useState<TabKey>(() => {
    if (urlTab && TAB_CONFIG.some((t) => t.key === urlTab)) return urlTab;
    return 'ficha';
  });

  const setActiveTab = useCallback((nextTab: TabKey) => {
    setActiveTabState(nextTab);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(`clinica_pront_tab_${clientId}`, nextTab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', nextTab);
        window.history.replaceState(null, '', url.pathname + url.search);
      } catch {
        // ignore
      }
    }
  }, [clientId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const currentUrl = new URL(window.location.href);
      const paramTab = currentUrl.searchParams.get('tab') as TabKey | null;
      if (paramTab && TAB_CONFIG.some((t) => t.key === paramTab)) {
        setActiveTabState(paramTab);
        window.localStorage.setItem(`clinica_pront_tab_${clientId}`, paramTab);
        return;
      }
      const saved = window.localStorage.getItem(`clinica_pront_tab_${clientId}`) as TabKey | null;
      if (saved && TAB_CONFIG.some((t) => t.key === saved)) {
        setActiveTabState(saved);
        currentUrl.searchParams.set('tab', saved);
        window.history.replaceState(null, '', currentUrl.pathname + currentUrl.search);
      }
    } catch {
      // ignore
    }
  }, [clientId]);
  const [, setLoading] = useState(!prontuarioCache.has(clientId));
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modais
  const [editRecordOpen, setEditRecordOpen] = useState(false);
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [newEvolutionOpen, setNewEvolutionOpen] = useState(false);
  const [newTechniqueOpen, setNewTechniqueOpen] = useState(false);
  const [newDocumentOpen, setNewDocumentOpen] = useState(false);
  const [docFiles, setDocFiles] = useState<{ name: string; mimeType: string; size: number; data: string }[]>([]);
  const [uploadingDocFiles, setUploadingDocFiles] = useState(false);
  const [docUploadProgressText, setDocUploadProgressText] = useState('');

  async function processSelectedDocumentFiles(files: File[]): Promise<Array<{ name: string; mimeType: string; size: number; data: string }>> {
    setUploadingDocFiles(true);
    setDocUploadProgressText('Otimizando arquivos...');
    try {
      const processed: Array<{ name: string; mimeType: string; size: number; data: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Se for imagem, comprime no navegador e salva no Supabase Storage (sem base64 no banco)
        if (file.type.startsWith('image/')) {
          setDocUploadProgressText(`Comprimindo foto ${i + 1} de ${files.length}...`);
          try {
            const { url, sizeAfter, sizeBefore } = await uploadImageToStorage(file, 'prontuarios');
            const reduction = Math.round((1 - sizeAfter / sizeBefore) * 100);
            console.log(
              `Imagem de prontuário salva no Storage: ${Math.round(sizeBefore / 1024)}KB -> ${Math.round(sizeAfter / 1024)}KB (-${reduction}%)`
            );
            processed.push({
              name: file.name,
              mimeType: 'image/jpeg',
              size: sizeAfter,
              data: url,
            });
            continue;
          } catch (storageErr) {
            console.error('Falha no upload para o storage:', storageErr);
            alert(`Erro ao enviar foto "${file.name}" para o storage. Verifique sua conexão.`);
            continue;
          }
        }

        // Para outros documentos (PDF, Docx etc) -> Envia direto para Cloudflare R2
        setDocUploadProgressText(`Enviando documento ${i + 1} de ${files.length} para o Cloudflare R2...`);
        try {
          const docRes = await uploadDocumentToR2Api(file, 'prontuarios');
          processed.push({
            name: file.name,
            mimeType: docRes.mimeType,
            size: docRes.size,
            data: docRes.url,
          });
        } catch (r2Err) {
          console.error('Falha no upload para Cloudflare R2:', r2Err);
          alert(`Erro ao enviar documento "${file.name}" para o Cloudflare R2. Verifique sua conexão.`);
        }
      }
      return processed;
    } finally {
      setUploadingDocFiles(false);
      setDocUploadProgressText('');
    }
  }
  // Document view/edit/delete
  const [viewDocOpen, setViewDocOpen] = useState<ClientDocument | null>(null);
  const [viewDocFileIdx, setViewDocFileIdx] = useState<number | null>(null);
  const [editDocOpen, setEditDocOpen] = useState<ClientDocument | null>(null);
  const [editDocFiles, setEditDocFiles] = useState<{ name: string; mimeType: string; size: number; data: string }[]>([]);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState<ClientDocument | null>(null);
  const [printing, setPrinting] = useState(false);
  const [quickDocOpen, setQuickDocOpen] = useState(false);

  // Pré-seleção ao criar evolução vinda de uma sessão
  const [selectedSessionForEvolution, setSelectedSessionForEvolution] = useState<AppointmentSummary | null>(null);

  // Estado de contatos de emergência no formulário
  const [emergencyContacts, setEmergencyContacts] = useState<{ name: string; phone: string; relationship: string }[]>([{ name: '', phone: '', relationship: '' }]);

  // Custom percentage state for goals
  const [customPctMap, setCustomPctMap] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}`, { cache: 'no-store' });
      const json = await res.json();
      setLoading(false);
      if (!res.ok) return setError(json.error ?? 'Erro ao carregar prontuário.');
      prontuarioCache.set(clientId, json);
      setData(json);
    } catch {
      setLoading(false);
      setError('Erro de conexão com o servidor.');
    }
  }, [clientId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  // Lock body scroll when any modal is open
  const anyModalOpen =
    editRecordOpen ||
    newGoalOpen ||
    newEvolutionOpen ||
    newTechniqueOpen ||
    newDocumentOpen ||
    !!viewDocOpen ||
    !!editDocOpen ||
    !!deleteDocConfirm;

  useEffect(() => {
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [anyModalOpen]);

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Salvar Ficha Inicial SBHP
  async function handleSaveRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = Object.fromEntries(formData.entries()) as Record<string, unknown>;
    
    // Contato de emergência direto
    const ecName = String(body.emergencyContactName || '').trim();
    const ecPhone = String(body.emergencyContactPhone || '').trim();
    const ecRel = String(body.emergencyContactRelationship || '').trim();
    if (ecName || ecPhone) {
      body.emergencyContacts = [{ name: ecName, phone: ecPhone, relationship: ecRel }];
    } else {
      body.emergencyContacts = null;
    }

    // Normalização dos checkboxes e campos da Anamnese
    body.epilepsyHistory = body.epilepsyHistory === '1' ? 1 : 0;
    body.hasHealthConditions = body.hasHealthConditions === '1' || body.hasHealthConditions === 'true';
    body.hasPsychCare = body.hasPsychCare === '1' || body.hasPsychCare === 'true';
    body.consentAgreed = body.consentAgreed === '1' || body.consentAgreed === 'true';
    if (!body.consultationReason && body.chiefComplaint) {
      body.consultationReason = body.chiefComplaint;
    }

    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao salvar ficha');
      setEditRecordOpen(false);
      showToast('Ficha de Hipnoterapia SBHP salva com sucesso!');
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  // Novo Objetivo
  async function handleCreateGoal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = {
      title: formData.get('title'),
      description: formData.get('description'),
      status: formData.get('status'),
      progressPct: Number(formData.get('progressPct') ?? 0),
      targetDate: formData.get('targetDate') || null,
    };

    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao cadastrar objetivo');
      setNewGoalOpen(false);
      showToast('Objetivo terapêutico cadastrado com sucesso!');
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao cadastrar');
    }
  }

  // Atualizar Progresso / Status do Objetivo
  async function handleUpdateGoal(goalId: string, status: string, progressPct: number) {
    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}/goals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId, status, progressPct }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao atualizar objetivo');
      showToast('Objetivo terapêutico atualizado!');
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  }

  // Nova Evolução
  async function handleCreateEvolution(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = {
      appointmentId: formData.get('appointmentId') || null,
      sessionDate: formData.get('sessionDate'),
      title: formData.get('title'),
      summary: formData.get('summary') || null,
      evolutionText: formData.get('evolutionText'),
      interventions: formData.get('interventions') || null,
      homeworkTasks: formData.get('homeworkTasks') || null,
      isConfidential: true,
      // Protocolo de Hipnose SBHP
      inductionMethod: formData.get('inductionMethod') || null,
      tranceDepth: formData.get('tranceDepth') || null,
      hypnoticPhenomena: formData.get('hypnoticPhenomena') || null,
      postHypnoticSuggestions: formData.get('postHypnoticSuggestions') || null,
      deinductionNotes: formData.get('deinductionNotes') || null,
      selfHypnosisPrescribed: formData.get('selfHypnosisPrescribed') || null,
    };

    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}/evolutions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao registrar evolução');
      setNewEvolutionOpen(false);
      setSelectedSessionForEvolution(null);
      showToast('Evolução clínica registrada no prontuário!');
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao registrar');
    }
  }

  const { confirmDialog, alertDialog, dialogNode } = useConfirmDialog();

  // Finalizar / Assinar Registro Clínico (Lei 13.787/2018)
  async function handleFinalizeEvolution(evolutionId: string, title: string) {
    const { confirmed } = await confirmDialog({
      title: 'Finalizar e assinar registro clínico',
      description: 'Após confirmar, este registro ficará bloqueado para edição e a autoria será preservada permanentemente (Lei 13.787/2018).',
      highlightText: title,
      confirmLabel: 'Sim, finalizar e assinar',
      cancelLabel: 'Voltar',
      variant: 'warning',
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}/evolutions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evolutionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao finalizar');
      showToast('✓ Registro finalizado e assinado. Integridade preservada.');
      load();
    } catch (err: unknown) {
      await alertDialog({
        title: 'Erro ao finalizar registro',
        description: err instanceof Error ? err.message : 'Erro ao finalizar',
        variant: 'error',
      });
    }
  }

  // Nova Técnica
  async function handleCreateTechnique(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = {
      evolutionId: formData.get('evolutionId') || null,
      name: formData.get('name'),
      category: formData.get('category'),
      notes: formData.get('notes') || null,
      outcome: formData.get('outcome'),
      appliedAt: formData.get('appliedAt'),
    };

    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}/techniques`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao registrar técnica');
      setNewTechniqueOpen(false);
      showToast('Técnica registrada com sucesso!');
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao registrar');
    }
  }

  // Novo Documento
  async function handleCreateDocument(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = {
      title: formData.get('title'),
      documentType: formData.get('documentType'),
      documentTypeLabel: formData.get('documentType'),
      status: formData.get('status'),
      fileName: docFiles.length > 0 ? docFiles.map(f => f.name).join(', ') : (formData.get('fileName') || null),
      fileData: docFiles.length > 0 ? docFiles : null,
      content: formData.get('content') || null,
    };

    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao cadastrar documento');
      setNewDocumentOpen(false);
      setDocFiles([]);
      showToast('Documento registrado com sucesso!');
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao cadastrar');
    }
  }

  // Editar Documento
  async function handleEditDocument(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editDocOpen) return;
    const formData = new FormData(e.currentTarget);
    // Merge: keep existing files unless user replaced them
    const allFiles = editDocFiles.length > 0 ? editDocFiles : (editDocOpen.fileData ?? []);
    const body = {
      documentId: editDocOpen.id,
      title: formData.get('title'),
      documentType: formData.get('documentType'),
      documentTypeLabel: formData.get('documentType'),
      status: formData.get('status'),
      fileName: allFiles.length > 0 ? allFiles.map((f: { name: string }) => f.name).join(', ') : null,
      fileData: allFiles.length > 0 ? allFiles : null,
      content: formData.get('content') || null,
    };

    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}/documents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao atualizar documento');
      setEditDocOpen(null);
      setEditDocFiles([]);
      showToast('Documento atualizado com sucesso!');
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar');
    }
  }

  // Excluir Documento
  async function handleDeleteDocument(doc: ClientDocument) {
    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}/documents`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao excluir documento');
      setDeleteDocConfirm(null);
      showToast('Documento excluído.');
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  }

  async function handleExportLgpdDossier() {
    try {
      const res = await fetch(`/api/admin/prontuarios/${clientId}/lgpd`);
      if (!res.ok) throw new Error('Erro ao gerar dossiê');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dossie-lgpd-${clientId}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Dossiê LGPD exportado com sucesso!');
    } catch {
      alert('Não foi possível exportar o dossiê LGPD.');
    }
  }

  if (error) {
    return (
      <div className="card empty-state">
        <AlertTriangle size={32} className="text-warning" />
        <h3>Erro ao carregar prontuário</h3>
        <p>{error || 'Prontuário não encontrado.'}</p>
        <Link href="/admin/prontuarios" className="btn btn-secondary">
          <ArrowLeft size={16} /> Voltar aos prontuários
        </Link>
      </div>
    );
  }

  const { client, record, goals, sessions, evolutions, techniques, documents, logs, packages = [] } = data;

  return (
    <>
      <div className={`prontuario-detail-page ${printing ? 'is-printing' : ''}`}>
      {/* Top action bar */}
      <div className="prontuario-top-nav">
        <Link href="/admin/prontuarios" className="btn btn-ghost btn-sm">
          <ArrowLeft size={16} /> Voltar para Prontuários
        </Link>
        <div className="prontuario-top-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setQuickDocOpen(true)}
            title="Gerar Declaração, Recibo de Reembolso/IRPF ou Termo LGPD em PDF (1 clique)"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={15} /> 📄 Doc / Recibo PDF
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleExportLgpdDossier}
            title="Exportar dossiê completo para atender Art. 18 da LGPD"
          >
            <ShieldCheck size={15} /> Exportar Dossiê LGPD (Art. 18)
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => window.print()}
            title="Imprimir visualização oficial do prontuário"
          >
            <Printer size={15} /> Imprimir Prontuário
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="form-alert form-alert-success page-alert" role="status">
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header do Cliente */}
      <div className="card prontuario-client-header">
        <div className="prontuario-client-profile">
          <div className="avatar avatar-lg">
            {client.name
              .split(' ')
              .slice(0, 2)
              .map((p) => p[0])
              .join('')}
          </div>
          <div className="prontuario-client-info">
            <div className="prontuario-title-row">
              <h2>{client.name}</h2>
              <span
                className={`badge ${
                  client.status === 'ativo'
                    ? 'badge-success'
                    : client.status === 'pendente'
                    ? 'badge-warning'
                    : 'badge-muted'
                }`}
              >
                {client.status === 'ativo' ? 'Ativo' : client.status === 'pendente' ? 'Pendente' : 'Inativo'}
              </span>
              <span className="badge badge-confidential">
                <Lock size={12} /> Sigilo Profissional SBHP
              </span>
            </div>

            <div className="prontuario-professional-row">
              <span className="badge badge-sbhp">
                <Award size={12} /> {PROFESSIONAL_INFO.name} — {PROFESSIONAL_INFO.credentialCode}
              </span>
              <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
                {PROFESSIONAL_INFO.society} • Hipnose Clínica Multidimensional Integrativa
              </span>
            </div>

            <div className="prontuario-meta-row">
              <a
                href={`https://wa.me/${(() => {
                  const d = (client.phone || '').replace(/\D/g, '');
                  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
                })()}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir conversa no WhatsApp"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {formatPhone(client.phone)}
              </a>
              {client.email && (
                <span>
                  <Mail size={13} /> {client.email}
                </span>
              )}
              {record?.birthDate && (
                <span>
                  <Calendar size={13} /> Nasc: {formatDateBr(record.birthDate)}
                </span>
              )}
              {record?.occupation && (
                <span>
                  <User size={13} /> {record.occupation}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="prontuario-quick-stats">
          <div className="quick-stat-box">
            <span className="stat-label">Sessões Concluídas</span>
            <strong className="stat-num">{client.completedAppointments}</strong>
          </div>
          <div className="quick-stat-box">
            <span className="stat-label">Evoluções Clínicas</span>
            <strong className="stat-num">{evolutions.length}</strong>
          </div>
          <div className="quick-stat-box">
            <span className="stat-label">Metas Terapêuticas</span>
            <strong className="stat-num">{goals.filter((g) => g.status === 'em_andamento').length}</strong>
          </div>
        </div>
      </div>

      {/* Navegação por Abas */}
      <div className="prontuario-tabs-nav" role="tablist">
        {TAB_CONFIG.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          let countBadge: number | null = null;
          if (t.key === 'objetivos') countBadge = goals.length;
          if (t.key === 'sessoes') countBadge = sessions.length;
          if (t.key === 'evolucoes') countBadge = evolutions.length;
          if (t.key === 'tecnicas') countBadge = techniques.length;
          if (t.key === 'documentos') countBadge = documents.length;
          if (t.key === 'auditoria') countBadge = logs.length;

          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              className={`prontuario-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              <Icon size={16} />
              <span>{t.label}</span>
              {countBadge !== null && countBadge > 0 && (
                <span className="tab-counter">{countBadge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Conteúdo das Abas */}
      <div className="prontuario-tab-content">
        {/* ABA 1: FICHA INICIAL */}
        {activeTab === 'ficha' && (
          <div className="card tab-pane">
            <div className="pane-header">
              <div>
                <h3>Ficha Inicial e Anamnese</h3>
                <p>Identificação ampliada, contatos de urgência, queixa principal e histórico clínico.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  // Pre-fill emergency contacts from saved record
                  if (record?.emergencyContacts && record.emergencyContacts.length > 0) {
                    setEmergencyContacts(record.emergencyContacts.map(c => ({ name: c.name ?? '', phone: c.phone ?? '', relationship: c.relationship ?? '' })));
                  } else if (record?.emergencyContactName || record?.emergencyContactPhone) {
                    setEmergencyContacts([{ name: record.emergencyContactName ?? '', phone: record.emergencyContactPhone ?? '', relationship: record.emergencyContactRelationship ?? '' }]);
                  } else {
                    setEmergencyContacts([{ name: '', phone: '', relationship: '' }]);
                  }
                  setEditRecordOpen(true);
                }}
              >
                <Edit3 size={15} /> {record ? 'Editar ficha' : 'Preencher ficha'}
              </button>
            </div>

            {record ? (
              <div className="record-details-grid">
                {/* 1. Ficha de Anamnese Digital – Hipnose Clínica (8 Campos) */}
                <section className="record-section full-width" style={{ borderLeft: '4px solid #b8860b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                    <h4 style={{ margin: 0, color: 'var(--color-primary, #245d80)' }}>
                      <ClipboardList size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle', color: '#b8860b' }} />
                      Ficha de Anamnese Digital – Hipnose Clínica
                    </h4>
                    {record.consentAgreed ? (
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <ShieldCheck size={14} /> Consentimento Informado Assinado ({record.consentAgreedAt ? formatDateBr(record.consentAgreedAt) : 'Registrado'})
                      </span>
                    ) : (
                      <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <AlertTriangle size={14} /> Consentimento Pendente
                      </span>
                    )}
                  </div>

                  <div className="info-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                      <span className="info-label">1. Nome Completo</span>
                      <strong className="info-val">{client?.name || 'Não informado'}</strong>
                    </div>
                    <div>
                      <span className="info-label">2. CPF</span>
                      <strong className="info-val">{record.cpf || 'Não informado'}</strong>
                    </div>
                    <div>
                      <span className="info-label">3. RG</span>
                      <strong className="info-val">{record.rg || 'Não informado'}</strong>
                    </div>
                    <div>
                      <span className="info-label">4. Data de Nascimento</span>
                      <strong className="info-val">{formatDateBr(record.birthDate)}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
                    <div>
                      <span className="info-label" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                        5. Qual o motivo da consulta?
                      </span>
                      <div className="record-text-box" style={{ marginTop: '0.35rem', background: '#fdfbf7', borderLeft: '3px solid #b8860b' }}>
                        {record.consultationReason || record.chiefComplaint || 'Nenhum motivo informado pelo cliente.'}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                      <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <span className="info-label" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                          6. Condição de saúde ou medicamentos?
                        </span>
                        <div style={{ marginTop: '6px' }}>
                          {record.hasHealthConditions ? (
                            <div>
                              <span className="badge badge-warning" style={{ marginBottom: '6px', display: 'inline-block' }}>Sim</span>
                              <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155' }}>
                                {record.healthConditionsDetails || record.healthHistory || record.medications || 'Condições / medicamentos relatados sem detalhes adicionais.'}
                              </p>
                            </div>
                          ) : (
                            <span className="badge badge-success">Não possui</span>
                          )}
                        </div>
                      </div>

                      <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <span className="info-label" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                          7. Acompanhamento psicológico / psiquiátrico?
                        </span>
                        <div style={{ marginTop: '6px' }}>
                          {record.hasPsychCare ? (
                            <div>
                              <span className="badge badge-info" style={{ marginBottom: '6px', display: 'inline-block' }}>Sim</span>
                              {record.psychCareDetails && (
                                <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155' }}>{record.psychCareDetails}</p>
                              )}
                            </div>
                          ) : (
                            <span className="badge badge-success">Não</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ background: '#fdf8f0', padding: '12px 14px', borderRadius: '10px', border: '1px solid #ebdcc5' }}>
                      <span className="info-label" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                        8. Termo de Ciência e Consentimento Informado (LGPD)
                      </span>
                      <div style={{ marginTop: '4px', fontSize: '0.88rem', color: '#475569' }}>
                        {record.consentAgreed ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 600 }}>
                              <CheckCircle2 size={16} color="#16a34a" />
                              <span>Cliente ciente e concorda com o atendimento de Hipnose Clínica e tratamento confidencial dos dados (LGPD).</span>
                            </div>
                            <div
                              style={{
                                marginTop: '10px',
                                background: '#f0fdf4',
                                border: '1px solid #86efac',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                fontSize: '0.84rem',
                                color: '#14532d',
                                lineHeight: 1.6,
                              }}
                            >
                              <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShieldCheck size={15} /> Assinado eletronicamente
                              </strong>
                              <div>Assinado por: <strong>{client?.name || 'Cliente'}</strong></div>
                              <div>CPF: <strong>{record.cpf || 'não informado'}</strong></div>
                              <div>
                                Data e horário:{' '}
                                <strong>
                                  {record.consentAgreedAt
                                    ? new Intl.DateTimeFormat('pt-BR', {
                                        dateStyle: 'long',
                                        timeStyle: 'medium',
                                        timeZone: 'America/Sao_Paulo',
                                      }).format(new Date(record.consentAgreedAt))
                                    : 'não registrado'}
                                </strong>
                              </div>
                              <div style={{ fontSize: '0.76rem', color: '#4d7c5a', marginTop: '2px' }}>
                                Aceite digital realizado pelo próprio cliente no Portal do Cliente (Lei 14.063/2020 e LGPD).
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                                <a
                                  href={`/api/admin/prontuarios/${clientId}/anamnese-pdf`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-secondary btn-sm"
                                >
                                  <Eye size={14} /> Visualizar PDF
                                </a>
                                <a
                                  href={`/api/admin/prontuarios/${clientId}/anamnese-pdf?download=1`}
                                  className="btn btn-primary btn-sm"
                                >
                                  <Download size={14} /> Baixar PDF
                                </a>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e' }}>
                            <AlertTriangle size={16} color="#d97706" />
                            <span>Consentimento informado ainda pendente de assinatura digital pelo cliente.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Contato de Emergência & Triagem de segurança */}
                <section className="record-section full-width">
                  <h4>
                    <User size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                    Contato de Emergência &amp; Triagem de Segurança
                  </h4>
                  <div className="info-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div>
                      <span className="info-label">Contato de Emergência</span>
                      <strong className="info-val">
                        {record.emergencyContactName || record.emergencyContacts?.[0]?.name ? (
                          <>
                            {record.emergencyContactName || record.emergencyContacts?.[0]?.name}
                            {(record.emergencyContactPhone || record.emergencyContacts?.[0]?.phone) && ` • ${formatPhone(record.emergencyContactPhone || record.emergencyContacts?.[0]?.phone || '')}`}
                            {(record.emergencyContactRelationship || record.emergencyContacts?.[0]?.relationship) && ` (${record.emergencyContactRelationship || record.emergencyContacts?.[0]?.relationship})`}
                          </>
                        ) : 'Não informado'}
                      </strong>
                    </div>
                    <div>
                      <span className="info-label">Epilepsia / Convulsão (SBHP)</span>
                      <div style={{ marginTop: '4px' }}>
                        {record.epilepsyHistory ? (
                          <span className="badge badge-danger epilepsy-alert">
                            <AlertTriangle size={12} /> Histórico relatado — avaliar antes da indução
                          </span>
                        ) : (
                          <span className="badge badge-success">Sem contraindicação relatada</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="empty-state">
                <HeartPulse size={32} />
                <h3>Ficha inicial ainda não preenchida</h3>
                <p>Preencha os dados da anamnese, contatos de emergência e queixa inicial do cliente.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setEmergencyContacts([{ name: '', phone: '', relationship: '' }]);
                    setEditRecordOpen(true);
                  }}
                >
                  <Edit3 size={16} /> Preencher ficha inicial agora
                </button>
              </div>
            )}
          </div>
        )}

        {/* ABA 2: OBJETIVOS DO ACOMPANHAMENTO */}
        {activeTab === 'objetivos' && (
          <div className="card tab-pane">
            <div className="pane-header">
              <div>
                <h3>Objetivos do Acompanhamento</h3>
                <p>Planejamento terapêutico, metas estabelecidas em conjunto e monitoramento de progresso.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setNewGoalOpen(true)}
              >
                <Plus size={16} /> Novo objetivo
              </button>
            </div>

            {goals.length === 0 ? (
              <div className="empty-state">
                <Target size={32} />
                <h3>Nenhum objetivo cadastrado</h3>
                <p>Defina as metas terapêuticas do acompanhamento deste cliente.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setNewGoalOpen(true)}
                >
                  <Plus size={16} /> Cadastrar primeiro objetivo
                </button>
              </div>
            ) : (
              <div className="goals-list">
                {goals.map((goal) => {
                  const isAchieved = goal.status === 'alcancado';
                  return (
                    <div key={goal.id} className={`goal-card ${isAchieved ? 'is-achieved' : ''}`}>
                      <div className="goal-header">
                        <div className="goal-title-area">
                          <h4>{goal.title}</h4>
                          {goal.targetDate && (
                            <span className="goal-date">
                              <Calendar size={13} /> Prazo alvo: {formatDateBr(goal.targetDate)}
                            </span>
                          )}
                          {goal.achievedAt && (
                            <span className="goal-date text-success">
                              <CheckCircle2 size={13} /> Concluído em: {formatDateBr(goal.achievedAt)}
                            </span>
                          )}
                        </div>
                        <span
                          className={`badge ${
                            goal.status === 'alcancado'
                              ? 'badge-success'
                              : goal.status === 'em_andamento'
                              ? 'badge-info'
                              : goal.status === 'ajustado'
                              ? 'badge-warning'
                              : 'badge-muted'
                          }`}
                        >
                          {goal.status === 'alcancado'
                            ? 'Alcançado'
                            : goal.status === 'em_andamento'
                            ? 'Em andamento'
                            : goal.status === 'ajustado'
                            ? 'Ajustado'
                            : 'Pausado'}
                        </span>
                      </div>

                      {goal.description && <p className="goal-desc">{goal.description}</p>}

                      <div className="goal-progress-wrap">
                        <div className="goal-progress-bar">
                          <div
                            className="goal-progress-fill"
                            style={{
                              width: `${goal.progressPct}%`,
                              backgroundColor: isAchieved ? 'var(--color-success)' : 'var(--color-primary)',
                            }}
                          />
                        </div>
                        <span className="goal-progress-text">{goal.progressPct}%</span>
                      </div>

                      <div className="goal-actions">
                        <span className="quick-label">Atualizar progresso:</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleUpdateGoal(goal.id, goal.status, Math.min(100, goal.progressPct + 20))}
                        >
                          +20%
                        </button>
                        <div className="goal-custom-pct">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            className="form-input goal-pct-input"
                            placeholder="%"
                            value={customPctMap[goal.id] ?? ''}
                            onChange={(e) => setCustomPctMap(prev => ({ ...prev, [goal.id]: Number(e.target.value) }))}
                            title="Digite uma porcentagem personalizada"
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={customPctMap[goal.id] === undefined || customPctMap[goal.id] === null}
                            onClick={() => {
                              const pct = Math.min(100, Math.max(0, customPctMap[goal.id] ?? 0));
                              handleUpdateGoal(goal.id, goal.status, pct);
                            }}
                          >
                            Definir
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleUpdateGoal(goal.id, 'alcancado', 100)}
                        >
                          ✓ Alcançado (100%)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ABA 3: HISTÓRICO DAS SESSÕES */}
        {activeTab === 'sessoes' && (
          <div className="card tab-pane">
            <div className="pane-header">
              <div>
                <h3>Histórico das Sessões</h3>
                <p>Consultas agendadas, realizadas e canceladas integradas com a agenda da clínica.</p>
              </div>
            </div>

            {/* PACOTES E CRÉDITOS DO CLIENTE */}
            {packages && packages.length > 0 && (
              <div style={{ marginBottom: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                  <Sparkles size={16} style={{ color: 'var(--primary)' }} />
                  Pacotes &amp; Saldo de Sessões
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                  {packages.map((pkg) => {
                    const remainingToSchedule = pkg.remainingToSchedule ?? pkg.remainingSessions;
                    const isSequential = pkg.bookingMode === 'sequencial';
                    return (
                      <div
                        key={pkg.id}
                        style={{
                          padding: '1.15rem 1.25rem',
                          borderRadius: '16px',
                          border: pkg.status === 'ativo' ? '1.5px solid rgba(13, 148, 136, 0.35)' : '1px solid var(--border-color)',
                          background: pkg.status === 'ativo' ? 'rgba(13, 148, 136, 0.04)' : 'var(--bg-subtle, #f8fafc)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.65rem',
                        }}
                      >
                        {/* Header do Pacote */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div>
                            <strong style={{ fontSize: '1rem', color: 'var(--color-text)', display: 'block' }}>{pkg.packageName}</strong>
                            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                              {pkg.serviceName || 'Serviço de Pacote'}
                            </span>
                          </div>
                          <span
                            className={`badge ${pkg.status === 'ativo' ? 'badge-success' : pkg.status === 'concluido' ? 'badge-neutral' : 'badge-danger'}`}
                            style={{ borderRadius: '9999px', fontSize: '0.72rem', textTransform: 'capitalize', flexShrink: 0 }}
                          >
                            {pkg.status}
                          </span>
                        </div>

                        {/* Regra de Agendamento do Pacote (+ de 1 sessão) */}
                        {pkg.totalSessions > 1 && (
                          <div style={{ marginTop: '2px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 9px',
                                borderRadius: '9999px',
                                background: isSequential ? '#fefce8' : '#eff6ff',
                                border: isSequential ? '1px solid #fde047' : '1px solid #bfdbfe',
                                color: isSequential ? '#854d0e' : '#1d4ed8',
                                fontSize: '0.73rem',
                                fontWeight: 700,
                              }}
                            >
                              {isSequential
                                ? '🔒 Agendamento Sequencial (bloqueado agendar todas de uma vez só)'
                                : '🔓 Agendamento Livre (pode agendar todas de uma vez)'}
                            </span>
                          </div>
                        )}

                        {/* Box Destaque: Sessões em Haver Restantes para Agendar */}
                        <div
                          style={{
                            background: '#ffffff',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '12px',
                            padding: '10px 12px',
                            marginTop: '2px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                              Sessões em haver para agendar:
                            </span>
                            <strong style={{ fontSize: '1.05rem', color: remainingToSchedule > 0 ? '#0284c7' : '#16a34a', fontWeight: 800 }}>
                              {remainingToSchedule} de {pkg.totalSessions}
                            </strong>
                          </div>

                          {/* Pílulas de detalhamento */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.73rem' }}>
                            <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '2px 7px', fontWeight: 600 }}>
                              ✓ {pkg.completedSessions ?? 0} concluída(s)
                            </span>
                            <span style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px', padding: '2px 7px', fontWeight: 600 }}>
                              ⏳ {pkg.scheduledSessions ?? 0} agendada(s)
                            </span>
                            <span style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 7px', fontWeight: 700 }}>
                              📦 {remainingToSchedule} em haver
                            </span>
                          </div>
                        </div>

                        {/* Barra de Progresso Geral */}
                        <div style={{ marginTop: '2px' }}>
                          <div style={{ height: '7px', background: 'rgba(0,0,0,0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.min(100, Math.round(((pkg.completedSessions ?? 0) / pkg.totalSessions) * 100))}%`,
                                height: '100%',
                                background: pkg.status === 'ativo' ? '#0d9488' : 'var(--text-muted)',
                                borderRadius: '9999px',
                              }}
                            />
                          </div>
                        </div>

                        {/* Status da Sessão Pendente / Bloqueio Sequencial */}
                        {isSequential && pkg.pendingSession && (
                          <div
                            style={{
                              background: '#fffbeb',
                              border: '1px solid #fde68a',
                              borderRadius: '8px',
                              padding: '7px 10px',
                              fontSize: '0.75rem',
                              color: '#92400e',
                              lineHeight: 1.4,
                            }}
                          >
                            <strong>⏳ Sessão {pkg.pendingSession.sessionNumber ?? 1} agendada:</strong>{' '}
                            {formatDateBr(pkg.pendingSession.startAt)} (Aguardando atendimento).
                            <span style={{ display: 'block', marginTop: '2px', color: '#78350f' }}>
                              As próximas <strong>{remainingToSchedule} sessão(ões) em haver</strong> serão liberadas no portal assim que esta sessão for concluída.
                            </span>
                          </div>
                        )}

                        {isSequential && !pkg.pendingSession && remainingToSchedule > 0 && (
                          <div
                            style={{
                              background: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                              borderRadius: '8px',
                              padding: '6px 10px',
                              fontSize: '0.74rem',
                              color: '#166534',
                            }}
                          >
                            ✅ Próxima sessão liberada para agendamento! Cliente possui <strong>{remainingToSchedule} sessão(ões) em haver</strong>.
                          </div>
                        )}

                        {/* Preço se houver */}
                        {typeof pkg.priceCents === 'number' && pkg.priceCents > 0 && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'right' }}>
                            Valor total: {(pkg.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sessions.length === 0 ? (
              <div className="empty-state">
                <CalendarDays size={32} />
                <h3>Nenhuma sessão registrada</h3>
                <p>As sessões agendadas deste cliente na agenda aparecerão automaticamente aqui.</p>
              </div>
            ) : (
              <div className="sessions-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Data e Horário</th>
                      <th>Serviço</th>
                      <th>Modalidade</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Ação Clínica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        <td data-label="Data e Horário">
                          <strong>{formatDateBr(session.startAt)}</strong>
                        </td>
                        <td data-label="Serviço">
                          <div>{session.serviceName}</div>
                          {session.sessionNumber && (
                            <span
                              className="badge badge-info"
                              style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '9999px', marginTop: '0.2rem', display: 'inline-flex' }}
                            >
                              Sessão {session.sessionNumber} do pacote
                            </span>
                          )}
                        </td>
                        <td data-label="Modalidade">
                          <span className="badge badge-neutral">
                            {session.modality === 'presencial' ? 'Presencial' : 'Online'}
                          </span>
                        </td>
                        <td data-label="Status">
                          <span
                            className={`badge ${
                              session.status === 'concluido'
                                ? 'badge-success'
                                : session.status === 'confirmado'
                                ? 'badge-info'
                                : session.status === 'cancelado'
                                ? 'badge-danger'
                                : 'badge-warning'
                            }`}
                          >
                            {session.status}
                          </span>
                        </td>
                        <td data-label="Ação Clínica" style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setSelectedSessionForEvolution(session);
                              setActiveTab('evolucoes');
                              setNewEvolutionOpen(true);
                            }}
                          >
                            <FileText size={14} /> Registrar evolução
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ABA 4: EVOLUÇÃO E OBSERVAÇÕES */}
        {activeTab === 'evolucoes' && (
          <div className="card tab-pane">
            <div className="pane-header">
              <div>
                <h3>Protocolo de Sessão — Evolução Clínica</h3>
                <p>Registro formal sessão a sessão: queixas, conduta, protocolo de hipnose, intervenções e combinados terapêuticos.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setSelectedSessionForEvolution(null);
                  setNewEvolutionOpen(true);
                }}
              >
                <Plus size={16} /> Nova evolução clínica
              </button>
            </div>

            {evolutions.length === 0 ? (
              <div className="empty-state">
                <FileText size={32} />
                <h3>Nenhuma evolução clínica registrada</h3>
                <p>Registre a primeira evolução após a sessão de atendimento.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setNewEvolutionOpen(true)}
                >
                  <Plus size={16} /> Registrar primeira evolução
                </button>
              </div>
            ) : (
              <div className="evolutions-timeline">
                {evolutions.map((ev) => (
                  <article key={ev.id} className="evolution-card">
                    <div className="evolution-top">
                      <div className="evolution-date-tag">
                        <Calendar size={14} />
                        <strong>Sessão de {formatDateBr(ev.sessionDate)}</strong>
                      </div>
                      <div className="evolution-badges">
                        {ev.finalizedAt ? (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <ShieldCheck size={12} /> Assinado &amp; Imutável (Lei 13.787)
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            Rascunho
                          </span>
                        )}
                        {ev.isConfidential && (
                          <span className="badge badge-confidential">
                            <Lock size={12} /> Confidencial
                          </span>
                        )}
                        {ev.createdByName && (
                          <span className="badge badge-neutral">
                            Registrado por: {ev.createdByName}
                          </span>
                        )}
                      </div>
                    </div>

                    <h4 className="evolution-title">{ev.title}</h4>

                    {ev.summary && (
                      <p className="evolution-summary">
                        <strong>Resumo da sessão:</strong> {ev.summary}
                      </p>
                    )}

                    <div className="evolution-body">
                      <strong>Registro clínico detalhado:</strong>
                      <p>{ev.evolutionText}</p>
                    </div>

                    {/* ── Protocolo Hipnose ── */}
                    {(ev.inductionMethod || ev.tranceDepth || ev.hypnoticPhenomena || ev.postHypnoticSuggestions || ev.deinductionNotes || ev.selfHypnosisPrescribed) && (
                      <div className="evolution-hypno-box">
                        <div className="hypno-box-title">
                          <Brain size={14} /> Protocolo de Hipnoterapia — SBHP
                        </div>
                        <div className="hypno-grid">
                          {ev.inductionMethod && (
                            <div>
                              <span className="hypno-label">Método de Indução</span>
                              <span className="hypno-val">{ev.inductionMethod}</span>
                            </div>
                          )}
                          {ev.tranceDepth && (
                            <div>
                              <span className="hypno-label">Profundidade do Transe</span>
                              <span className="badge badge-info">{ev.tranceDepth}</span>
                            </div>
                          )}
                          {ev.hypnoticPhenomena && (
                            <div style={{ gridColumn: '1/-1' }}>
                              <span className="hypno-label">Fenômenos Hipnóticos Observados</span>
                              <span className="hypno-val">{ev.hypnoticPhenomena}</span>
                            </div>
                          )}
                          {ev.postHypnoticSuggestions && (
                            <div style={{ gridColumn: '1/-1' }}>
                              <span className="hypno-label">Sugestões Pós-Hipnóticas Aplicadas</span>
                              <span className="hypno-val">{ev.postHypnoticSuggestions}</span>
                            </div>
                          )}
                          {ev.deinductionNotes && (
                            <div>
                              <span className="hypno-label">Notas de Desindução</span>
                              <span className="hypno-val">{ev.deinductionNotes}</span>
                            </div>
                          )}
                          {ev.selfHypnosisPrescribed && (
                            <div>
                              <span className="hypno-label">Autohipnose Prescrita</span>
                              <span className="hypno-val">{ev.selfHypnosisPrescribed}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {ev.interventions && (
                      <div className="evolution-highlight-block">
                        <strong>Intervenções e técnicas da sessão:</strong>
                        <p>{ev.interventions}</p>
                      </div>
                    )}

                    {ev.homeworkTasks && (
                      <div className="evolution-homework-block">
                        <strong>Combinados / Tarefas intersessão:</strong>
                        <p>{ev.homeworkTasks}</p>
                      </div>
                    )}

                    <div className="evolution-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '10px', marginTop: '12px' }}>
                      {ev.finalizedAt ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#15803d', fontWeight: 500 }}>
                          <ShieldCheck size={16} />
                          <span>Assinado eletronicamente por <strong>{ev.finalizedByName || ev.createdByName || 'Profissional'}</strong> em {formatDateBr(ev.finalizedAt)} (Imutável — Lei 13.787/2018 e CFP 001/2009)</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline btn-xs"
                          onClick={() => handleFinalizeEvolution(ev.id, ev.title)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#047857', borderColor: '#a7f3d0' }}
                          title="Finalizar e bloquear registro sob Lei 13.787/2018"
                        >
                          <CheckCircle2 size={13} /> Finalizar &amp; Assinar Registro (Lei 13.787)
                        </button>
                      )}
                      <small style={{ color: 'var(--text-muted, #64748b)' }}>Registrado em {formatDateBr(ev.createdAt)}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 5: TÉCNICAS UTILIZADAS */}
        {activeTab === 'tecnicas' && (
          <div className="card tab-pane">
            <div className="pane-header">
              <div>
                <h3>Técnicas &amp; Abordagens Hipnoterapêuticas</h3>
                <p>Técnicas de hipnose, PNL, psicoterapia integrativa e intervenções aplicadas em cada sessão SBHP.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setNewTechniqueOpen(true)}
              >
                <Plus size={16} /> Registrar técnica
              </button>
            </div>

            {techniques.length === 0 ? (
              <div className="empty-state">
                <Brain size={32} />
                <h3>Nenhuma técnica registrada</h3>
                <p>Registre as abordagens aplicadas: Dave Elman, Ericksoniana, Regressão, Âncoras, Swish, etc.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setNewTechniqueOpen(true)}
                >
                  <Plus size={16} /> Registrar primeira técnica
                </button>
              </div>
            ) : (
              <div className="techniques-grid">
                {techniques.map((tech) => (
                  <div key={tech.id} className="technique-card card">
                    <div className="technique-header">
                      <span className="technique-category">{tech.category}</span>
                      <span
                        className={`badge ${
                          tech.outcome === 'muito_positiva' || tech.outcome === 'positiva'
                            ? 'badge-success'
                            : tech.outcome === 'neutra'
                            ? 'badge-neutral'
                            : 'badge-warning'
                        }`}
                      >
                        Desfecho:{' '}
                        {tech.outcome === 'muito_positiva'
                          ? 'Muito positiva'
                          : tech.outcome === 'positiva'
                          ? 'Positiva'
                          : tech.outcome === 'neutra'
                          ? 'Neutra'
                          : 'Necessita ajuste'}
                      </span>
                    </div>

                    <h4>{tech.name}</h4>

                    {tech.notes && <p className="technique-notes">{tech.notes}</p>}

                    <div className="technique-footer">
                      <Calendar size={13} />
                      <span>Aplicada em: {formatDateBr(tech.appliedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 6: DOCUMENTOS E TERMOS */}
        {activeTab === 'documentos' && (
          <div className="card tab-pane">
            <div className="pane-header">
              <div>
                <h3>Documentos, Termos e Contratos</h3>
                <p>TCLE Hipnose &amp; Telessaúde, Contrato Terapêutico, Declarações, Relatórios (SBHP / Lei 13.787/2018).</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setQuickDocOpen(true)}
                  title="Gerar PDF timbrado oficial da clínica"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <FileText size={15} /> 📄 Gerar Declaração / Recibo / LGPD
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setNewDocumentOpen(true)}
                >
                  <Plus size={16} /> Novo documento
                </button>
              </div>
            </div>

            {/* Templates rápidos SBHP */}
            <div className="doc-templates-bar">
              <span className="templates-label"><Sparkles size={13} /> Modelos SBHP:</span>
              <div className="templates-chips">
                {Object.entries(HYPNOTHERAPY_DOC_TEMPLATES).map(([key, tpl]) => (
                  <button
                    key={key}
                    type="button"
                    className="template-chip"
                    onClick={() => {
                      setNewDocumentOpen(true);
                      setTimeout(() => {
                        const titleEl = document.querySelector<HTMLInputElement>('input[name="title"]');
                        const typeEl = document.querySelector<HTMLInputElement>('input[name="documentType"]');
                        const contentEl = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
                        if (titleEl) titleEl.value = tpl.title;
                        if (typeEl) typeEl.value = tpl.type;
                        if (contentEl) contentEl.value = tpl.content;
                      }, 80);
                    }}
                  >
                    {tpl.chipLabel}
                  </button>
                ))}
              </div>
            </div>

            {documents.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={32} />
                <h3>Nenhum documento registrado</h3>
                <p>Arquive os termos de consentimento, contratos e relatórios vinculados a este cliente.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setNewDocumentOpen(true)}
                >
                  <Plus size={16} /> Adicionar termo ou documento
                </button>
              </div>
            ) : (
              <div className="documents-list">
                {documents.map((doc) => (
                  <div key={doc.id} className="doc-item-card">
                    <div className="doc-icon-wrap">
                      {doc.fileData && doc.fileData.some(f => f.mimeType.startsWith('image/'))
                        ? (
                            <img
                              src={getSafeFileUrl(doc.fileData.find(f => f.mimeType.startsWith('image/'))!)}
                              alt="capa"
                              className="doc-icon-thumb"
                              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 'inherit' }}
                            />
                          )
                        : <FileText size={24} />}
                    </div>
                    <div className="doc-info">
                      <div className="doc-title-row">
                        <h4>{doc.title}</h4>
                        <div className="doc-actions-row">
                          <span
                            className={`badge ${
                              doc.status === 'assinado' || doc.status === 'ativo'
                                ? 'badge-success'
                                : doc.status === 'pendente_assinatura'
                                ? 'badge-warning'
                                : 'badge-muted'
                            }`}
                          >
                            {doc.status === 'assinado'
                              ? 'Assinado'
                              : doc.status === 'pendente_assinatura'
                              ? 'Pendente assinatura'
                              : doc.status === 'ativo'
                              ? 'Ativo'
                              : 'Arquivado'}
                          </span>
                          <div className="doc-action-btns">
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm"
                              title="Visualizar"
                              onClick={() => {
                                setViewDocOpen(doc);
                                setViewDocFileIdx(doc.fileData && doc.fileData.length === 1 ? 0 : null);
                              }}
                            >
                              <Eye size={15} />
                            </button>
                            <a
                              href={`/api/admin/prontuarios/${clientId}/documents/${doc.id}/pdf?download=1`}
                              className="btn btn-ghost btn-icon btn-sm"
                              title="Baixar em PDF"
                              aria-label="Baixar em PDF"
                            >
                              <Download size={15} />
                            </a>
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm"
                              title="Editar"
                              onClick={() => { setEditDocOpen(doc); setEditDocFiles(doc.fileData ? [...doc.fileData] : []); }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm doc-delete-btn"
                              title="Excluir"
                              onClick={() => setDeleteDocConfirm(doc)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                      <span className="doc-type-label">
                        Tipo: {doc.documentTypeLabel || doc.documentType}
                      </span>
                      {doc.content && <p className="doc-content-snippet">{doc.content}</p>}
                      {/* Attachment thumbnails */}
                      {doc.fileData && doc.fileData.length > 0 && (
                        <div className="doc-attachments">
                          {doc.fileData.map((f, idx) => (
                            <div key={idx} className="doc-attachment-item">
                              {f.mimeType.startsWith('image/') ? (
                                <button
                                  type="button"
                                  className="doc-attach-thumb-btn"
                                  title={`Ver ${f.name}`}
                                  onClick={() => { setViewDocOpen(doc); setViewDocFileIdx(idx); }}
                                >
                                  <img
                                    src={getSafeFileUrl(f)}
                                    alt={f.name}
                                    className="doc-attachment-thumb"
                                  />
                                  <span className="doc-attach-name">{f.name}</span>
                                </button>
                              ) : (
                                <a
                                  href={getSafeFileUrl(f)}
                                  download={f.name}
                                  className="doc-attach-file"
                                  title={`Baixar ${f.name}`}
                                >
                                  <FileText size={16} />
                                  <span>{f.name}</span>
                                  <span className="doc-attach-size">{(f.size / 1024).toFixed(1)} KB</span>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="doc-meta">
                        {doc.signedAt && (
                          <span className="text-success">
                            <CheckCircle2 size={13} /> Assinado em {formatDateBr(doc.signedAt)}
                          </span>
                        )}
                        <span>Criado em {formatDateBr(doc.createdAt)}</span>
                        {doc.fileName && !doc.fileData && <span className="doc-filename">Arquivo: {doc.fileName}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 8: HISTÓRICO DE ACESSOS E AUDITORIA */}
        {activeTab === 'auditoria' && (
          <div className="card tab-pane">
            <div className="pane-header">
              <div>
                <h3>Histórico de Alterações e Acessos (Auditoria)</h3>
                <p>
                  Registro cronológico inviolável de consultas, edições e inclusões conforme exigência do Conselho Federal de Psicologia (CFP) e LGPD.
                </p>
              </div>
              <span className="badge badge-confidential">
                <Shield size={13} /> Auditoria Ativa
              </span>
            </div>

            <div className="audit-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data e Hora</th>
                    <th>Usuário / Profissional</th>
                    <th>Tipo de Operação</th>
                    <th>Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td data-label="Data e Hora">
                        <span className="inline-detail">
                          <Clock size={13} /> {formatDateBr(log.createdAt)}
                        </span>
                      </td>
                      <td data-label="Usuário">
                        <strong>{log.actorName}</strong>
                      </td>
                      <td data-label="Tipo">
                        <span className="badge badge-neutral">{log.actionType}</span>
                      </td>
                      <td data-label="Detalhes">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: EDITAR / PREENCHER FICHA INICIAL */}
      {editRecordOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditRecordOpen(false); }}>
          <section className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="modal-ficha-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Prontuário do Cliente</span>
                <h2 id="modal-ficha-title">Ficha Inicial e Anamnese</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditRecordOpen(false)} aria-label="Fechar">
                <X size={19} />
              </button>
            </div>
            <form onSubmit={handleSaveRecord} className="modal-body">
              {/* BLOCO 1: FICHA DE ANAMNESE DIGITAL (8 CAMPOS) */}
              <div className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                <ClipboardList size={16} /> Ficha de Anamnese Digital – Hipnose Clínica (8 Campos)
              </div>
              
              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">1. Nome Completo (Automático do Cadastro)</span>
                  <input className="form-input" disabled value={client?.name || ''} style={{ background: 'var(--color-bg-subtle, #f8fafc)', cursor: 'not-allowed' }} />
                </label>
                <label className="form-group">
                  <span className="form-label">2. CPF (11 dígitos) *</span>
                  <input className="form-input" name="cpf" placeholder="000.000.000-00" defaultValue={record?.cpf ?? ''} />
                </label>
              </div>

              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">3. RG (Texto)</span>
                  <input className="form-input" name="rg" placeholder="Ex: 0.000.000 ou SSP/SC" defaultValue={record?.rg ?? ''} />
                </label>
                <label className="form-group">
                  <span className="form-label">4. Data de Nascimento *</span>
                  <input className="form-input" type="date" name="birthDate" defaultValue={record?.birthDate ?? ''} />
                </label>
              </div>

              <label className="form-group">
                <span className="form-label">5. Qual o motivo da consulta? (opcional, máx. 500 caracteres)</span>
                <textarea
                  className="form-textarea"
                  name="chiefComplaint"
                  rows={3}
                  maxLength={500}
                  placeholder="Qual o motivo da busca pelo acompanhamento terapêutico?"
                  defaultValue={record?.consultationReason ?? record?.chiefComplaint ?? ''}
                />
              </label>

              <div style={{ background: '#fdfbf7', border: '1px solid #ebdcc5', borderRadius: '14px', padding: '16px', marginBottom: '14px' }}>
                <span className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '10px', color: '#1a3a4a' }}>
                  6. Possui alguma condição de saúde ou utiliza medicamentos?
                </span>
                <YesNoPills
                  name="hasHealthConditions"
                  defaultValue={!!record?.hasHealthConditions}
                  yesContent={
                    <input
                      className="form-input"
                      name="healthConditionsDetails"
                      placeholder="Especifique condições de saúde, diagnósticos ou medicamentos em uso..."
                      defaultValue={record?.healthConditionsDetails ?? record?.healthHistory ?? record?.medications ?? ''}
                    />
                  }
                />
              </div>

              <div style={{ background: '#fdfbf7', border: '1px solid #ebdcc5', borderRadius: '14px', padding: '16px', marginBottom: '14px' }}>
                <span className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '10px', color: '#1a3a4a' }}>
                  7. Faz acompanhamento psicológico ou psiquiátrico?
                </span>
                <YesNoPills
                  name="hasPsychCare"
                  defaultValue={!!record?.hasPsychCare}
                  yesContent={
                    <input
                      className="form-input"
                      name="psychCareDetails"
                      placeholder="(Opcional) Com quem faz acompanhamento / há quanto tempo?"
                      defaultValue={record?.psychCareDetails ?? ''}
                    />
                  }
                />
              </div>

              <div style={{ background: '#fdf8f0', border: '1px solid #ebdcc5', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                <span className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                  8. Termo de Ciência e Consentimento Informado (LGPD)
                </span>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                  <input
                    type="checkbox"
                    name="consentAgreed"
                    value="1"
                    defaultChecked={!!record?.consentAgreed}
                    style={{ width: '18px', height: '18px', marginTop: '2px' }}
                  />
                  <span>
                    <strong>Cliente ciente e concorda com o atendimento</strong> e autoriza o tratamento dos dados confidenciais conforme a LGPD.
                  </span>
                </label>
              </div>

              {/* BLOCO 2: CONTATO DE EMERGÊNCIA */}
              <div className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={15} /> Contato de Emergência
              </div>
              <div className="form-row form-row-3">
                <label className="form-group">
                  <span className="form-label">Nome</span>
                  <input
                    className="form-input"
                    name="emergencyContactName"
                    placeholder="Nome completo do responsável"
                    defaultValue={record?.emergencyContactName ?? record?.emergencyContacts?.[0]?.name ?? ''}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">Telefone</span>
                  <input
                    className="form-input"
                    type="tel"
                    name="emergencyContactPhone"
                    placeholder="(00) 00000-0000"
                    defaultValue={record?.emergencyContactPhone ?? record?.emergencyContacts?.[0]?.phone ?? ''}
                    onChange={(e) => {
                      e.target.value = maskPhone(e.target.value);
                    }}
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">Parentesco / Relação</span>
                  <input
                    className="form-input"
                    name="emergencyContactRelationship"
                    placeholder="Ex: Cônjuge, Mãe, Irmão..."
                    defaultValue={record?.emergencyContactRelationship ?? record?.emergencyContacts?.[0]?.relationship ?? ''}
                  />
                </label>
              </div>

              {/* BLOCO 3: TRIAGEM DE SEGURANÇA (SBHP) */}
              <div className="hypno-screening-check">
                <label className="hypno-check-label">
                  <input
                    type="checkbox"
                    name="epilepsyHistory"
                    value="1"
                    defaultChecked={!!record?.epilepsyHistory}
                  />
                  <span>
                    <strong>Histórico de Epilepsia ou Convulsão</strong>
                    <small> — Se marcado, avaliar contraindicação antes de induzir transe (protocolo SBHP)</small>
                  </span>
                </label>
              </div>

              {/* Campos removidos do formulário: preservados como estão no banco */}
              <input type="hidden" name="occupation" value={record?.occupation ?? ''} />
              <input type="hidden" name="psychiatricHistory" value={record?.psychiatricHistory ?? ''} />
              <input type="hidden" name="suggestibilityNotes" value={record?.suggestibilityNotes ?? ''} />
              <input type="hidden" name="safePlace" value={record?.safePlace ?? ''} />
              <input type="hidden" name="emotionalTriggers" value={record?.emotionalTriggers ?? ''} />
              <input type="hidden" name="previousHypnosis" value={record?.previousHypnosis ?? ''} />

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditRecordOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar Ficha do Cliente
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* MODAL: NOVO OBJETIVO */}
      {newGoalOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setNewGoalOpen(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-goal-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Planejamento Terapêutico</span>
                <h2 id="modal-goal-title">Novo Objetivo do Acompanhamento</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setNewGoalOpen(false)} aria-label="Fechar">
                <X size={19} />
              </button>
            </div>
            <form onSubmit={handleCreateGoal} className="modal-body">
              <label className="form-group">
                <span className="form-label">Título da Meta / Objetivo *</span>
                <input className="form-input" name="title" required placeholder="Ex: Manejo da ansiedade em reuniões de trabalho" />
              </label>

              <label className="form-group">
                <span className="form-label">Descrição detalhada</span>
                <textarea className="form-textarea" name="description" rows={3} placeholder="Descreva os critérios de sucesso e estratégias combinadas..." />
              </label>

              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">Status Inicial</span>
                  <select className="form-select" name="status" defaultValue="em_andamento">
                    <option value="em_andamento">Em andamento</option>
                    <option value="alcancado">Alcançado</option>
                    <option value="ajustado">Ajustado</option>
                    <option value="pausado">Pausado</option>
                  </select>
                </label>
                <label className="form-group">
                  <span className="form-label">Progresso Inicial (%)</span>
                  <input className="form-input" type="number" name="progressPct" min={0} max={100} defaultValue={0} />
                </label>
              </div>

              <label className="form-group">
                <span className="form-label">Data Alvo / Previsão (opcional)</span>
                <input className="form-input" type="date" name="targetDate" />
              </label>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setNewGoalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Cadastrar Objetivo
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* MODAL: NOVA EVOLUÇÃO CLÍNICA */}
      {newEvolutionOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setNewEvolutionOpen(false); }}>
          <section className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="modal-evolution-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Registro de Atendimento</span>
                <h2 id="modal-evolution-title">Nova Evolução Clínica</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setNewEvolutionOpen(false)} aria-label="Fechar">
                <X size={19} />
              </button>
            </div>
            <form onSubmit={handleCreateEvolution} className="modal-body">
              {selectedSessionForEvolution && (
                <div className="session-link-notice">
                  <Calendar size={15} />
                  <span>
                    Vinculada à sessão de{' '}
                    <strong>{formatDateBr(selectedSessionForEvolution.startAt)}</strong> (
                    {selectedSessionForEvolution.serviceName})
                  </span>
                  <input type="hidden" name="appointmentId" value={selectedSessionForEvolution.id} />
                </div>
              )}

              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">Data da Sessão *</span>
                  <input
                    className="form-input"
                    type="date"
                    name="sessionDate"
                    required
                    defaultValue={
                      selectedSessionForEvolution
                        ? selectedSessionForEvolution.startAt.slice(0, 10)
                        : new Date().toISOString().slice(0, 10)
                    }
                  />
                </label>
                <label className="form-group">
                  <span className="form-label">Título / Tema Principal da Sessão *</span>
                  <input
                    className="form-input"
                    name="title"
                    required
                    placeholder="Ex: Sessão 03 — Regressão à causa básica + Ressignificação"
                  />
                </label>
              </div>

              <label className="form-group">
                <span className="form-label">Relato Clínico da Sessão *</span>
                <textarea
                  className="form-textarea"
                  name="evolutionText"
                  rows={4}
                  required
                  placeholder="Descreva o andamento da sessão, humor do paciente, queixas trazidas, temas trabalhados, respostas ao transe e percepções clínicas..."
                />
              </label>

              {/* ── PROTOCOLO DE HIPNOSE SBHP (DIRETO) ── */}
              <div className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Brain size={14} /> Protocolo de Hipnose — SBHP
              </div>

              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">Método de Indução / Técnica</span>
                  <input
                    className="form-input"
                    name="inductionMethod"
                    list="induction-suggestions"
                    placeholder="Ex: Dave Elman, Ericksoniana, Âncora, Swish..."
                  />
                  <datalist id="induction-suggestions">
                    {HYPNOTHERAPY_TECHNIQUES.map(t => <option key={t.name} value={t.name} />)}
                  </datalist>
                </label>
                <label className="form-group">
                  <span className="form-label">Profundidade do Transe</span>
                  <input
                    className="form-input"
                    name="tranceDepth"
                    list="trance-depth-suggestions"
                    placeholder="Digite ou escolha (Ex: Leve, Médio, Sonambúlico...)"
                  />
                  <datalist id="trance-depth-suggestions">
                    <option value="Leve (estado alfa)" />
                    <option value="Médio (relaxamento profundo)" />
                    <option value="Profundo (sonambulismo / hipnose profunda)" />
                    <option value="Estado de Esdaile (coma hipnótico / analgesia)" />
                    <option value="Estado de Sichort (ultra-profundo)" />
                    <option value="Hipnose Acordada (estado waken)" />
                  </datalist>
                </label>
              </div>

              <label className="form-group">
                <span className="form-label">Prescrição de Autohipnose &amp; Combinados para Casa</span>
                <textarea
                  className="form-textarea"
                  name="homeworkTasks"
                  rows={2}
                  placeholder="Ex: Praticar áudio de autohipnose do lugar seguro por 10 min diários; disparar a âncora de paz antes de dormir..."
                />
              </label>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setNewEvolutionOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar Evolução no Prontuário
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* MODAL: NOVA TÉCNICA */}
      {newTechniqueOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setNewTechniqueOpen(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-tech-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Ferramentas e Intervenções</span>
                <h2 id="modal-tech-title">Registrar Técnica Utilizada</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setNewTechniqueOpen(false)} aria-label="Fechar">
                <X size={19} />
              </button>
            </div>
            <form onSubmit={handleCreateTechnique} className="modal-body">
              <label className="form-group">
                <span className="form-label">Nome da Técnica / Abordagem *</span>
                <input className="form-input" name="name" required list="tech-name-suggestions" placeholder="Ex: Indução Dave Elman, Regressão à Causa Básica, Ponte ao Futuro..." />
                <datalist id="tech-name-suggestions">
                  {HYPNOTHERAPY_TECHNIQUES.map(t => <option key={t.name} value={t.name} />)}
                </datalist>
              </label>

              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">Abordagem / Categoria *</span>
                  <input className="form-input" name="category" required list="tech-cat-suggestions" placeholder="Ex: Hipnose Clínica, PNL, Psicoterapia Integrativa" />
                  <datalist id="tech-cat-suggestions">
                    <option value="Hipnose Clínica" />
                    <option value="PNL (Programação Neurolinguística)" />
                    <option value="Psicoterapia Integrativa" />
                    <option value="Regressão de Memória" />
                    <option value="Técnicas de Âncoras" />
                    <option value="Autohipnose" />
                    <option value="Mindfulness / Meditação Guiada" />
                    <option value="Terapia Cognitivo-Comportamental" />
                    <option value="Técnicas de Regulação Emocional" />
                  </datalist>
                </label>
                <label className="form-group">
                  <span className="form-label">Data da Aplicação *</span>
                  <input className="form-input" type="date" name="appliedAt" required defaultValue={new Date().toISOString().slice(0, 10)} />
                </label>
              </div>

              <label className="form-group">
                <span className="form-label">Avaliação do Desfecho Clínico *</span>
                <select className="form-select" name="outcome" defaultValue="positiva">
                  <option value="muito_positiva">Muito positiva</option>
                  <option value="positiva">Positiva</option>
                  <option value="neutra">Neutra</option>
                  <option value="necessita_ajuste">Necessita ajuste</option>
                </select>
              </label>

              <label className="form-group">
                <span className="form-label">Observações e Receptividade do Cliente</span>
                <textarea className="form-textarea" name="notes" rows={3} placeholder="Descreva como o cliente respondeu à técnica..." />
              </label>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setNewTechniqueOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Registrar Técnica
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* MODAL: NOVO DOCUMENTO */}
      {newDocumentOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) { setNewDocumentOpen(false); setDocFiles([]); } }}>
          <section className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="modal-doc-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Documentação Clínica</span>
                <h2 id="modal-doc-title">Registrar Termo ou Documento</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => { setNewDocumentOpen(false); setDocFiles([]); }} aria-label="Fechar">
                <X size={19} />
              </button>
            </div>
            <form onSubmit={handleCreateDocument} className="modal-body">
              <label className="form-group">
                <span className="form-label">Título do Documento *</span>
                <input className="form-input" name="title" required placeholder="Ex: Termo de Consentimento Livre e Esclarecido (TCLE)" />
              </label>

              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">Tipo de Documento *</span>
                  <input
                    className="form-input"
                    name="documentType"
                    required
                    list="doc-type-suggestions"
                    placeholder="Ex: Contrato Terapêutico, TCLE, Relatório..."
                  />
                  <datalist id="doc-type-suggestions">
                    <option value="TCLE — Hipnose Clínica e Telessaúde" />
                    <option value="Contrato Terapêutico SBHP" />
                    <option value="Declaração de Comparecimento" />
                    <option value="Relatório Terapêutico Integrativo" />
                    <option value="Autorização de Responsável Legal" />
                    <option value="Termo de Sigilo e Confidencialidade" />
                    <option value="Contrato de Prestação de Serviços" />
                    <option value="Atestado de Acompanhamento Terapêutico" />
                    <option value="Outro" />
                  </datalist>
                </label>
                <label className="form-group">
                  <span className="form-label">Status *</span>
                  <select className="form-select" name="status" defaultValue="ativo">
                    <option value="assinado">Assinado</option>
                    <option value="pendente_assinatura">Pendente de assinatura</option>
                    <option value="ativo">Ativo</option>
                    <option value="arquivado">Arquivado</option>
                  </select>
                </label>
              </div>

              {/* Upload de arquivos */}
              <div className="form-group">
                <span className="form-label">
                  Arquivos e Fotos Anexas {docFiles.length > 0 ? `(${docFiles.length} selecionados)` : '(ilimitados)'}
                </span>

                {docFiles.length > 0 && (
                  <div className="doc-upload-preview" style={{ marginBottom: 10 }}>
                    {docFiles.map((f, idx) => (
                      <div key={idx} className="doc-preview-item">
                        {f.mimeType.startsWith('image/') ? (
                          <img src={getSafeFileUrl(f)} alt={f.name} className="doc-preview-thumb" />
                        ) : (
                          <div className="doc-preview-icon"><FileText size={24} /></div>
                        )}
                        <span className="doc-preview-name">{f.name}</span>
                        <span className="doc-preview-size">{(f.size / 1024).toFixed(1)} KB</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => setDocFiles(prev => prev.filter((_, i) => i !== idx))}
                          title="Remover arquivo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {uploadingDocFiles && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '10px',
                    }}
                  >
                    <RefreshCw size={15} className="animate-spin" />
                    <span>{docUploadProgressText || 'Otimizando e enviando foto para o Storage...'}</span>
                  </div>
                )}

                <label className="doc-upload-area">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt,.odt"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const input = e.target;
                      const files = Array.from(input.files ?? []);
                      if (files.length === 0) return;
                      const results = await processSelectedDocumentFiles(files);
                      setDocFiles(prev => [...prev, ...results]);
                      input.value = '';
                    }}
                  />
                  <div className="doc-upload-placeholder">
                    <Plus size={20} />
                    <span>{docFiles.length > 0 ? 'Clique para adicionar mais fotos ou arquivos' : 'Clique para selecionar arquivos e fotos'}</span>
                    <small>Selecione quantos arquivos desejar — múltiplos arquivos se acumulam sem apagar os anteriores</small>
                  </div>
                </label>
              </div>

              <label className="form-group">
                <span className="form-label">Conteúdo / Texto do Documento</span>
                <textarea className="form-textarea" name="content" rows={4} placeholder="Texto do termo ou resumo do documento registrado..." />
              </label>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setNewDocumentOpen(false); setDocFiles([]); }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Registrar Documento
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* MODAL: VISUALIZAR DOCUMENTO */}
      {viewDocOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setViewDocOpen(null); }}>
          <section className="modal modal-xl doc-viewer-modal" role="dialog" aria-modal="true" aria-labelledby="modal-view-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Visualizar Documento</span>
                <h2 id="modal-view-title">{viewDocOpen.title}</h2>
                <span className="doc-type-label">Tipo: {viewDocOpen.documentTypeLabel || viewDocOpen.documentType}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-icon" onClick={() => setViewDocOpen(null)} aria-label="Fechar">
                  <X size={19} />
                </button>
              </div>
            </div>
            <div className="doc-viewer-body">
              {/* Text content */}
              {viewDocOpen.content && (
                <div className="doc-viewer-text">
                  <h4>Conteúdo</h4>
                  <p>{viewDocOpen.content}</p>
                </div>
              )}

              {/* MODO 1: Tela de Seleção de Arquivos (quando nenhum arquivo foi selecionado ainda) */}
              {viewDocOpen.fileData && viewDocOpen.fileData.length > 0 && viewDocFileIdx === null && (
                <div className="doc-select-container">
                  <div className="doc-select-header">
                    <h4>Arquivos e Fotos Anexadas ({viewDocOpen.fileData.length})</h4>
                    <p>Selecione abaixo o documento ou foto que deseja visualizar:</p>
                  </div>
                  <div className="doc-files-grid">
                    {viewDocOpen.fileData.map((f, idx) => (
                      <div
                        key={idx}
                        className="doc-file-card"
                        onClick={() => setViewDocFileIdx(idx)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="doc-file-card-preview">
                          {f.mimeType.startsWith('image/') ? (
                            <img
                              src={getSafeFileUrl(f)}
                              alt={f.name}
                              className="doc-file-card-thumb"
                            />
                          ) : (
                            <div className="doc-file-card-icon">
                              <FileText size={40} />
                              <span className="doc-file-card-ext">
                                {f.mimeType === 'application/pdf' ? 'PDF' : f.name.split('.').pop()?.toUpperCase() || 'DOC'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="doc-file-card-details">
                          <strong className="doc-file-card-name" title={f.name}>{f.name}</strong>
                          <div className="doc-file-card-meta">
                            <span className="doc-file-card-size">{(f.size / 1024).toFixed(1)} KB</span>
                            <span className="doc-file-card-badge">
                              {f.mimeType.startsWith('image/') ? 'Foto / Imagem' : f.mimeType === 'application/pdf' ? 'Documento PDF' : 'Arquivo'}
                            </span>
                          </div>
                        </div>
                        <div className="doc-file-card-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setViewDocFileIdx(idx)}
                          >
                            <Eye size={14} /> Visualizar
                          </button>
                          <a
                            href={getSafeFileUrl(f)}
                            download={f.name}
                            className="btn btn-secondary btn-sm"
                            title="Baixar arquivo"
                          >
                            <Download size={14} /> Baixar
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* MODO 2: Visualizador do Arquivo Selecionado */}
              {viewDocOpen.fileData && viewDocOpen.fileData.length > 0 && typeof viewDocFileIdx === 'number' && (
                <div className="doc-viewer-gallery">
                  {/* Barra superior com botão de voltar para a lista */}
                  <div className="doc-viewer-topbar">
                    {viewDocOpen.fileData.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setViewDocFileIdx(null)}
                      >
                        <ArrowLeft size={15} /> Ver todos os arquivos ({viewDocOpen.fileData.length})
                      </button>
                    )}
                    <span className="doc-viewer-filename" title={viewDocOpen.fileData[viewDocFileIdx].name}>
                      {viewDocOpen.fileData[viewDocFileIdx].name}
                    </span>
                    <a
                      href={getSafeFileUrl(viewDocOpen.fileData[viewDocFileIdx])}
                      download={viewDocOpen.fileData[viewDocFileIdx].name}
                      className="btn btn-secondary btn-sm"
                      title="Baixar este arquivo"
                    >
                      <Download size={14} /> Baixar
                    </a>
                  </div>

                  {/* Abas rápidas para alternar entre arquivos */}
                  {viewDocOpen.fileData.length > 1 && (
                    <div className="doc-viewer-tabs">
                      {viewDocOpen.fileData.map((f, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`doc-viewer-tab-btn ${idx === viewDocFileIdx ? 'active' : ''}`}
                          onClick={() => setViewDocFileIdx(idx)}
                          title={f.name}
                        >
                          {f.mimeType.startsWith('image/') ? (
                            <img src={getSafeFileUrl(f)} alt="" className="doc-viewer-tab-thumb" />
                          ) : (
                            <FileText size={14} />
                          )}
                          <span className="doc-viewer-tab-name">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Área principal de visualização */}
                  <div className="doc-viewer-main">
                    {viewDocOpen.fileData[viewDocFileIdx].mimeType.startsWith('image/') ? (
                      <img
                        src={getSafeFileUrl(viewDocOpen.fileData[viewDocFileIdx])}
                        alt={viewDocOpen.fileData[viewDocFileIdx].name}
                        className="doc-viewer-img"
                      />
                    ) : viewDocOpen.fileData[viewDocFileIdx].mimeType === 'application/pdf' ? (
                      <iframe
                        src={getSafeFileUrl(viewDocOpen.fileData[viewDocFileIdx])}
                        className="doc-viewer-iframe"
                        title={viewDocOpen.fileData[viewDocFileIdx].name}
                      />
                    ) : (
                      <div className="doc-viewer-other">
                        <FileText size={48} />
                        <p>{viewDocOpen.fileData[viewDocFileIdx].name}</p>
                        <a
                          href={getSafeFileUrl(viewDocOpen.fileData[viewDocFileIdx])}
                          download={viewDocOpen.fileData[viewDocFileIdx].name}
                          className="btn btn-primary"
                        >
                          <Download size={16} /> Baixar arquivo
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Navegação entre arquivos */}
                  {viewDocOpen.fileData.length > 1 && (
                    <div className="doc-viewer-nav">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        disabled={viewDocFileIdx === 0}
                        onClick={() => setViewDocFileIdx(i => (typeof i === 'number' && i > 0 ? i - 1 : 0))}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="doc-viewer-counter">
                        {viewDocFileIdx + 1} de {viewDocOpen.fileData.length}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        disabled={viewDocFileIdx === viewDocOpen.fileData.length - 1}
                        onClick={() => setViewDocFileIdx(i => (typeof i === 'number' && i < viewDocOpen.fileData!.length - 1 ? i + 1 : i))}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!viewDocOpen.content && (!viewDocOpen.fileData || viewDocOpen.fileData.length === 0) && (
                <div className="empty-state" style={{ padding: '40px 0' }}>
                  <FolderOpen size={32} />
                  <p>Este documento não possui conteúdo ou arquivos anexados.</p>
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ borderTop: '1px solid var(--color-border)', padding: '16px 24px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setViewDocOpen(null)}>Fechar</button>
              <button type="button" className="btn btn-primary" onClick={() => { setViewDocOpen(null); setEditDocOpen(viewDocOpen); setEditDocFiles(viewDocOpen.fileData ? [...viewDocOpen.fileData] : []); }}>
                <Pencil size={15} /> Editar Documento
              </button>
            </div>
          </section>
        </div>
      )}

      {/* MODAL: EDITAR DOCUMENTO */}
      {editDocOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) { setEditDocOpen(null); setEditDocFiles([]); } }}>
          <section className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="modal-editdoc-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Editar Documento</span>
                <h2 id="modal-editdoc-title">Editar: {editDocOpen.title}</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => { setEditDocOpen(null); setEditDocFiles([]); }} aria-label="Fechar">
                <X size={19} />
              </button>
            </div>
            <form onSubmit={handleEditDocument} className="modal-body">
              <label className="form-group">
                <span className="form-label">Título do Documento *</span>
                <input className="form-input" name="title" required defaultValue={editDocOpen.title} />
              </label>

              <div className="form-row form-row-2">
                <label className="form-group">
                  <span className="form-label">Tipo de Documento *</span>
                  <input
                    className="form-input"
                    name="documentType"
                    required
                    list="edit-doc-type-suggestions"
                    defaultValue={editDocOpen.documentTypeLabel || editDocOpen.documentType}
                  />
                  <datalist id="edit-doc-type-suggestions">
                    <option value="Termo de Consentimento (TCLE)" />
                    <option value="Contrato Terapêutico" />
                    <option value="Contrato de Prestação de Serviços" />
                    <option value="Declaração de Comparecimento" />
                    <option value="Atestado Psicológico" />
                    <option value="Relatório Psicológico" />
                    <option value="Autorização Responsável" />
                    <option value="Termo de Sigilo" />
                    <option value="Outro" />
                  </datalist>
                </label>
                <label className="form-group">
                  <span className="form-label">Status *</span>
                  <select className="form-select" name="status" defaultValue={editDocOpen.status}>
                    <option value="assinado">Assinado</option>
                    <option value="pendente_assinatura">Pendente de assinatura</option>
                    <option value="ativo">Ativo</option>
                    <option value="arquivado">Arquivado</option>
                  </select>
                </label>
              </div>

              {/* Arquivos do Documento */}
              <div className="form-group">
                <span className="form-label">
                  Arquivos e Fotos Anexadas {editDocFiles.length > 0 ? `(${editDocFiles.length})` : '(nenhum arquivo)'}
                </span>

                {/* Lista de todos os arquivos do documento com exclusão individual */}
                {editDocFiles.length > 0 && (
                  <div className="doc-upload-preview" style={{ marginBottom: 12 }}>
                    {editDocFiles.map((f, idx) => (
                      <div key={idx} className="doc-preview-item">
                        {f.mimeType.startsWith('image/') ? (
                          <img src={getSafeFileUrl(f)} alt={f.name} className="doc-preview-thumb" />
                        ) : (
                          <div className="doc-preview-icon"><FileText size={24} /></div>
                        )}
                        <span className="doc-preview-name">{f.name}</span>
                        <span className="doc-preview-size">{(f.size / 1024).toFixed(1)} KB</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => setEditDocFiles(prev => prev.filter((_, i) => i !== idx))}
                          title="Remover este arquivo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {uploadingDocFiles && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '10px',
                    }}
                  >
                    <RefreshCw size={15} className="animate-spin" />
                    <span>{docUploadProgressText || 'Otimizando e enviando foto para o Storage...'}</span>
                  </div>
                )}

                {/* Upload para adicionar mais arquivos sem apagar os existentes */}
                <label className="doc-upload-area">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt,.odt"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const input = e.target;
                      const files = Array.from(input.files ?? []);
                      if (files.length === 0) return;
                      const results = await processSelectedDocumentFiles(files);
                      setEditDocFiles(prev => [...prev, ...results]);
                      input.value = '';
                    }}
                  />
                  <div className="doc-upload-placeholder">
                    <Plus size={20} />
                    <span>Clique para adicionar fotos ou documentos</span>
                    <small>Selecione um ou vários arquivos — novos anexos são somados aos existentes</small>
                  </div>
                </label>
              </div>

              <label className="form-group">
                <span className="form-label">Conteúdo / Texto do Documento</span>
                <textarea className="form-textarea" name="content" rows={4} defaultValue={editDocOpen.content ?? ''} />
              </label>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setEditDocOpen(null); setEditDocFiles([]); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><Pencil size={15} /> Salvar Alterações</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* MODAL: CONFIRMAR EXCLUSÃO DE DOCUMENTO */}
      {deleteDocConfirm && (
        <div className="modal-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteDocConfirm(null); }}>
          <section className="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="modal-deldoc-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow" style={{ color: 'var(--color-danger)' }}>Atenção</span>
                <h2 id="modal-deldoc-title">Excluir Documento</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setDeleteDocConfirm(null)} aria-label="Fechar">
                <X size={19} />
              </button>
            </div>
            <div className="modal-body">
              <div className="confirm-delete-body">
                <Trash2 size={40} className="confirm-delete-icon" />
                <p>Tem certeza que deseja excluir o documento:</p>
                <strong>&ldquo;{deleteDocConfirm.title}&rdquo;</strong>
                <p className="confirm-delete-warn">Esta ação não pode ser desfeita. Todos os arquivos anexados serão removidos permanentemente.</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setDeleteDocConfirm(null)}>Cancelar</button>
                <button type="button" className="btn btn-danger" onClick={() => handleDeleteDocument(deleteDocConfirm)}>
                  <Trash2 size={15} /> Excluir Definitivamente
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Modal de Documentos Rápidos (Declaração, Recibo de Reembolso/IRPF, Termo LGPD) */}
      <QuickDocumentsModal
        open={quickDocOpen}
        onClose={() => setQuickDocOpen(false)}
        initialClientName={client?.name || ''}
        initialClientPhone={client?.phone || ''}
        initialClientCpf={record?.cpf || ''}
      />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          RELATÓRIO OFICIAL DE PRONTUÁRIO CLÍNICO (EXIBIDO NA IMPRESSÃO)
          Conforme Lei 13.787/2018, CFP 001/2009 e Padrão SBHP
      ══════════════════════════════════════════════════════════════ */}
      <div className="prontuario-print-report">
        {/* Cabeçalho Oficial Timbrado */}
        <div className="print-header">
          <div>
            <h1 className="print-title">{PROFESSIONAL_INFO.name}</h1>
            <p className="print-subtitle">
              {PROFESSIONAL_INFO.title} • {PROFESSIONAL_INFO.credentialCode}
            </p>
            <p className="print-subtitle" style={{ fontSize: '8.5pt', color: '#6b7280' }}>
              {PROFESSIONAL_INFO.society} • {PROFESSIONAL_INFO.city}
            </p>
          </div>
          <div className="print-badge">
            <div>PRONTUÁRIO CLÍNICO INDIVIDUAL</div>
            <div style={{ fontSize: '7.5pt', fontWeight: 400, marginTop: '2px' }}>
              Emissão: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}
            </div>
            <div style={{ fontSize: '7.5pt', fontWeight: 600, color: '#15803d', marginTop: '2px' }}>
              🔒 SIGILO PROFISSIONAL (SBHP)
            </div>
          </div>
        </div>

        {/* 1. Dados do Paciente */}
        <div className="print-section">
          <div className="print-section-title">1. Identificação do Paciente / Titular</div>
          <div className="print-grid-3">
            <div>
              <span className="print-label">Nome Completo</span>
              <span className="print-val">{client.name}</span>
            </div>
            <div>
              <span className="print-label">CPF</span>
              <span className="print-val">{record?.cpf || 'Não informado'}</span>
            </div>
            <div>
              <span className="print-label">Data de Nascimento</span>
              <span className="print-val">{formatDateBr(record?.birthDate)}</span>
            </div>
            <div>
              <span className="print-label">Telefone de Contato</span>
              <span className="print-val">{formatPhone(client.phone)}</span>
            </div>
            <div>
              <span className="print-label">E-mail</span>
              <span className="print-val">{client.email || 'Não informado'}</span>
            </div>
            <div>
              <span className="print-label">Contato de Emergência</span>
              <span className="print-val">
                {record?.emergencyContactName || record?.emergencyContacts?.[0]?.name || 'Não informado'}
              </span>
            </div>
          </div>
          {(record?.emergencyContactName || record?.emergencyContacts?.[0]?.name) && (
            <div style={{ fontSize: '9pt', marginTop: '4px', color: '#4b5563' }}>
              <strong>Contato de Emergência:</strong> {record.emergencyContactName || record.emergencyContacts?.[0]?.name}
              {(record.emergencyContactPhone || record.emergencyContacts?.[0]?.phone) && ` • ${formatPhone(record.emergencyContactPhone || record.emergencyContacts?.[0]?.phone || '')}`}
              {(record.emergencyContactRelationship || record.emergencyContacts?.[0]?.relationship) && ` (${record.emergencyContactRelationship || record.emergencyContacts?.[0]?.relationship})`}
            </div>
          )}
        </div>

        {/* 2. Ficha Clínica & Anamnese SBHP */}
        <div className="print-section">
          <div className="print-section-title">2. Anamnese &amp; Protocolo SBHP</div>
          <div style={{ marginBottom: '8px' }}>
            <span className="print-label">Queixa Principal &amp; Objetivo do Acompanhamento:</span>
            <div className="print-box">
              {record?.chiefComplaint || 'Sem queixa registrada.'}
            </div>
          </div>
          {record?.healthHistory && (
            <div style={{ marginBottom: '8px' }}>
              <span className="print-label">Saúde Geral &amp; Medicamentos Contínuos:</span>
              <div className="print-box">{record.healthHistory}</div>
            </div>
          )}
          <div className="print-grid" style={{ marginTop: '6px' }}>
            <div>
              <span className="print-label">Triagem de Epilepsia / Convulsão</span>
              <span className="print-val" style={{ color: record?.epilepsyHistory ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
                {record?.epilepsyHistory ? '⚠️ SIM (Contraindicação SBHP mapeada)' : '✓ Não relatada (Apto)'}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Metas Terapêuticas */}
        {goals.length > 0 && (
          <div className="print-section">
            <div className="print-section-title">3. Metas &amp; Objetivos Terapêuticos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {goals.map(g => (
                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '9pt' }}>
                  <div>
                    <strong>{g.title}</strong>
                    {g.description && <span style={{ color: '#6b7280', marginLeft: '6px' }}>— {g.description}</span>}
                  </div>
                  <div style={{ fontWeight: 600 }}>
                    {g.progressPct}% • {g.status === 'alcancado' ? 'Alcançado' : g.status === 'em_andamento' ? 'Em andamento' : g.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Evoluções Clínicas & Histórico de Sessões (Lei 13.787/2018) */}
        <div className="print-section">
          <div className="print-section-title">4. Registro das Sessões &amp; Evoluções Clínicas (Lei 13.787/2018)</div>
          {evolutions.length === 0 ? (
            <p style={{ fontStyle: 'italic', color: '#6b7280', fontSize: '9pt' }}>Nenhuma evolução clínica registrada até o momento.</p>
          ) : (
            evolutions.map((ev, idx) => (
              <div key={ev.id} className="print-evolution-item">
                <div className="print-evolution-top">
                  <span>Sessão #{evolutions.length - idx} • {formatDateBr(ev.sessionDate)} — {ev.title}</span>
                  <span style={{ fontSize: '8.5pt', color: ev.finalizedAt ? '#15803d' : '#d97706', fontWeight: 600 }}>
                    {ev.finalizedAt ? '✓ Assinado e Imutável (Lei 13.787)' : 'Rascunho'}
                  </span>
                </div>
                <div style={{ fontSize: '9.5pt', lineHeight: 1.45, marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                  {ev.evolutionText}
                </div>
                {(ev.inductionMethod || ev.tranceDepth) && (
                  <div style={{ marginTop: '6px', fontSize: '8.5pt', color: '#374151', background: '#f3f4f6', padding: '4px 8px', borderRadius: '3px' }}>
                    <strong>Protocolo Hipnótico:</strong> {ev.inductionMethod && `Indução: ${ev.inductionMethod}`} {ev.tranceDepth && ` • Profundidade: ${ev.tranceDepth}`}
                  </div>
                )}
                {ev.homeworkTasks && (
                  <div style={{ marginTop: '4px', fontSize: '8.5pt', color: '#4b5563' }}>
                    <strong>Combinados / Autohipnose para Casa:</strong> {ev.homeworkTasks}
                  </div>
                )}
                {ev.finalizedAt && (
                  <div className="print-signature-seal">
                    🔒 Assinatura Eletrônica: {ev.finalizedByName || ev.createdByName || PROFESSIONAL_INFO.name} ({PROFESSIONAL_INFO.credentialCode}) em {formatDateBr(ev.finalizedAt)}. Integridade garantida sob Lei 13.787/2018.
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 5. Documentos e Termos Registrados */}
        {documents.length > 0 && (
          <div className="print-section">
            <div className="print-section-title">5. Documentos, Termos &amp; Consentimentos</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '8.5pt' }}>
              {documents.map(d => (
                <div key={d.id} style={{ border: '1px solid #e5e7eb', padding: '6px 8px', borderRadius: '4px' }}>
                  <strong>{d.title}</strong> ({d.documentTypeLabel || d.documentType})
                  <div style={{ color: '#6b7280' }}>Registrado em {formatDateBr(d.createdAt)} • Status: {d.status}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé e Assinatura Profissional */}
        <div className="print-footer-signature">
          <div style={{ maxWidth: '60%', fontSize: '8pt', color: '#6b7280', lineHeight: 1.4 }}>
            Este prontuário é um documento sigiloso e confidencial, protegido pelo Sigilo Profissional da Sociedade Brasileira de Hipnose e Psicoterapia (SBHP), pela Lei Geral de Proteção de Dados (Lei 13.709/2018 - LGPD) e pelas normas da Lei 13.787/2018 para Prontuários Eletrônicos de Saúde.
          </div>
          <div className="print-sign-line">
            <strong>{PROFESSIONAL_INFO.name}</strong><br />
            {PROFESSIONAL_INFO.title}<br />
            <span style={{ fontSize: '8pt', color: '#4b5563' }}>{PROFESSIONAL_INFO.credentialCode} • SBHP</span>
          </div>
        </div>
      </div>
      {dialogNode}
    </>
  );
}

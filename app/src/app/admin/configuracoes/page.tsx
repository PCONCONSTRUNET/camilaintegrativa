'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  CalendarCheck2,
  CalendarX2,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  CreditCard,
  Database,
  Download,
  Eye,
  EyeOff,
  FolderDown,
  HardDrive,
  History,
  MessageSquare,
  Play,
  PowerOff,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Webhook,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  WhatsappAutomationSettings,
  WhatsappMessageLog,
  WhatsappProviderType,
  WhatsappTemplatesMap,
  WhatsappTriggerType,
} from '@/lib/whatsapp-templates';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { getInstantCache, setInstantCache } from '@/lib/client-cache';

const TRIGGER_ORDER: WhatsappTriggerType[] = [
  'sessao_agendada',
  'lembrete_24h',
  'agendamento_cancelado',
  'pagamento_identificado',
  'fatura_vencida',
];

const TRIGGER_META: Record<
  WhatsappTriggerType,
  {
    badge: string;
    shortTitle: string;
    subtitle: string;
    accentColor: string;
    softBg: string;
    borderColor: string;
    icon: typeof CalendarCheck2;
    triggerWhen: string;
  }
> = {
  sessao_agendada: {
    badge: 'GATILHO 1 • AGENDAMENTO',
    shortTitle: 'Sessão Agendada com Sucesso',
    subtitle: 'Confirmação imediata quando o cliente ou a clínica agenda uma sessão',
    accentColor: '#059669',
    softBg: '#ecfdf5',
    borderColor: '#a7f3d0',
    icon: CalendarCheck2,
    triggerWhen: 'Dispara ao criar agendamento online (/agendar), interno (/admin/agenda) ou confirmar sessão.',
  },
  lembrete_24h: {
    badge: 'GATILHO 2 • ANTI-FALTA (24H)',
    shortTitle: 'Lembrete 24 Horas Antes do Horário',
    subtitle: 'Aviso automático enviado 1 dia antes da sessão para confirmar presença',
    accentColor: '#2563eb',
    softBg: '#eff6ff',
    borderColor: '#bfdbfe',
    icon: Clock,
    triggerWhen: 'Dispara automaticamente quando faltam ~24h para o horário agendado (1 envio único por sessão).',
  },
  agendamento_cancelado: {
    badge: 'GATILHO 3 • CANCELAMENTO',
    shortTitle: 'Agendamento Cancelado (Dona ou Cliente)',
    subtitle: 'Notificação automática caso a clínica ou o próprio cliente cancele o horário',
    accentColor: '#dc2626',
    softBg: '#fef2f2',
    borderColor: '#fecaca',
    icon: CalendarX2,
    triggerWhen: 'Dispara quando a profissional cancela na Agenda ou quando o cliente cancela na Área do Cliente.',
  },
  pagamento_identificado: {
    badge: 'GATILHO 4 • FINANCEIRO & FATURAS',
    shortTitle: 'Pagamento Identificado (Fatura / Área do Cliente)',
    subtitle: 'Confirmação detalhada com valor pago, fatura, forma de pagamento e saldo restante',
    accentColor: '#b45309',
    softBg: '#fffbeb',
    borderColor: '#fde68a',
    icon: CreditCard,
    triggerWhen: 'Dispara quando o cliente paga uma fatura pela Área do Cliente ou quando há baixa no Financeiro.',
  },
  fatura_vencida: {
    badge: 'GATILHO 5 • COBRANÇA & PIX',
    shortTitle: 'Lembrete de Vencimento de Fatura (Chave PIX)',
    subtitle: 'Aviso automático com valor em aberto, data de vencimento, chave PIX e solicitação de comprovante',
    accentColor: '#ea580c',
    softBg: '#fff7ed',
    borderColor: '#fed7aa',
    icon: Receipt,
    triggerWhen: 'Dispara automaticamente quando a fatura ou saldo em aberto do cliente atinge ou passa da data de vencimento.',
  },
};

const SAMPLE_PREVIEW_VARIABLES: Record<string, string> = {
  '{{primeiro_nome}}': 'Lucas',
  '{{nome_cliente}}': 'Lucas Pereira de Souza',
  '{{servico}}': 'Sessão de Hipnoterapia Integrativa',
  '{{data}}': '29/10/2026',
  '{{horario}}': '14:00',
  '{{modalidade}}': 'Presencial',
  '{{valor}}': 'R$ 380,00',
  '{{profissional}}': 'Camila Machado',
  '{{cancelado_por}}': 'Cancelado pelo cliente na Área do Cliente',
  '{{motivo}}': 'Reagendamento solicitado',
  '{{fatura_descricao}}': 'Reiki nível III (Saldo Parcial)',
  '{{valor_pago}}': 'R$ 125,00',
  '{{valor_pendente}}': 'R$ 125,00',
  '{{valor_total}}': 'R$ 450,00',
  '{{valor_total_fatura}}': 'R$ 450,00',
  '{{saldo_restante}}': 'R$ 0,00 (Quitado ✅)',
  '{{data_vencimento}}': '28/10/2026',
  '{{chave_pix}}': '(48) 99691-5303 (Camila Machado)',
  '{{forma_pagamento}}': 'PIX',
  '{{status_fatura}}': 'Fatura Quitada (100% Pago)',
  '{{data_pagamento}}': '28/10/2026 às 15:30',
};

function renderPreviewText(rawTemplate: string): string {
  let out = rawTemplate || '';
  for (const [key, val] of Object.entries(SAMPLE_PREVIEW_VARIABLES)) {
    out = out.split(key).join(val);
  }
  return out;
}

function formatWhatsAppRichText(text: string) {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*[^*]+\*)/g);
    return (
      <span key={lineIdx} style={{ display: 'block', minHeight: line.trim() === '' ? '0.65rem' : undefined }}>
        {parts.map((part, partIdx) => {
          if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return (
              <strong key={partIdx} style={{ fontWeight: 700, color: '#0f172a' }}>
                {part.slice(1, -1)}
              </strong>
            );
          }
          return <span key={partIdx}>{part}</span>;
        })}
      </span>
    );
  });
}

type ClinicBackupSummary = {
  clinicId: string;
  clinicName: string;
  generatedAt: string;
  generatedBy: string;
  counts: {
    clients: number;
    prontuarioRecords: number;
    clinicalEvolutions: number;
    treatmentGoals: number;
    clientDocuments: number;
    clientPackages: number;
    appointments: number;
    timeBlocks: number;
    services: number;
    expenses: number;
    payments: number;
    groupSessions: number;
    groupEnrollments: number;
    noteFolders: number;
    notes: number;
  };
};

export default function ConfiguracoesPage() {
  const cachedData = getInstantCache<any>('admin_whatsapp_settings', null);
  const [loading, setLoading] = useState(() => !cachedData);
  const [saving, setSaving] = useState(false);
  const [checking24h, setChecking24h] = useState(false);
  const [checkingOverdue, setCheckingOverdue] = useState(false);
  const [sendingTest, setSendingTest] = useState<WhatsappTriggerType | 'global' | null>(null);

  const [activeSection, setActiveSection] = useState<'todos' | 'lembretes' | 'api' | 'historico' | 'backup'>('todos');
  const [activeTriggerTab, setActiveTriggerTab] = useState<WhatsappTriggerType>('sessao_agendada');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPayloadExample, setShowPayloadExample] = useState(false);

  // Backup state
  const [backupSummary, setBackupSummary] = useState<ClinicBackupSummary | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupDownloading, setBackupDownloading] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  // Settings state
  const [enabled, setEnabled] = useState<boolean>(() => cachedData?.settings?.enabled ?? true);
  const [providerType, setProviderType] = useState<WhatsappProviderType>('webhook_custom');
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(() => cachedData?.settings?.apiBaseUrl || '');
  const [apiKey, setApiKey] = useState<string>(() => cachedData?.settings?.apiKey || '');
  const [instanceName, setInstanceName] = useState<string>(() => cachedData?.settings?.instanceName || 'clinica-camila');
  const [adminNotifyPhone, setAdminNotifyPhone] = useState<string>(() => cachedData?.settings?.adminNotifyPhone || '');
  const [notifyOwnerOnCancel, setNotifyOwnerOnCancel] = useState<boolean>(() => cachedData?.settings?.notifyOwnerOnCancel ?? true);
  const [notifyOwnerOnPayment, setNotifyOwnerOnPayment] = useState<boolean>(() => cachedData?.settings?.notifyOwnerOnPayment ?? true);
  const [templates, setTemplates] = useState<WhatsappTemplatesMap>(() => cachedData?.settings?.templates || DEFAULT_WHATSAPP_TEMPLATES);

  // Logs & stats
  const [logs, setLogs] = useState<WhatsappMessageLog[]>(() => cachedData?.logs || []);
  const [upcoming24hCount, setUpcoming24hCount] = useState<number>(() => cachedData?.upcoming24hCount ?? 0);
  const [overdueInvoicesCount, setOverdueInvoicesCount] = useState<number>(() => cachedData?.overdueInvoicesCount ?? 0);

  // Test bar state
  const [testPhone, setTestPhone] = useState<string>(() => cachedData?.settings?.adminNotifyPhone || '');
  const [testClientName, setTestClientName] = useState('Lucas Pereira de Souza');
  const [testTrigger, setTestTrigger] = useState<WhatsappTriggerType>('sessao_agendada');

  // QR Code & Session connection state
  const [qrEndpointOverride, setQrEndpointOverride] = useState<string>(() => cachedData?.settings?.qrEndpoint || '');
  const [qrLoading, setQrLoading] = useState<'qrcode' | 'status' | 'disconnect' | null>(null);
  const [qrState, setQrState] = useState<{
    status: 'idle' | 'connected' | 'qrcode' | 'connecting' | 'disconnected' | 'error';
    qrImageUrl?: string | null;
    pairingCode?: string | null;
    connectedPhone?: string | null;
    profileName?: string | null;
    message?: string;
    simulated?: boolean;
  }>(() => {
    if (cachedData?.connectionStatus?.status === 'connected') {
      return {
        status: 'connected',
        qrImageUrl: null,
        connectedPhone: cachedData.connectionStatus.connectedPhone ?? null,
        profileName: cachedData.connectionStatus.profileName ?? null,
        message: cachedData.connectionStatus.message || 'WhatsApp Conectado e ativo na API!',
        simulated: false,
      };
    }
    return { status: 'idle' };
  });

  // Toast feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whatsapp-settings', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar configurações.');

      setInstantCache('admin_whatsapp_settings', data);
      const s: WhatsappAutomationSettings = data.settings;
      setEnabled(s.enabled);
      setProviderType('webhook_custom');
      const rawUrl = (s.apiBaseUrl || '').trim();
      setApiBaseUrl(rawUrl.includes('@') && !rawUrl.startsWith('http') ? '' : rawUrl);
      setApiKey(s.apiKey || '');
      setInstanceName(s.instanceName || 'clinica-camila');
      setAdminNotifyPhone(s.adminNotifyPhone || '');
      setNotifyOwnerOnCancel(s.notifyOwnerOnCancel ?? true);
      setNotifyOwnerOnPayment(s.notifyOwnerOnPayment ?? true);
      setQrEndpointOverride(s.qrEndpoint || '');
      setTemplates(s.templates || DEFAULT_WHATSAPP_TEMPLATES);
      setLogs(data.logs || []);
      setUpcoming24hCount(data.upcoming24hCount ?? 0);
      setOverdueInvoicesCount(data.overdueInvoicesCount ?? 0);
      if (s.adminNotifyPhone) {
        setTestPhone((prev) => prev || s.adminNotifyPhone);
      }
      if (data.connectionStatus?.status === 'connected') {
        setQrState({
          status: 'connected',
          qrImageUrl: null,
          connectedPhone: data.connectionStatus.connectedPhone ?? null,
          profileName: data.connectionStatus.profileName ?? null,
          message: data.connectionStatus.message || 'WhatsApp Conectado e ativo na API!',
          simulated: false,
        });
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Falha ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const loadBackupSummary = useCallback(async () => {
    try {
      setBackupLoading(true);
      const res = await fetch('/api/admin/backup?mode=summary', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setBackupSummary(data.summary);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar resumo de backup:', err);
    } finally {
      setBackupLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('last_clinic_backup_at');
      if (saved) setLastBackupAt(saved);
    } catch {}
    void loadBackupSummary();
  }, [loadBackupSummary]);

  const handleDownloadBackup = async () => {
    try {
      setBackupDownloading(true);
      showToast('info', 'Gerando backup completo de todas as tabelas e dados...');

      const res = await fetch('/api/admin/backup', { cache: 'no-store' });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro ao gerar arquivo de backup.');
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `backup-clinica-camila-machado-${new Date().toISOString().slice(0, 10)}.json`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      const nowIso = new Date().toISOString();
      setLastBackupAt(nowIso);
      try {
        localStorage.setItem('last_clinic_backup_at', nowIso);
      } catch {}

      const sizeKb = (blob.size / 1024).toFixed(1);
      showToast('success', `Backup baixado com sucesso (${sizeKb} KB)! Arquivo JSON preservado.`);
      void loadBackupSummary();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Falha ao baixar backup.');
    } finally {
      setBackupDownloading(false);
    }
  };

  // Polling automático inteligente: enquanto o QR Code estiver visível, verifica a cada 2.5s se o usuário escaneou
  useEffect(() => {
    if (qrState.status !== 'qrcode') return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/whatsapp-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'status',
            qrEndpointOverride: qrEndpointOverride.trim() || undefined,
            apiBaseUrl: apiBaseUrl.trim(),
            apiKey: apiKey.trim(),
            instanceName: instanceName.trim() || 'clinica-camila',
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.status === 'connected') {
          setQrState({
            status: 'connected',
            qrImageUrl: null,
            pairingCode: null,
            connectedPhone: data.connectedPhone ?? null,
            profileName: data.profileName ?? null,
            message: data.message || 'WhatsApp Conectado com sucesso!',
            simulated: false,
          });
          showToast('success', 'WhatsApp Conectado com sucesso! QR Code finalizado.');
        }
      } catch {
        // polling silencioso sem quebrar interface
      }
    }, 2500);

    return () => clearInterval(intervalId);
  }, [qrState.status, qrEndpointOverride, apiBaseUrl, apiKey, instanceName, showToast]);

  async function handleSaveAll() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/whatsapp-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          providerType,
          apiBaseUrl,
          apiKey,
          instanceName,
          adminNotifyPhone,
          notifyOwnerOnCancel,
          notifyOwnerOnPayment,
          qrEndpoint: qrEndpointOverride.trim(),
          templates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar configurações.');

      if (data.settings?.qrEndpoint !== undefined) {
        setQrEndpointOverride(data.settings.qrEndpoint || '');
      }
      setLogs(data.logs || logs);
      showToast('success', 'Configurações da API salvas com sucesso!');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleQrSessionAction(action: 'qrcode' | 'status' | 'disconnect') {
    if (action === 'disconnect') {
      const { confirmed } = await confirmDialog({
        title: 'Desconectar WhatsApp',
        description: 'Deseja realmente desconectar o aparelho atual desta instância? Será necessário escanear um novo QR Code para reconectar.',
        highlightText: `Instância: ${instanceName.trim() || 'clinica-camila'}`,
        confirmLabel: 'Sim, desconectar',
        cancelLabel: 'Manter conectado',
        variant: 'danger',
      });
      if (!confirmed) return;
    }
    setQrLoading(action);

    // Auto-save current values into database so F5 or reloads never lose what was typed
    fetch('/api/admin/whatsapp-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled,
        providerType,
        apiBaseUrl: apiBaseUrl.trim(),
        apiKey: apiKey.trim(),
        instanceName: instanceName.trim() || 'clinica-camila',
        adminNotifyPhone: adminNotifyPhone.trim(),
        notifyOwnerOnCancel,
        notifyOwnerOnPayment,
        qrEndpoint: qrEndpointOverride.trim(),
        templates,
      }),
    }).catch(() => null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);
    try {
      const res = await fetch('/api/admin/whatsapp-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          qrEndpointOverride: qrEndpointOverride.trim() || undefined,
          apiBaseUrl: apiBaseUrl.trim(),
          apiKey: apiKey.trim(),
          instanceName: instanceName.trim() || 'clinica-camila',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      const nextStatus = data.status || (res.ok ? (action === 'status' ? 'connected' : 'qrcode') : 'error');
      setQrState({
        status: nextStatus,
        qrImageUrl: data.qrImageUrl ?? null,
        pairingCode: data.pairingCode ?? null,
        connectedPhone: data.connectedPhone ?? null,
        profileName: data.profileName ?? null,
        message: data.message || data.error || 'Operação concluída.',
        simulated: Boolean(data.simulated),
      });
      if (nextStatus === 'connected') {
        showToast('success', data.message || 'WhatsApp conectado e pronto para disparos!');
      } else if (nextStatus === 'qrcode') {
        showToast('info', data.message || 'QR Code gerado! Escaneie com o WhatsApp do seu celular.');
      } else if (nextStatus === 'disconnected') {
        showToast('info', data.message || 'Sessão desconectada.');
      } else {
        showToast('error', data.message || data.error || 'Falha ao consultar API de QR Code.');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const msg = isAbort
        ? `Tempo limite excedido ao contatar ${apiBaseUrl.trim() || 'a API'}. Verifique se o servidor na Contabo está ativo.`
        : err instanceof Error
        ? err.message
        : 'Erro ao conectar com a API de QR Code.';
      setQrState({ status: 'error', message: msg });
      showToast('error', msg);
    } finally {
      setQrLoading(null);
    }
  }

  async function handleSendTest(triggerToTest: WhatsappTriggerType) {
    const targetPhone = testPhone.trim() || adminNotifyPhone.trim();
    if (!targetPhone) {
      showToast('error', 'Informe um número de WhatsApp com DDD no campo de teste para enviar a mensagem.');
      return;
    }

    setSendingTest(triggerToTest);
    try {
      // Save current templates first so test uses latest message
      await fetch('/api/admin/whatsapp-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          providerType,
          apiBaseUrl,
          apiKey,
          instanceName,
          adminNotifyPhone,
          notifyOwnerOnCancel,
          notifyOwnerOnPayment,
          qrEndpoint: qrEndpointOverride.trim(),
          templates,
        }),
      });

      const res = await fetch('/api/admin/whatsapp-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          triggerType: triggerToTest,
          phone: targetPhone,
          clientName: testClientName || 'Lucas Pereira de Souza',
          customMessageOverride: templates[triggerToTest]?.messageTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar teste.');

      setLogs(data.logs || []);
      const status = data.log?.status;
      if (status === 'enviado') {
        showToast('success', `Disparo de teste (${TRIGGER_META[triggerToTest].shortTitle}) enviado para ${targetPhone}!`);
      } else if (status === 'simulado_sem_api') {
        showToast(
          'info',
          `Teste processado e registrado no histórico! (Modo Simulação: preencha a URL da API para envio externo no WhatsApp).`
        );
      } else {
        showToast('error', `A API retornou erro: ${data.log?.responsePreview || 'Verifique a URL e o Token.'}`);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Falha no disparo de teste.');
    } finally {
      setSendingTest(null);
    }
  }

  async function handleRun24hCheck() {
    setChecking24h(true);
    try {
      const res = await fetch('/api/admin/whatsapp-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_24h_check' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao verificar lembretes de 24h.');
      setLogs(data.logs || []);
      showToast(
        'success',
        `Verificação concluída: ${data.checkedCount} sessão(ões) nas próximas 24h analisadas • ${data.dispatchedCount} novo(s) lembrete(s) disparado(s).`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao verificar fila de 24h.');
    } finally {
      setChecking24h(false);
    }
  }

  async function handleRunOverdueCheck() {
    setCheckingOverdue(true);
    try {
      const res = await fetch('/api/admin/whatsapp-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_overdue_check' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao verificar faturas vencidas.');
      setLogs(data.logs || []);
      if (data.dispatchedCount > 0) {
        showToast(
          'success',
          `Cobrança processada: ${data.dispatchedCount} lembrete(s) de vencimento com chave PIX enviado(s) aos clientes!`
        );
      } else {
        showToast(
          'info',
          `Varredura concluída: ${data.checkedCount} fatura(s) vencida(s) identificada(s), mas todas já foram notificadas hoje ou não possuem telefone válido.`
        );
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao processar faturas vencidas.');
    } finally {
      setCheckingOverdue(false);
    }
  }

  const { confirmDialog, dialogNode } = useConfirmDialog();

  async function handleClearLogs() {
    const { confirmed } = await confirmDialog({
      title: 'Limpar histórico de envios',
      description: 'Deseja realmente excluir todo o histórico de disparos de WhatsApp? Esta ação não pode ser desfeita.',
      confirmLabel: 'Sim, limpar histórico',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await fetch('/api/admin/whatsapp-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_logs' }),
      });
      if (res.ok) {
        setLogs([]);
        showToast('info', 'Histórico de disparos limpo com sucesso.');
      }
    } catch {
      // ignore
    }
  }

  function updateTemplateText(trigger: WhatsappTriggerType, newText: string) {
    setTemplates((prev) => ({
      ...prev,
      [trigger]: {
        ...prev[trigger],
        messageTemplate: newText,
      },
    }));
  }

  function toggleTemplateEnabled(trigger: WhatsappTriggerType) {
    setTemplates((prev) => ({
      ...prev,
      [trigger]: {
        ...prev[trigger],
        enabled: !prev[trigger].enabled,
      },
    }));
  }

  function restoreDefaultTemplate(trigger: WhatsappTriggerType) {
    setTemplates((prev) => ({
      ...prev,
      [trigger]: {
        ...prev[trigger],
        messageTemplate: DEFAULT_WHATSAPP_TEMPLATES[trigger].messageTemplate,
      },
    }));
    showToast('info', `Mensagem padrão de "${TRIGGER_META[trigger].shortTitle}" restaurada.`);
  }

  function insertVariableIntoTemplate(trigger: WhatsappTriggerType, variableKey: string) {
    const current = templates[trigger]?.messageTemplate || '';
    const next = current.endsWith(' ') || current.endsWith('\n') || !current ? `${current}${variableKey}` : `${current} ${variableKey}`;
    updateTemplateText(trigger, next);
  }

  const activeTriggersCount = useMemo(
    () => TRIGGER_ORDER.filter((k) => templates[k]?.enabled).length,
    [templates]
  );

  return (
    <div style={{ padding: '20px 20px 60px', maxWidth: '1260px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toast Flutuante */}
      {feedback && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 200,
            maxWidth: '440px',
            background:
              feedback.type === 'success'
                ? '#065f46'
                : feedback.type === 'error'
                ? '#991b1b'
                : '#1e293b',
            color: '#ffffff',
            padding: '14px 18px',
            borderRadius: '16px',
            boxShadow: '0 16px 36px rgba(15, 23, 42, 0.28)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.86rem',
            fontWeight: 600,
          }}
        >
          <Sparkles size={18} style={{ flexShrink: 0 }} />
          <span style={{ lineHeight: 1.4 }}>{feedback.message}</span>
        </div>
      )}

      {/* CABEÇALHO PRINCIPAL */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f2937 0%, #1a3a4a 100%)',
          borderRadius: '22px',
          padding: '24px 28px',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '18px',
          boxShadow: '0 12px 32px rgba(15, 41, 55, 0.16)',
        }}
      >
        <div style={{ maxWidth: '680px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.12)', padding: '5px 12px', borderRadius: '999px', fontSize: '0.73rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px', color: '#f3d078' }}>
            <BellRing size={14} /> Central de Automação & Mensageria WhatsApp
          </div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em', color: '#ffffff' }}>
            Configurações de Lembretes Automáticos & API
          </h1>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5 }}>
            Conecte sua API de WhatsApp e personalize as mensagens automáticas de <strong>Sessão Agendada</strong>,{' '}
            <strong>Lembrete 24h Antes</strong>, <strong>Agendamento Cancelado</strong>,{' '}
            <strong>Pagamento Identificado</strong> e <strong>Vencimento de Fatura (Chave PIX)</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleRun24hCheck}
            disabled={checking24h}
            style={{
              background: 'rgba(255,255,255,0.12)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: '999px',
              padding: '10px 16px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <RefreshCw size={15} className={checking24h ? 'animate-spin' : ''} />
            {checking24h ? 'Verificando fila 24h...' : `Verificar Fila 24h (${upcoming24hCount})`}
          </button>

          <button
            type="button"
            onClick={handleRunOverdueCheck}
            disabled={checkingOverdue}
            style={{
              background: 'rgba(234, 88, 12, 0.22)',
              color: '#ffffff',
              border: '1px solid rgba(254, 215, 170, 0.45)',
              borderRadius: '999px',
              padding: '10px 16px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <Receipt size={15} className={checkingOverdue ? 'animate-spin' : ''} />
            {checkingOverdue ? 'Verificando faturas...' : `Verificar Vencimentos (${overdueInvoicesCount})`}
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            style={{
              background: '#d4a238',
              color: '#0f172a',
              border: 'none',
              borderRadius: '999px',
              padding: '10px 22px',
              fontSize: '0.86rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(212, 162, 56, 0.35)',
            }}
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar Todas as Configurações'}
          </button>
        </div>
      </div>

      {/* RESUMO DE STATUS RÁPIDO + NAVEGAÇÃO ESTILO iOS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          background: '#ffffff',
          padding: '12px 18px',
          borderRadius: '18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
        }}
      >
        {/* iOS Segmented Control */}
        <div
          style={{
            display: 'inline-flex',
            background: '#f1f5f9',
            padding: '4px',
            borderRadius: '12px',
            gap: '4px',
            flexWrap: 'wrap',
          }}
        >
          {[
            { id: 'todos', label: 'Visão Completa', icon: Settings2 },
            { id: 'lembretes', label: `Mensagens Automáticas (${activeTriggersCount}/${TRIGGER_ORDER.length})`, icon: MessageSquare },
            { id: 'api', label: 'Conexão API WhatsApp', icon: Webhook },
            { id: 'historico', label: `Histórico de Envios (${logs.length})`, icon: History },
            { id: 'backup', label: 'Backup & Segurança', icon: ShieldCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id as typeof activeSection)}
                style={{
                  background: active ? '#ffffff' : 'transparent',
                  color: active ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '9px',
                  padding: '8px 14px',
                  fontSize: '0.8rem',
                  fontWeight: active ? 700 : 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: active ? '0 1px 3px rgba(15, 23, 42, 0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Status Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '999px',
              fontSize: '0.76rem',
              fontWeight: 700,
              background: enabled ? '#dcfce7' : '#f1f5f9',
              color: enabled ? '#166534' : '#64748b',
              border: `1px solid ${enabled ? '#86efac' : '#cbd5e1'}`,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: enabled ? '#16a34a' : '#94a3b8',
              }}
            />
            {enabled ? 'Automação Ativa' : 'Automação Pausada'}
          </span>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '999px',
              fontSize: '0.76rem',
              fontWeight: 700,
              background: apiBaseUrl.trim() ? '#eff6ff' : '#fffbeb',
              color: apiBaseUrl.trim() ? '#1d4ed8' : '#b45309',
              border: `1px solid ${apiBaseUrl.trim() ? '#bfdbfe' : '#fde68a'}`,
            }}
          >
            <Zap size={13} />
            {apiBaseUrl.trim() ? 'API Privada Contabo Conectada' : 'Modo Simulação (Aguardando URL da API Contabo)'}
          </span>
        </div>
      </div>

      {/* =====================================================================
          SEÇÃO 1: CONEXÃO DA API PRIVADA (CONTABO VPS)
         ===================================================================== */}
      {(activeSection === 'todos' || activeSection === 'api') && (
        <section
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: '#ecfdf5',
                  color: '#059669',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Webhook size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.12rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    1. Conexão da API Privada de WhatsApp (Contabo VPS)
                  </h2>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 9px',
                      borderRadius: '999px',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    Servidor Dedicado / API Própria
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '2px 0 0' }}>
                  Informe o endpoint da sua API privada hospedada na Contabo e a chave de autenticação para gerenciar todos os disparos automáticos.
                </p>
              </div>
            </div>

            {/* Chave Geral iOS */}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                background: enabled ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${enabled ? '#86efac' : '#e2e8f0'}`,
                padding: '8px 14px',
                borderRadius: '999px',
              }}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: enabled ? '#166534' : '#475569' }}>
                {enabled ? 'Envios Automáticos Ativados' : 'Envios Automáticos Desativados'}
              </span>
            </label>
          </div>

          {/* Campos de URL, Token, Instância, QR Endpoint e WhatsApp Admin */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Bloco de destaque: 3 campos principais do Natan */}
            <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)', border: '1.5px solid #bfdbfe', borderRadius: '16px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚙️ Configuração da API (preencha os 3 campos abaixo)</span>
              </div>

              {/* Campo 1: URL da API */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  1 · URL da API Privada (Contabo) / Endpoint de Envio (POST)
                </label>
                <input
                  type="url"
                  name="contabo_whatsapp_endpoint_url"
                  autoComplete="off"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="Ex: http://138.117.194.82:3002/webhook/notificacao"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: '1.5px solid #93c5fd',
                    fontSize: '0.88rem',
                    color: '#0f172a',
                    background: '#ffffff',
                  }}
                />
                <span style={{ display: 'block', fontSize: '0.73rem', color: '#64748b', marginTop: '4px' }}>
                  O sistema fará um <code>POST</code> em JSON para este endereço sempre que um dos 5 gatilhos for acionado.
                </span>
              </div>

              {/* Campo 2: Token + Campo 3: Endpoint QR Code (lado a lado) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    2 · Token de Autenticação / Secret Key (Contabo)
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      name="contabo_whatsapp_secret_token"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Cole aqui o Token / Secret da sua API..."
                      style={
                        {
                          width: '100%',
                          padding: '11px 40px 11px 14px',
                          borderRadius: '12px',
                          border: '1.5px solid #93c5fd',
                          fontSize: '0.86rem',
                          color: '#0f172a',
                          background: '#ffffff',
                          WebkitTextSecurity: showApiKey ? 'none' : 'disc',
                        } as React.CSSProperties
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                      title={showApiKey ? 'Ocultar Token' : 'Mostrar Token'}
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                    Enviado nos headers <code>Authorization: Bearer</code>, <code>x-api-key</code> e <code>apikey</code>.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    3 · Endpoint do QR Code na Contabo
                  </label>
                  <input
                    type="url"
                    name="contabo_whatsapp_qr_endpoint"
                    autoComplete="off"
                    value={qrEndpointOverride}
                    onChange={(e) => setQrEndpointOverride(e.target.value)}
                    placeholder="Ex: http://138.117.194.82:3002/api/status"
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '12px',
                      border: '1.5px solid #93c5fd',
                      fontSize: '0.86rem',
                      color: '#0f172a',
                      background: '#ffffff',
                    }}
                  />
                  <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                    Rota que retorna o QR Code da instância (fornecida pelo Natan / responsável da API).
                  </span>
                </div>
              </div>
            </div>

            {/* Instância + WhatsApp Admin */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  Identificador da Sessão / Instância (Opcional)
                </label>
                <input
                  type="text"
                  name="contabo_whatsapp_instance"
                  autoComplete="off"
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Ex: clinica-camila"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.86rem',
                    color: '#0f172a',
                    background: '#f8fafc',
                  }}
                />
                <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                  Enviado no campo <code>instance</code> do JSON para sua API identificar a sessão.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  WhatsApp da Dona / Clínica (Alertas Admin)
                </label>
                <input
                  type="tel"
                  value={adminNotifyPhone}
                  onChange={(e) => setAdminNotifyPhone(e.target.value)}
                  placeholder="Ex: (48) 99999-9999"
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.86rem',
                    color: '#0f172a',
                    background: '#f8fafc',
                  }}
                />
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={notifyOwnerOnCancel}
                      onChange={(e) => setNotifyOwnerOnCancel(e.target.checked)}
                    />
                    Avisar-me quando cliente cancelar
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem', color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={notifyOwnerOnPayment}
                      onChange={(e) => setNotifyOwnerOnPayment(e.target.checked)}
                    />
                    Avisar-me quando pagamento for identificado
                </label>
              </div>
            </div>
          </div>

          {/* Botão de Salvar Rápido da Seção 1 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              style={{
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '999px',
                padding: '10px 24px',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(22, 163, 74, 0.25)',
              }}
            >
              <Save size={16} />
              {saving ? 'Salvando...' : 'Salvar Configurações da API'}
            </button>
          </div>
        </div>

          {/* =====================================================================
              ÁREA DE GERAÇÃO DE QR CODE E PAREAMENTO DO WHATSAPP
             ===================================================================== */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)',
              border: '1.5px solid #bbf7d0',
              borderRadius: '18px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: '#16a34a',
                    color: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    boxShadow: '0 6px 16px rgba(22, 163, 74, 0.25)',
                  }}
                >
                  <QrCode size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                      Conectar WhatsApp via QR Code (Pareamento da Instância)
                    </strong>
                    {qrState.status === 'connected' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '999px', background: '#dcfce7', color: '#166534', fontSize: '0.72rem', fontWeight: 800, border: '1px solid #86efac' }}>
                        <Wifi size={12} /> Aparelho Conectado
                      </span>
                    )}
                    {qrState.status === 'disconnected' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '999px', background: '#fef2f2', color: '#b91c1c', fontSize: '0.72rem', fontWeight: 800, border: '1px solid #fecaca' }}>
                        <WifiOff size={12} /> Desconectado
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#475569', display: 'block', marginTop: '2px' }}>
                    Gere o QR Code da sessão <code>{instanceName || 'clinica-camila'}</code> na sua API Contabo e escaneie com o WhatsApp da clínica para ativar os envios automáticos.
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={qrLoading !== null}
                  onClick={() => handleQrSessionAction('qrcode')}
                  style={{
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '10px 18px',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                  }}
                >
                  <QrCode size={15} />
                  {qrLoading === 'qrcode'
                    ? 'Gerando QR Code...'
                    : qrState.status === 'qrcode'
                    ? 'Atualizar QR Code'
                    : 'Gerar QR Code WhatsApp'}
                </button>

                <button
                  type="button"
                  disabled={qrLoading !== null}
                  onClick={() => handleQrSessionAction('status')}
                  style={{
                    background: '#ffffff',
                    color: '#0f172a',
                    border: '1px solid #cbd5e1',
                    borderRadius: '999px',
                    padding: '10px 15px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <RefreshCw size={14} className={qrLoading === 'status' ? 'animate-spin' : ''} />
                  {qrLoading === 'status' ? 'Verificando...' : 'Verificar Conexão'}
                </button>

                {(qrState.status === 'connected' || qrState.status === 'qrcode') && (
                  <button
                    type="button"
                    disabled={qrLoading !== null}
                    onClick={() => handleQrSessionAction('disconnect')}
                    style={{
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: '999px',
                      padding: '10px 14px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <PowerOff size={14} />
                    Desconectar
                  </button>
                )}
              </div>
            </div>

            {/* Painel de Exibição do QR Code ou Status da Conexão */}
            {qrState.status !== 'idle' && (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: '20px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '20px',
                }}
              >
                {qrState.status === 'qrcode' && qrState.qrImageUrl ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px', width: '100%' }}>
                    <div
                      style={{
                        padding: '14px',
                        borderRadius: '18px',
                        background: '#ffffff',
                        border: '2px solid #16a34a',
                        boxShadow: '0 10px 25px rgba(22, 163, 74, 0.12)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <img
                        src={qrState.qrImageUrl}
                        alt="QR Code WhatsApp"
                        width={220}
                        height={220}
                        style={{ width: 220, height: 220, objectFit: 'contain', display: 'block' }}
                      />
                    </div>

                    <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {qrState.simulated && (
                        <span
                          style={{
                            alignSelf: 'flex-start',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            background: '#fffbeb',
                            color: '#b45309',
                            border: '1px solid #fde68a',
                            fontSize: '0.73rem',
                            fontWeight: 800,
                          }}
                        >
                          {apiBaseUrl.trim()
                            ? `QR da Instância (${instanceName || 'clinica-camila'}) • Caso sua VPS use rota própria de QR, informe no campo acima`
                            : 'Modo Demonstração • Configure a URL da API Contabo acima para QR Real'}
                        </span>
                      )}
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Smartphone size={18} style={{ color: '#16a34a' }} />
                        Escaneie o QR Code no seu WhatsApp
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.83rem', color: '#475569', lineHeight: 1.5 }}>
                        {qrState.message}
                      </p>
                      <ol style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '0.82rem', color: '#334155', lineHeight: 1.65 }}>
                        <li>Abra o <strong>WhatsApp</strong> no celular da clínica</li>
                        <li>Toque em <strong>Mais opções (⋮)</strong> ou <strong>Configurações</strong> → <strong>Aparelhos conectados</strong></li>
                        <li>Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para o QR Code ao lado</li>
                      </ol>

                      {qrState.pairingCode && (
                        <div style={{ marginTop: '6px', padding: '10px 14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '10px', alignSelf: 'flex-start' }}>
                          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Código de Pareamento:</span>
                          <strong style={{ fontSize: '1rem', letterSpacing: '0.12em', color: '#0f172a' }}>{qrState.pairingCode}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                ) : qrState.status === 'connected' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'grid', placeItems: 'center' }}>
                      <CheckCircle2 size={26} />
                    </div>
                    <div>
                      <strong style={{ fontSize: '1rem', fontWeight: 800, color: '#166534', display: 'block' }}>
                        WhatsApp Conectado e Ativo na API Contabo!
                      </strong>
                      <span style={{ fontSize: '0.83rem', color: '#475569' }}>
                        {qrState.message}
                        {qrState.connectedPhone ? ` • Número: ${qrState.connectedPhone}` : ''}
                        {qrState.profileName ? ` (${qrState.profileName})` : ''}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: qrState.status === 'error' ? '#b91c1c' : '#334155', fontSize: '0.85rem', fontWeight: 600 }}>
                    <span>{qrState.message}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BARRA DE TESTE RÁPIDO DA API */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              border: '1px solid #cbd5e1',
              borderRadius: '16px',
              padding: '16px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Play size={18} color="#1a3a4a" />
              <div>
                <strong style={{ fontSize: '0.86rem', color: '#0f172a', display: 'block' }}>
                  Testar Disparo de Lembrete Agora
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Envie uma mensagem de teste com dados simulados para validar sua conexão e formatação.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={testTrigger}
                onChange={(e) => setTestTrigger(e.target.value as WhatsappTriggerType)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  background: '#ffffff',
                  color: '#0f172a',
                }}
              >
                <option value="sessao_agendada">1. Sessão Agendada com Sucesso</option>
                <option value="lembrete_24h">2. Lembrete de 24 Horas Antes</option>
                <option value="agendamento_cancelado">3. Agendamento Cancelado</option>
                <option value="pagamento_identificado">4. Pagamento Identificado (Fatura)</option>
                <option value="fatura_vencida">5. Lembrete de Fatura Vencida (Chave PIX)</option>
              </select>

              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="WhatsApp destino (ex: 48999999999)"
                style={{
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8rem',
                  width: '215px',
                  background: '#ffffff',
                }}
              />

              <button
                type="button"
                disabled={sendingTest !== null}
                onClick={() => handleSendTest(testTrigger)}
                style={{
                  background: '#1a3a4a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '9px 18px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Send size={14} />
                {sendingTest ? 'Disparando...' : 'Enviar Teste'}
              </button>

              <button
                type="button"
                onClick={() => setShowPayloadExample((v) => !v)}
                style={{
                  background: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '999px',
                  padding: '9px 14px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Code2 size={14} />
                {showPayloadExample ? 'Ocultar JSON' : 'Ver JSON enviado'}
              </button>
            </div>
          </div>

          {showPayloadExample && (
            <div
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '16px',
                borderRadius: '14px',
                fontSize: '0.76rem',
                fontFamily: 'monospace',
                overflowX: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', color: '#94a3b8' }}>
                <span>Exemplo de Payload HTTP POST enviado pelo sistema para a sua API Privada na Contabo:</span>
              </div>
              <pre style={{ margin: 0, lineHeight: 1.5 }}>
                {JSON.stringify(
                  {
                    event: testTrigger,
                    triggerType: testTrigger,
                    instance: instanceName || 'clinica-camila',
                    phone: '5548999999999',
                    number: '5548999999999',
                    recipientName: 'Lucas Pereira de Souza',
                    message: renderPreviewText(templates[testTrigger]?.messageTemplate || ''),
                    text: renderPreviewText(templates[testTrigger]?.messageTemplate || ''),
                    variables: SAMPLE_PREVIEW_VARIABLES,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          SEÇÃO 2: CONFIGURAÇÃO DAS 4 MENSAGENS AUTOMÁTICAS DE LEMBRETES
         ===================================================================== */}
      {(activeSection === 'todos' || activeSection === 'lembretes') && (
        <section
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <MessageSquare size={22} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.12rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  2. Personalização das Mensagens Automáticas (5 Gatilhos)
                </h2>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '2px 0 0' }}>
                  Clique em qualquer variável dinâmica abaixo para inseri-la na mensagem e veja ao lado como o cliente receberá no WhatsApp.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              style={{
                background: '#1a3a4a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '999px',
                padding: '9px 20px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
              }}
            >
              <Save size={15} />
              {saving ? 'Salvando...' : 'Salvar Mensagens'}
            </button>
          </div>

          {/* Seletor Rápido dos 5 Lembretes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            {TRIGGER_ORDER.map((triggerKey) => {
              const meta = TRIGGER_META[triggerKey];
              const cfg = templates[triggerKey];
              const Icon = meta.icon;
              const isSelected = activeTriggerTab === triggerKey;

              return (
                <div
                  key={triggerKey}
                  onClick={() => setActiveTriggerTab(triggerKey)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '16px',
                    border: isSelected ? `2px solid ${meta.accentColor}` : '1px solid #e2e8f0',
                    background: isSelected ? meta.softBg : '#f8fafc',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: meta.accentColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      <Icon size={15} />
                      {meta.badge}
                    </span>

                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={cfg?.enabled ?? true}
                        onChange={() => toggleTemplateEnabled(triggerKey)}
                        style={{ width: '16px', height: '16px', accentColor: meta.accentColor, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cfg?.enabled ? '#166534' : '#64748b' }}>
                        {cfg?.enabled ? 'Ativo' : 'Pausado'}
                      </span>
                    </label>
                  </div>

                  <strong style={{ fontSize: '0.92rem', color: '#0f172a', lineHeight: 1.3 }}>
                    {meta.shortTitle}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.35 }}>
                    {meta.subtitle}
                  </span>
                </div>
              );
            })}
          </div>

          {/* LISTA COMPLETA DOS 5 CARDS DE EDIÇÃO + PREVIEW DO WHATSAPP */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', marginTop: '4px' }}>
            {TRIGGER_ORDER.map((triggerKey) => {
              const meta = TRIGGER_META[triggerKey];
              const cfg = templates[triggerKey] || DEFAULT_WHATSAPP_TEMPLATES[triggerKey];
              const defaultVars = DEFAULT_WHATSAPP_TEMPLATES[triggerKey].availableVariables;
              const Icon = meta.icon;
              const previewRendered = renderPreviewText(cfg.messageTemplate);

              return (
                <div
                  key={triggerKey}
                  id={`card-${triggerKey}`}
                  style={{
                    borderRadius: '18px',
                    border: `1.5px solid ${activeTriggerTab === triggerKey ? meta.accentColor : '#e2e8f0'}`,
                    background: '#ffffff',
                    overflow: 'hidden',
                    boxShadow: activeTriggerTab === triggerKey ? '0 8px 24px rgba(15, 23, 42, 0.06)' : 'none',
                  }}
                >
                  {/* Topo do Card */}
                  <div
                    style={{
                      background: meta.softBg,
                      borderBottom: `1px solid ${meta.borderColor}`,
                      padding: '14px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          background: '#ffffff',
                          color: meta.accentColor,
                          display: 'grid',
                          placeItems: 'center',
                          border: `1px solid ${meta.borderColor}`,
                        }}
                      >
                        <Icon size={19} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {meta.shortTitle}
                          </h3>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: cfg.enabled ? '#dcfce7' : '#f1f5f9',
                              color: cfg.enabled ? '#166534' : '#64748b',
                            }}
                          >
                            {cfg.enabled ? '● DISPARO AUTOMÁTICO ATIVO' : '○ PAUSADO'}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.76rem', color: '#475569', margin: '2px 0 0' }}>
                          {meta.triggerWhen}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => restoreDefaultTemplate(triggerKey)}
                        style={{
                          background: '#ffffff',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          borderRadius: '999px',
                          padding: '6px 12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <RotateCcw size={13} /> Restaurar Padrão
                      </button>

                      <button
                        type="button"
                        disabled={sendingTest !== null}
                        onClick={() => handleSendTest(triggerKey)}
                        style={{
                          background: meta.accentColor,
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '999px',
                          padding: '6px 14px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <Send size={13} />
                        {sendingTest === triggerKey ? 'Enviando...' : 'Testar este Lembrete'}
                      </button>
                    </div>
                  </div>

                  {/* Corpo do Card: Editor à esquerda + Simulador WhatsApp à direita */}
                  <div
                    style={{
                      padding: '18px 20px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: '20px',
                      alignItems: 'start',
                    }}
                  >
                    {/* Coluna Esquerda: Editor + Variáveis */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>
                          Mensagem que será enviada ao cliente:
                        </label>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          Use <code>*texto*</code> para negrito no WhatsApp
                        </span>
                      </div>

                      <textarea
                        rows={8}
                        value={cfg.messageTemplate}
                        onChange={(e) => updateTemplateText(triggerKey, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: '14px',
                          border: '1.5px solid #cbd5e1',
                          fontSize: '0.86rem',
                          lineHeight: 1.55,
                          color: '#0f172a',
                          background: '#f8fafc',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                      />

                      {/* Chips de Variáveis Dinâmicas */}
                      <div>
                        <span style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                          Variáveis inteligentes disponíveis (clique para adicionar na mensagem):
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {defaultVars.map((v) => (
                            <button
                              key={v.key}
                              type="button"
                              onClick={() => insertVariableIntoTemplate(triggerKey, v.key)}
                              title={`Exemplo: ${v.example}`}
                              style={{
                                background: '#f1f5f9',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '4px 9px',
                                fontSize: '0.73rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <code style={{ color: meta.accentColor, fontWeight: 800 }}>{v.key}</code>
                              <span style={{ color: '#64748b', fontSize: '0.68rem' }}>({v.label})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Coluna Direita: Preview Realista do WhatsApp */}
                    <div
                      style={{
                        background: '#efeae2',
                        borderRadius: '16px',
                        padding: '14px',
                        border: '1px solid #d1d5db',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: '#075e54',
                          color: '#ffffff',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <ShieldCheck size={15} /> Prévia no WhatsApp do Cliente
                        </span>
                        <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>Simulação em Tempo Real</span>
                      </div>

                      <div
                        style={{
                          background: '#d9fdd3',
                          color: '#111b21',
                          padding: '12px 14px',
                          borderRadius: '12px 12px 12px 2px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                          fontSize: '0.83rem',
                          lineHeight: 1.5,
                          position: 'relative',
                        }}
                      >
                        {formatWhatsAppRichText(previewRendered)}
                        <div
                          style={{
                            textAlign: 'right',
                            fontSize: '0.66rem',
                            color: '#667781',
                            marginTop: '6px',
                          }}
                        >
                          15:30 ✓✓
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(previewRendered);
                          showToast('info', 'Texto da prévia copiado para a área de transferência!');
                        }}
                        style={{
                          alignSelf: 'flex-end',
                          background: 'rgba(255,255,255,0.85)',
                          color: '#334155',
                          border: '1px solid #cbd5e1',
                          borderRadius: '999px',
                          padding: '4px 10px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <Copy size={12} /> Copiar Prévia
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* =====================================================================
          SEÇÃO 3: HISTÓRICO E LOGS DE ENVIOS AUTOMÁTICOS EM TEMPO REAL
         ===================================================================== */}
      {(activeSection === 'todos' || activeSection === 'historico') && (
        <section
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  color: '#0f172a',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <History size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  3. Histórico de Disparos & Fila Automática ({logs.length})
                </h2>
                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>
                  Registro completo de todas as mensagens automáticas processadas pelo sistema.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={loadSettings}
                style={{
                  background: '#f8fafc',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '999px',
                  padding: '7px 14px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <RefreshCw size={13} /> Atualizar
              </button>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearLogs}
                  style={{
                    background: '#fef2f2',
                    color: '#b91c1c',
                    border: '1px solid #fecaca',
                    borderRadius: '999px',
                    padding: '7px 14px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Trash2 size={13} /> Limpar Histórico
                </button>
              )}
            </div>
          </div>

          {logs.length === 0 ? (
            <div
              style={{
                padding: '36px 20px',
                textAlign: 'center',
                background: '#f8fafc',
                borderRadius: '14px',
                border: '1px dashed #cbd5e1',
                color: '#64748b',
                fontSize: '0.85rem',
              }}
            >
              Nenhum disparo registrado ainda. Clique em <strong>&ldquo;Testar este Lembrete&rdquo;</strong> em qualquer card acima ou realize um agendamento/pagamento para ver o registro aqui em tempo real!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {logs.map((log) => {
                const triggerMeta =
                  log.triggerType in TRIGGER_META
                    ? TRIGGER_META[log.triggerType as WhatsappTriggerType]
                    : null;

                return (
                  <div
                    key={log.id}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '14px',
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: triggerMeta ? triggerMeta.softBg : '#e2e8f0',
                            color: triggerMeta ? triggerMeta.accentColor : '#334155',
                            border: `1px solid ${triggerMeta ? triggerMeta.borderColor : '#cbd5e1'}`,
                          }}
                        >
                          {triggerMeta ? triggerMeta.shortTitle : log.triggerType}
                        </span>
                        <strong style={{ fontSize: '0.86rem', color: '#0f172a' }}>{log.clientName}</strong>
                        <span style={{ fontSize: '0.76rem', color: '#64748b' }}>• WhatsApp: +{log.recipientPhone}</span>
                      </div>

                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: '#334155',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          marginTop: '4px',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.4,
                        }}
                      >
                        {log.messageBody}
                      </div>

                      {log.responsePreview && (
                        <span style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                          Retorno: {log.responsePreview}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: '999px',
                          background:
                            log.status === 'enviado'
                              ? '#dcfce7'
                              : log.status === 'simulado_sem_api'
                              ? '#eff6ff'
                              : '#fef2f2',
                          color:
                            log.status === 'enviado'
                              ? '#166534'
                              : log.status === 'simulado_sem_api'
                              ? '#1d4ed8'
                              : '#b91c1c',
                        }}
                      >
                        {log.status === 'enviado'
                          ? '✓ Enviado via API'
                          : log.status === 'simulado_sem_api'
                          ? '✓ Processado (Simulação)'
                          : '✕ Erro na API'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(log.createdAt))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          SEÇÃO 4: BACKUP COMPLETO DO CONSULTÓRIO (LGPD ART. 18 / 1 CLIQUE)
         ===================================================================== */}
      {(activeSection === 'todos' || activeSection === 'backup') && (
        <section
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)',
            overflow: 'hidden',
          }}
        >
          {/* Section Header */}
          <div
            style={{
              padding: '24px 28px',
              borderBottom: '1px solid #f1f5f9',
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #132f4c 0%, #1e4976 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#d4a238',
                  boxShadow: '0 4px 12px rgba(19, 47, 76, 0.25)',
                }}
              >
                <HardDrive size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#1e4976',
                      background: '#e0f2fe',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      border: '1px solid #bae6fd',
                    }}
                  >
                    Segurança & Continuidade • LGPD Art. 18
                  </span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      color: '#059669',
                      background: '#ecfdf5',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      border: '1px solid #a7f3d0',
                    }}
                  >
                    Exportação 100% Offline
                  </span>
                </div>
                <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Backup Completo do Consultório em 1 Clique
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                  Gere e baixe uma cópia integral estruturada (.JSON) contendo todos os dados clínicos, cadastros, prontuários, financeiro e anotações.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void loadBackupSummary()}
                disabled={backupLoading}
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '9px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#475569',
                  cursor: backupLoading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
                }}
                title="Recalcular totais de registros do banco"
              >
                <RefreshCw size={14} className={backupLoading ? 'animate-spin' : ''} />
                {backupLoading ? 'Atualizando...' : 'Recalcular'}
              </button>

              <button
                type="button"
                onClick={() => void handleDownloadBackup()}
                disabled={backupDownloading}
                style={{
                  background: 'linear-gradient(135deg, #132f4c 0%, #1e4976 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 20px',
                  fontSize: '0.86rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  cursor: backupDownloading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(19, 47, 76, 0.3)',
                  transition: 'all 0.2s ease',
                  opacity: backupDownloading ? 0.8 : 1,
                }}
              >
                <Download size={16} className={backupDownloading ? 'animate-bounce' : ''} />
                {backupDownloading ? 'Gerando Arquivo JSON...' : '💾 Baixar Backup Completo (.JSON)'}
              </button>
            </div>
          </div>

          {/* Cards de Métricas e Contadores em Tempo Real */}
          <div style={{ padding: '24px 28px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px',
                marginBottom: '20px',
              }}
            >
              {[
                {
                  label: 'Pacientes Cadastrados',
                  count: backupSummary?.counts.clients ?? '—',
                  detail: 'Fichas cadastrais completas',
                  bg: '#f8fafc',
                  border: '#e2e8f0',
                  accent: '#1e293b',
                },
                {
                  label: 'Prontuários & Evoluções',
                  count:
                    backupSummary
                      ? (backupSummary.counts.prontuarioRecords || 0) +
                        (backupSummary.counts.clinicalEvolutions || 0) +
                        (backupSummary.counts.treatmentGoals || 0)
                      : '—',
                  detail: `${backupSummary?.counts.clinicalEvolutions ?? 0} evoluções • ${backupSummary?.counts.treatmentGoals ?? 0} metas`,
                  bg: '#eff6ff',
                  border: '#bfdbfe',
                  accent: '#2563eb',
                },
                {
                  label: 'Agenda & Horários',
                  count:
                    backupSummary
                      ? (backupSummary.counts.appointments || 0) + (backupSummary.counts.timeBlocks || 0)
                      : '—',
                  detail: `${backupSummary?.counts.appointments ?? 0} consultas • ${backupSummary?.counts.timeBlocks ?? 0} bloqueios`,
                  bg: '#f0fdf4',
                  border: '#bbf7d0',
                  accent: '#16a34a',
                },
                {
                  label: 'Financeiro & Faturas',
                  count:
                    backupSummary
                      ? (backupSummary.counts.payments || 0) + (backupSummary.counts.expenses || 0)
                      : '—',
                  detail: `${backupSummary?.counts.payments ?? 0} recebimentos • ${backupSummary?.counts.expenses ?? 0} despesas`,
                  bg: '#fffbeb',
                  border: '#fde68a',
                  accent: '#d97706',
                },
                {
                  label: 'Caderno de Anotações',
                  count: backupSummary?.counts.notes ?? '—',
                  detail: `Em ${backupSummary?.counts.noteFolders ?? 0} pastas organizadoras`,
                  bg: '#faf5ff',
                  border: '#e9d5ff',
                  accent: '#9333ea',
                },
                {
                  label: 'Sessões em Grupo & Turmas',
                  count: backupSummary?.counts.groupSessions ?? '—',
                  detail: `${backupSummary?.counts.groupEnrollments ?? 0} inscrições registradas`,
                  bg: '#ecfeff',
                  border: '#a5f3fc',
                  accent: '#0891b2',
                },
              ].map((card, idx) => (
                <div
                  key={idx}
                  style={{
                    background: card.bg,
                    border: `1px solid ${card.border}`,
                    borderRadius: '14px',
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b' }}>{card.label}</span>
                  <div style={{ fontSize: '1.65rem', fontWeight: 900, color: card.accent, margin: '6px 0 2px 0' }}>
                    {backupLoading ? <span style={{ fontSize: '1rem', color: '#94a3b8' }}>...</span> : card.count}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{card.detail}</span>
                </div>
              ))}
            </div>

            {/* Banner de Status do Último Backup */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                background: lastBackupAt ? '#f0fdf4' : '#fffbeb',
                border: `1px solid ${lastBackupAt ? '#bbf7d0' : '#fef08a'}`,
                borderRadius: '12px',
                padding: '12px 18px',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={18} style={{ color: lastBackupAt ? '#16a34a' : '#d97706', flexShrink: 0 }} />
                <div>
                  <strong style={{ fontSize: '0.84rem', color: lastBackupAt ? '#166534' : '#854d0e' }}>
                    {lastBackupAt
                      ? `Último backup baixado neste computador: ${new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'long',
                          timeStyle: 'short',
                        }).format(new Date(lastBackupAt))}`
                      : 'Nenhum backup baixado neste navegador ainda. Recomendamos salvar uma cópia semanal.'}
                  </strong>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: lastBackupAt ? '#15803d' : '#a16207' }}>
                    O arquivo gerado é independente do servidor e pode ser arquivado em pendrive, HD externo ou nuvem pessoal.
                  </p>
                </div>
              </div>

              {lastBackupAt && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#166534',
                    background: '#dcfce7',
                    padding: '3px 10px',
                    borderRadius: '999px',
                  }}
                >
                  ✓ Cópia Salva
                </span>
              )}
            </div>

            {/* Informações Técnicas e LGPD Art. 18 */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '18px 20px',
              }}
            >
              <h4
                style={{
                  margin: '0 0 10px 0',
                  fontSize: '0.86rem',
                  fontWeight: 800,
                  color: '#1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <ShieldCheck size={16} color="#132f4c" />
                Segurança, Sigilo Profissional e Conformidade LGPD
              </h4>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '14px',
                  fontSize: '0.78rem',
                  color: '#475569',
                  lineHeight: 1.5,
                }}
              >
                <div>
                  <strong style={{ color: '#0f172a', display: 'block', marginBottom: '2px' }}>
                    🔒 Portabilidade e Propriedade Total dos Dados
                  </strong>
                  Em atendimento ao Art. 18, inciso V da Lei Geral de Proteção de Dados (LGPD 13.709/2018), você possui o direito e o controle integral de portabilidade dos seus dados e dos seus pacientes a qualquer momento, sem retenção ou lock-in proprietário.
                </div>

                <div>
                  <strong style={{ color: '#0f172a', display: 'block', marginBottom: '2px' }}>
                    📑 Formato Universal e Aberto (.JSON)
                  </strong>
                  Os dados são salvos em formato JSON estruturado, UTF-8 legível por qualquer computador, banco de dados ou ferramenta de migração, preservando datas originais, relacionamentos entre atendimentos e histórico cronológico.
                </div>

                <div>
                  <strong style={{ color: '#0f172a', display: 'block', marginBottom: '2px' }}>
                    🛡️ Higienização e Proteção de Credenciais
                  </strong>
                  Senhas de acesso de clientes e chaves secretas de APIs externas são automaticamente ofuscadas/sanitizadas antes da geração do arquivo, garantindo conformidade rigorosa com normas de segurança cibernética.
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
      {dialogNode}
    </div>
  );
}

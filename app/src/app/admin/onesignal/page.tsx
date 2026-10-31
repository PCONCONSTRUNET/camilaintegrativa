'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BellRing,
  Radio,
  Send,
  Sparkles,
  ShieldCheck,
  Copy,
  Check,
  RefreshCw,
  Users,
  Search,
  Laptop,
  History,
  Calendar,
  DollarSign,
  AlertTriangle,
  Clock,
  ExternalLink,
  Edit3,
  RotateCcw,
  Sliders,
  CheckCircle2,
  Info,
  Power,
  Play,
  Heart,
} from 'lucide-react';
import {
  getOneSignalPushStatus,
  requestOneSignalPushPermission,
} from '@/components/onesignal-init';
import type { PushRuleConfig } from '@/lib/push-configs';
import type { PushNotificationLog } from '@/lib/onesignal';
import type { ClientSummary } from '@/lib/domain';

type ActiveTab = 'admin-config' | 'client-config' | 'manual' | 'logs';

export default function OneSignalAdminPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('admin-config');
  const [loading, setLoading] = useState(true);
  const [submittingManual, setSubmittingManual] = useState(false);
  const [testingLocal, setTestingLocal] = useState(false);
  const [testingRuleKey, setTestingRuleKey] = useState<string | null>(null);
  const [savingRuleKey, setSavingRuleKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Regras de Push configuradas
  const [rules, setRules] = useState<PushRuleConfig[]>([]);
  const [editingRuleKey, setEditingRuleKey] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMessage, setDraftMessage] = useState('');

  // Dados gerais do OneSignal
  const [appId, setAppId] = useState('d1a83484-dce6-45f0-880f-15f3d8235d4c');
  const [logs, setLogs] = useState<PushNotificationLog[]>([]);
  const [stats, setStats] = useState({
    totalDispatches: 0,
    totalSent: 0,
    totalFailed: 0,
    totalRecipients: 0,
  });

  // Clientes para envio manual
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientSearch, setClientSearch] = useState('');

  // Status local do navegador
  const [localPushStatus, setLocalPushStatus] = useState<{
    supported: boolean;
    permission: boolean;
  }>({ supported: false, permission: false });

  // Formulário manual
  const [targetType, setTargetType] = useState<'all' | 'admins' | 'clients' | 'client'>('all');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [manualUrl, setManualUrl] = useState('/');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setFeedback({ type, message: msg });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === msg ? null : prev));
    }, 5000);
  }, []);

  // Carregar regras e dados
  const loadData = useCallback(async () => {
    try {
      const [configsRes, onesignalRes, clientsRes] = await Promise.allSettled([
        fetch('/api/admin/onesignal/configs'),
        fetch('/api/admin/onesignal'),
        fetch('/api/admin/clients?status=todos'),
      ]);

      if (configsRes.status === 'fulfilled' && configsRes.value.ok) {
        const data = await configsRes.value.json().catch(() => ({}));
        if (data.configs) setRules(data.configs);
      }

      if (onesignalRes.status === 'fulfilled' && onesignalRes.value.ok) {
        const data = await onesignalRes.value.json().catch(() => ({}));
        setAppId(data.appId || 'd1a83484-dce6-45f0-880f-15f3d8235d4c');
        setLogs(data.logs || []);
        if (data.stats) setStats(data.stats);
      }

      if (clientsRes.status === 'fulfilled' && clientsRes.value.ok) {
        const clientsData = await clientsRes.value.json().catch(() => ({}));
        if (clientsData.clients) setClients(clientsData.clients);
      }
    } catch (err) {
      console.warn('[OneSignal Admin] Aviso ao atualizar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    void checkLocalStatus();
  }, [loadData]);

  async function checkLocalStatus() {
    const status = await getOneSignalPushStatus();
    setLocalPushStatus(status);
  }

  async function handleActivateLocalPush() {
    setTestingLocal(true);
    try {
      const res = await requestOneSignalPushPermission({
        role: 'admin',
        userId: 'admin_camila_machado',
        name: 'Camila Machado (Admin)',
      });
      const granted = typeof res === 'boolean' ? res : res.granted;
      if (granted) {
        showToast('success', '✓ Notificações Push ativadas com sucesso neste aparelho!');
        setLocalPushStatus({ supported: true, permission: true });
      } else {
        showToast('info', 'Permissão de notificação negada ou fechada no navegador.');
      }
    } catch {
      showToast('error', 'Erro ao solicitar permissão no navegador.');
    } finally {
      setTestingLocal(false);
    }
  }

  // Ligar/Desligar uma regra
  async function handleToggleRule(rule: PushRuleConfig) {
    const newEnabled = !rule.enabled;
    setRules((prev) =>
      prev.map((r) => (r.key === rule.key ? { ...r, enabled: newEnabled } : r))
    );

    try {
      const res = await fetch('/api/admin/onesignal/configs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: rule.key, enabled: newEnabled }),
      });
      if (!res.ok) throw new Error('Falha ao salvar status');
      showToast(
        newEnabled ? 'success' : 'info',
        newEnabled
          ? `✓ Notificação "${rule.label}" ativada!`
          : `Notificação "${rule.label}" desativada com sucesso.`
      );
    } catch {
      // Reverter
      setRules((prev) =>
        prev.map((r) => (r.key === rule.key ? { ...r, enabled: rule.enabled } : r))
      );
      showToast('error', 'Erro ao atualizar notificação.');
    }
  }

  // Iniciar edição de texto da regra
  function handleStartEdit(rule: PushRuleConfig) {
    setEditingRuleKey(rule.key);
    setDraftTitle(rule.title);
    setDraftMessage(rule.message);
  }

  function handleCancelEdit() {
    setEditingRuleKey(null);
    setDraftTitle('');
    setDraftMessage('');
  }

  // Salvar novo texto da regra
  async function handleSaveEdit(ruleKey: string) {
    setSavingRuleKey(ruleKey);
    try {
      const res = await fetch('/api/admin/onesignal/configs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: ruleKey,
          title: draftTitle,
          message: draftMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');

      setRules((prev) =>
        prev.map((r) =>
          r.key === ruleKey
            ? { ...r, title: draftTitle.trim(), message: draftMessage.trim() }
            : r
        )
      );
      setEditingRuleKey(null);
      showToast('success', '✓ Mensagem configurada com sucesso!');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao salvar alterações.');
    } finally {
      setSavingRuleKey(null);
    }
  }

  // Restaurar mensagem padrão da regra
  async function handleResetDefault(rule: PushRuleConfig) {
    setSavingRuleKey(rule.key);
    try {
      const res = await fetch('/api/admin/onesignal/configs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: rule.key,
          title: rule.defaultTitle,
          message: rule.defaultMessage,
        }),
      });
      if (!res.ok) throw new Error('Erro ao restaurar');

      setRules((prev) =>
        prev.map((r) =>
          r.key === rule.key
            ? { ...r, title: r.defaultTitle, message: r.defaultMessage }
            : r
        )
      );
      if (editingRuleKey === rule.key) {
        setDraftTitle(rule.defaultTitle);
        setDraftMessage(rule.defaultMessage);
      }
      showToast('success', `✓ Mensagem de "${rule.label}" restaurada para o padrão!`);
    } catch {
      showToast('error', 'Erro ao restaurar mensagem padrão.');
    } finally {
      setSavingRuleKey(null);
    }
  }

  // Testar/Simular disparo da regra no aparelho
  async function handleTestRule(ruleKey: string) {
    setTestingRuleKey(ruleKey);
    try {
      const res = await fetch('/api/admin/onesignal/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ruleKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao simular');

      showToast('success', '✓ Notificação push de teste enviada! Veja na sua tela.');
      void loadData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Falha ao testar notificação.');
    } finally {
      setTestingRuleKey(null);
    }
  }

  // Envio manual
  async function handleSubmitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manualTitle.trim() || !manualMessage.trim()) {
      showToast('error', 'Preencha o título e a mensagem.');
      return;
    }
    if (targetType === 'client' && !selectedClientId) {
      showToast('error', 'Selecione o paciente.');
      return;
    }

    setSubmittingManual(true);
    try {
      const res = await fetch('/api/admin/onesignal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: manualTitle.trim(),
          message: manualMessage.trim(),
          url: manualUrl.trim() || '/',
          targetType,
          clientId: targetType === 'client' ? selectedClientId : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao disparar push');

      showToast('success', `✓ Push disparado com sucesso! (${data.recipients || 0} aparelhos alcançados)`);
      setManualTitle('');
      setManualMessage('');
      setManualUrl('/');
      void loadData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Falha ao enviar push manual.');
    } finally {
      setSubmittingManual(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2500);
  }

  const adminRules = useMemo(() => rules.filter((r) => r.category === 'admin'), [rules]);
  const clientRules = useMemo(() => rules.filter((r) => r.category === 'client'), [rules]);

  const activeAdminCount = adminRules.filter((r) => r.enabled).length;
  const activeClientCount = clientRules.filter((r) => r.enabled).length;

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) => c.name.toLowerCase().includes(q) || (c.cpf && c.cpf.includes(q))).slice(0, 8);
  }, [clients, clientSearch]);

  const selectedClientObj = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  return (
    <div style={{ padding: '24px 20px 60px', maxWidth: '1240px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Toast Feedback */}
      {feedback && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            background: feedback.type === 'success' ? '#065f46' : feedback.type === 'error' ? '#991b1b' : '#1e293b',
            color: '#ffffff',
            padding: '14px 20px',
            borderRadius: '14px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.88rem',
            fontWeight: 700,
          }}
        >
          <Sparkles size={18} />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', background: '#ecfdf5', color: '#0f766e', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
            <Radio size={13} /> Central OneSignal & Automação de Push
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Configuração de Notificações Push
          </h1>
          <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '4px 0 0' }}>
            Ative, desative e personalize cada uma das notificações automáticas da administração e dos pacientes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => { void loadData(); void checkLocalStatus(); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: '#ffffff',
            border: '1.5px solid #cbd5e1',
            borderRadius: '10px',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} /> Atualizar Status
        </button>
      </div>

      {/* Card de Status do Aparelho da Admin */}
      <div style={{ background: '#ffffff', borderRadius: '18px', border: '1.5px solid #e2e8f0', padding: '18px 22px', boxShadow: '0 4px 12px rgba(15,23,42,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: localPushStatus.permission ? '#ecfdf5' : '#fee2e2', color: localPushStatus.permission ? '#0f766e' : '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Laptop size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>Recebimento Neste Aparelho</strong>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: localPushStatus.permission ? '#dcfce7' : '#fee2e2', color: localPushStatus.permission ? '#15803d' : '#b91c1c' }}>
                {localPushStatus.permission ? '🟢 Ativo (Pronto)' : '🔴 Não Autorizado'}
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>
              {localPushStatus.permission
                ? 'Este navegador está conectado como Administração da clínica para receber avisos em tempo real.'
                : 'Clique no botão ao lado para autorizar o recebimento de notificações neste celular ou computador.'}
            </p>
          </div>
        </div>

        {!localPushStatus.permission && (
          <button
            type="button"
            onClick={() => void handleActivateLocalPush()}
            disabled={testingLocal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              background: '#0f766e',
              color: '#ffffff',
              fontSize: '0.82rem',
              fontWeight: 800,
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(15, 118, 110, 0.3)',
            }}
          >
            <BellRing size={15} /> Ativar Notificações no Aparelho
          </button>
        )}
      </div>

      {/* ABAS PRINCIPAIS */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          background: '#f1f5f9',
          padding: '6px',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('admin-config')}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '11px 16px',
            borderRadius: '10px',
            fontSize: '0.88rem',
            fontWeight: 800,
            border: 'none',
            background: activeTab === 'admin-config' ? '#ffffff' : 'transparent',
            color: activeTab === 'admin-config' ? '#0f766e' : '#64748b',
            boxShadow: activeTab === 'admin-config' ? '0 2px 8px rgba(15,23,42,0.08)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <ShieldCheck size={17} /> Notificações da Administração
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 800,
              background: activeTab === 'admin-config' ? '#ecfdf5' : '#e2e8f0',
              color: activeTab === 'admin-config' ? '#0f766e' : '#475569',
            }}
          >
            {activeAdminCount}/{adminRules.length} ativas
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('client-config')}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '11px 16px',
            borderRadius: '10px',
            fontSize: '0.88rem',
            fontWeight: 800,
            border: 'none',
            background: activeTab === 'client-config' ? '#ffffff' : 'transparent',
            color: activeTab === 'client-config' ? '#0f766e' : '#64748b',
            boxShadow: activeTab === 'client-config' ? '0 2px 8px rgba(15,23,42,0.08)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Users size={17} /> Notificações dos Pacientes
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 800,
              background: activeTab === 'client-config' ? '#eff6ff' : '#e2e8f0',
              color: activeTab === 'client-config' ? '#1d4ed8' : '#475569',
            }}
          >
            {activeClientCount}/{clientRules.length} ativas
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '11px 16px',
            borderRadius: '10px',
            fontSize: '0.88rem',
            fontWeight: 800,
            border: 'none',
            background: activeTab === 'manual' ? '#ffffff' : 'transparent',
            color: activeTab === 'manual' ? '#0f766e' : '#64748b',
            boxShadow: activeTab === 'manual' ? '0 2px 8px rgba(15,23,42,0.08)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Send size={16} /> Disparo Manual
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          style={{
            flex: 0.8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '11px 16px',
            borderRadius: '10px',
            fontSize: '0.88rem',
            fontWeight: 800,
            border: 'none',
            background: activeTab === 'logs' ? '#ffffff' : 'transparent',
            color: activeTab === 'logs' ? '#0f766e' : '#64748b',
            boxShadow: activeTab === 'logs' ? '0 2px 8px rgba(15,23,42,0.08)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <History size={16} /> Histórico ({logs.length})
        </button>
      </div>

      {/* ABA 1: CONFIGURAÇÃO DE PUSH DA ADMINISTRAÇÃO */}
      {activeTab === 'admin-config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={22} color="#15803d" />
              <div>
                <strong style={{ fontSize: '0.92rem', color: '#166534', display: 'block' }}>
                  Alertas em Tempo Real para a Camila (Proprietária / Admin)
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#15803d' }}>
                  Ligue ou desligue qualquer notificação abaixo. Ao desmarcar o botão, a clínica deixa de receber o push correspondente.
                </span>
              </div>
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#166534' }}>
              {activeAdminCount} de {adminRules.length} alertas ligados
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {adminRules.map((rule) => {
              const isEditing = editingRuleKey === rule.key;

              return (
                <div
                  key={rule.key}
                  style={{
                    background: '#ffffff',
                    borderRadius: '18px',
                    border: rule.enabled ? '1.5px solid #cbd5e1' : '1.5px dashed #cbd5e1',
                    padding: '20px',
                    boxShadow: '0 4px 12px rgba(15,23,42,0.03)',
                    opacity: rule.enabled ? 1 : 0.75,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          {rule.label}
                        </h3>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: rule.enabled ? '#dcfce7' : '#f1f5f9',
                            color: rule.enabled ? '#15803d' : '#64748b',
                          }}
                        >
                          {rule.enabled ? '✓ Notificação Ativada' : 'Desativada'}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>
                        {rule.description}
                      </p>
                    </div>

                    {/* BOTÃO SWITCH LIGAR/DESLIGAR */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: rule.enabled ? '#0f766e' : '#94a3b8' }}>
                          {rule.enabled ? 'Ligado' : 'Desligado'}
                        </span>
                        <div
                          onClick={() => void handleToggleRule(rule)}
                          style={{
                            width: '48px',
                            height: '26px',
                            background: rule.enabled ? '#0f766e' : '#cbd5e1',
                            borderRadius: '999px',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background 0.2s ease',
                          }}
                        >
                          <div
                            style={{
                              width: '20px',
                              height: '20px',
                              background: '#ffffff',
                              borderRadius: '50%',
                              position: 'absolute',
                              top: '3px',
                              left: rule.enabled ? '25px' : '3px',
                              transition: 'left 0.2s ease',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            }}
                          />
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* VISUALIZAÇÃO / EDIÇÃO DO TEXTO */}
                  {!isEditing ? (
                    <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                          Mensagem que aparece na tela:
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(rule)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#334155',
                              cursor: 'pointer',
                            }}
                          >
                            <Edit3 size={13} /> Personalizar Mensagem
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleTestRule(rule.key)}
                            disabled={testingRuleKey === rule.key}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              background: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#0f766e',
                              cursor: 'pointer',
                            }}
                          >
                            <Play size={12} /> {testingRuleKey === rule.key ? 'Enviando...' : 'Testar no Aparelho'}
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                        {rule.title}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.4 }}>
                        {rule.message}
                      </div>
                    </div>
                  ) : (
                    /* MODO DE EDIÇÃO */
                    <div style={{ background: '#f0fdf4', borderRadius: '14px', border: '1.5px solid #86efac', padding: '16px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#166534', display: 'block', marginBottom: '10px' }}>
                        ✏️ Editando Mensagem de "{rule.label}":
                      </span>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                            Título da Notificação:
                          </label>
                          <input
                            type="text"
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                            Texto da Mensagem:
                          </label>
                          <textarea
                            value={draftMessage}
                            onChange={(e) => setDraftMessage(e.target.value)}
                            rows={2}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '0.82rem',
                              fontFamily: 'inherit',
                            }}
                          />
                        </div>
                      </div>

                      {/* Variáveis disponíveis */}
                      <div style={{ marginBottom: '14px' }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                          Variáveis dinâmicas que você pode usar:
                        </span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {rule.variables.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setDraftMessage((prev) => `${prev} ${v}`)}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.72rem',
                                color: '#0f766e',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              + {v}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(rule.key)}
                          disabled={savingRuleKey === rule.key}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: '#0f766e',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {savingRuleKey === rule.key ? 'Salvando...' : '✓ Salvar Alterações'}
                        </button>

                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#475569',
                            cursor: 'pointer',
                          }}
                        >
                          Cancelar
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleResetDefault(rule)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#dc2626',
                            cursor: 'pointer',
                            marginLeft: 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <RotateCcw size={13} /> Restaurar Padrão
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABA 2: CONFIGURAÇÃO DE PUSH DOS PACIENTES */}
      {activeTab === 'client-config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '16px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Users size={22} color="#1d4ed8" />
              <div>
                <strong style={{ fontSize: '0.92rem', color: '#1e40af', display: 'block' }}>
                  Notificações Push Automáticas para os Pacientes
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#1d4ed8' }}>
                  Controle quais avisos e lembretes a clínica dispara automaticamente para a tela dos celulares dos pacientes cadastrados.
                </span>
              </div>
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e40af' }}>
              {activeClientCount} de {clientRules.length} mensagens ativas
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {clientRules.map((rule) => {
              const isEditing = editingRuleKey === rule.key;

              return (
                <div
                  key={rule.key}
                  style={{
                    background: '#ffffff',
                    borderRadius: '18px',
                    border: rule.enabled ? '1.5px solid #cbd5e1' : '1.5px dashed #cbd5e1',
                    padding: '20px',
                    boxShadow: '0 4px 12px rgba(15,23,42,0.03)',
                    opacity: rule.enabled ? 1 : 0.75,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          {rule.label}
                        </h3>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: rule.enabled ? '#eff6ff' : '#f1f5f9',
                            color: rule.enabled ? '#1d4ed8' : '#64748b',
                          }}
                        >
                          {rule.enabled ? '✓ Notificação Ativada' : 'Desativada'}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>
                        {rule.description}
                      </p>
                    </div>

                    {/* BOTÃO SWITCH LIGAR/DESLIGAR */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: rule.enabled ? '#1d4ed8' : '#94a3b8' }}>
                          {rule.enabled ? 'Ligado' : 'Desligado'}
                        </span>
                        <div
                          onClick={() => void handleToggleRule(rule)}
                          style={{
                            width: '48px',
                            height: '26px',
                            background: rule.enabled ? '#1d4ed8' : '#cbd5e1',
                            borderRadius: '999px',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background 0.2s ease',
                          }}
                        >
                          <div
                            style={{
                              width: '20px',
                              height: '20px',
                              background: '#ffffff',
                              borderRadius: '50%',
                              position: 'absolute',
                              top: '3px',
                              left: rule.enabled ? '25px' : '3px',
                              transition: 'left 0.2s ease',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            }}
                          />
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* VISUALIZAÇÃO / EDIÇÃO DO TEXTO */}
                  {!isEditing ? (
                    <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                          Mensagem que o paciente recebe no celular:
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(rule)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#334155',
                              cursor: 'pointer',
                            }}
                          >
                            <Edit3 size={13} /> Personalizar Mensagem
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleTestRule(rule.key)}
                            disabled={testingRuleKey === rule.key}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              borderRadius: '6px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              color: '#1d4ed8',
                              cursor: 'pointer',
                            }}
                          >
                            <Play size={12} /> {testingRuleKey === rule.key ? 'Enviando...' : 'Testar no Aparelho'}
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                        {rule.title}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.4 }}>
                        {rule.message}
                      </div>
                    </div>
                  ) : (
                    /* MODO DE EDIÇÃO DO PACIENTE */
                    <div style={{ background: '#eff6ff', borderRadius: '14px', border: '1.5px solid #93c5fd', padding: '16px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e40af', display: 'block', marginBottom: '10px' }}>
                        ✏️ Editando Mensagem para o Paciente ("{rule.label}"):
                      </span>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                            Título da Notificação:
                          </label>
                          <input
                            type="text"
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                            Texto da Mensagem:
                          </label>
                          <textarea
                            value={draftMessage}
                            onChange={(e) => setDraftMessage(e.target.value)}
                            rows={2}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #cbd5e1',
                              fontSize: '0.82rem',
                              fontFamily: 'inherit',
                            }}
                          />
                        </div>
                      </div>

                      {/* Variáveis disponíveis */}
                      <div style={{ marginBottom: '14px' }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                          Variáveis do Paciente:
                        </span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {rule.variables.map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setDraftMessage((prev) => `${prev} ${v}`)}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.72rem',
                                color: '#1d4ed8',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              + {v}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(rule.key)}
                          disabled={savingRuleKey === rule.key}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            background: '#1d4ed8',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {savingRuleKey === rule.key ? 'Salvando...' : '✓ Salvar Mensagem'}
                        </button>

                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#475569',
                            cursor: 'pointer',
                          }}
                        >
                          Cancelar
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleResetDefault(rule)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#dc2626',
                            cursor: 'pointer',
                            marginLeft: 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <RotateCcw size={13} /> Restaurar Padrão
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABA 3: DISPARAR MENSAGEM MANUAL */}
      {activeTab === 'manual' && (
        <div style={{ background: '#ffffff', borderRadius: '20px', border: '1.5px solid #e2e8f0', padding: '24px', boxShadow: '0 6px 18px rgba(15,23,42,0.04)' }}>
          <div style={{ marginBottom: '18px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
              Enviar Notificação Push Manual (Campanhas & Comunicados)
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
              Dispare um aviso imediato que aparecerá na tela dos celulares cadastrados.
            </p>
          </div>

          <form onSubmit={handleSubmitManual} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Destinatários */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                Destinatários do Push:
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: '👥 Todos os Inscritos' },
                  { id: 'clients', label: '👤 Somente Pacientes' },
                  { id: 'admins', label: '🛡️ Somente Administradores' },
                  { id: 'client', label: '🎯 Paciente Específico' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTargetType(t.id as any)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '999px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      border: targetType === t.id ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
                      background: targetType === t.id ? '#ecfdf5' : '#ffffff',
                      color: targetType === t.id ? '#0f766e' : '#475569',
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Paciente Específico */}
            {targetType === 'client' && (
              <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '12px', border: '1.5px solid #cbd5e1' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: '6px' }}>
                  Pesquisar Paciente:
                </span>
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Buscar por nome ou CPF..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.85rem',
                    marginBottom: '8px',
                  }}
                />
                {selectedClientObj && (
                  <div style={{ marginBottom: '8px', padding: '6px 10px', background: '#ecfdf5', borderRadius: '6px', color: '#0f766e', fontSize: '0.8rem', fontWeight: 700 }}>
                    ✓ Paciente selecionado: {selectedClientObj.name} ({selectedClientObj.phone})
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '6px' }}>
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedClientId(c.id)}
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: selectedClientId === c.id ? '1.5px solid #0f766e' : '1px solid #e2e8f0',
                        background: selectedClientId === c.id ? '#dcfce7' : '#ffffff',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      <strong>{c.name}</strong>
                      <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{c.phone}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Título */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                Título do Push *
              </label>
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Ex.: ✨ Nova Sessão em Grupo Confirmada!"
                required
                maxLength={80}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
              />
            </div>

            {/* Mensagem */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                Mensagem do Push *
              </label>
              <textarea
                value={manualMessage}
                onChange={(e) => setManualMessage(e.target.value)}
                placeholder="Digite a mensagem que aparecerá na tela..."
                rows={3}
                required
                maxLength={240}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.88rem',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Link */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                Link de Destino ao Clicar (Opcional):
              </label>
              <input
                type="text"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="Ex.: /agendar ou /cliente"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={submittingManual}
              style={{
                padding: '12px 22px',
                borderRadius: '12px',
                background: '#0f766e',
                color: '#ffffff',
                fontSize: '0.92rem',
                fontWeight: 800,
                border: 'none',
                cursor: submittingManual ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(15, 118, 110, 0.35)',
              }}
            >
              <Send size={16} />
              {submittingManual ? 'Disparando...' : 'Disparar Notificação Push Agora'}
            </button>
          </form>
        </div>
      )}

      {/* ABA 4: HISTÓRICO DE DISPAROS */}
      {activeTab === 'logs' && (
        <div style={{ background: '#ffffff', borderRadius: '20px', border: '1.5px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: '0 0 14px' }}>
            Histórico dos Últimos Envios
          </h3>

          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b', fontSize: '0.88rem' }}>
              Nenhum disparo de push registrado ainda.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '8px 10px' }}>Data / Hora</th>
                    <th style={{ padding: '8px 10px' }}>Destinatários</th>
                    <th style={{ padding: '8px 10px' }}>Título & Mensagem</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px' }}>Alcance</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 10px', whiteSpace: 'nowrap', color: '#64748b' }}>
                        {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(log.createdAt))}
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#334155', fontWeight: 700, fontSize: '0.74rem' }}>
                          {log.targetType === 'all' ? 'Todos' : log.targetType === 'admins' ? 'Admins' : log.targetType === 'clients' ? 'Pacientes' : 'Específico'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <strong style={{ color: '#0f172a', display: 'block' }}>{log.title}</strong>
                        <span style={{ color: '#64748b', fontSize: '0.76rem' }}>{log.message}</span>
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: log.status === 'enviado' ? '#dcfce7' : '#fee2e2', color: log.status === 'enviado' ? '#15803d' : '#b91c1c', fontWeight: 800, fontSize: '0.72rem' }}>
                          {log.status === 'enviado' ? '✓ Enviado' : 'Erro'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 10px', fontWeight: 800, color: '#0f172a' }}>
                        {log.recipientsCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

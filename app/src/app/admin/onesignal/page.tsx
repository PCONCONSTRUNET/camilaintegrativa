'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BellRing,
  Radio,
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ShieldCheck,
  Copy,
  Check,
  RefreshCw,
  Clock,
  ExternalLink,
  Users,
  Search,
  Laptop,
} from 'lucide-react';
import {
  getOneSignalPushStatus,
  requestOneSignalPushPermission,
} from '@/components/onesignal-init';
import type { PushNotificationLog } from '@/lib/onesignal';
import type { ClientSummary } from '@/lib/domain';

export default function OneSignalAdminPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testingLocal, setTestingLocal] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Dados do OneSignal da API
  const [appId, setAppId] = useState('d1a83484-dce6-45f0-880f-15f3d8235d4c');
  const [apiKeyPreview, setApiKeyPreview] = useState('');
  const [logs, setLogs] = useState<PushNotificationLog[]>([]);
  const [stats, setStats] = useState({
    totalDispatches: 0,
    totalSent: 0,
    totalFailed: 0,
    totalRecipients: 0,
  });

  // Clientes para filtro específico
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [clientSearch, setClientSearch] = useState('');

  // Status local do navegador
  const [localPushStatus, setLocalPushStatus] = useState<{
    supported: boolean;
    permission: boolean;
  }>({ supported: false, permission: false });

  // Formulário de envio
  const [targetType, setTargetType] = useState<'all' | 'admins' | 'clients' | 'client'>('all');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetUrl, setTargetUrl] = useState('/');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setFeedback({ type, message: msg });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === msg ? null : prev));
    }, 5000);
  }, []);

  // Carregar dados
  const loadData = useCallback(async () => {
    try {
      const [res, clientsRes] = await Promise.allSettled([
        fetch('/api/admin/onesignal'),
        fetch('/api/admin/clients?status=todos'),
      ]);

      if (res.status === 'fulfilled' && res.value.ok) {
        const data = await res.value.json().catch(() => ({}));
        setAppId(data.appId || 'd1a83484-dce6-45f0-880f-15f3d8235d4c');
        setApiKeyPreview(data.apiKeyPreview || '');
        setLogs(data.logs || []);
        if (data.stats) setStats(data.stats);
      }

      if (clientsRes.status === 'fulfilled' && clientsRes.value.ok) {
        const clientsData = await clientsRes.value.json().catch(() => ({}));
        if (clientsData.clients) {
          setClients(clientsData.clients);
        }
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
      const granted = await requestOneSignalPushPermission({
        role: 'admin',
        userId: 'admin_camila_machado',
        name: 'Camila Machado (Admin)',
      });
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

  async function handleSendTestPush() {
    setTestingLocal(true);
    try {
      const res = await fetch('/api/admin/onesignal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🔔 Teste de Notificação OneSignal',
          message: 'Seu sistema está pronto para enviar notificações push em tempo real no PWA!',
          url: '/admin/onesignal',
          targetType: 'admins',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar teste');
      showToast('success', '✓ Notificação Push de teste enviada!');
      void loadData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao disparar teste.');
    } finally {
      setTestingLocal(false);
    }
  }

  async function handleSubmitPush(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      showToast('error', 'Preencha o título e a mensagem da notificação.');
      return;
    }
    if (targetType === 'client' && !selectedClientId) {
      showToast('error', 'Selecione o paciente destinatário.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/onesignal/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          url: targetUrl.trim() || '/',
          targetType,
          clientId: targetType === 'client' ? selectedClientId : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao disparar notificação.');

      showToast('success', `✓ Notificação disparada com sucesso! (${data.recipients || 0} aparelhos alcançados)`);
      setTitle('');
      setMessage('');
      setTargetUrl('/');
      void loadData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Falha ao disparar push.');
    } finally {
      setSubmitting(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2500);
  }

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
            <Radio size={13} /> OneSignal Web Push & PWA
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Central de Notificações Push (OneSignal)
          </h1>
          <p style={{ fontSize: '0.86rem', color: '#64748b', margin: '4px 0 0' }}>
            Envie alertas instantâneos direto na tela de celulares e computadores de pacientes e da clínica, mesmo com o navegador fechado.
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

      {/* Grid Superior: Ativação Local + KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Card 1: Ativação Neste Aparelho */}
        <div style={{ background: '#ffffff', borderRadius: '18px', border: '1.5px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Laptop size={17} color="#0f766e" /> Notificações Neste Aparelho
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '6px',
                background: localPushStatus.permission ? '#dcfce7' : '#fee2e2',
                color: localPushStatus.permission ? '#15803d' : '#b91c1c',
              }}
            >
              {localPushStatus.permission ? '✓ Ativas' : 'Inativas'}
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 16px', lineHeight: 1.4 }}>
            {localPushStatus.permission
              ? 'Este navegador está conectado com sucesso como Administrador da clínica e pronto para receber notificações de novos agendamentos e mensagens.'
              : 'Clique no botão abaixo para autorizar o recebimento de notificações push nativas neste aparelho ao utilizar o sistema ou PWA.'}
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {!localPushStatus.permission ? (
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
                <BellRing size={15} /> Ativar Notificações Push
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSendTestPush()}
                disabled={testingLocal}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 16px',
                  background: '#f8fafc',
                  color: '#0f766e',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  borderRadius: '10px',
                  border: '1.5px solid #0f766e',
                  cursor: 'pointer',
                }}
              >
                <Send size={14} /> Testar Notificação Push
              </button>
            )}
          </div>
        </div>

        {/* Card 2: Credenciais & Status OneSignal */}
        <div style={{ background: '#ffffff', borderRadius: '18px', border: '1.5px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={17} color="#2563eb" /> Conexão & Chaves OneSignal
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#dcfce7', color: '#15803d' }}>
              🟢 Conectado
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>App ID:</span>
                <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{appId}</strong>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(appId, 'appId')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f766e' }}
                title="Copiar App ID"
              >
                {copiedKey === 'appId' ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Service Worker:</span>
                <strong style={{ color: '#15803d' }}>/OneSignalSDKWorker.js (Ativo no PWA)</strong>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>SDK v16</span>
            </div>
          </div>
        </div>

        {/* Card 3: Métricas Rápidas */}
        <div style={{ background: '#ffffff', borderRadius: '18px', border: '1.5px solid #e2e8f0', padding: '20px', boxShadow: '0 4px 12px rgba(15,23,42,0.04)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
            <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Disparos Push</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>{stats.totalDispatches}</div>
            <span style={{ fontSize: '0.72rem', color: '#166534' }}>{stats.totalSent} entregues</span>
          </div>
          <div style={{ background: '#eff6ff', padding: '14px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
            <span style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>Alcance Total</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1d4ed8', marginTop: '2px' }}>{stats.totalRecipients}</div>
            <span style={{ fontSize: '0.72rem', color: '#1e40af' }}>aparelhos notificados</span>
          </div>
        </div>
      </div>

      {/* Disparador de Notificações Push */}
      <div style={{ background: '#ffffff', borderRadius: '20px', border: '1.5px solid #e2e8f0', padding: '24px', boxShadow: '0 6px 18px rgba(15,23,42,0.04)' }}>
        <div style={{ marginBottom: '18px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
            Enviar Notificação Push Manual (Campanhas & Avisos)
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
            Dispare um comunicado instantâneo que saltará na tela dos celulares e computadores cadastrados.
          </p>
        </div>

        <form onSubmit={handleSubmitPush} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Destinatários */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
              Destinatários do Push:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: '👥 Todos os Aparelhos Inscritos' },
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
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selecionar Paciente Específico se target === client */}
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
                    <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{c.phone} {c.cpf ? `· CPF ${c.cpf}` : ''}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sugestões Rápidas de Título */}
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '6px' }}>
              Modelos Rápidos de Notificação:
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { t: '✨ Novas Vagas em Sessão Coletiva', m: 'Confira os novos horários abertos para sessões em grupo no Espaço Camila Machado.', u: '/agendar' },
                { t: '🌿 Lembrete de Cuidado & Bem-Estar', m: 'Reserve um momento do seu dia para respirar fundo e cuidar das suas emoções.', u: '/cliente' },
                { t: '📅 Horários Disponíveis para esta Semana', m: 'Alguns horários para atendimento presencial e online abriram na agenda. Reserve o seu!', u: '/agendar' },
              ].map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setTitle(sug.t); setMessage(sug.m); setTargetUrl(sug.u); }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  {sug.t}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
              Título do Push *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
                outline: 'none',
              }}
            />
          </div>

          {/* Mensagem */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                Mensagem do Push *
              </label>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{message.length}/240 caracteres</span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite o texto da notificação que aparecerá na tela do celular..."
              rows={3}
              required
              maxLength={240}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.88rem',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Link de destino */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
              Link de Destino ao Clicar (Opcional):
            </label>
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
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
            disabled={submitting}
            style={{
              padding: '12px 22px',
              borderRadius: '12px',
              background: '#0f766e',
              color: '#ffffff',
              fontSize: '0.92rem',
              fontWeight: 800,
              border: 'none',
              cursor: submitting ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(15, 118, 110, 0.35)',
            }}
          >
            <Send size={16} />
            {submitting ? 'Disparando Notificação Push...' : 'Disparar Notificação Push Agora'}
          </button>
        </form>
      </div>

      {/* Histórico de Envios */}
      <div style={{ background: '#ffffff', borderRadius: '20px', border: '1.5px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: '0 0 14px' }}>
          Histórico dos Últimos Envios
        </h3>

        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b', fontSize: '0.88rem' }}>
            Nenhum disparo de push registrado ainda. Envie seu primeiro teste acima!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '8px 10px' }}>Data / Hora</th>
                  <th style={{ padding: '8px 10px' }}>Destinatários</th>
                  <th style={{ padding: '8px 10px' }}>Título & Mensagem</th>
                  <th style={{ padding: '8px 10px' }}>Link</th>
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
                    <td style={{ padding: '10px 10px', color: '#0f766e' }}>
                      {log.url || '/'}
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
    </div>
  );
}


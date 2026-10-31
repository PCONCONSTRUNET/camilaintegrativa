import { getDatabase } from '@/lib/db';

export interface PushRuleConfig {
  key: string;
  category: 'admin' | 'client';
  label: string;
  description: string;
  triggerEvent: string;
  defaultTitle: string;
  defaultMessage: string;
  title: string;
  message: string;
  enabled: boolean;
  variables: string[];
  updatedAt?: string;
}

export const DEFAULT_PUSH_RULES: Record<string, Omit<PushRuleConfig, 'updatedAt'>> = {
  // ================= ADMIN RULES =================
  admin_new_appointment: {
    key: 'admin_new_appointment',
    category: 'admin',
    label: 'Novo Agendamento Realizado',
    description: 'Envia um push para a administração assim que uma consulta for agendada pelo site ou pela clínica.',
    triggerEvent: 'Quando uma consulta é agendada',
    defaultTitle: '📅 Novo Agendamento: {paciente}',
    defaultMessage: '{servico} ({modalidade}) agendado {origem} para {data} às {horario}.',
    title: '📅 Novo Agendamento: {paciente}',
    message: '{servico} ({modalidade}) agendado {origem} para {data} às {horario}.',
    enabled: true,
    variables: ['{paciente}', '{servico}', '{modalidade}', '{origem}', '{data}', '{horario}'],
  },
  admin_upcoming_30m: {
    key: 'admin_upcoming_30m',
    category: 'admin',
    label: 'Lembrete de Atendimento (30 min antes)',
    description: 'Avisa a Camila 30 minutos antes do início do próximo atendimento marcado na agenda.',
    triggerEvent: '30 minutos antes de cada sessão',
    defaultTitle: '⏰ Próximo Atendimento em ~30 min!',
    defaultMessage: '{paciente} às {horario} · {servico} ({modalidade}).',
    title: '⏰ Próximo Atendimento em ~30 min!',
    message: '{paciente} às {horario} · {servico} ({modalidade}).',
    enabled: true,
    variables: ['{paciente}', '{horario}', '{servico}', '{modalidade}'],
  },
  admin_payment_confirmed: {
    key: 'admin_payment_confirmed',
    category: 'admin',
    label: 'Pagamento Confirmado',
    description: 'Notifica a administração imediatamente quando uma fatura ou consulta for paga.',
    triggerEvent: 'Quando um pagamento é confirmado/quitado',
    defaultTitle: '💰 Pagamento Confirmado: {valor}',
    defaultMessage: 'Recebido de {paciente} via {metodo}{servico}.',
    title: '💰 Pagamento Confirmado: {valor}',
    message: 'Recebido de {paciente} via {metodo}{servico}.',
    enabled: true,
    variables: ['{valor}', '{paciente}', '{metodo}', '{servico}'],
  },
  admin_payment_pending: {
    key: 'admin_payment_pending',
    category: 'admin',
    label: 'Pagamento Pendente / Cobrança Gerada',
    description: 'Avisa a administração quando uma nova fatura com pagamento pendente for lançada.',
    triggerEvent: 'Ao gerar fatura com status pendente',
    defaultTitle: '⏳ Pagamento Pendente: {paciente}',
    defaultMessage: 'Fatura de {valor}{servico} gerada e aguardando quitação.{vencimento}',
    title: '⏳ Pagamento Pendente: {paciente}',
    message: 'Fatura de {valor}{servico} gerada e aguardando quitação.{vencimento}',
    enabled: true,
    variables: ['{paciente}', '{valor}', '{servico}', '{vencimento}'],
  },
  admin_invoice_overdue: {
    key: 'admin_invoice_overdue',
    category: 'admin',
    label: 'Fatura Vencida',
    description: 'Alerta a administração sobre cobranças em atraso que venceram sem confirmação de pagamento.',
    triggerEvent: 'Diariamente quando uma cobrança vence sem quitação',
    defaultTitle: '⚠️ Fatura Vencida: {paciente}',
    defaultMessage: 'A cobrança de {valor}{servico} venceu em {data_vencimento} e ainda não foi paga.',
    title: '⚠️ Fatura Vencida: {paciente}',
    message: 'A cobrança de {valor}{servico} venceu em {data_vencimento} e ainda não foi paga.',
    enabled: true,
    variables: ['{paciente}', '{valor}', '{servico}', '{data_vencimento}'],
  },
  admin_appointment_cancelled: {
    key: 'admin_appointment_cancelled',
    category: 'admin',
    label: 'Agendamento Cancelado',
    description: 'Notifica a administração quando uma consulta é cancelada pelo paciente ou pela clínica.',
    triggerEvent: 'Quando um agendamento é desmarcado',
    defaultTitle: '❌ Agendamento Cancelado: {paciente}',
    defaultMessage: 'A consulta de {data} às {horario} foi cancelada ({cancelado_por}).{motivo}',
    title: '❌ Agendamento Cancelado: {paciente}',
    message: 'A consulta de {data} às {horario} foi cancelada ({cancelado_por}).{motivo}',
    enabled: true,
    variables: ['{paciente}', '{data}', '{horario}', '{cancelado_por}', '{motivo}'],
  },

  // ================= CLIENT RULES =================
  client_welcome_push: {
    key: 'client_welcome_push',
    category: 'client',
    label: 'Boas-Vindas ao Ativar Notificações no Portal',
    description: 'Disparada instantaneamente na tela do paciente quando ele autoriza o Push no portal /cliente.',
    triggerEvent: 'Ao clicar em "Ativar Notificações" no portal',
    defaultTitle: '🌿 Notificações Ativadas com Sucesso!',
    defaultMessage: 'Olá, {paciente}! Agora você receberá lembretes das suas consultas e avisos da clínica direto na tela.',
    title: '🌿 Notificações Ativadas com Sucesso!',
    message: 'Olá, {paciente}! Agora você receberá lembretes das suas consultas e avisos da clínica direto na tela.',
    enabled: true,
    variables: ['{paciente}'],
  },
  client_appointment_confirmed: {
    key: 'client_appointment_confirmed',
    category: 'client',
    label: 'Confirmação de Agendamento do Paciente',
    description: 'Notificação de confirmação enviada ao paciente assim que sua consulta for agendada.',
    triggerEvent: 'Ao confirmar novo agendamento do paciente',
    defaultTitle: '✨ Consulta Confirmada: Espaço Camila Machado',
    defaultMessage: 'Olá, {paciente}! Seu atendimento de {servico} ({modalidade}) foi marcado para {data} às {horario}.',
    title: '✨ Consulta Confirmada: Espaço Camila Machado',
    message: 'Olá, {paciente}! Seu atendimento de {servico} ({modalidade}) foi marcado para {data} às {horario}.',
    enabled: true,
    variables: ['{paciente}', '{servico}', '{modalidade}', '{data}', '{horario}'],
  },
  client_reminder_24h: {
    key: 'client_reminder_24h',
    category: 'client',
    label: 'Lembrete 24h Antes da Consulta',
    description: 'Enviada 1 dia antes da sessão para o paciente se programar com antecedência.',
    triggerEvent: '24 horas antes do horário marcado',
    defaultTitle: '🔔 Lembrete da sua Consulta amanhã!',
    defaultMessage: 'Olá, {paciente}! Sua sessão de {servico} está agendada para amanhã às {horario}. Clique para ver orientações.',
    title: '🔔 Lembrete da sua Consulta amanhã!',
    message: 'Olá, {paciente}! Sua sessão de {servico} está agendada para amanhã às {horario}. Clique para ver orientações.',
    enabled: true,
    variables: ['{paciente}', '{servico}', '{horario}', '{modalidade}'],
  },
  client_reminder_2h: {
    key: 'client_reminder_2h',
    category: 'client',
    label: 'Lembrete 2 Horas Antes da Consulta',
    description: 'Aviso rápido antes do horário para o paciente se conectar ou se deslocar até o consultório.',
    triggerEvent: '2 horas antes do atendimento',
    defaultTitle: '⏰ Sua consulta começa em 2 horas!',
    defaultMessage: 'Olá, {paciente}! Nos vemos às {horario} para {servico}. Clique para abrir seu portal.',
    title: '⏰ Sua consulta começa em 2 horas!',
    message: 'Olá, {paciente}! Nos vemos às {horario} para {servico}. Clique para abrir seu portal.',
    enabled: true,
    variables: ['{paciente}', '{horario}', '{servico}'],
  },
  client_payment_confirmed: {
    key: 'client_payment_confirmed',
    category: 'client',
    label: 'Comprovante / Pagamento Recebido',
    description: 'Enviado ao paciente quando seu pagamento de consulta ou plano for registrado.',
    triggerEvent: 'Ao confirmar quitação de pagamento',
    defaultTitle: '💳 Pagamento Confirmado!',
    defaultMessage: 'Olá, {paciente}! Confirmamos o recebimento de {valor} via {metodo}. O comprovante já está no seu portal.',
    title: '💳 Pagamento Confirmado!',
    message: 'Olá, {paciente}! Confirmamos o recebimento de {valor} via {metodo}. O comprovante já está no seu portal.',
    enabled: true,
    variables: ['{paciente}', '{valor}', '{metodo}'],
  },
  client_appointment_cancelled: {
    key: 'client_appointment_cancelled',
    category: 'client',
    label: 'Aviso de Consulta Cancelada',
    description: 'Notifica o paciente caso uma consulta agendada precise ser desmarcada.',
    triggerEvent: 'Ao cancelar agendamento do paciente',
    defaultTitle: 'Aviso: Consulta Cancelada',
    defaultMessage: 'Olá, {paciente}. Sua consulta agendada para {data} às {horario} foi cancelada. Acesse o portal para escolher um novo horário.',
    title: 'Aviso: Consulta Cancelada',
    message: 'Olá, {paciente}. Sua consulta agendada para {data} às {horario} foi cancelada. Acesse o portal para escolher um novo horário.',
    enabled: true,
    variables: ['{paciente}', '{data}', '{horario}'],
  },
};

let tableEnsured = false;

export async function ensurePushConfigsTable() {
  if (tableEnsured) return;
  try {
    const db = getDatabase();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS push_notification_configs (
        key TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        updated_at TEXT NOT NULL
      );
    `);
    tableEnsured = true;
  } catch (err) {
    console.warn('[PushConfigs] Erro ao criar tabela push_notification_configs:', err);
  }
}

/**
 * Obtém todas as configurações salvas (mescladas com os padrões)
 */
export async function getAllPushConfigs(): Promise<PushRuleConfig[]> {
  await ensurePushConfigsTable();
  const db = getDatabase();

  const savedMap = new Map<string, { title: string; message: string; enabled: number; updated_at: string }>();

  try {
    const rows = (await db
      .prepare('SELECT key, title, message, enabled, updated_at FROM push_notification_configs')
      .all()) as Array<{ key: string; title: string; message: string; enabled: number; updated_at: string }>;

    for (const r of rows) {
      savedMap.set(r.key, r);
    }
  } catch (err) {
    console.warn('[PushConfigs] Erro ao carregar configs do banco:', err);
  }

  const result: PushRuleConfig[] = [];

  for (const [key, def] of Object.entries(DEFAULT_PUSH_RULES)) {
    const saved = savedMap.get(key);
    result.push({
      ...def,
      title: saved ? saved.title : def.defaultTitle,
      message: saved ? saved.message : def.defaultMessage,
      enabled: saved ? saved.enabled === 1 : def.enabled,
      updatedAt: saved ? saved.updated_at : undefined,
    });
  }

  return result;
}

/**
 * Obtém uma configuração específica para saber se está ativada e qual o texto renderizado
 */
export async function getPushConfig(key: string): Promise<PushRuleConfig> {
  await ensurePushConfigsTable();
  const def = DEFAULT_PUSH_RULES[key];
  if (!def) {
    throw new Error(`Regra de push não encontrada: ${key}`);
  }

  try {
    const db = getDatabase();
    const saved = (await db
      .prepare('SELECT title, message, enabled, updated_at FROM push_notification_configs WHERE key = ? LIMIT 1')
      .get(key)) as { title: string; message: string; enabled: number; updated_at: string } | undefined;

    if (saved) {
      return {
        ...def,
        title: saved.title,
        message: saved.message,
        enabled: saved.enabled === 1,
        updatedAt: saved.updated_at,
      };
    }
  } catch (err) {
    console.warn(`[PushConfigs] Erro ao buscar config ${key}:`, err);
  }

  return { ...def };
}

/**
 * Salva ou atualiza a configuração de uma regra
 */
export async function savePushConfig(
  key: string,
  params: { enabled?: boolean; title?: string; message?: string }
): Promise<PushRuleConfig> {
  await ensurePushConfigsTable();
  const current = await getPushConfig(key);
  const now = new Date().toISOString();

  const newEnabled = params.enabled !== undefined ? params.enabled : current.enabled;
  const newTitle = params.title !== undefined ? params.title.trim() : current.title;
  const newMessage = params.message !== undefined ? params.message.trim() : current.message;

  const db = getDatabase();

  await db
    .prepare(
      `INSERT INTO push_notification_configs (key, category, title, message, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET
         title = excluded.title,
         message = excluded.message,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`
    )
    .run(key, current.category, newTitle, newMessage, newEnabled ? 1 : 0, now);

  return {
    ...current,
    title: newTitle,
    message: newMessage,
    enabled: newEnabled,
    updatedAt: now,
  };
}

/**
 * Substitui placeholders como {paciente}, {horario}, {data} no texto
 */
export function renderPushTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  let result = template;
  for (const [k, v] of Object.entries(vars)) {
    const valStr = v !== null && v !== undefined ? String(v) : '';
    const regex = new RegExp(`\\{${k}\\}`, 'g');
    result = result.replace(regex, valStr);
  }
  return result;
}

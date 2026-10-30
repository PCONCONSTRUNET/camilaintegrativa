export type WhatsappTriggerType =
  | 'sessao_agendada'
  | 'lembrete_24h'
  | 'agendamento_cancelado'
  | 'pagamento_identificado'
  | 'fatura_vencida';

export type WhatsappProviderType = 'evolution' | 'zapi' | 'meta_cloud' | 'webhook_custom';

export interface WhatsappTemplateConfig {
  enabled: boolean;
  title: string;
  description: string;
  messageTemplate: string;
  availableVariables: Array<{ key: string; label: string; example: string }>;
}

export type WhatsappTemplatesMap = Record<WhatsappTriggerType, WhatsappTemplateConfig>;

export interface WhatsappAutomationSettings {
  clinicId: string;
  enabled: boolean;
  providerType: WhatsappProviderType;
  apiBaseUrl: string;
  apiKey: string;
  instanceName: string;
  adminNotifyPhone: string;
  notifyOwnerOnCancel: boolean;
  notifyOwnerOnPayment: boolean;
  qrEndpoint: string;
  templates: WhatsappTemplatesMap;
  updatedAt: string;
}

export interface WhatsappMessageLog {
  id: string;
  clinicId: string;
  triggerType: WhatsappTriggerType | 'teste_conexao';
  clientId: string | null;
  clientName: string;
  recipientPhone: string;
  messageBody: string;
  status: 'enviado' | 'simulado_sem_api' | 'erro' | 'pausado';
  httpStatus: number | null;
  responsePreview: string | null;
  referenceId: string | null;
  createdAt: string;
}

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsappTemplatesMap = {
  sessao_agendada: {
    enabled: true,
    title: 'Sessão Agendada com Sucesso',
    description: 'Disparado imediatamente quando uma sessão é agendada ou confirmada para o cliente.',
    messageTemplate:
      'Olá, *{{primeiro_nome}}*! ✨\n\nSua sessão foi agendada com sucesso no espaço *{{profissional}}*.\n\n📅 *Data:* {{data}}\n⏰ *Horário:* {{horario}}\n💆‍♀️ *Atendimento:* {{servico}}\n📍 *Modalidade:* {{modalidade}}\n💰 *Valor da Sessão:* {{valor}}\n\nQualquer dúvida estamos à disposição. Até breve! 🌿',
    availableVariables: [
      { key: '{{primeiro_nome}}', label: 'Primeiro Nome', example: 'Lucas' },
      { key: '{{nome_cliente}}', label: 'Nome Completo', example: 'Lucas Pereira de Souza' },
      { key: '{{servico}}', label: 'Serviço / Sessão', example: 'Sessão de Hipnoterapia Integrativa' },
      { key: '{{data}}', label: 'Data da Sessão', example: '29/10/2026' },
      { key: '{{horario}}', label: 'Horário', example: '14:00' },
      { key: '{{modalidade}}', label: 'Modalidade', example: 'Presencial' },
      { key: '{{valor}}', label: 'Valor da Sessão', example: 'R$ 380,00' },
      { key: '{{profissional}}', label: 'Nome da Clínica / Profissional', example: 'Camila Machado' },
    ],
  },
  lembrete_24h: {
    enabled: true,
    title: 'Lembrete de 24 Horas Antes do Horário',
    description: 'Disparado automaticamente 24 horas antes do horário agendado para lembrar o cliente.',
    messageTemplate:
      'Olá, *{{primeiro_nome}}*! ⏰\n\nPassando para lembrar do seu atendimento agendado para amanhã (faltam 24h):\n\n📅 *Data:* {{data}}\n⏰ *Horário:* {{horario}}\n💆‍♀️ *Atendimento:* {{servico}}\n📍 *Modalidade:* {{modalidade}}\n\nContamos com a sua presença! Caso precise falar conosco, basta responder esta mensagem. 🌿',
    availableVariables: [
      { key: '{{primeiro_nome}}', label: 'Primeiro Nome', example: 'Lucas' },
      { key: '{{nome_cliente}}', label: 'Nome Completo', example: 'Lucas Pereira de Souza' },
      { key: '{{servico}}', label: 'Serviço / Sessão', example: 'Sessão de Hipnoterapia Integrativa' },
      { key: '{{data}}', label: 'Data da Sessão', example: '29/10/2026' },
      { key: '{{horario}}', label: 'Horário', example: '14:00' },
      { key: '{{modalidade}}', label: 'Modalidade', example: 'Presencial' },
      { key: '{{profissional}}', label: 'Nome da Clínica / Profissional', example: 'Camila Machado' },
    ],
  },
  agendamento_cancelado: {
    enabled: true,
    title: 'Agendamento Cancelado (Clínica ou Cliente)',
    description: 'Disparado quando a proprietária ou o próprio cliente cancela um agendamento.',
    messageTemplate:
      'Olá, *{{primeiro_nome}}*.\n\nInformamos que o seu agendamento de *{{servico}}* previsto para o dia *{{data}} às {{horario}}* foi cancelado (*{{cancelado_por}}*).\n\nCaso deseje escolher uma nova data e horário, acesse sua Área do Cliente ou entre em contato conosco por aqui. 🤍',
    availableVariables: [
      { key: '{{primeiro_nome}}', label: 'Primeiro Nome', example: 'Lucas' },
      { key: '{{nome_cliente}}', label: 'Nome Completo', example: 'Lucas Pereira de Souza' },
      { key: '{{servico}}', label: 'Serviço Cancelado', example: 'Sessão de Hipnoterapia Integrativa' },
      { key: '{{data}}', label: 'Data da Sessão', example: '29/10/2026' },
      { key: '{{horario}}', label: 'Horário', example: '14:00' },
      { key: '{{cancelado_por}}', label: 'Quem Cancelou', example: 'Cancelado pelo cliente na Área do Cliente' },
      { key: '{{motivo}}', label: 'Observação / Motivo', example: 'Imprevisto de agenda' },
      { key: '{{profissional}}', label: 'Nome da Clínica / Profissional', example: 'Camila Machado' },
    ],
  },
  pagamento_identificado: {
    enabled: true,
    title: 'Pagamento Identificado (Fatura / Área do Cliente)',
    description: 'Disparado quando o cliente paga uma fatura pela Área do Cliente ou quando o pagamento é baixado no sistema.',
    messageTemplate:
      'Olá, *{{primeiro_nome}}*! ✅\n\nIdentificamos o seu pagamento com sucesso!\n\n🧾 *Fatura / Serviço:* {{fatura_descricao}}\n💰 *Valor Pago Agora:* {{valor_pago}}\n💳 *Forma de Pagamento:* {{forma_pagamento}}\n📊 *Valor Total da Fatura:* {{valor_total_fatura}}\n⏳ *Saldo Restante:* {{saldo_restante}}\n📌 *Situação da Fatura:* {{status_fatura}}\n\nSeu comprovante e histórico atualizado já estão disponíveis na sua Área do Cliente. Muito obrigada pela confiança! ✨',
    availableVariables: [
      { key: '{{primeiro_nome}}', label: 'Primeiro Nome', example: 'Lucas' },
      { key: '{{nome_cliente}}', label: 'Nome Completo', example: 'Lucas Pereira de Souza' },
      { key: '{{fatura_descricao}}', label: 'Descrição da Fatura / Serviço', example: 'Reiki nível III (Fatura #F-104)' },
      { key: '{{servico}}', label: 'Nome do Serviço', example: 'Reiki nível III' },
      { key: '{{valor_pago}}', label: 'Valor Pago na Transação', example: 'R$ 125,00' },
      { key: '{{valor_total_fatura}}', label: 'Valor Total Líquido da Fatura', example: 'R$ 450,00' },
      { key: '{{saldo_restante}}', label: 'Saldo Restante em Aberto', example: 'R$ 0,00 (Quitado)' },
      { key: '{{forma_pagamento}}', label: 'Forma de Pagamento', example: 'PIX' },
      { key: '{{status_fatura}}', label: 'Status Atual da Fatura', example: 'Fatura Quitada (100%)' },
      { key: '{{data_pagamento}}', label: 'Data/Hora do Pagamento', example: '28/10/2026 às 15:30' },
      { key: '{{profissional}}', label: 'Nome da Clínica / Profissional', example: 'Camila Machado' },
    ],
  },
  fatura_vencida: {
    enabled: true,
    title: 'Lembrete de Vencimento de Fatura (Chave PIX)',
    description: 'Disparado automaticamente quando a fatura ou saldo em aberto do cliente atinge ou passa da data de vencimento.',
    messageTemplate:
      'Olá, *{{primeiro_nome}}*! 📄\n\nPassando para lembrar do seu saldo em aberto com vencimento em *{{data_vencimento}}*:\n\n🧾 *Fatura / Atendimento:*\n{{fatura_descricao}}\n\n💰 *Valor Pendente:* {{valor_pendente}}\n📊 *Valor Total:* {{valor_total}}\n\n🔑 *Chave PIX para Pagamento:*\n{{chave_pix}}\n*Favorecida:* {{profissional}}\n\nPor gentileza, após efetuar o pagamento nos envie o *comprovante por aqui* para registrarmos a baixa no sistema. 🌿\n\nCaso já tenha efetuado o pagamento, por favor desconsidere este aviso. Muito obrigada! ✨',
    availableVariables: [
      { key: '{{primeiro_nome}}', label: 'Primeiro Nome', example: 'Lucas' },
      { key: '{{nome_cliente}}', label: 'Nome Completo', example: 'Lucas Pereira de Souza' },
      { key: '{{fatura_descricao}}', label: 'Descrição da Fatura / Serviço', example: 'Reiki nível III (Saldo Parcial)' },
      { key: '{{valor_pendente}}', label: 'Valor Pendente em Aberto', example: 'R$ 125,00' },
      { key: '{{valor_total}}', label: 'Valor Total da Fatura', example: 'R$ 450,00' },
      { key: '{{data_vencimento}}', label: 'Data de Vencimento', example: '28/10/2026' },
      { key: '{{chave_pix}}', label: 'Chave PIX da Clínica', example: '(48) 99691-5303 (Camila Machado)' },
      { key: '{{profissional}}', label: 'Nome da Clínica / Profissional', example: 'Camila Machado' },
    ],
  },
};


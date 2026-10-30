export type ServicePriceTier = {
  id: string;
  name: string; // Ex: "4 sessões", "6 sessões", "Sessão avulsa"
  priceCents: number; // Ex: 165000 (R$ 1.650,00)
  isPackage?: boolean; // Se true, ativa o sistema de pacotes com créditos de múltiplas sessões
  sessionCount?: number; // Quantidade de sessões (padrão 1 ou número contratado)
};

export type ClientPackageStatus = 'ativo' | 'concluido' | 'cancelado';

export type ClientPackage = {
  id: string;
  clinicId: string;
  clientId: string;
  clientName?: string;
  serviceId: string | null;
  serviceName?: string;
  packageName: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  completedSessions?: number;
  scheduledSessions?: number;
  remainingToSchedule?: number;
  bookingMode?: PackageBookingMode;
  pendingSession?: { id: string; sessionNumber: number | null; startAt: string } | null;
  priceCents: number | null;
  status: ClientPackageStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number | null;
  priceVisible: boolean;
  modalities: Array<'presencial' | 'online'>;
  pricingTiers?: ServicePriceTier[];
  /** 'sequencial' (padrão): próxima sessão só após concluir a anterior. 'livre': agenda todas de uma vez. */
  packageBookingMode?: PackageBookingMode;
  audioUrl?: string | null;
  audioName?: string | null;
};

export type PackageBookingMode = 'sequencial' | 'livre';

export type AdminService = Service & {
  intervalMinutes: number;
  published: boolean;
};

export type ClientSummary = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: 'ativo' | 'inativo' | 'pendente';
  createdAt: string;
  nextAppointmentAt: string | null;
  completedAppointments: number;
  activePackagesCount?: number;
  activePackagesRemainingSessions?: number;
  cpf?: string | null;
  rg?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  occupation?: string | null;
  administrativeNotes?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  hasAnamnese?: boolean;
  openBalanceCents?: number;
  totalPaidCents?: number;
};

export type AppointmentStatus =
  | 'solicitado'
  | 'confirmado'
  | 'em_atendimento'
  | 'concluido'
  | 'cancelado'
  | 'nao_compareceu';

export type AppointmentPackageSummary = {
  id: string;
  name: string;
  totalSessions: number;
  usedSessions: number;
  status: string;
};

export type AppointmentSummary = {
  id: string;
  clientId: string;
  clientName: string;
  serviceId: string;
  serviceName: string;
  modality: 'presencial' | 'online';
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  source: 'publico' | 'interno';
  bookingKind: 'regular' | 'encaixe';
  fitInReason: string | null;
  administrativeNotes: string | null;
  clientPackageId?: string | null;
  sessionNumber?: number | null;
  packageSummary?: AppointmentPackageSummary | null;
  updatedAt: string;
};

export type TimeBlock = {
  id: string;
  startAt: string;
  endAt: string;
  reason: string;
  createdAt: string;
};

export type AgendaSettings = {
  settings: {
    bookingConfirmationMode: 'manual' | 'automatico';
    minimumNoticeMinutes: number;
  };
  workingHours: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
    publicBooking: boolean;
  }>;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    intervalMinutes: number;
  }>;
  holidays: Array<{
    id: string;
    date: string;
    name: string;
  }>;
};

// ==========================================
// REGISTROS DE ATENDIMENTO E PRONTUÁRIO
// ==========================================

export type EmergencyContact = {
  id?: string;
  name: string;
  phone?: string | null;
  relationship?: string | null;
};

export type ClientRecord = {
  clientId: string;
  birthDate: string | null;
  cpf: string | null;
  rg?: string | null;
  gender: string | null;
  occupation: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  emergencyContacts?: EmergencyContact[] | null;
  chiefComplaint: string | null;
  consultationReason?: string | null;
  hasHealthConditions?: boolean | null;
  healthConditionsDetails?: string | null;
  hasPsychCare?: boolean | null;
  psychCareDetails?: string | null;
  consentAgreed?: boolean | null;
  consentAgreedAt?: string | null;
  healthHistory: string | null;
  medications: string | null;
  personalBackground: string | null;
  // Campos especializados de Hipnose Clínica & Psicoterapia Integrativa
  epilepsyHistory?: boolean | null;
  psychiatricHistory?: string | null;
  previousHypnosis?: string | null;
  suggestibilityNotes?: string | null;
  emotionalTriggers?: string | null;
  safePlace?: string | null;
  updatedAt: string;
};

export type TreatmentGoal = {
  id: string;
  clientId: string;
  title: string;
  description: string | null;
  status: 'em_andamento' | 'alcancado' | 'ajustado' | 'pausado';
  progressPct: number;
  targetDate: string | null;
  achievedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClinicalEvolution = {
  id: string;
  clientId: string;
  appointmentId: string | null;
  professionalId: string;
  sessionDate: string;
  title: string;
  summary: string | null;
  evolutionText: string;
  interventions: string | null;
  homeworkTasks: string | null;
  isConfidential: boolean;
  // Parâmetros de Hipnoterapia da Sessão
  inductionMethod?: string | null;
  tranceDepth?: string | null;
  hypnoticPhenomena?: string | null;
  postHypnoticSuggestions?: string | null;
  deinductionNotes?: string | null;
  selfHypnosisPrescribed?: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  // Finalização / Assinatura do Registro (Lei 13.787/2018)
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  finalizedByName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClinicalTechnique = {
  id: string;
  clientId: string;
  evolutionId: string | null;
  name: string;
  category: string;
  notes: string | null;
  outcome: 'muito_positiva' | 'positiva' | 'neutra' | 'necessita_ajuste';
  appliedAt: string;
  createdAt: string;
};

export type ClientDocumentFile = {
  name: string;
  mimeType: string;
  size: number;
  data: string; // base64
};

export type ClientDocument = {
  id: string;
  clientId: string;
  title: string;
  documentType: string;
  documentTypeLabel: string | null;
  status: 'pendente_assinatura' | 'assinado' | 'ativo' | 'arquivado';
  fileName: string | null;
  fileData: ClientDocumentFile[] | null;
  content: string | null;
  signedAt: string | null;
  createdBy: string | null;
  createdAt: string;
};


export type ClientReferral = {
  id: string;
  clientId: string;
  specialty: string;
  professionalName: string | null;
  reason: string;
  referredAt: string;
  expectedReturnAt: string | null;
  status: 'aguardando_retorno' | 'retornou' | 'concluido' | 'cancelado';
  returnNotes: string | null;
  createdAt: string;
};

export type ProntuarioAccessLog = {
  id: string;
  clientId: string;
  actorUserId: string | null;
  actorName: string;
  actionType: string;
  details: string;
  createdAt: string;
};

export type ProntuarioFull = {
  client: ClientSummary;
  record: ClientRecord | null;
  goals: TreatmentGoal[];
  sessions: AppointmentSummary[];
  evolutions: ClinicalEvolution[];
  techniques: ClinicalTechnique[];
  documents: ClientDocument[];
  referrals: ClientReferral[];
  logs: ProntuarioAccessLog[];
  packages?: ClientPackage[];
};

export const PROFESSIONAL_INFO = {
  name: 'Camila Machado',
  title: 'Terapeuta em Hipnose Clínica Multidimensional Integrativa',
  credentialCode: 'CRT-SBHP/SC 805',
  society: 'Sociedade Brasileira de Hipnose e Psicoterapia (SBHP)',
  city: 'Urussanga / SC',
} as const;

export const HYPNOTHERAPY_TECHNIQUES = [
  { name: 'Indução Dave Elman (Relaxamento Físico & Fracionamento)', category: 'Indução Hipnótica' },
  { name: 'Hipnose Ericksoniana (Metáforas Permissivas)', category: 'Indução Hipnótica' },
  { name: 'Indução por Fixação do Olhar com Espelhamento', category: 'Indução Hipnótica' },
  { name: 'Regressão à Causa (R2C) e Ressignificação', category: 'Terapia Regressiva' },
  { name: 'Ponte ao Futuro (Ensaio Mental & Consolidação)', category: 'Psicoterapia Cognitiva' },
  { name: 'Lugar Seguro / Âncora de Paz e Serenidade', category: 'Recurso Emocional' },
  { name: 'Dessensibilização Sistemática sob Transe', category: 'Tratamento de Ansiedade/Fobias' },
  { name: 'Swish Pattern / Padrão Swish', category: 'Ressignificação Comportamental' },
  { name: 'Ancoragem Cinestésica e Auditiva de Confiança', category: 'PNL & Hipnose' },
  { name: 'Ressignificação da Criança Interior', category: 'Psicoterapia Integrativa' },
  { name: 'Instrução e Treinamento de Auto-hipnose', category: 'Autonomia do Paciente' },
] as const;

export const HYPNOTHERAPY_DOC_TEMPLATES: Record<string, { title: string; chipLabel: string; type: string; content: string }> = {
  tcle: {
    chipLabel: 'TCLE — Hipnose & Telessaúde',
    title: 'Termo de Consentimento Livre e Esclarecido (TCLE) - Hipnose Clínica e Psicoterapia',
    type: 'Termo de Consentimento (TCLE)',
    content: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)
HIPNOSE CLÍNICA E PSICOTERAPIA INTEGRATIVA
Profissional Responsável: Camila Machado
Credenciamento: Sociedade Brasileira de Hipnose e Psicoterapia (SBHP)
Registro Profissional: CRT-SBHP/SC 805

1. DA NATUREZA DO ATENDIMENTO E DO TRANSE HIPNÓTICO:
Declaro, por minha livre iniciativa, estar ciente de que a Hipnose Clínica é uma abordagem terapêutica integrativa fundamentada em um estado fisiológico natural de foco concentrado, atenção direcionada e relaxamento físico e mental. Compreendo expressamente que:
a) Durante todo o processo permaneço consciente, lúcido(a) e em pleno domínio de minhas faculdades morais e volitivas;
b) Não há perda de controle, sono involuntário ou submissão a comandos contrários aos meus valores éticos;
c) O transe hipnótico é um estado colaborativo de cooperação entre cliente e terapeuta.

2. DO SIGILO PROFISSIONAL E CONDUTA ÉTICA:
Todas as informações prestadas durante as sessões são rigorosamente sigilosas e confidenciais, em conformidade com o Código de Ética da Sociedade Brasileira de Hipnose e Psicoterapia (SBHP), salvo nos casos estritos de obrigação legal ou risco iminente de dano à vida.

3. DO ATENDIMENTO REMOTO / TELESSAÚDE (Lei 14.510/2022):
Para sessões realizadas de modo online:
a) Comprometo-me a estar em ambiente privado, silencioso, seguro e livre de interrupções de terceiros;
b) Estou ciente do protocolo de segurança: caso ocorra interrupção ou queda de conexão durante o transe, meu organismo abrirá os olhos e retornará espontaneamente ao estado desperto habitual em alguns instantes, sentindo-me sereno(a) e calmo(a).

4. DO TRATAMENTO DE DADOS PESSOAIS E SENSÍVEIS (LGPD - Lei 13.709/2018):
Autorizo expressamente o tratamento de meus dados pessoais e dados sensíveis de saúde pelo consultório exclusivamente para fins de anamnese, acompanhamento terapêutico, registro de evolução e cumprimento do prazo de guarda legal (Lei 13.787/2018).`,
  },
  contrato: {
    chipLabel: 'Contrato Terapêutico',
    title: 'Contrato de Prestação de Serviços Terapêuticos - Hipnoterapia e Psicoterapia',
    type: 'Contrato Terapêutico',
    content: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS TERAPÊUTICOS
Contratada: Camila Machado — Terapeuta CRT-SBHP/SC 805 (SBHP)

1. OBJETO: O presente instrumento tem por objeto a prestação de serviços de Hipnose Clínica Multidimensional Integrativa, nas modalidades presencial ou remota.
2. DURAÇÃO E PONTUALIDADE: Cada sessão tem duração programada de 60 a 75 minutos. A pontualidade é essencial para o cumprimento do protocolo terapêutico.
3. REMARCAÇÕES E CANCELAMENTOS (Código de Defesa do Consumidor):
Solicitações de reagendamento ou cancelamento devem ser comunicadas com antecedência mínima de 24 horas úteis. Faltas sem aviso prévio inviabilizam a oferta do horário a outros clientes.
4. COOPERAÇÃO E AUTO-HIPNOSE:
A hipnoterapia clínica é um processo cooperativo. O engajamento do cliente na realização das práticas recomendadas de auto-hipnose e tarefas reflexivas é parte integrante do sucesso do acompanhamento.`,
  },
  declaracao: {
    chipLabel: 'Declaração de Comparecimento',
    title: 'Declaração de Comparecimento Terapêutico',
    type: 'Declaração de Comparecimento',
    content: `DECLARAÇÃO DE COMPARECIMENTO TERAPÊUTICO

Declaro para os devidos fins que o(a) cliente esteve sob atendimento de Hipnoterapia e Psicoterapia Integrativa nesta data, no período acordado.

Urussanga/SC.

_______________________________________________
Camila Machado
Terapeuta em Hipnose Clínica Multidimensional Integrativa
Registro Profissional: CRT-SBHP/SC 805
Sociedade Brasileira de Hipnose e Psicoterapia (SBHP)`,
  },
  relatorio: {
    chipLabel: 'Relatório Terapêutico',
    title: 'Relatório de Acompanhamento Terapêutico Integrativo',
    type: 'Relatório Terapêutico',
    content: `RELATÓRIO DE ACOMPANHAMENTO TERAPÊUTICO INTEGRATIVO

1. IDENTIFICAÇÃO:
Profissional Responsável: Camila Machado
Habilitação: CRT-SBHP/SC 805 — Sociedade Brasileira de Hipnose e Psicoterapia (SBHP)

2. QUEIXA INICIAL E MOTIVO DO ATENDIMENTO:
[Descrever queixa principal, sintomas relatados e objetivos terapêuticos acordados]

3. METODOLOGIA E PROTOCOLOS DE HIPNOTERAPIA UTILIZADOS:
[Mencionar técnicas: Indução, Dessensibilização, Regressão à Causa (R2C), Ressignificação, Ancoragem, Auto-hipnose]

4. EVOLUÇÃO E RESULTADOS ALCANÇADOS:
[Descrever progressos observados nos estados emocionais, comportamentais e autorregulação]

5. CONCLUSÃO E RECOMENDAÇÕES:
[Orientações de continuidade, manutenção com auto-hipnose ou encerramento do ciclo terapêutico]

Urussanga/SC.

_______________________________________________
Camila Machado — CRT-SBHP/SC 805`,
  },
};

// ==========================================
// PAGAMENTOS & HISTÓRICO FINANCEIRO
// ==========================================

export type PaymentMethod = 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro' | 'transferencia' | 'boleto' | 'outro';

export type EntryType = 'entrada' | 'saida';

export type ClientPayment = {
  id: string;
  clinicId: string;
  clientId: string | null;
  clientName?: string;
  appointmentId: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  clientPackageId?: string | null;
  parentPaymentId?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  entryType: EntryType;
  category: string;
  chargeType?: 'avulso' | 'sessao' | 'pacote' | 'outro';
  description: string;
  amountCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  discountCents?: number;
  paymentMethod: PaymentMethod;
  status: 'pago' | 'pendente' | 'parcial' | 'cancelado' | 'estornado';
  paidAt: string | null;
  dueAt: string | null;
  receiptUrl: string | null;
  notes: string | null;
  transactions?: PaymentTransaction[];
  createdAt: string;
  updatedAt: string;
};

export type PaymentTransaction = {
  id: string;
  paymentId: string;
  clinicId: string;
  clientId: string;
  clientName?: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  paidAt: string;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
};

export type ClientProfileFull = {
  client: ClientSummary;
  record: ClientRecord | null;
  appointments: Array<{
    id: string;
    serviceName: string;
    startAt: string;
    endAt: string;
    status: string;
    modality: string;
    bookingKind: string;
    fitInReason: string | null;
  }>;
  payments: ClientPayment[];
  stats: {
    totalAppointments: number;
    completedAppointments: number;
    totalPaidCents: number;
    totalPendingCents: number;
  };
};

// ─── Group Sessions (Agendamento em Grupo) ──────────────────────────────────

export type GroupSessionStatus = 'ativo' | 'encerrado' | 'cancelado';
export type GroupSessionEnrollmentStatus = 'confirmado' | 'cancelado' | 'lista_espera';

export type GroupSession = {
  id: string;
  clinicId: string;
  serviceId: string | null;
  title: string;
  description: string | null;
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:MM
  endTime: string | null; // HH:MM
  durationMinutes: number;
  maxParticipants: number; // 0 = Vagas Ilimitadas
  currentParticipants: number;
  showRemainingSpots: boolean;
  customRemainingSpots: number | null;
  showOnHome: boolean;
  priceCents: number | null;
  priceVisible: boolean;
  modality: 'presencial' | 'online';
  locationNotes: string | null;
  audioUrl?: string | null;
  audioName?: string | null;
  status: GroupSessionStatus;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GroupSessionEnrollment = {
  id: string;
  groupSessionId: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientCpf?: string | null;
  clientBirthDate?: string | null;
  status: GroupSessionEnrollmentStatus;
  paymentMethod: string | null;
  paymentId?: string | null;
  notes: string | null;
  enrolledAt: string;
  createdAt: string;
};

export type GroupSessionWithEnrollments = GroupSession & {
  enrollments: GroupSessionEnrollment[];
};



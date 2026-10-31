import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((value) => value.length >= 10 && value.length <= 13, 'Informe um WhatsApp válido.');

export const bookingSchema = z.object({
  serviceId: z.string().uuid('Serviço inválido.'),
  tierId: z.string().optional().nullable(),
  packageId: z.string().uuid().optional().nullable(),
  modality: z.enum(['presencial', 'online']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').refine(isRealDateKey, 'Data inválida.'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.'),
  name: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
  phone,
  cpf: z
    .string()
    .trim()
    .refine((val) => val.replace(/\D/g, '').length === 11, 'Informe um CPF válido com 11 dígitos.'),
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe sua data de nascimento.'),
  email: z.union([z.string().trim().email('E-mail inválido.'), z.literal('')]).optional(),
  notes: z.string().trim().max(500, 'Use no máximo 500 caracteres.').optional(),
  paymentMethod: z.enum(['pix', 'dinheiro', 'cartao']).optional().nullable(),
  privacyAccepted: z.literal(true, { error: 'É necessário aceitar o aviso de privacidade.' }),
  therapeuticConsentAccepted: z.boolean().optional(),
});

export const clientSchema = z.object({
  name: z.string().trim().min(3).max(120),
  phone,
  email: z.union([z.string().trim().email(), z.literal('')]).optional(),
  status: z.enum(['ativo', 'inativo', 'pendente']).default('ativo'),
  administrativeNotes: z.string().trim().max(500).optional(),
  // Dados opcionais da Ficha
  cpf: z.string().trim().optional().nullable(),
  birthDate: z.string().trim().optional().nullable(),
  gender: z.string().trim().optional().nullable(),
  occupation: z.string().trim().optional().nullable(),
  emergencyContactName: z.string().trim().optional().nullable(),
  emergencyContactPhone: z.string().trim().optional().nullable(),
  emergencyContactRelationship: z.string().trim().optional().nullable(),
});

const appointmentStatusValueSchema = z.enum([
  'solicitado',
  'confirmado',
  'em_atendimento',
  'concluido',
  'cancelado',
  'nao_compareceu',
]);

const bookingKindSchema = z.enum(['regular', 'encaixe']);
const fitInReasonSchema = z
  .union([z.string().trim().max(300, 'Use no máximo 300 caracteres.'), z.null()])
  .optional()
  .transform((value) => value?.trim() || undefined);

export const appointmentStatusSchema = z.object({
  status: appointmentStatusValueSchema,
}).strict();

export const appointmentResizeSchema = z.object({
  operation: z.literal('resize'),
  durationMinutes: z.number().int().min(15).max(480),
  expectedEndAt: z.string().datetime({ offset: true }),
}).strict();

function isRealDateKey(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isRealTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function timeInMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function durationBetweenTimes(startTime: string, endTime: string) {
  if (startTime === endTime) return 0;
  const difference = timeInMinutes(endTime) - timeInMinutes(startTime);
  return difference > 0 ? difference : difference + 24 * 60;
}

const appointmentTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Horário inválido.')
  .refine(isRealTime, 'Horário inválido.');

export const internalAppointmentSchema = z.object({
  clientId: z.string().uuid('Selecione um cliente válido.'),
  serviceId: z.string().uuid('Selecione um serviço válido.'),
  clientPackageId: z.string().uuid().optional().nullable(),
  modality: z.enum(['presencial', 'online']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').refine(isRealDateKey, 'Data inválida.'),
  time: appointmentTimeSchema,
  endTime: z.union([appointmentTimeSchema, z.literal('')]).optional().transform((value) => value || undefined),
  status: z.enum(['solicitado', 'confirmado']).default('confirmado'),
  bookingKind: bookingKindSchema.default('regular'),
  fitInReason: fitInReasonSchema,
  notes: z.string().trim().max(500, 'Use no máximo 500 caracteres.').optional(),
}).superRefine((input, context) => {
  if (input.bookingKind === 'encaixe' && (!input.fitInReason || input.fitInReason.length < 3)) {
    context.addIssue({
      code: 'custom',
      path: ['fitInReason'],
      message: 'Informe o motivo do encaixe.',
    });
  }
  if (!input.endTime) return;
  const durationMinutes = durationBetweenTimes(input.time, input.endTime);
  if (durationMinutes < 15) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'O horário final deve criar uma duração mínima de 15 minutos.',
    });
  } else if (durationMinutes > 480) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'A duração máxima de um agendamento é de 8 horas.',
    });
  }
});

export const appointmentEditSchema = z.object({
  operation: z.literal('edit'),
  clientId: z.string().uuid('Selecione um cliente válido.'),
  serviceId: z.string().uuid('Selecione um serviço válido.'),
  modality: z.enum(['presencial', 'online']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').refine(isRealDateKey, 'Data inválida.'),
  time: appointmentTimeSchema,
  endTime: appointmentTimeSchema,
  status: appointmentStatusValueSchema,
  bookingKind: bookingKindSchema.optional(),
  fitInReason: fitInReasonSchema,
  notes: z.string().trim().max(500, 'Use no máximo 500 caracteres.').optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((input, context) => {
  if (input.bookingKind === 'encaixe' && (!input.fitInReason || input.fitInReason.length < 3)) {
    context.addIssue({
      code: 'custom',
      path: ['fitInReason'],
      message: 'Informe o motivo do encaixe.',
    });
  }
  const durationMinutes = durationBetweenTimes(input.time, input.endTime);
  if (durationMinutes < 15) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'O horário final deve criar uma duração mínima de 15 minutos.',
    });
  } else if (durationMinutes > 480) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'A duração máxima de um agendamento é de 8 horas.',
    });
  }
});

export const appointmentPatchSchema = z.union([
  appointmentStatusSchema,
  appointmentResizeSchema,
  appointmentEditSchema,
]);

const agendaSettingsValueSchema = z.object({
  bookingConfirmationMode: z.enum(['manual', 'automatico']),
  minimumNoticeMinutes: z.number().int().min(0).max(525_600),
}).strict();

const workingHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: appointmentTimeSchema,
  endTime: appointmentTimeSchema,
  publicBooking: z.boolean(),
}).strict().superRefine((input, context) => {
  if (timeInMinutes(input.startTime) >= timeInMinutes(input.endTime)) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'O horário final deve ser posterior ao inicial.',
    });
  }
});

const agendaServiceSchema = z.object({
  id: z.string().uuid('Serviço inválido.'),
  name: z.string().trim().min(1).max(120),
  durationMinutes: z.number().int().min(15).max(480),
  intervalMinutes: z.number().int().min(0).max(180),
}).strict();

const holidaySchema = z.object({
  id: z.string().uuid('Feriado inválido.').optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').refine(isRealDateKey, 'Data inválida.'),
  name: z.string().trim().min(1, 'Informe o nome do feriado.').max(120),
}).strict();

export const agendaSettingsPatchSchema = z.object({
  settings: agendaSettingsValueSchema.optional(),
  workingHours: z.array(workingHourSchema).max(28).optional(),
  services: z.array(agendaServiceSchema).max(100).optional(),
  holidays: z.array(holidaySchema).max(366).optional(),
}).strict().superRefine((input, context) => {
  if (!input.settings && !input.workingHours && !input.services && !input.holidays) {
    context.addIssue({ code: 'custom', message: 'Informe ao menos uma configuração.' });
  }

  const rangesByWeekday = new Map<number, Array<{ start: number; end: number; index: number }>>();
  input.workingHours?.forEach((item, index) => {
    const ranges = rangesByWeekday.get(item.weekday) ?? [];
    ranges.push({ start: timeInMinutes(item.startTime), end: timeInMinutes(item.endTime), index });
    rangesByWeekday.set(item.weekday, ranges);
  });
  for (const ranges of rangesByWeekday.values()) {
    ranges.sort((left, right) => left.start - right.start);
    for (let index = 1; index < ranges.length; index += 1) {
      if (ranges[index].start < ranges[index - 1].end) {
        context.addIssue({
          code: 'custom',
          path: ['workingHours', ranges[index].index, 'startTime'],
          message: 'Há horários de trabalho sobrepostos neste dia.',
        });
      }
    }
  }

  const holidayDates = new Set<string>();
  input.holidays?.forEach((holiday, index) => {
    if (holidayDates.has(holiday.date)) {
      context.addIssue({
        code: 'custom',
        path: ['holidays', index, 'date'],
        message: 'Há mais de um feriado na mesma data.',
      });
    }
    holidayDates.add(holiday.date);
  });
});

const blockReasonSchema = z.string().trim().min(3, 'Informe o motivo do bloqueio.').max(300);

const timedBlockSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').refine(isRealDateKey, 'Data inválida.'),
  startTime: appointmentTimeSchema,
  endTime: appointmentTimeSchema,
  reason: blockReasonSchema,
  allDay: z.literal(false).optional(),
}).strict().superRefine((input, context) => {
  if (timeInMinutes(input.startTime) >= timeInMinutes(input.endTime)) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'O horário final deve ser posterior ao inicial.',
    });
  }
});

const allDayBlockSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').refine(isRealDateKey, 'Data inválida.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').refine(isRealDateKey, 'Data inválida.'),
  allDay: z.literal(true),
  reason: blockReasonSchema,
}).strict().superRefine((input, context) => {
  const start = new Date(`${input.startDate}T12:00:00Z`);
  const end = new Date(`${input.endDate}T12:00:00Z`);
  const durationDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (durationDays < 0) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'A data final deve ser igual ou posterior à inicial.' });
  } else if (durationDays > 366) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'O bloqueio deve ter no máximo 367 dias.' });
  }
});

export const timeBlockCreateSchema = z.union([timedBlockSchema, allDayBlockSchema]);

export const agendaRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inicial inválida.').refine(isRealDateKey, 'Data inicial inválida.'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data final inválida.').refine(isRealDateKey, 'Data final inválida.'),
}).strict().superRefine((input, context) => {
  const start = new Date(`${input.from}T12:00:00Z`);
  const end = new Date(`${input.to}T12:00:00Z`);
  const durationDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (durationDays < 0) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'O período é inválido.' });
  } else if (durationDays > 366) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'O período deve ter no máximo 367 dias.' });
  }
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

export const emergencyContactSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Informe o nome do contato.'),
  phone: z.string().trim().optional().nullable(),
  relationship: z.string().trim().optional().nullable(),
});

export const clientRecordSchema = z.object({
  birthDate: z.string().trim().optional().nullable(),
  cpf: z.string().trim().optional().nullable(),
  rg: z.string().trim().optional().nullable(),
  gender: z.string().trim().optional().nullable(),
  occupation: z.string().trim().optional().nullable(),
  emergencyContactName: z.string().trim().optional().nullable(),
  emergencyContactPhone: z.string().trim().optional().nullable(),
  emergencyContactRelationship: z.string().trim().optional().nullable(),
  emergencyContacts: z.union([z.array(emergencyContactSchema), z.string()]).optional().nullable(),
  chiefComplaint: z.string().trim().optional().nullable(),
  consultationReason: z.string().trim().optional().nullable(),
  hasHealthConditions: z.union([z.boolean(), z.coerce.number()]).optional().nullable(),
  healthConditionsDetails: z.string().trim().optional().nullable(),
  hasPsychCare: z.union([z.boolean(), z.coerce.number()]).optional().nullable(),
  psychCareDetails: z.string().trim().optional().nullable(),
  consentAgreed: z.union([z.boolean(), z.coerce.number()]).optional().nullable(),
  consentAgreedAt: z.string().trim().optional().nullable(),
  healthHistory: z.string().trim().optional().nullable(),
  medications: z.string().trim().optional().nullable(),
  personalBackground: z.string().trim().optional().nullable(),
  // Hipnoterapia & Psicoterapia
  epilepsyHistory: z.union([z.boolean(), z.coerce.number()]).optional().nullable(),
  psychiatricHistory: z.string().trim().optional().nullable(),
  previousHypnosis: z.string().trim().optional().nullable(),
  suggestibilityNotes: z.string().trim().optional().nullable(),
  emotionalTriggers: z.string().trim().optional().nullable(),
  safePlace: z.string().trim().optional().nullable(),
});

export const anamneseDigitalSchema = z.object({
  fullName: z.string().trim().min(2, 'Nome completo obrigatório.'),
  cpf: z.string().trim().min(11, 'CPF deve ter 11 dígitos.').max(14, 'CPF inválido.'),
  rg: z.string().trim().min(2, 'Informe o RG.'),
  birthDate: z.string().trim().min(8, 'Data de nascimento obrigatória.'),
  emergencyContactName: z.string().trim().max(150).optional().nullable(),
  emergencyContactPhone: z.string().trim().max(30).optional().nullable(),
  emergencyContactRelationship: z.string().trim().max(80).optional().nullable(),
  consultationReason: z.string().trim().max(500).optional().nullable().transform((v) => v ?? ''),
  hasHealthConditions: z.boolean(),
  healthConditionsDetails: z.string().trim().optional().nullable(),
  hasPsychCare: z.boolean(),
  psychCareDetails: z.string().trim().optional().nullable(),
  epilepsyHistory: z.boolean().optional().default(false),
  consentAgreed: z.literal(true, {
    error: 'É obrigatório estar ciente e concordar com o atendimento para prosseguir.',
  }),
});

export const treatmentGoalSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título do objetivo.').max(200),
  description: z.string().trim().optional().nullable(),
  status: z.enum(['em_andamento', 'alcancado', 'ajustado', 'pausado']).default('em_andamento'),
  progressPct: z.coerce.number().int().min(0).max(100).default(0),
  targetDate: z.string().trim().optional().nullable(),
});

export const clinicalEvolutionSchema = z.object({
  appointmentId: z.string().uuid().optional().nullable(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data da sessão inválida.'),
  title: z.string().trim().min(2, 'Informe o título ou tema da sessão.').max(200),
  summary: z.string().trim().optional().nullable(),
  evolutionText: z.string().trim().min(3, 'Anotação de evolução clínica é obrigatória.').max(10000),
  interventions: z.string().trim().optional().nullable(),
  homeworkTasks: z.string().trim().optional().nullable(),
  isConfidential: z.boolean().default(true),
  // Hipnoterapia
  inductionMethod: z.string().trim().optional().nullable(),
  tranceDepth: z.string().trim().max(120).optional().nullable(),
  hypnoticPhenomena: z.string().trim().optional().nullable(),
  postHypnoticSuggestions: z.string().trim().optional().nullable(),
  deinductionNotes: z.string().trim().optional().nullable(),
  selfHypnosisPrescribed: z.string().trim().optional().nullable(),
});

export const clinicalTechniqueSchema = z.object({
  evolutionId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2, 'Informe o nome da técnica ou intervenção.').max(150),
  category: z.string().trim().min(2, 'Informe a abordagem ou categoria.').max(100),
  notes: z.string().trim().optional().nullable(),
  outcome: z.enum(['muito_positiva', 'positiva', 'neutra', 'necessita_ajuste']).default('positiva'),
  appliedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
});

export const clientDocumentSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título do documento.').max(200),
  documentType: z.string().trim().min(1, 'Informe o tipo do documento.').max(100),
  documentTypeLabel: z.string().trim().optional().nullable(),
  status: z.enum(['pendente_assinatura', 'assinado', 'ativo', 'arquivado']).default('ativo'),
  fileName: z.string().trim().optional().nullable(),
  fileData: z.any().optional().nullable(), // JSON string of ClientDocumentFile[]
  content: z.string().trim().optional().nullable(),
});

export const clientReferralSchema = z.object({
  specialty: z.string().trim().min(2, 'Informe a especialidade.').max(120),
  professionalName: z.string().trim().optional().nullable(),
  reason: z.string().trim().min(3, 'Informe o motivo do encaminhamento.').max(500),
  referredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data do encaminhamento inválida.'),
  expectedReturnAt: z.string().trim().optional().nullable(),
  status: z.enum(['aguardando_retorno', 'retornou', 'concluido', 'cancelado']).default('aguardando_retorno'),
  returnNotes: z.string().trim().optional().nullable(),
});

export const servicePriceTierSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, 'Informe o nome da opção/pacote.'),
  priceCents: z.number().int().min(0, 'Valor deve ser positivo.'),
  isPackage: z.boolean().default(false).optional(),
  sessionCount: z.number().int().min(1, 'Quantidade de sessões deve ser no mínimo 1.').default(1).optional(),
});

export const clientPackageSchema = z.object({
  clientId: z.string().uuid('Cliente inválido.'),
  serviceId: z.string().uuid('Serviço inválido.').optional().nullable(),
  packageName: z.string().trim().min(2, 'Nome do pacote obrigatório.'),
  totalSessions: z.number().int().min(1, 'Mínimo de 1 sessão.'),
  usedSessions: z.number().int().min(0).default(0),
  priceCents: z.number().int().min(0).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  status: z.enum(['ativo', 'concluido', 'cancelado']).default('ativo'),
});

export const adminServiceSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter no mínimo 2 caracteres.').max(100),
  description: z.string().trim().max(1000).default('').optional(),
  durationMinutes: z.number().int().min(15, 'Mínimo de 15 minutos.').max(480, 'Máximo de 480 minutos.'),
  intervalMinutes: z.number().int().min(0, 'Mínimo de 0 minutos.').max(180, 'Máximo de 180 minutos.').default(15),
  priceCents: z.number().int().min(0).nullable().optional(),
  priceVisible: z.boolean().default(true),
  published: z.boolean().default(true),
  modalities: z.array(z.enum(['presencial', 'online'])).min(1, 'Selecione ao menos uma modalidade (presencial ou online).'),
  pricingTiers: z.array(servicePriceTierSchema).optional().nullable(),
  packageBookingMode: z.enum(['sequencial', 'livre']).default('sequencial'),
  audioUrl: z.string().optional().nullable(),
  audioName: z.string().max(255).optional().nullable(),
});

export type AdminServiceInput = z.infer<typeof adminServiceSchema>;


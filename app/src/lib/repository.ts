import 'server-only';

import { randomUUID } from 'node:crypto';
import type {
  AdminService,
  AgendaSettings,
  AppointmentSummary,
  ClientDocument,
  ClientDocumentFile,
  ClinicalEvolution,
  ClinicalTechnique,
  ClientRecord,
  ClientReferral,
  ClientSummary,
  EmergencyContact,
  ProntuarioAccessLog,
  ProntuarioFull,
  Service,
  ServicePriceTier,
  ClientPackage,
  ClientPackageStatus,
  TimeBlock,
  TreatmentGoal,
} from './domain';
import { getDatabase, IDS } from './db';
import { recordAuditLog } from './audit';
import { hashPassword, verifyPassword } from './auth';
import { dateKeyInClinicTimeZone, localDateBounds, timeKeyInClinicTimeZone, weekdayForLocalDate, zonedDateTimeToUtc } from './time';
import type { z } from 'zod';
import type {
  agendaSettingsPatchSchema,
  appointmentEditSchema,
  appointmentResizeSchema,
  bookingSchema,
  clientDocumentSchema,
  clinicalEvolutionSchema,
  clinicalTechniqueSchema,
  clientRecordSchema,
  clientReferralSchema,
  clientSchema,
  internalAppointmentSchema,
  timeBlockCreateSchema,
  treatmentGoalSchema,
  adminServiceSchema,
} from './validation';

type AdminServiceInput = z.infer<typeof adminServiceSchema>;
type BookingInput = z.infer<typeof bookingSchema>;
type ClientInput = z.infer<typeof clientSchema>;
type InternalAppointmentInput = z.infer<typeof internalAppointmentSchema>;
type AppointmentResizeInput = z.infer<typeof appointmentResizeSchema>;
type AppointmentEditInput = z.infer<typeof appointmentEditSchema>;
type AgendaSettingsPatchInput = z.infer<typeof agendaSettingsPatchSchema>;
type TimeBlockCreateInput = z.infer<typeof timeBlockCreateSchema>;
type ClientRecordInput = z.infer<typeof clientRecordSchema>;
type TreatmentGoalInput = z.infer<typeof treatmentGoalSchema>;
type ClinicalEvolutionInput = z.infer<typeof clinicalEvolutionSchema>;
type ClinicalTechniqueInput = z.infer<typeof clinicalTechniqueSchema>;
type ClientDocumentInput = z.infer<typeof clientDocumentSchema>;
type ClientReferralInput = z.infer<typeof clientReferralSchema>;
type Database = ReturnType<typeof getDatabase>;

type ServiceRow = {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  interval_minutes: number;
  price_cents: number | null;
  price_visible: number;
  published: number;
  pricing_tiers?: string | null;
  package_booking_mode?: string | null;
  audio_url?: string | null;
  audio_name?: string | null;
};

let serviceAudioColumnsEnsured = false;
async function ensureServiceAudioColumns(database: Database) {
  if (serviceAudioColumnsEnsured) return;
  try {
    await database.prepare('ALTER TABLE services ADD COLUMN audio_url TEXT').run();
  } catch {
    // column already exists
  }
  try {
    await database.prepare('ALTER TABLE services ADD COLUMN audio_name TEXT').run();
  } catch {
    // column already exists
  }
  serviceAudioColumnsEnsured = true;
}

function normalizeBookingMode(raw: unknown): 'sequencial' | 'livre' {
  return raw === 'livre' ? 'livre' : 'sequencial';
}

function parsePricingTiers(raw: unknown): ServicePriceTier[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .map((item) => {
          const sessionCount = Number(item.sessionCount) > 0 ? Number(item.sessionCount) : 1;
          return {
            id: String(item.id || randomUUID()),
            name: String(item.name || ''),
            priceCents: Number(item.priceCents || 0),
            sessionCount,
            isPackage: Boolean(item.isPackage) || sessionCount > 1,
          };
        })
        .filter((tier) => tier.name.trim().length > 0);
    }
  } catch {}
  return undefined;
}

export class BookingConflictError extends Error {
  constructor(message = 'Este horário acabou de ser reservado. Escolha outra opção.') {
    super(message);
    this.name = 'BookingConflictError';
  }
}

export class BookingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingValidationError';
  }
}

export class AgendaPermissionError extends Error {
  constructor(message = 'Você não tem permissão para gerenciar esta parte da agenda.') {
    super(message);
    this.name = 'AgendaPermissionError';
  }
}

export class AppointmentStaleError extends Error {
  constructor(message = 'Este atendimento foi alterado em outra tela. A agenda será atualizada.') {
    super(message);
    this.name = 'AppointmentStaleError';
  }
}

export async function listPublicServices(): Promise<Service[]> {
  const database = getDatabase();
  await ensureServiceAudioColumns(database);
  const services = (await database.prepare(`
    SELECT id, name, description, duration_minutes, interval_minutes, price_cents, price_visible, published, pricing_tiers, package_booking_mode, audio_url, audio_name
    FROM services WHERE clinic_id = ? AND published = 1 ORDER BY created_at
  `).all(IDS.clinic)) as ServiceRow[];
  const modalityQuery = database.prepare('SELECT modality FROM service_modalities WHERE service_id = ? ORDER BY modality');

  return await Promise.all(services.map(async (service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    durationMinutes: service.duration_minutes,
    priceCents: service.price_cents,
    priceVisible: Boolean(service.price_visible),
    modalities: ((await modalityQuery.all(service.id)) as Array<{ modality: 'presencial' | 'online' }>).map((row) => row.modality),
    pricingTiers: parsePricingTiers(service.pricing_tiers),
    packageBookingMode: normalizeBookingMode(service.package_booking_mode),
    audioUrl: service.audio_url ?? null,
    audioName: service.audio_name ?? null,
  })));
}

export async function listAdminServices(): Promise<AdminService[]> {
  const database = getDatabase();
  await ensureServiceAudioColumns(database);
  const services = (await database.prepare(`
    SELECT id, name, description, duration_minutes, interval_minutes,
           price_cents, price_visible, published, pricing_tiers, package_booking_mode, audio_url, audio_name
    FROM services
    WHERE clinic_id = ?
    ORDER BY created_at, name COLLATE NOCASE
  `).all(IDS.clinic)) as ServiceRow[];
  const modalityQuery = database.prepare('SELECT modality FROM service_modalities WHERE service_id = ? ORDER BY modality');

  return await Promise.all(services.map(async (service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    durationMinutes: service.duration_minutes,
    intervalMinutes: service.interval_minutes,
    priceCents: service.price_cents,
    priceVisible: Boolean(service.price_visible),
    published: Boolean(service.published),
    modalities: ((await modalityQuery.all(service.id)) as Array<{ modality: 'presencial' | 'online' }>).map((row) => row.modality),
    pricingTiers: parsePricingTiers(service.pricing_tiers),
    packageBookingMode: normalizeBookingMode(service.package_booking_mode),
    audioUrl: service.audio_url ?? null,
    audioName: service.audio_name ?? null,
  })));
}

export async function getAdminServiceById(serviceId: string): Promise<AdminService | null> {
  const database = getDatabase();
  await ensureServiceAudioColumns(database);
  const service = (await database.prepare(`
    SELECT id, name, description, duration_minutes, interval_minutes,
           price_cents, price_visible, published, pricing_tiers, package_booking_mode, audio_url, audio_name
    FROM services
    WHERE id = ? AND clinic_id = ?
  `).get(serviceId, IDS.clinic)) as ServiceRow | undefined;

  if (!service) return null;

  const modalities = ((await database.prepare('SELECT modality FROM service_modalities WHERE service_id = ? ORDER BY modality').all(service.id)) as Array<{ modality: 'presencial' | 'online' }>).map((row) => row.modality);

  return {
    id: service.id,
    name: service.name,
    description: service.description,
    durationMinutes: service.duration_minutes,
    intervalMinutes: service.interval_minutes,
    priceCents: service.price_cents,
    priceVisible: Boolean(service.price_visible),
    published: Boolean(service.published),
    modalities,
    pricingTiers: parsePricingTiers(service.pricing_tiers),
    packageBookingMode: normalizeBookingMode(service.package_booking_mode),
    audioUrl: service.audio_url ?? null,
    audioName: service.audio_name ?? null,
  };
}

export async function createAdminService(input: AdminServiceInput): Promise<AdminService> {
  const database = getDatabase();
  await ensureServiceAudioColumns(database);
  const id = randomUUID();
  const now = new Date().toISOString();
  const pricingTiersJson = input.pricingTiers && input.pricingTiers.length > 0 ? JSON.stringify(input.pricingTiers) : null;
  const audioUrl = input.audioUrl?.trim() ? input.audioUrl.trim() : null;
  const audioName = input.audioName?.trim() ? input.audioName.trim() : null;

  await database.transaction(async (tx) => {
    await tx.prepare(`
      INSERT INTO services (
        id, clinic_id, name, description, duration_minutes, interval_minutes,
        price_cents, price_visible, published, pricing_tiers, package_booking_mode, audio_url, audio_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      IDS.clinic,
      input.name.trim(),
      (input.description || '').trim(),
      input.durationMinutes,
      input.intervalMinutes ?? 15,
      input.priceCents ?? null,
      input.priceVisible ? 1 : 0,
      input.published ? 1 : 0,
      pricingTiersJson,
      normalizeBookingMode(input.packageBookingMode),
      audioUrl,
      audioName,
      now,
      now
    );

    const insertModality = tx.prepare('INSERT INTO service_modalities (service_id, modality) VALUES (?, ?)');
    for (const modality of input.modalities) {
      await insertModality.run(id, modality);
    }
  });

  return {
    id,
    name: input.name.trim(),
    description: (input.description || '').trim(),
    durationMinutes: input.durationMinutes,
    intervalMinutes: input.intervalMinutes ?? 15,
    priceCents: input.priceCents ?? null,
    priceVisible: Boolean(input.priceVisible),
    published: Boolean(input.published),
    modalities: input.modalities,
    pricingTiers: input.pricingTiers ?? undefined,
    packageBookingMode: normalizeBookingMode(input.packageBookingMode),
    audioUrl,
    audioName,
  };
}

export async function updateAdminService(serviceId: string, input: AdminServiceInput): Promise<AdminService> {
  const database = getDatabase();
  await ensureServiceAudioColumns(database);
  const existing = await database.prepare('SELECT id FROM services WHERE id = ? AND clinic_id = ?').get(serviceId, IDS.clinic);
  if (!existing) {
    throw new BookingValidationError('Serviço não encontrado.');
  }

  const now = new Date().toISOString();
  const pricingTiersJson = input.pricingTiers && input.pricingTiers.length > 0 ? JSON.stringify(input.pricingTiers) : null;
  const audioUrl = input.audioUrl?.trim() ? input.audioUrl.trim() : null;
  const audioName = input.audioName?.trim() ? input.audioName.trim() : null;

  await database.transaction(async (tx) => {
    await tx.prepare(`
      UPDATE services
      SET name = ?,
          description = ?,
          duration_minutes = ?,
          interval_minutes = ?,
          price_cents = ?,
          price_visible = ?,
          published = ?,
          pricing_tiers = ?,
          package_booking_mode = ?,
          audio_url = ?,
          audio_name = ?,
          updated_at = ?
      WHERE id = ? AND clinic_id = ?
    `).run(
      input.name.trim(),
      (input.description || '').trim(),
      input.durationMinutes,
      input.intervalMinutes ?? 15,
      input.priceCents ?? null,
      input.priceVisible ? 1 : 0,
      input.published ? 1 : 0,
      pricingTiersJson,
      normalizeBookingMode(input.packageBookingMode),
      audioUrl,
      audioName,
      now,
      serviceId,
      IDS.clinic
    );

    await tx.prepare('DELETE FROM service_modalities WHERE service_id = ?').run(serviceId);
    const insertModality = tx.prepare('INSERT INTO service_modalities (service_id, modality) VALUES (?, ?)');
    for (const modality of input.modalities) {
      await insertModality.run(serviceId, modality);
    }
  });

  return {
    id: serviceId,
    name: input.name.trim(),
    description: (input.description || '').trim(),
    durationMinutes: input.durationMinutes,
    intervalMinutes: input.intervalMinutes ?? 15,
    priceCents: input.priceCents ?? null,
    priceVisible: Boolean(input.priceVisible),
    published: Boolean(input.published),
    modalities: input.modalities,
    pricingTiers: input.pricingTiers ?? undefined,
    packageBookingMode: normalizeBookingMode(input.packageBookingMode),
    audioUrl,
    audioName,
  };
}

export async function deleteAdminService(serviceId: string): Promise<{ deleted: boolean; message?: string }> {
  const database = getDatabase();
  const existing = await database.prepare('SELECT id, name FROM services WHERE id = ? AND clinic_id = ?').get(serviceId, IDS.clinic);
  if (!existing) {
    throw new BookingValidationError('Serviço não encontrado.');
  }

  await database.transaction(async (tx) => {
    // Remove eventos de agendamentos associados
    await tx.prepare('DELETE FROM appointment_events WHERE appointment_id IN (SELECT id FROM appointments WHERE service_id = ?)').run(serviceId);
    // Remove agendamentos vinculados ao serviço
    await tx.prepare('DELETE FROM appointments WHERE service_id = ?').run(serviceId);
    // Remove inscrições em lista de espera
    await tx.prepare('DELETE FROM waitlist_entries WHERE service_id = ?').run(serviceId);
    // Remove modalidades vinculadas
    await tx.prepare('DELETE FROM service_modalities WHERE service_id = ?').run(serviceId);
    // Remove o próprio serviço
    await tx.prepare('DELETE FROM services WHERE id = ? AND clinic_id = ?').run(serviceId, IDS.clinic);
  });

  return { deleted: true, message: 'Serviço excluído com sucesso.' };
}

async function getService(serviceId: string, publishedOnly = true) {
  return (await getDatabase().prepare(`
    SELECT id, name, duration_minutes, interval_minutes, pricing_tiers FROM services
    WHERE id = ? AND clinic_id = ? AND (? = 0 OR published = 1)
  `).get(serviceId, IDS.clinic, publishedOnly ? 1 : 0)) as { id: string; name: string; duration_minutes: number; interval_minutes: number; pricing_tiers?: unknown } | undefined;
}

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function nextDateKey(date: string) {
  const nextDate = new Date(`${date}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}

type MinuteRange = { start: number; end: number };

function normalizeRanges(ranges: MinuteRange[]) {
  const sorted = ranges
    .filter((range) => range.start < range.end)
    .sort((left, right) => left.start - right.start);
  const normalized: MinuteRange[] = [];
  for (const range of sorted) {
    const previous = normalized.at(-1);
    if (!previous || range.start > previous.end) {
      normalized.push({ ...range });
    } else {
      previous.end = Math.max(previous.end, range.end);
    }
  }
  return normalized;
}

function subtractRange(ranges: MinuteRange[], exclusion: MinuteRange) {
  return ranges.flatMap((range) => {
    if (exclusion.end <= range.start || exclusion.start >= range.end) return [range];
    const remaining: MinuteRange[] = [];
    if (exclusion.start > range.start) remaining.push({ start: range.start, end: exclusion.start });
    if (exclusion.end < range.end) remaining.push({ start: exclusion.end, end: range.end });
    return remaining;
  });
}

async function scheduleRangesForDate(database: Database, professionalId: string, date: string, publicOnly: boolean) {
  const weekday = weekdayForLocalDate(date);
  const holiday = (await database.prepare('SELECT 1 FROM holidays WHERE clinic_id = ? AND date = ?').get(IDS.clinic, date));
  const hours = (await database.prepare(`
    SELECT start_time, end_time
    FROM working_hours
    WHERE clinic_id = ? AND professional_id = ? AND weekday = ?
      AND (? = 0 OR public_booking = 1)
    ORDER BY start_time
  `).all(IDS.clinic, professionalId, weekday, publicOnly ? 1 : 0)) as Array<{ start_time: string; end_time: string }>;
  let ranges = holiday
    ? []
    : hours.map((range) => ({ start: timeToMinutes(range.start_time), end: timeToMinutes(range.end_time) }));

  const exceptions = (await database.prepare(`
    SELECT start_time, end_time, available
    FROM availability_exceptions
    WHERE clinic_id = ? AND professional_id = ? AND date = ?
    ORDER BY available DESC, start_time
  `).all(IDS.clinic, professionalId, date)) as Array<{
    start_time: string | null;
    end_time: string | null;
    available: number;
  }>;

  for (const exception of exceptions.filter((item) => Boolean(item.available))) {
    if (!exception.start_time || !exception.end_time) continue;
    ranges.push({ start: timeToMinutes(exception.start_time), end: timeToMinutes(exception.end_time) });
  }
  ranges = normalizeRanges(ranges);

  for (const exception of exceptions.filter((item) => !item.available)) {
    if (!exception.start_time || !exception.end_time) {
      ranges = [];
      break;
    }
    ranges = subtractRange(ranges, {
      start: timeToMinutes(exception.start_time),
      end: timeToMinutes(exception.end_time),
    });
  }
  return normalizeRanges(ranges);
}

async function fitsWorkingSchedule(
  database: Database,
  professionalId: string,
  date: string,
  startTime: string,
  start: Date,
  end: Date,
) {
  if (dateKeyInClinicTimeZone(end) !== date && end.getTime() !== zonedDateTimeToUtc(nextDateKey(date), '00:00').getTime()) {
    return false;
  }
  const startMinutes = timeToMinutes(startTime);
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  const endMinutes = startMinutes + durationMinutes;
  return (await scheduleRangesForDate(database, professionalId, date, false))
    .some((range) => startMinutes >= range.start && endMinutes <= range.end);
}

async function findScheduleConflict(
  database: Database,
  input: {
    professionalId: string;
    start: Date;
    end: Date;
    intervalMinutes?: number;
    excludeAppointmentId?: string;
    excludeTimeBlockId?: string;
  },
): Promise<'appointment' | 'time_block' | null> {
  const occupiedEnd = new Date(input.end.getTime() + (input.intervalMinutes ?? 0) * 60_000).toISOString();
  const startAt = input.start.toISOString();
  const appointment = (await database.prepare(`
    SELECT 1
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    WHERE a.clinic_id = ? AND a.professional_id = ?
      AND a.status NOT IN ('cancelado', 'nao_compareceu')
      AND (? IS NULL OR a.id <> ?)
      AND julianday(a.start_at) < julianday(?)
      AND julianday(a.end_at) + (s.interval_minutes / 1440.0) > julianday(?)
    LIMIT 1
  `).get(
    IDS.clinic,
    input.professionalId,
    input.excludeAppointmentId ?? null,
    input.excludeAppointmentId ?? null,
    occupiedEnd,
    startAt,
  ));
  if (appointment) return 'appointment';

  const timeBlock = (await database.prepare(`
    SELECT 1
    FROM time_blocks
    WHERE clinic_id = ? AND professional_id = ?
      AND (? IS NULL OR id <> ?)
      AND julianday(start_at) < julianday(?)
      AND julianday(end_at) > julianday(?)
    LIMIT 1
  `).get(
    IDS.clinic,
    input.professionalId,
    input.excludeTimeBlockId ?? null,
    input.excludeTimeBlockId ?? null,
    occupiedEnd,
    startAt,
  ));
  return timeBlock ? 'time_block' : null;
}

async function publicSlotMeetsCurrentRules(
  database: Database,
  service: { duration_minutes: number },
  date: string,
  time: string,
  start: Date,
) {
  const cursor = timeToMinutes(time);
  const followsWorkingHours = (await scheduleRangesForDate(database, IDS.professional, date, true)).some((range) => (
    cursor >= range.start
    && cursor + service.duration_minutes <= range.end
    && (cursor - range.start) % 30 === 0
  ));
  if (!followsWorkingHours) return false;

  const settings = (await database.prepare(`
    SELECT minimum_notice_minutes
    FROM clinic_settings
    WHERE clinic_id = ?
  `).get(IDS.clinic)) as { minimum_notice_minutes: number } | undefined;
  const minimumStart = Date.now() + (settings?.minimum_notice_minutes ?? 720) * 60_000;
  return start.getTime() >= minimumStart;
}

export async function getAvailability(serviceId: string, date: string) {
  const database = getDatabase();
  const service = (await getService(serviceId));
  if (!service) return [];

  const ranges = (await scheduleRangesForDate(database, IDS.professional, date, true));
  const settings = (await database.prepare('SELECT minimum_notice_minutes FROM clinic_settings WHERE clinic_id = ?').get(IDS.clinic)) as { minimum_notice_minutes: number };
  const minimumStart = Date.now() + settings.minimum_notice_minutes * 60_000;
  const slots: Array<{ time: string; startAt: string }> = [];

  for (const range of ranges) {
    for (let cursor = range.start; cursor + service.duration_minutes <= range.end; cursor += 30) {
      const time = minutesToTime(cursor);
      const start = zonedDateTimeToUtc(date, time);
      const end = new Date(start.getTime() + service.duration_minutes * 60_000);
      if (start.getTime() < minimumStart) continue;

      const conflict = (await findScheduleConflict(database, {
        professionalId: IDS.professional,
        start,
        end,
        intervalMinutes: service.interval_minutes,
      }));
      if (!conflict) slots.push({ time, startAt: start.toISOString() });
    }
  }
  return slots;
}

/**
 * Regra de agendamento de pacotes.
 * Retorna a sessão pendente (agendada e ainda não realizada) que bloqueia o agendamento da próxima,
 * quando o serviço está no modo 'sequencial' (padrão). No modo 'livre', nunca bloqueia.
 * Sessões canceladas não bloqueiam; sessões concluídas ou com falta (não compareceu) liberam a próxima.
 */
async function getPackagePendingSession(
  database: Database,
  packageId: string,
  serviceId: string | null,
): Promise<{ id: string; sessionNumber: number | null; startAt: string } | null> {
  let mode: 'sequencial' | 'livre' = 'sequencial';
  if (serviceId) {
    const svc = (await database.prepare('SELECT package_booking_mode FROM services WHERE id = ?').get(serviceId)) as
      | { package_booking_mode?: string | null }
      | undefined;
    mode = normalizeBookingMode(svc?.package_booking_mode);
  }
  if (mode === 'livre') return null;

  const row = (await database.prepare(`
    SELECT id, session_number, start_at
    FROM appointments
    WHERE client_package_id = ?
      AND status IN ('solicitado', 'confirmado', 'em_atendimento')
    ORDER BY start_at ASC
    LIMIT 1
  `).get(packageId)) as { id: string; session_number: number | null; start_at: string } | undefined;

  return row ? { id: row.id, sessionNumber: row.session_number ?? null, startAt: row.start_at } : null;
}

export async function createPublicBooking(input: BookingInput, explicitClientId?: string | null) {
  const database = getDatabase();
  const service = (await getService(input.serviceId));
  if (!service) throw new Error('Serviço indisponível.');

  const modality = (await database.prepare('SELECT 1 FROM service_modalities WHERE service_id = ? AND modality = ?').get(
    input.serviceId,
    input.modality,
  ));
  if (!modality) throw new Error('Modalidade indisponível para este serviço.');

  const available = (await getAvailability(input.serviceId, input.date)).some((slot) => slot.time === input.time);
  if (!available) throw new BookingConflictError();

  const start = zonedDateTimeToUtc(input.date, input.time);
  let end = new Date(start.getTime() + service.duration_minutes * 60_000);
  const appointmentId = randomUUID();
  let createdClientId: string | null = null;
  let packageSummary: { id: string; name: string; totalSessions: number; usedSessions: number; remainingSessions: number } | null = null;
  (await database.exec('BEGIN IMMEDIATE'));
  try {
    const currentService = (await getService(input.serviceId));
    if (!currentService || !(await publicSlotMeetsCurrentRules(database, currentService, input.date, input.time, start))) {
      throw new BookingConflictError('Este horário não está mais disponível. Escolha outra opção.');
    }
    end = new Date(start.getTime() + currentService.duration_minutes * 60_000);
    const conflict = (await findScheduleConflict(database, {
      professionalId: IDS.professional,
      start,
      end,
      intervalMinutes: currentService.interval_minutes,
    }));
    if (conflict) throw new BookingConflictError();

    const settings = (await database.prepare(`
      SELECT booking_confirmation_mode
      FROM clinic_settings
      WHERE clinic_id = ?
    `).get(IDS.clinic)) as { booking_confirmation_mode: 'manual' | 'automatico' } | undefined;
    const status = settings?.booking_confirmation_mode === 'automatico' ? 'confirmado' : 'solicitado';

    const cleanPhone = (input.phone || '').replace(/\D/g, '');
    const cleanCpf = input.cpf ? input.cpf.replace(/\D/g, '') : null;
    const cleanEmail = (input.email || '').trim().toLowerCase();

    let client: { id: string } | undefined;

    if (explicitClientId) {
      client = (await database.prepare('SELECT id FROM clients WHERE id = ? AND clinic_id = ?').get(explicitClientId, IDS.clinic)) as { id: string } | undefined;
    }

    if (!client && cleanCpf && cleanCpf.length === 11) {
      const byCpf = (await database.prepare(`
        SELECT c.id FROM clients c
        JOIN client_records cr ON cr.client_id = c.id
        WHERE c.clinic_id = ? AND REPLACE(REPLACE(REPLACE(cr.cpf, '.', ''), '-', ''), ' ', '') = ?
        LIMIT 1
      `).get(IDS.clinic, cleanCpf)) as { id: string } | undefined;
      if (byCpf) client = byCpf;
    }

    if (!client && cleanPhone.length >= 8) {
      const byPhone = (await database.prepare(`
        SELECT id FROM clients
        WHERE clinic_id = ?
          AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') LIKE '%' || ?
        LIMIT 1
      `).get(IDS.clinic, cleanPhone.slice(-8))) as { id: string } | undefined;
      if (byPhone) client = byPhone;
    }

    if (!client && cleanEmail) {
      const byEmail = (await database.prepare(`
        SELECT id FROM clients
        WHERE clinic_id = ? AND LOWER(email) = ?
        LIMIT 1
      `).get(IDS.clinic, cleanEmail)) as { id: string } | undefined;
      if (byEmail) client = byEmail;
    }

    if (!client) {
      client = { id: randomUUID() };
      (await database.prepare(`
        INSERT INTO clients (id, clinic_id, name, phone, email, status)
        VALUES (?, ?, ?, ?, ?, 'pendente')
      `).run(client.id, IDS.clinic, input.name, cleanPhone || input.phone, cleanEmail || null));
    } else {
      (await database.prepare(`UPDATE clients SET name = ?, phone = COALESCE(?, phone), email = COALESCE(?, email), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
        .run(input.name, cleanPhone || null, cleanEmail || null, client.id));
    }
    createdClientId = client.id;

    if (input.cpf || input.birthDate) {
      const cleanCpf = input.cpf ? input.cpf.replace(/\D/g, '') : null;
      const nowRec = new Date().toISOString();
      const existingRec = await database.prepare('SELECT client_id FROM client_records WHERE client_id = ?').get(client.id);
      if (existingRec) {
        await database.prepare(`
          UPDATE client_records
          SET cpf = COALESCE(?, cpf),
              birth_date = COALESCE(?, birth_date),
              updated_at = ?
          WHERE client_id = ?
        `).run(cleanCpf || null, input.birthDate || null, nowRec, client.id);
      } else {
        await database.prepare(`
          INSERT INTO client_records (client_id, cpf, birth_date, updated_at)
          VALUES (?, ?, ?, ?)
        `).run(client.id, cleanCpf || null, input.birthDate || null, nowRec);
      }
    }

    // Identificação e Ativação/Consumo de Pacote de Múltiplas Sessões
    const tiers = parsePricingTiers(currentService?.pricing_tiers);
    const selectedTier = input.tierId ? tiers?.find((t: ServicePriceTier) => t.id === input.tierId) : undefined;
    let packageId: string | null = null;
    let sessionNumber: number | null = null;

    if (input.packageId) {
      const existingPkg = (await database.prepare(`
        SELECT id, package_name, total_sessions, used_sessions, status
        FROM client_packages
        WHERE id = ? AND client_id = ?
      `).get(input.packageId, client.id)) as {
        id: string;
        package_name: string;
        total_sessions: number;
        used_sessions: number;
        status: string;
      } | undefined;

      if (!existingPkg) {
        throw new BookingValidationError('Pacote de sessões não encontrado para este cliente.');
      }
      if (existingPkg.used_sessions >= existingPkg.total_sessions) {
        throw new BookingValidationError('Todas as sessões configuradas neste pacote já foram utilizadas.');
      }

      // Regra de agendamento sequencial (padrão): só libera a próxima sessão após a anterior ser concluída
      const pending = await getPackagePendingSession(database, existingPkg.id, input.serviceId);
      if (pending) {
        throw new BookingValidationError(
          `${pending.sessionNumber ? `A sessão ${pending.sessionNumber}` : 'A sessão anterior'} deste pacote ainda não foi realizada. A próxima sessão será liberada para agendamento assim que ela for concluída.`,
        );
      }

      const nextSession = existingPkg.used_sessions + 1;
      const newPkgStatus = nextSession >= existingPkg.total_sessions ? 'concluido' : 'ativo';
      const now = new Date().toISOString();

      await database.prepare(`
        UPDATE client_packages
        SET used_sessions = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(nextSession, newPkgStatus, now, existingPkg.id);

      packageId = existingPkg.id;
      sessionNumber = nextSession;
      packageSummary = {
        id: existingPkg.id,
        name: existingPkg.package_name,
        totalSessions: existingPkg.total_sessions,
        usedSessions: nextSession,
        remainingSessions: Math.max(0, existingPkg.total_sessions - nextSession),
      };
    } else if (selectedTier && selectedTier.sessionCount && selectedTier.sessionCount > 1) {
      packageId = randomUUID();
      const now = new Date().toISOString();
      const total = selectedTier.sessionCount;
      (await database.prepare(`
        INSERT INTO client_packages (
          id, clinic_id, client_id, service_id, package_name,
          total_sessions, used_sessions, price_cents, status, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'ativo', 'Pacote contratado no agendamento online', ?, ?)
      `).run(
        packageId,
        IDS.clinic,
        client.id,
        input.serviceId,
        selectedTier.name,
        total,
        selectedTier.priceCents,
        now,
        now,
      ));

      sessionNumber = 1;
      packageSummary = {
        id: packageId,
        name: selectedTier.name,
        totalSessions: total,
        usedSessions: 1,
        remainingSessions: total - 1,
      };
    }

    (await database.prepare(`
      INSERT INTO appointments (
        id, clinic_id, professional_id, client_id, service_id, modality,
        start_at, end_at, status, source, administrative_notes,
        client_package_id, session_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'publico', ?, ?, ?)
    `).run(
      appointmentId,
      IDS.clinic,
      IDS.professional,
      client.id,
      input.serviceId,
      input.modality,
      start.toISOString(),
      end.toISOString(),
      status,
      input.notes || null,
      packageId,
      sessionNumber,
    ));
    (await database.prepare(`
      INSERT INTO appointment_events (id, appointment_id, event_type, new_value)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), appointmentId, status, JSON.stringify({ source: 'publico', status, packageId, sessionNumber })));

    // Registro financeiro do agendamento online (forma de pagamento escolhida pelo cliente)
    if (!input.packageId) {
      const svcRow = (await database.prepare('SELECT name, price_cents FROM services WHERE id = ?').get(input.serviceId)) as
        | { name: string; price_cents: number | null }
        | undefined;
      const priceCents = Number(selectedTier?.priceCents ?? svcRow?.price_cents ?? 0);
      if (priceCents > 0) {
        const methodMap: Record<string, string> = { pix: 'pix', dinheiro: 'dinheiro', cartao: 'cartao' };
        const method = methodMap[input.paymentMethod || 'pix'] || 'pix';
        const nowIso = new Date().toISOString();
        await database.prepare(`
          INSERT INTO client_payments (
            id, clinic_id, client_id, appointment_id, service_id, client_package_id,
            entry_type, category, charge_type, description,
            amount_cents, paid_amount_cents, remaining_amount_cents, discount_cents,
            payment_method, status, due_at, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'entrada', ?, 'avulso', ?, ?, 0, ?, 0, ?, 'pendente', ?, ?, ?, ?)
        `).run(
          randomUUID(),
          IDS.clinic,
          client.id,
          appointmentId,
          input.serviceId,
          packageId,
          packageId ? 'pacote_tratamento' : 'sessao_avulsa',
          selectedTier
            ? (selectedTier.name.toLowerCase().includes((svcRow?.name ?? '').toLowerCase().trim())
                ? `${selectedTier.name} (agendamento online)`
                : `${svcRow?.name ?? 'Atendimento'} — ${selectedTier.name} (agendamento online)`)
            : `${svcRow?.name ?? 'Atendimento'} (agendamento online)`,
          priceCents,
          priceCents,
          method,
          start.toISOString(),
          'Forma de pagamento escolhida pelo cliente no agendamento online',
          nowIso,
          nowIso,
        );
      }
    }
    (await database.exec('COMMIT'));
  } catch (error) {
    (await database.exec('ROLLBACK'));
    throw error;
  }

  const created = (await database.prepare('SELECT status FROM appointments WHERE id = ?').get(appointmentId)) as {
    status: 'solicitado' | 'confirmado';
  };
  return {
    id: appointmentId,
    clientId: createdClientId,
    status: created.status,
    startAt: start.toISOString(),
    serviceName: service.name,
    package: packageSummary,
  };
}

export async function listClientPackages(clientId?: string): Promise<ClientPackage[]> {
  const database = getDatabase();
  const sql = clientId
    ? `
      SELECT p.*, c.name as client_name, s.name as service_name, s.package_booking_mode
      FROM client_packages p
      JOIN clients c ON c.id = p.client_id
      LEFT JOIN services s ON s.id = p.service_id
      WHERE p.clinic_id = ? AND p.client_id = ?
      ORDER BY p.created_at DESC
    `
    : `
      SELECT p.*, c.name as client_name, s.name as service_name, s.package_booking_mode
      FROM client_packages p
      JOIN clients c ON c.id = p.client_id
      LEFT JOIN services s ON s.id = p.service_id
      WHERE p.clinic_id = ?
      ORDER BY p.created_at DESC
    `;
  const params = clientId ? [IDS.clinic, clientId] : [IDS.clinic];
  const rows = (await database.prepare(sql).all(...params)) as Array<Record<string, unknown>>;

  return Promise.all(
    rows.map(async (r) => {
      const pkgId = String(r.id);
      const serviceId = r.service_id ? String(r.service_id) : null;
      const bookingMode = normalizeBookingMode(r.package_booking_mode as string | null | undefined);
      const totalSessions = Number(r.total_sessions || 1);

      const counts = (await database.prepare(`
        SELECT
          COUNT(CASE WHEN status = 'concluido' THEN 1 END) as completed_count,
          COUNT(CASE WHEN status IN ('solicitado', 'confirmado', 'em_atendimento') THEN 1 END) as scheduled_count
        FROM appointments
        WHERE client_package_id = ?
      `).get(pkgId)) as { completed_count?: number; scheduled_count?: number } | undefined;

      const completedSessions = Number(counts?.completed_count ?? 0);
      const scheduledSessions = Number(counts?.scheduled_count ?? 0);
      const remainingToSchedule = Math.max(0, totalSessions - (completedSessions + scheduledSessions));
      const remainingSessions = Math.max(0, totalSessions - completedSessions);
      const pendingSession = await getPackagePendingSession(database, pkgId, serviceId);

      return {
        id: pkgId,
        clinicId: String(r.clinic_id),
        clientId: String(r.client_id),
        clientName: r.client_name ? String(r.client_name) : undefined,
        serviceId,
        serviceName: r.service_name ? String(r.service_name) : undefined,
        packageName: String(r.package_name),
        totalSessions,
        usedSessions: completedSessions + scheduledSessions,
        remainingSessions,
        completedSessions,
        scheduledSessions,
        remainingToSchedule,
        bookingMode,
        pendingSession,
        priceCents: r.price_cents !== null && r.price_cents !== undefined ? Number(r.price_cents) : null,
        status: (r.status || 'ativo') as ClientPackageStatus,
        notes: r.notes ? String(r.notes) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    })
  );
}

export async function createClientPackage(input: {
  clientId: string;
  serviceId?: string | null;
  packageName: string;
  totalSessions: number;
  usedSessions?: number;
  priceCents?: number | null;
  status?: ClientPackageStatus;
  notes?: string | null;
}): Promise<ClientPackage> {
  const database = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const usedSessions = input.usedSessions ?? 0;
  const status = input.status || (usedSessions >= input.totalSessions ? 'concluido' : 'ativo');

  await database.prepare(`
    INSERT INTO client_packages (
      id, clinic_id, client_id, service_id, package_name,
      total_sessions, used_sessions, price_cents, status, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    IDS.clinic,
    input.clientId,
    input.serviceId || null,
    input.packageName,
    input.totalSessions,
    usedSessions,
    input.priceCents ?? null,
    status,
    input.notes || null,
    now,
    now,
  );

  return {
    id,
    clinicId: IDS.clinic,
    clientId: input.clientId,
    serviceId: input.serviceId || null,
    packageName: input.packageName,
    totalSessions: input.totalSessions,
    usedSessions,
    remainingSessions: Math.max(0, input.totalSessions - usedSessions),
    priceCents: input.priceCents ?? null,
    status,
    notes: input.notes || null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listClients(search = '', status = 'todos'): Promise<ClientSummary[]> {
  const database = getDatabase();
  const cleanSearch = search.trim();
  const term = `%${cleanSearch}%`;
  const digitsTerm = cleanSearch.replace(/\D/g, '') ? `%${cleanSearch.replace(/\D/g, '')}%` : term;
  const todaySimpleStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const sqlStatus = status === 'inadimplente' || status === 'em_dia' ? 'todos' : status;

  const rows = (await database.prepare(`
    SELECT c.id, c.name, c.phone, c.email, c.status, c.administrative_notes, c.created_at,
      MIN(CASE WHEN a.start_at >= ? AND a.status NOT IN ('cancelado', 'nao_compareceu') THEN a.start_at END) AS next_appointment_at,
      SUM(CASE WHEN a.status = 'concluido' THEN 1 ELSE 0 END) AS completed_appointments,
      (SELECT COUNT(*) FROM client_packages cp WHERE cp.client_id = c.id AND cp.status = 'ativo') AS active_packages_count,
      (SELECT COALESCE(SUM(cp.total_sessions - cp.used_sessions), 0) FROM client_packages cp WHERE cp.client_id = c.id AND cp.status = 'ativo') AS active_packages_remaining_sessions,
      (SELECT cr.cpf FROM client_records cr WHERE cr.client_id = c.id) AS cpf,
      (SELECT cr.rg FROM client_records cr WHERE cr.client_id = c.id) AS rg,
      (SELECT cr.birth_date FROM client_records cr WHERE cr.client_id = c.id) AS birth_date,
      (SELECT cr.gender FROM client_records cr WHERE cr.client_id = c.id) AS gender,
      (SELECT cr.occupation FROM client_records cr WHERE cr.client_id = c.id) AS occupation,
      (SELECT cr.emergency_contact_name FROM client_records cr WHERE cr.client_id = c.id) AS emergency_contact_name,
      (SELECT cr.emergency_contact_phone FROM client_records cr WHERE cr.client_id = c.id) AS emergency_contact_phone,
      (SELECT cr.emergency_contact_relationship FROM client_records cr WHERE cr.client_id = c.id) AS emergency_contact_relationship,
      (SELECT CASE WHEN cr.consent_agreed = 1 OR COALESCE(cr.chief_complaint, '') != '' OR COALESCE(cr.cpf, '') != '' THEN 1 ELSE 0 END FROM client_records cr WHERE cr.client_id = c.id) AS has_anamnese,
      (SELECT COALESCE(SUM(p.remaining_amount_cents), 0) FROM client_payments p WHERE p.client_id = c.id AND p.entry_type = 'entrada' AND p.status != 'cancelado') AS open_balance_cents,
      (SELECT COALESCE(SUM(p.paid_amount_cents), 0) FROM client_payments p WHERE p.client_id = c.id AND p.entry_type = 'entrada' AND p.status != 'cancelado') AS total_paid_cents,
      (SELECT COALESCE(SUM(p.remaining_amount_cents), 0) FROM client_payments p WHERE p.client_id = c.id AND p.entry_type = 'entrada' AND p.status NOT IN ('cancelado', 'pago') AND p.remaining_amount_cents > 0 AND p.due_at IS NOT NULL AND SUBSTR(p.due_at, 1, 10) < ?) AS overdue_balance_cents,
      (SELECT COUNT(*) FROM client_payments p WHERE p.client_id = c.id AND p.entry_type = 'entrada' AND p.status NOT IN ('cancelado', 'pago') AND p.remaining_amount_cents > 0 AND p.due_at IS NOT NULL AND SUBSTR(p.due_at, 1, 10) < ?) AS overdue_invoices_count,
      (SELECT MIN(SUBSTR(p.due_at, 1, 10)) FROM client_payments p WHERE p.client_id = c.id AND p.entry_type = 'entrada' AND p.status NOT IN ('cancelado', 'pago') AND p.remaining_amount_cents > 0 AND p.due_at IS NOT NULL AND SUBSTR(p.due_at, 1, 10) < ?) AS oldest_overdue_due_at,
      (SELECT MIN(SUBSTR(p.due_at, 1, 10)) FROM client_payments p WHERE p.client_id = c.id AND p.entry_type = 'entrada' AND p.status NOT IN ('cancelado', 'pago') AND p.remaining_amount_cents > 0 AND p.due_at IS NOT NULL AND SUBSTR(p.due_at, 1, 10) >= ?) AS next_due_at,
      (SELECT COUNT(*) FROM client_payments p WHERE p.client_id = c.id AND p.entry_type = 'entrada' AND p.status NOT IN ('cancelado', 'pago') AND p.remaining_amount_cents > 0) AS pending_invoices_count
    FROM clients c
    LEFT JOIN appointments a ON a.client_id = c.id
    LEFT JOIN client_records cr_search ON cr_search.client_id = c.id
    WHERE c.clinic_id = ?
      AND (
        ? = ''
        OR c.name LIKE ?
        OR c.phone LIKE ?
        OR COALESCE(c.email, '') LIKE ?
        OR COALESCE(cr_search.cpf, '') LIKE ?
        OR REPLACE(REPLACE(REPLACE(COALESCE(cr_search.cpf, ''), '.', ''), '-', ''), ' ', '') LIKE ?
      )
      AND (? = 'todos' OR c.status = ?)
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE
  `).all(
    new Date().toISOString(),
    todaySimpleStr,
    todaySimpleStr,
    todaySimpleStr,
    todaySimpleStr,
    IDS.clinic,
    cleanSearch,
    term,
    term,
    term,
    term,
    digitsTerm,
    sqlStatus,
    sqlStatus
  )).map((row) => {
    const item = row as Record<string, unknown>;
    const overdueBalanceCents = Number(item.overdue_balance_cents ?? 0);
    const overdueInvoicesCount = Number(item.overdue_invoices_count ?? 0);
    const oldestOverdueDate = item.oldest_overdue_due_at ? String(item.oldest_overdue_due_at) : null;
    const nextDueDate = item.next_due_at ? String(item.next_due_at) : null;
    const pendingInvoicesCount = Number(item.pending_invoices_count ?? 0);
    const isInadimplente = overdueBalanceCents > 0;

    const daysOverdue = (() => {
      if (!oldestOverdueDate) return 0;
      const dOld = new Date(`${oldestOverdueDate}T12:00:00-03:00`);
      const dNow = new Date(`${todaySimpleStr}T12:00:00-03:00`);
      const diffMs = dNow.getTime() - dOld.getTime();
      return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    })();

    return {
      id: String(item.id),
      name: String(item.name),
      phone: String(item.phone),
      email: item.email ? String(item.email) : null,
      status: item.status as ClientSummary['status'],
      createdAt: String(item.created_at),
      nextAppointmentAt: item.next_appointment_at ? String(item.next_appointment_at) : null,
      completedAppointments: Number(item.completed_appointments ?? 0),
      activePackagesCount: Number(item.active_packages_count ?? 0),
      activePackagesRemainingSessions: Number(item.active_packages_remaining_sessions ?? 0),
      cpf: item.cpf ? String(item.cpf) : null,
      rg: item.rg ? String(item.rg) : null,
      birthDate: item.birth_date ? String(item.birth_date) : null,
      gender: item.gender ? String(item.gender) : null,
      occupation: item.occupation ? String(item.occupation) : null,
      administrativeNotes: item.administrative_notes ? String(item.administrative_notes) : null,
      emergencyContactName: item.emergency_contact_name ? String(item.emergency_contact_name) : null,
      emergencyContactPhone: item.emergency_contact_phone ? String(item.emergency_contact_phone) : null,
      emergencyContactRelationship: item.emergency_contact_relationship ? String(item.emergency_contact_relationship) : null,
      hasAnamnese: Boolean(item.has_anamnese),
      openBalanceCents: Number(item.open_balance_cents ?? 0),
      totalPaidCents: Number(item.total_paid_cents ?? 0),
      isInadimplente,
      overdueBalanceCents,
      overdueInvoicesCount,
      oldestOverdueDate,
      daysOverdue,
      nextDueDate,
      pendingInvoicesCount,
    };
  });

  if (status === 'inadimplente') {
    return rows.filter((c) => c.isInadimplente);
  }
  if (status === 'em_dia') {
    return rows.filter((c) => !c.isInadimplente);
  }
  return rows;
}

export async function updateClient(clientId: string, input: ClientInput) {
  const database = getDatabase();
  const existing = await database.prepare('SELECT id FROM clients WHERE id = ? AND clinic_id = ?').get(clientId, IDS.clinic);
  if (!existing) {
    throw new BookingValidationError('Cliente não encontrado.');
  }
  const now = new Date().toISOString();

  await database.prepare(`
    UPDATE clients
    SET name = ?,
        phone = ?,
        email = ?,
        status = ?,
        administrative_notes = ?,
        updated_at = ?
    WHERE id = ? AND clinic_id = ?
  `).run(
    input.name.trim(),
    input.phone,
    input.email?.trim() ? input.email.trim().toLowerCase() : null,
    input.status,
    input.administrativeNotes?.trim() ? input.administrativeNotes.trim() : null,
    now,
    clientId,
    IDS.clinic,
  );

  const contactsJson = (input.emergencyContactName || input.emergencyContactPhone)
    ? JSON.stringify([{
        id: '1',
        name: input.emergencyContactName || '',
        phone: input.emergencyContactPhone || '',
        relationship: input.emergencyContactRelationship || '',
      }])
    : null;

  const existingRec = await database.prepare('SELECT client_id FROM client_records WHERE client_id = ?').get(clientId);
  if (existingRec) {
    await database.prepare(`
      UPDATE client_records
      SET birth_date = ?,
          cpf = ?,
          gender = ?,
          occupation = ?,
          emergency_contact_name = ?,
          emergency_contact_phone = ?,
          emergency_contact_relationship = ?,
          emergency_contacts = COALESCE(?, emergency_contacts),
          updated_at = ?
      WHERE client_id = ?
    `).run(
      input.birthDate || null,
      input.cpf || null,
      input.gender || null,
      input.occupation || null,
      input.emergencyContactName || null,
      input.emergencyContactPhone || null,
      input.emergencyContactRelationship || null,
      contactsJson,
      now,
      clientId,
    );
  } else {
    await database.prepare(`
      INSERT INTO client_records (
        client_id, birth_date, cpf, gender, occupation,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        emergency_contacts, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId,
      input.birthDate || null,
      input.cpf || null,
      input.gender || null,
      input.occupation || null,
      input.emergencyContactName || null,
      input.emergencyContactPhone || null,
      input.emergencyContactRelationship || null,
      contactsJson,
      now,
    );
  }

  return { id: clientId };
}

export async function deleteClient(
  clientId: string,
  actor?: { userId?: string; name?: string; ip?: string; userAgent?: string }
) {
  const database = getDatabase();
  const existing = (await database
    .prepare(`
      SELECT c.id, c.name, c.phone, c.email, cr.cpf
      FROM clients c
      LEFT JOIN client_records cr ON cr.client_id = c.id
      WHERE c.id = ? AND c.clinic_id = ?
    `)
    .get(clientId, IDS.clinic)) as
    | { id: string; name: string; phone: string; email?: string | null; cpf?: string | null }
    | undefined;

  if (!existing) {
    throw new BookingValidationError('Cliente não encontrado.');
  }

  let apptsCount = 0;
  let recordsCount = 0;
  try {
    const rowA = (await database.prepare('SELECT count(*) as count FROM appointments WHERE client_id = ?').get(clientId)) as { count: number } | undefined;
    apptsCount = rowA?.count || 0;
    const rowR = (await database.prepare('SELECT count(*) as count FROM clinical_evolutions WHERE client_id = ?').get(clientId)) as { count: number } | undefined;
    recordsCount = rowR?.count || 0;
  } catch {}

  await database.transaction(async (tx) => {
    // 1. Refunds de pagamentos do cliente
    try {
      await tx.prepare(`
        DELETE FROM refunds WHERE payment_id IN (
          SELECT p.id FROM payments p
          JOIN charges c ON c.id = p.charge_id
          WHERE c.client_id = ?
        )
      `).run(clientId);
    } catch {}

    // 2. Payments de charges do cliente
    try {
      await tx.prepare(`
        DELETE FROM payments WHERE charge_id IN (
          SELECT id FROM charges WHERE client_id = ?
        )
      `).run(clientId);
    } catch {}

    // 3. Desvincular e remover charges do cliente
    try {
      await tx.prepare(`
        UPDATE charges SET appointment_id = NULL
        WHERE client_id = ? OR appointment_id IN (SELECT id FROM appointments WHERE client_id = ?)
      `).run(clientId, clientId);
      await tx.prepare('DELETE FROM charges WHERE client_id = ?').run(clientId);
    } catch {}

    // 4. Transações financeiras (payment_transactions) vinculadas ao cliente ou a pagamentos dele
    try {
      await tx.prepare(`
        DELETE FROM payment_transactions
        WHERE client_id = ? OR payment_id IN (SELECT id FROM client_payments WHERE client_id = ?)
      `).run(clientId, clientId);
    } catch {}

    // 5. Desvincular e remover client_payments (desfaz chaves estrangeiras com appointments e client_packages)
    try {
      await tx.prepare(`
        UPDATE client_payments
        SET parent_payment_id = NULL, appointment_id = NULL, client_package_id = NULL
        WHERE client_id = ? OR appointment_id IN (SELECT id FROM appointments WHERE client_id = ?)
      `).run(clientId, clientId);
      await tx.prepare('DELETE FROM client_payments WHERE client_id = ?').run(clientId);
    } catch {}

    // 6. Usos de pacote (package_usages) e pacotes de sessões (client_packages)
    try {
      await tx.prepare(`
        DELETE FROM package_usages
        WHERE client_package_id IN (SELECT id FROM client_packages WHERE client_id = ?)
           OR appointment_id IN (SELECT id FROM appointments WHERE client_id = ?)
      `).run(clientId, clientId);
    } catch {}
    try {
      await tx.prepare('UPDATE appointments SET client_package_id = NULL WHERE client_id = ?').run(clientId);
      await tx.prepare('DELETE FROM client_packages WHERE client_id = ?').run(clientId);
    } catch {}

    // 7. Registros de sessão (session_records e session_record_versions)
    try {
      await tx.prepare(`
        DELETE FROM session_record_versions
        WHERE session_record_id IN (
          SELECT sr.id FROM session_records sr
          JOIN appointments a ON a.id = sr.appointment_id
          WHERE a.client_id = ?
        )
      `).run(clientId);
      await tx.prepare(`
        DELETE FROM session_records
        WHERE appointment_id IN (SELECT id FROM appointments WHERE client_id = ?)
      `).run(clientId);
    } catch {}

    // 8. Eventos de agendamentos e desvincular evoluções
    try {
      await tx.prepare('DELETE FROM appointment_events WHERE appointment_id IN (SELECT id FROM appointments WHERE client_id = ?)').run(clientId);
    } catch {}
    try {
      await tx.prepare(`
        UPDATE clinical_evolutions SET appointment_id = NULL
        WHERE client_id = ? OR appointment_id IN (SELECT id FROM appointments WHERE client_id = ?)
      `).run(clientId, clientId);
    } catch {}

    // 9. Agendamentos
    await tx.prepare('DELETE FROM appointments WHERE client_id = ?').run(clientId);

    // 10. Sessões em grupo e lista de espera
    try { await tx.prepare('DELETE FROM group_session_enrollments WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM waitlist_entries WHERE client_id = ?').run(clientId); } catch {}

    // 11. Registros clínicos e prontuário
    try {
      await tx.prepare(`
        DELETE FROM clinical_techniques
        WHERE client_id = ? OR evolution_id IN (SELECT id FROM clinical_evolutions WHERE client_id = ?)
      `).run(clientId, clientId);
    } catch {}
    try { await tx.prepare('DELETE FROM clinical_evolutions WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM treatment_goals WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM client_documents WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM client_referrals WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM prontuario_access_logs WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM consent_records WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM form_responses WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM private_documents WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM privacy_requests WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM client_preferences WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('DELETE FROM client_records WHERE client_id = ?').run(clientId); } catch {}
    try { await tx.prepare('UPDATE whatsapp_message_logs SET client_id = NULL WHERE client_id = ?').run(clientId); } catch {}

    // 12. Deletar finalmente o cliente
    await tx.prepare('DELETE FROM clients WHERE id = ? AND clinic_id = ?').run(clientId, IDS.clinic);
  });

  // Gravar Auditoria LGPD e de Prontuário Imediatamente (Irreversível e Permanente)
  try {
    await recordAuditLog({
      clinicId: IDS.clinic,
      actorType: 'admin',
      actorId: actor?.userId || null,
      actorName: actor?.name || 'Administrador',
      category: 'paciente',
      action: 'cliente_excluido',
      title: 'Exclusão Definitiva de Paciente / Prontuário',
      description: `O(A) paciente "${existing.name}" foi excluído(a) do sistema por ${actor?.name || 'Administrador'}, removendo cadastro e registros vinculados.`,
      severity: 'critico',
      ipAddress: actor?.ip || null,
      userAgent: actor?.userAgent || null,
      details: {
        clientId: existing.id,
        name: existing.name,
        phone: existing.phone,
        email: existing.email || null,
        cpf: existing.cpf || null,
        agendamentosRemovidos: apptsCount,
        evolucoesRemovidas: recordsCount,
        dataExclusao: new Date().toISOString(),
      },
    });
  } catch (auditErr) {
    console.error('[Audit] Falha ao registrar log de exclusão de paciente:', auditErr);
  }

  return { deleted: true };
}

export async function createClient(input: ClientInput) {
  const database = getDatabase();
  const cpfDigits = (input.cpf || '').replace(/\D/g, '');
  const phoneDigits = (input.phone || '').replace(/\D/g, '');
  const cleanEmail = input.email?.trim() ? input.email.trim().toLowerCase() : null;
  const now = new Date().toISOString();

  // Verificar se já existe cliente com o mesmo CPF ou Telefone para evitar duplicidade e manter vínculo com o Portal
  let existingClient: { id: string } | undefined;
  if (cpfDigits.length === 11) {
    existingClient = (await database.prepare(`
      SELECT c.id
      FROM clients c
      JOIN client_records cr ON cr.client_id = c.id
      WHERE c.clinic_id = ?
        AND REPLACE(REPLACE(REPLACE(COALESCE(cr.cpf, ''), '.', ''), '-', ''), ' ', '') = ?
      LIMIT 1
    `).get(IDS.clinic, cpfDigits)) as { id: string } | undefined;
  }
  if (!existingClient && phoneDigits.length >= 10) {
    existingClient = (await database.prepare(`
      SELECT id
      FROM clients
      WHERE clinic_id = ?
        AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?
      LIMIT 1
    `).get(IDS.clinic, phoneDigits)) as { id: string } | undefined;
  }

  const id = existingClient ? existingClient.id : randomUUID();

  if (existingClient) {
    await database.prepare(`
      UPDATE clients
      SET name = ?, phone = COALESCE(NULLIF(?, ''), phone), email = COALESCE(?, email),
          status = COALESCE(?, status), administrative_notes = COALESCE(?, administrative_notes), updated_at = ?
      WHERE id = ?
    `).run(input.name, input.phone, input.email || null, input.status, input.administrativeNotes || null, now, id);
  } else {
    (await database.prepare(`
      INSERT INTO clients (id, clinic_id, name, phone, email, status, administrative_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, IDS.clinic, input.name, input.phone, input.email || null, input.status, input.administrativeNotes || null));
  }

  const hasRecord = input.cpf || input.birthDate || input.occupation || input.emergencyContactName || input.emergencyContactPhone || input.emergencyContactRelationship || input.gender;
  if (hasRecord) {
    const contactsJson = (input.emergencyContactName || input.emergencyContactPhone)
      ? JSON.stringify([{
          id: '1',
          name: input.emergencyContactName || '',
          phone: input.emergencyContactPhone || '',
          relationship: input.emergencyContactRelationship || '',
        }])
      : null;

    const existingRec = await database.prepare('SELECT client_id FROM client_records WHERE client_id = ?').get(id);
    if (existingRec) {
      await database.prepare(`
        UPDATE client_records
        SET birth_date = COALESCE(?, birth_date),
            cpf = COALESCE(?, cpf),
            gender = COALESCE(?, gender),
            occupation = COALESCE(?, occupation),
            emergency_contact_name = COALESCE(?, emergency_contact_name),
            emergency_contact_phone = COALESCE(?, emergency_contact_phone),
            emergency_contact_relationship = COALESCE(?, emergency_contact_relationship),
            emergency_contacts = COALESCE(?, emergency_contacts),
            updated_at = ?
        WHERE client_id = ?
      `).run(
        input.birthDate || null,
        input.cpf || null,
        input.gender || null,
        input.occupation || null,
        input.emergencyContactName || null,
        input.emergencyContactPhone || null,
        input.emergencyContactRelationship || null,
        contactsJson,
        now,
        id
      );
    } else {
      (await database.prepare(`
        INSERT INTO client_records (
          client_id, birth_date, cpf, gender, occupation,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
          emergency_contacts, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.birthDate || null,
        input.cpf || null,
        input.gender || null,
        input.occupation || null,
        input.emergencyContactName || null,
        input.emergencyContactPhone || null,
        input.emergencyContactRelationship || null,
        contactsJson,
        now
      ));
    }
  }

  await unifyClientRecordsByIdentity(database, id, cpfDigits, phoneDigits, cleanEmail);

  return { id };
}

function mapAppointmentSummary(row: unknown): AppointmentSummary {
  const item = row as Record<string, unknown>;
  const total = item.package_total_sessions != null ? Number(item.package_total_sessions) : null;
  const used = item.package_used_sessions != null ? Number(item.package_used_sessions) : null;
  const overdueBalanceCents = Number(item.client_overdue_balance_cents ?? 0);
  const oldestOverdueDate = item.client_oldest_overdue_due_at ? String(item.client_oldest_overdue_due_at) : null;
  const todaySimpleStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const daysOverdue = (() => {
    if (!oldestOverdueDate) return 0;
    const dOld = new Date(`${oldestOverdueDate}T12:00:00-03:00`);
    const dNow = new Date(`${todaySimpleStr}T12:00:00-03:00`);
    const diffMs = dNow.getTime() - dOld.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  })();

  return {
    id: String(item.id),
    clientId: String(item.client_id),
    clientName: String(item.client_name),
    serviceId: String(item.service_id),
    serviceName: String(item.service_name),
    modality: item.modality as AppointmentSummary['modality'],
    startAt: String(item.start_at),
    endAt: String(item.end_at),
    status: item.status as AppointmentSummary['status'],
    source: item.source as AppointmentSummary['source'],
    bookingKind: (item.booking_kind ?? 'regular') as AppointmentSummary['bookingKind'],
    fitInReason: item.fit_in_reason ? String(item.fit_in_reason) : null,
    administrativeNotes: item.administrative_notes ? String(item.administrative_notes) : null,
    clientPackageId: item.client_package_id ? String(item.client_package_id) : null,
    sessionNumber: item.session_number !== null && item.session_number !== undefined ? Number(item.session_number) : null,
    packageSummary: item.package_name && total ? {
      id: String(item.client_package_id || ''),
      name: String(item.package_name),
      totalSessions: total,
      usedSessions: used || 0,
      status: String(item.package_status || 'ativo'),
    } : null,
    clientPhone: item.client_phone ? String(item.client_phone) : null,
    clientCpf: item.client_cpf ? String(item.client_cpf) : null,
    clientOverdueBalanceCents: overdueBalanceCents,
    clientDaysOverdue: daysOverdue,
    clientIsInadimplente: overdueBalanceCents > 0,
    clientOldestOverdueDate: oldestOverdueDate,
    updatedAt: String(item.updated_at),
  };
}

export async function createInternalAppointment(
  input: InternalAppointmentInput,
  actorUserId: string,
  allowFitIn = false,
): Promise<AppointmentSummary> {
  const database = getDatabase();
  if (input.bookingKind === 'encaixe' && !allowFitIn) throw new AgendaPermissionError();
  const service = (await getService(input.serviceId, false));
  if (!service) throw new BookingValidationError('Serviço indisponível.');

  const client = (await database.prepare('SELECT id FROM clients WHERE id = ? AND clinic_id = ?').get(
    input.clientId,
    IDS.clinic,
  )) as { id: string } | undefined;
  if (!client) throw new BookingValidationError('Cliente não encontrado.');

  const modality = (await database.prepare('SELECT 1 FROM service_modalities WHERE service_id = ? AND modality = ?').get(
    input.serviceId,
    input.modality,
  ));
  if (!modality) throw new BookingValidationError('Modalidade indisponível para este serviço.');

  const start = zonedDateTimeToUtc(input.date, input.time);
  const endDate = input.endTime && timeToMinutes(input.endTime) <= timeToMinutes(input.time)
    ? nextDateKey(input.date)
    : input.date;
  const end = input.endTime
    ? zonedDateTimeToUtc(endDate, input.endTime)
    : new Date(start.getTime() + service.duration_minutes * 60_000);
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  if (durationMinutes < 15 || durationMinutes > 480) {
    throw new BookingValidationError('A duração deve ser de no mínimo 15 minutos e no máximo 8 horas.');
  }
  if (
    input.bookingKind === 'regular'
    && !(await fitsWorkingSchedule(database, IDS.professional, input.date, input.time, start, end))
  ) {
    throw new BookingValidationError('O horário está fora da jornada. Use um encaixe e informe o motivo.');
  }
  const appointmentId = randomUUID();

  (await database.exec('BEGIN IMMEDIATE'));
  try {
    const conflict = (await findScheduleConflict(database, {
      professionalId: IDS.professional,
      start,
      end,
      intervalMinutes: service.interval_minutes,
    }));
    if (conflict) throw new BookingConflictError('Já existe um atendimento ou bloqueio nesse período.');

    let sessionNumber: number | null = null;
    if (input.clientPackageId) {
      const pkg = (await database.prepare('SELECT id, total_sessions, used_sessions FROM client_packages WHERE id = ?').get(input.clientPackageId)) as {
        id: string;
        total_sessions: number;
        used_sessions: number;
      } | undefined;
      if (pkg) {
        sessionNumber = pkg.used_sessions + 1;
        const newStatus = sessionNumber >= pkg.total_sessions ? 'concluido' : 'ativo';
        (await database.prepare(`
          UPDATE client_packages
          SET used_sessions = ?, status = ?, updated_at = ?
          WHERE id = ?
        `).run(sessionNumber, newStatus, new Date().toISOString(), pkg.id));
      }
    }

    (await database.prepare(`
      INSERT INTO appointments (
        id, clinic_id, professional_id, client_id, service_id, modality,
        start_at, end_at, status, source, booking_kind, fit_in_reason,
        administrative_notes, client_package_id, session_number, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'interno', ?, ?, ?, ?, ?, ?)
    `).run(
      appointmentId,
      IDS.clinic,
      IDS.professional,
      input.clientId,
      input.serviceId,
      input.modality,
      start.toISOString(),
      end.toISOString(),
      input.status,
      input.bookingKind,
      input.bookingKind === 'encaixe' ? input.fitInReason : null,
      input.notes || null,
      input.clientPackageId || null,
      sessionNumber,
      actorUserId,
    ));
    (await database.prepare(`
      INSERT INTO appointment_events (id, appointment_id, actor_user_id, event_type, new_value)
      VALUES (?, ?, ?, 'criado', ?)
    `).run(randomUUID(), appointmentId, actorUserId, JSON.stringify({
      source: 'interno',
      status: input.status,
      bookingKind: input.bookingKind,
      fitInReason: input.bookingKind === 'encaixe' ? input.fitInReason : null,
      clientPackageId: input.clientPackageId || null,
      sessionNumber,
    })));
    (await database.prepare(`
      INSERT INTO audit_logs (id, clinic_id, actor_user_id, action, resource_type, resource_id, metadata_json)
      VALUES (?, ?, ?, 'appointment.created', 'appointment', ?, ?)
    `).run(
      randomUUID(),
      IDS.clinic,
      actorUserId,
      appointmentId,
      JSON.stringify({
        date: input.date,
        time: input.time,
        endTime: input.endTime ?? null,
        endAt: end.toISOString(),
        durationMinutes,
        customEndTime: Boolean(input.endTime),
        status: input.status,
        bookingKind: input.bookingKind,
        fitInReason: input.bookingKind === 'encaixe' ? input.fitInReason : null,
        clientPackageId: input.clientPackageId || null,
        sessionNumber,
      }),
    ));
    (await database.exec('COMMIT'));
  } catch (error) {
    (await database.exec('ROLLBACK'));
    throw error;
  }

  const created = (await database.prepare(`
    SELECT a.id, a.client_id, c.name AS client_name, a.service_id, s.name AS service_name,
           a.modality, a.start_at, a.end_at, a.status, a.source, a.booking_kind, a.fit_in_reason,
           a.administrative_notes, a.client_package_id, a.session_number, a.updated_at
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    WHERE a.id = ? AND a.clinic_id = ?
  `).get(appointmentId, IDS.clinic));

  return mapAppointmentSummary(created);
}

export async function listAppointmentsInRange(from: string, to: string): Promise<AppointmentSummary[]> {
  const database = getDatabase();
  const start = localDateBounds(from).start;
  const endDate = new Date(`${to}T12:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = localDateBounds(endDate.toISOString().slice(0, 10)).start;
  const todaySimpleStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

  return (await database.prepare(`
    SELECT a.id, a.client_id, c.name AS client_name, c.phone AS client_phone,
           (SELECT cr.cpf FROM client_records cr WHERE cr.client_id = a.client_id LIMIT 1) AS client_cpf,
           a.service_id, s.name AS service_name,
           a.modality, a.start_at, a.end_at, a.status, a.source, a.booking_kind, a.fit_in_reason,
           a.administrative_notes, a.client_package_id, a.session_number, a.updated_at,
           cp.package_name, cp.total_sessions AS package_total_sessions, cp.used_sessions AS package_used_sessions, cp.status AS package_status,
           (SELECT COALESCE(SUM(p.remaining_amount_cents), 0) FROM client_payments p WHERE p.client_id = a.client_id AND p.entry_type = 'entrada' AND p.status NOT IN ('cancelado', 'pago') AND p.remaining_amount_cents > 0 AND p.due_at IS NOT NULL AND SUBSTR(p.due_at, 1, 10) < ?) AS client_overdue_balance_cents,
           (SELECT MIN(SUBSTR(p.due_at, 1, 10)) FROM client_payments p WHERE p.client_id = a.client_id AND p.entry_type = 'entrada' AND p.status NOT IN ('cancelado', 'pago') AND p.remaining_amount_cents > 0 AND p.due_at IS NOT NULL AND SUBSTR(p.due_at, 1, 10) < ?) AS client_oldest_overdue_due_at
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    LEFT JOIN client_packages cp ON cp.id = a.client_package_id
    WHERE a.clinic_id = ? AND a.start_at < ? AND a.end_at > ?
    ORDER BY a.start_at
  `).all(todaySimpleStr, todaySimpleStr, IDS.clinic, end.toISOString(), start.toISOString())).map(mapAppointmentSummary);
}

export async function listAppointments(date = dateKeyInClinicTimeZone()): Promise<AppointmentSummary[]> {
  return (await listAppointmentsInRange(date, date));
}

export async function listPendingAppointments(): Promise<AppointmentSummary[]> {
  const database = getDatabase();
  const rows = (await database.prepare(`
    SELECT a.id, a.client_id, c.name AS client_name, c.phone AS client_phone,
           (SELECT cr.cpf FROM client_records cr WHERE cr.client_id = a.client_id LIMIT 1) AS client_cpf,
           a.service_id, s.name AS service_name, a.modality, a.start_at, a.end_at, a.status, a.source,
           a.booking_kind, a.fit_in_reason, a.administrative_notes, a.client_package_id, a.session_number,
           a.updated_at, cp.package_name, cp.total_sessions AS package_total_sessions,
           cp.used_sessions AS package_used_sessions, cp.status AS package_status
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    LEFT JOIN client_packages cp ON cp.id = a.client_package_id
    WHERE a.clinic_id = ? AND a.status = 'solicitado'
    ORDER BY a.start_at ASC
  `).all(IDS.clinic)) as Array<Record<string, unknown>>;

  return rows.map(mapAppointmentSummary);
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: AppointmentSummary['status'],
  actorUserId: string,
): Promise<{ previousStatus: AppointmentSummary['status']; status: AppointmentSummary['status']; changed: boolean }> {
  const database = getDatabase();
  (await database.exec('BEGIN IMMEDIATE'));
  try {
    const current = (await database.prepare(`
      SELECT a.status, a.professional_id, a.start_at, a.end_at, s.interval_minutes
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      WHERE a.id = ? AND a.clinic_id = ?
    `).get(appointmentId, IDS.clinic)) as {
      status: AppointmentSummary['status'];
      professional_id: string;
      start_at: string;
      end_at: string;
      interval_minutes: number;
    } | undefined;
    if (!current) throw new Error('Agendamento não encontrado.');
    if (current.status === status) {
      (await database.exec('COMMIT'));
      return { previousStatus: current.status, status, changed: false };
    }
    const wasInactive = ['cancelado', 'nao_compareceu'].includes(current.status);
    const willBeActive = !['cancelado', 'nao_compareceu'].includes(status);
    if (wasInactive && willBeActive) {
      const conflict = (await findScheduleConflict(database, {
        professionalId: current.professional_id,
        start: new Date(current.start_at),
        end: new Date(current.end_at),
        intervalMinutes: current.interval_minutes,
        excludeAppointmentId: appointmentId,
      }));
      if (conflict) throw new BookingConflictError('Não é possível reativar: já existe um atendimento ou bloqueio nesse período.');
    }
    (await database.prepare(`UPDATE appointments SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(status, appointmentId));
    (await database.prepare(`
      INSERT INTO appointment_events (id, appointment_id, actor_user_id, event_type, previous_value, new_value)
      VALUES (?, ?, ?, 'status_alterado', ?, ?)
    `).run(randomUUID(), appointmentId, actorUserId, current.status, status));
    (await database.exec('COMMIT'));
    return { previousStatus: current.status, status, changed: true };
  } catch (error) {
    (await database.exec('ROLLBACK'));
    throw error;
  }
}

export async function editAppointment(
  appointmentId: string,
  input: AppointmentEditInput,
  actorUserId: string,
  allowFitIn = false,
): Promise<AppointmentSummary> {
  const database = getDatabase();
  (await database.exec('BEGIN IMMEDIATE'));
  try {
    const current = (await database.prepare(`
      SELECT id, professional_id, client_id, service_id, modality, start_at, end_at,
             status, booking_kind, fit_in_reason, administrative_notes, updated_at
      FROM appointments
      WHERE id = ? AND clinic_id = ?
    `).get(appointmentId, IDS.clinic)) as {
      id: string;
      professional_id: string;
      client_id: string;
      service_id: string;
      modality: AppointmentSummary['modality'];
      start_at: string;
      end_at: string;
      status: AppointmentSummary['status'];
      booking_kind: AppointmentSummary['bookingKind'];
      fit_in_reason: string | null;
      administrative_notes: string | null;
      updated_at: string;
    } | undefined;

    if (!current) throw new BookingValidationError('Agendamento não encontrado.');
    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    const storedUpdatedAt = new Date(current.updated_at);
    if (Number.isNaN(expectedUpdatedAt.getTime()) || expectedUpdatedAt.getTime() !== storedUpdatedAt.getTime()) {
      throw new AppointmentStaleError();
    }

    const service = (await getService(input.serviceId, false));
    if (!service) throw new BookingValidationError('Serviço indisponível.');
    const client = (await database.prepare('SELECT id FROM clients WHERE id = ? AND clinic_id = ?').get(
      input.clientId,
      IDS.clinic,
    )) as { id: string } | undefined;
    if (!client) throw new BookingValidationError('Cliente não encontrado.');
    const modality = (await database.prepare('SELECT 1 FROM service_modalities WHERE service_id = ? AND modality = ?').get(
      input.serviceId,
      input.modality,
    ));
    if (!modality) throw new BookingValidationError('Modalidade indisponível para este serviço.');

    const start = zonedDateTimeToUtc(input.date, input.time);
    const endDate = timeToMinutes(input.endTime) <= timeToMinutes(input.time)
      ? nextDateKey(input.date)
      : input.date;
    const end = zonedDateTimeToUtc(endDate, input.endTime);
    const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
    if (durationMinutes < 15 || durationMinutes > 480) {
      throw new BookingValidationError('A duração deve ser de no mínimo 15 minutos e no máximo 8 horas.');
    }
    const bookingKind = input.bookingKind ?? current.booking_kind;
    const fitInReason = bookingKind === 'encaixe'
      ? (input.fitInReason ?? current.fit_in_reason)
      : null;
    if (!allowFitIn && (current.booking_kind === 'encaixe' || bookingKind === 'encaixe')) {
      throw new AgendaPermissionError();
    }
    if (bookingKind === 'encaixe' && (!fitInReason || fitInReason.length < 3)) {
      throw new BookingValidationError('Informe o motivo do encaixe.');
    }
    if (
      bookingKind === 'regular'
      && !(await fitsWorkingSchedule(database, current.professional_id, input.date, input.time, start, end))
    ) {
      throw new BookingValidationError('O horário está fora da jornada. Use um encaixe e informe o motivo.');
    }

    if (!['cancelado', 'nao_compareceu'].includes(input.status)) {
      const conflict = (await findScheduleConflict(database, {
        professionalId: current.professional_id,
        start,
        end,
        intervalMinutes: service.interval_minutes,
        excludeAppointmentId: appointmentId,
      }));
      if (conflict) throw new BookingConflictError('Já existe um atendimento ou bloqueio nesse período.');
    }

    const notes = input.notes || null;
    (await database.prepare(`
      UPDATE appointments
      SET client_id = ?, service_id = ?, modality = ?, start_at = ?, end_at = ?,
          status = ?, booking_kind = ?, fit_in_reason = ?, administrative_notes = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND clinic_id = ?
    `).run(
      input.clientId,
      input.serviceId,
      input.modality,
      start.toISOString(),
      end.toISOString(),
      input.status,
      bookingKind,
      fitInReason,
      notes,
      appointmentId,
      IDS.clinic,
    ));

    const previousValue = {
      clientId: current.client_id,
      serviceId: current.service_id,
      modality: current.modality,
      startAt: current.start_at,
      endAt: current.end_at,
      status: current.status,
      bookingKind: current.booking_kind,
      fitInReason: current.fit_in_reason,
      hasNotes: Boolean(current.administrative_notes),
    };
    const newValue = {
      clientId: input.clientId,
      serviceId: input.serviceId,
      modality: input.modality,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: input.status,
      bookingKind,
      fitInReason,
      hasNotes: Boolean(notes),
    };
    (await database.prepare(`
      INSERT INTO appointment_events (id, appointment_id, actor_user_id, event_type, previous_value, new_value)
      VALUES (?, ?, ?, 'editado', ?, ?)
    `).run(randomUUID(), appointmentId, actorUserId, JSON.stringify(previousValue), JSON.stringify(newValue)));
    (await database.prepare(`
      INSERT INTO audit_logs (id, clinic_id, actor_user_id, action, resource_type, resource_id, metadata_json)
      VALUES (?, ?, ?, 'appointment.updated', 'appointment', ?, ?)
    `).run(
      randomUUID(),
      IDS.clinic,
      actorUserId,
      appointmentId,
      JSON.stringify({ previous: previousValue, next: newValue, durationMinutes }),
    ));

    const updated = (await database.prepare(`
      SELECT a.id, a.client_id, c.name AS client_name, a.service_id, s.name AS service_name,
             a.modality, a.start_at, a.end_at, a.status, a.source, a.booking_kind, a.fit_in_reason,
             a.administrative_notes, a.updated_at
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN services s ON s.id = a.service_id
      WHERE a.id = ? AND a.clinic_id = ?
    `).get(appointmentId, IDS.clinic));
    (await database.exec('COMMIT'));
    return mapAppointmentSummary(updated);
  } catch (error) {
    (await database.exec('ROLLBACK'));
    throw error;
  }
}

export async function resizeAppointment(
  appointmentId: string,
  input: AppointmentResizeInput,
  actorUserId: string,
): Promise<{ appointment: AppointmentSummary; changed: boolean; previousEndAt: string }> {
  const database = getDatabase();
  (await database.exec('BEGIN IMMEDIATE'));
  try {
    const current = (await database.prepare(`
      SELECT a.id, a.professional_id, a.start_at, a.end_at, a.status, a.booking_kind,
             s.interval_minutes
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      WHERE a.id = ? AND a.clinic_id = ?
    `).get(appointmentId, IDS.clinic)) as {
      id: string;
      professional_id: string;
      start_at: string;
      end_at: string;
      status: AppointmentSummary['status'];
      booking_kind: AppointmentSummary['bookingKind'];
      interval_minutes: number;
    } | undefined;

    if (!current) throw new BookingValidationError('Agendamento não encontrado.');
    if (['concluido', 'cancelado', 'nao_compareceu'].includes(current.status)) {
      throw new BookingValidationError('Este atendimento não pode mais ter a duração alterada.');
    }

    const expectedEndAt = new Date(input.expectedEndAt);
    const storedEndAt = new Date(current.end_at);
    if (Number.isNaN(expectedEndAt.getTime()) || expectedEndAt.getTime() !== storedEndAt.getTime()) {
      throw new AppointmentStaleError();
    }

    const start = new Date(current.start_at);
    const end = new Date(start.getTime() + input.durationMinutes * 60_000);
    const nextEndAt = end.toISOString();
    const previousEndAt = storedEndAt.toISOString();

    if (nextEndAt !== previousEndAt) {
      const startDate = dateKeyInClinicTimeZone(start);
      if (
        current.booking_kind === 'regular'
        && !(await fitsWorkingSchedule(
          database,
          current.professional_id,
          startDate,
          timeKeyInClinicTimeZone(start),
          start,
          end,
        ))
      ) {
        throw new BookingValidationError('O novo término ultrapassa a jornada. Converta o atendimento em encaixe para continuar.');
      }
      const conflict = (await findScheduleConflict(database, {
        professionalId: current.professional_id,
        start,
        end,
        intervalMinutes: current.interval_minutes,
        excludeAppointmentId: appointmentId,
      }));
      if (conflict) throw new BookingConflictError('Já existe um atendimento ou bloqueio nesse período.');

      (await database.prepare(`
        UPDATE appointments
        SET end_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND clinic_id = ?
      `).run(nextEndAt, appointmentId, IDS.clinic));
      (await database.prepare(`
        INSERT INTO appointment_events (
          id, appointment_id, actor_user_id, event_type, previous_value, new_value
        ) VALUES (?, ?, ?, 'duracao_alterada', ?, ?)
      `).run(
        randomUUID(),
        appointmentId,
        actorUserId,
        JSON.stringify({ endAt: previousEndAt }),
        JSON.stringify({ endAt: nextEndAt, durationMinutes: input.durationMinutes }),
      ));
      (await database.prepare(`
        INSERT INTO audit_logs (
          id, clinic_id, actor_user_id, action, resource_type, resource_id, metadata_json
        ) VALUES (?, ?, ?, 'appointment.resized', 'appointment', ?, ?)
      `).run(
        randomUUID(),
        IDS.clinic,
        actorUserId,
        appointmentId,
        JSON.stringify({
          startAt: current.start_at,
          previousEndAt,
          newEndAt: nextEndAt,
          previousDurationMinutes: Math.round((storedEndAt.getTime() - start.getTime()) / 60_000),
          newDurationMinutes: input.durationMinutes,
        }),
      ));
    }

    const updated = (await database.prepare(`
      SELECT a.id, a.client_id, c.name AS client_name, a.service_id, s.name AS service_name,
             a.modality, a.start_at, a.end_at, a.status, a.source, a.booking_kind, a.fit_in_reason,
             a.administrative_notes, a.updated_at
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN services s ON s.id = a.service_id
      WHERE a.id = ? AND a.clinic_id = ?
    `).get(appointmentId, IDS.clinic));
    (await database.exec('COMMIT'));

    return {
      appointment: mapAppointmentSummary(updated),
      changed: nextEndAt !== previousEndAt,
      previousEndAt,
    };
  } catch (error) {
    (await database.exec('ROLLBACK'));
    throw error;
  }
}

export async function getAgendaSettings(): Promise<AgendaSettings> {
  const database = getDatabase();
  const settings = (await database.prepare(`
    SELECT booking_confirmation_mode, minimum_notice_minutes
    FROM clinic_settings
    WHERE clinic_id = ?
  `).get(IDS.clinic)) as {
    booking_confirmation_mode: AgendaSettings['settings']['bookingConfirmationMode'];
    minimum_notice_minutes: number;
  } | undefined;
  const workingHours = (await database.prepare(`
    SELECT weekday, start_time, end_time, public_booking
    FROM working_hours
    WHERE clinic_id = ? AND professional_id = ?
    ORDER BY weekday, start_time
  `).all(IDS.clinic, IDS.professional)) as Array<{
    weekday: number;
    start_time: string;
    end_time: string;
    public_booking: number;
  }>;
  const services = (await database.prepare(`
    SELECT id, name, duration_minutes, interval_minutes
    FROM services
    WHERE clinic_id = ?
    ORDER BY created_at, name COLLATE NOCASE
  `).all(IDS.clinic)) as Array<{
    id: string;
    name: string;
    duration_minutes: number;
    interval_minutes: number;
  }>;
  const holidays = (await database.prepare(`
    SELECT id, date, name
    FROM holidays
    WHERE clinic_id = ?
    ORDER BY date, name COLLATE NOCASE
  `).all(IDS.clinic)) as Array<{ id: string; date: string; name: string }>;

  return {
    settings: {
      bookingConfirmationMode: settings?.booking_confirmation_mode ?? 'manual',
      minimumNoticeMinutes: settings?.minimum_notice_minutes ?? 720,
    },
    workingHours: workingHours.map((item) => ({
      weekday: item.weekday,
      startTime: item.start_time,
      endTime: item.end_time,
      publicBooking: Boolean(item.public_booking),
    })),
    services: services.map((item) => ({
      id: item.id,
      name: item.name,
      durationMinutes: item.duration_minutes,
      intervalMinutes: item.interval_minutes,
    })),
    holidays,
  };
}

export async function updateAgendaSettings(input: AgendaSettingsPatchInput, actorUserId: string): Promise<AgendaSettings> {
  const database = getDatabase();
  (await database.exec('BEGIN IMMEDIATE'));
  try {
    if (input.settings) {
      (await database.prepare(`
        INSERT INTO clinic_settings (clinic_id, booking_confirmation_mode, minimum_notice_minutes)
        VALUES (?, ?, ?)
        ON CONFLICT(clinic_id) DO UPDATE SET
          booking_confirmation_mode = excluded.booking_confirmation_mode,
          minimum_notice_minutes = excluded.minimum_notice_minutes,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `).run(
        IDS.clinic,
        input.settings.bookingConfirmationMode,
        input.settings.minimumNoticeMinutes,
      ));
    }

    if (input.workingHours) {
      (await database.prepare('DELETE FROM working_hours WHERE clinic_id = ? AND professional_id = ?')
        .run(IDS.clinic, IDS.professional));
      const insertWorkingHour = database.prepare(`
        INSERT INTO working_hours (
          id, clinic_id, professional_id, weekday, start_time, end_time, public_booking
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const workingHour of input.workingHours) {
        (await insertWorkingHour.run(
          randomUUID(),
          IDS.clinic,
          IDS.professional,
          workingHour.weekday,
          workingHour.startTime,
          workingHour.endTime,
          workingHour.publicBooking ? 1 : 0,
        ));
      }
    }

    if (input.services) {
      const updateService = database.prepare(`
        UPDATE services
        SET duration_minutes = ?, interval_minutes = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND clinic_id = ?
      `);
      for (const service of input.services) {
        const result = (await updateService.run(
          service.durationMinutes,
          service.intervalMinutes,
          service.id,
          IDS.clinic,
        ));
        if (Number(result.changes) === 0) {
          throw new BookingValidationError(`Serviço não encontrado: ${service.name}.`);
        }
      }
    }

    if (input.holidays) {
      (await database.prepare('DELETE FROM holidays WHERE clinic_id = ?').run(IDS.clinic));
      const insertHoliday = database.prepare(`
        INSERT INTO holidays (id, clinic_id, date, name)
        VALUES (?, ?, ?, ?)
      `);
      for (const holiday of input.holidays) {
        (await insertHoliday.run(holiday.id ?? randomUUID(), IDS.clinic, holiday.date, holiday.name));
      }
    }

    (await database.prepare(`
      INSERT INTO audit_logs (
        id, clinic_id, actor_user_id, action, resource_type, resource_id, metadata_json
      ) VALUES (?, ?, ?, 'agenda.settings.updated', 'agenda_settings', ?, ?)
    `).run(
      randomUUID(),
      IDS.clinic,
      actorUserId,
      IDS.clinic,
      JSON.stringify({
        settings: Boolean(input.settings),
        workingHours: input.workingHours?.length,
        services: input.services?.length,
        holidays: input.holidays?.length,
      }),
    ));
    (await database.exec('COMMIT'));
  } catch (error) {
    (await database.exec('ROLLBACK'));
    throw error;
  }
  return (await getAgendaSettings());
}

function mapTimeBlock(row: unknown): TimeBlock {
  const item = row as Record<string, unknown>;
  return {
    id: String(item.id),
    startAt: String(item.start_at),
    endAt: String(item.end_at),
    reason: item.reason ? String(item.reason) : 'Bloqueio',
    createdAt: String(item.created_at),
  };
}

export async function listTimeBlocksInRange(from: string, to: string): Promise<TimeBlock[]> {
  const database = getDatabase();
  const start = localDateBounds(from).start;
  const end = localDateBounds(nextDateKey(to)).start;
  return (await database.prepare(`
    SELECT id, start_at, end_at, reason, created_at
    FROM time_blocks
    WHERE clinic_id = ? AND professional_id = ?
      AND julianday(start_at) < julianday(?)
      AND julianday(end_at) > julianday(?)
    ORDER BY start_at
  `).all(IDS.clinic, IDS.professional, end.toISOString(), start.toISOString())).map(mapTimeBlock);
}

export async function createTimeBlock(input: TimeBlockCreateInput, actorUserId: string): Promise<TimeBlock> {
  const database = getDatabase();
  const allDay = input.allDay === true;
  const start = allDay
    ? zonedDateTimeToUtc(input.startDate, '00:00')
    : zonedDateTimeToUtc(input.date, input.startTime);
  const end = allDay
    ? zonedDateTimeToUtc(nextDateKey(input.endDate), '00:00')
    : zonedDateTimeToUtc(input.date, input.endTime);
  const id = randomUUID();

  (await database.exec('BEGIN IMMEDIATE'));
  try {
    const conflict = (await findScheduleConflict(database, {
      professionalId: IDS.professional,
      start,
      end,
    }));
    if (conflict === 'appointment') {
      throw new BookingConflictError('O bloqueio não pode cobrir um atendimento existente.');
    }
    if (conflict === 'time_block') {
      throw new BookingConflictError('Já existe um bloqueio nesse período.');
    }

    (await database.prepare(`
      INSERT INTO time_blocks (
        id, clinic_id, professional_id, start_at, end_at, reason, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      IDS.clinic,
      IDS.professional,
      start.toISOString(),
      end.toISOString(),
      input.reason,
      actorUserId,
    ));
    (await database.prepare(`
      INSERT INTO audit_logs (
        id, clinic_id, actor_user_id, action, resource_type, resource_id, metadata_json
      ) VALUES (?, ?, ?, 'agenda.block.created', 'time_block', ?, ?)
    `).run(
      randomUUID(),
      IDS.clinic,
      actorUserId,
      id,
      JSON.stringify({ startAt: start.toISOString(), endAt: end.toISOString(), allDay, reason: input.reason }),
    ));
    (await database.exec('COMMIT'));
  } catch (error) {
    (await database.exec('ROLLBACK'));
    throw error;
  }

  const created = (await database.prepare(`
    SELECT id, start_at, end_at, reason, created_at
    FROM time_blocks
    WHERE id = ? AND clinic_id = ?
  `).get(id, IDS.clinic));
  return mapTimeBlock(created);
}

export async function deleteTimeBlock(timeBlockId: string, actorUserId: string) {
  const database = getDatabase();
  (await database.exec('BEGIN IMMEDIATE'));
  try {
    const current = (await database.prepare(`
      SELECT id, start_at, end_at, reason
      FROM time_blocks
      WHERE id = ? AND clinic_id = ? AND professional_id = ?
    `).get(timeBlockId, IDS.clinic, IDS.professional)) as {
      id: string;
      start_at: string;
      end_at: string;
      reason: string | null;
    } | undefined;
    if (!current) throw new BookingValidationError('Bloqueio não encontrado.');

    (await database.prepare('DELETE FROM time_blocks WHERE id = ? AND clinic_id = ?').run(timeBlockId, IDS.clinic));
    (await database.prepare(`
      INSERT INTO audit_logs (
        id, clinic_id, actor_user_id, action, resource_type, resource_id, metadata_json
      ) VALUES (?, ?, ?, 'agenda.block.deleted', 'time_block', ?, ?)
    `).run(
      randomUUID(),
      IDS.clinic,
      actorUserId,
      timeBlockId,
      JSON.stringify({ startAt: current.start_at, endAt: current.end_at, reason: current.reason }),
    ));
    (await database.exec('COMMIT'));
  } catch (error) {
    (await database.exec('ROLLBACK'));
    throw error;
  }
}

export async function getDashboard() {
  const database = getDatabase();
  const today = dateKeyInClinicTimeZone();
  const monthPrefix = today.slice(0, 7); // YYYY-MM
  const todayStartUtc = zonedDateTimeToUtc(today, '00:00').toISOString();

  // Executa todas as consultas do painel em PARALELO (reduz a latência de múltiplos round-trips)
  const [
    appointments,
    pendingResult,
    activeClientsResult,
    upRowsRaw,
    pendRowsRaw,
    allRowsRaw,
    payRowsRaw,
    txRowsRaw,
  ] = await Promise.all([
    listAppointments(today),
    database
      .prepare(`SELECT COUNT(*) AS total FROM appointments WHERE clinic_id = ? AND status = 'solicitado'`)
      .get(IDS.clinic) as Promise<{ total: number } | undefined>,
    database
      .prepare(`SELECT COUNT(*) AS total FROM clients WHERE clinic_id = ? AND status = 'ativo'`)
      .get(IDS.clinic) as Promise<{ total: number } | undefined>,
    database
      .prepare(`
        SELECT a.id, a.client_id, c.name AS client_name, c.phone AS client_phone,
               a.service_id, s.name AS service_name,
               a.modality, a.start_at, a.end_at, a.status, a.source, a.booking_kind,
               a.fit_in_reason, a.administrative_notes, a.client_package_id, a.session_number, a.updated_at
        FROM appointments a
        JOIN clients c ON c.id = a.client_id
        JOIN services s ON s.id = a.service_id
        WHERE a.clinic_id = ? AND a.start_at >= ? AND a.status != 'cancelado'
        ORDER BY a.start_at ASC
        LIMIT 12
      `)
      .all(IDS.clinic, todayStartUtc)
      .catch(() => [] as Array<Record<string, unknown>>),
    database
      .prepare(`
        SELECT a.id, a.client_id, c.name AS client_name, c.phone AS client_phone,
               a.service_id, s.name AS service_name,
               a.modality, a.start_at, a.end_at, a.status, a.source, a.booking_kind,
               a.fit_in_reason, a.administrative_notes, a.client_package_id, a.session_number, a.updated_at
        FROM appointments a
        JOIN clients c ON c.id = a.client_id
        JOIN services s ON s.id = a.service_id
        WHERE a.clinic_id = ? AND a.status = 'solicitado'
        ORDER BY a.start_at ASC
        LIMIT 10
      `)
      .all(IDS.clinic)
      .catch(() => [] as Array<Record<string, unknown>>),
    database
      .prepare(`
        SELECT a.id, a.client_id, c.name AS client_name, c.phone AS client_phone,
               a.service_id, s.name AS service_name,
               a.modality, a.start_at, a.end_at, a.status, a.source, a.booking_kind,
               a.fit_in_reason, a.administrative_notes, a.client_package_id, a.session_number, a.updated_at
        FROM appointments a
        JOIN clients c ON c.id = a.client_id
        JOIN services s ON s.id = a.service_id
        WHERE a.clinic_id = ? AND a.status != 'cancelado'
        ORDER BY a.start_at DESC
        LIMIT 25
      `)
      .all(IDS.clinic)
      .catch(() => [] as Array<Record<string, unknown>>),
    database
      .prepare(`
        SELECT p.id, p.client_id, c.name AS client_name, c.phone AS client_phone,
               p.entry_type, p.description, p.amount_cents, p.paid_amount_cents,
               p.remaining_amount_cents, p.discount_cents, p.payment_method,
               p.status, p.paid_at, p.due_at, p.created_at
        FROM client_payments p
        LEFT JOIN clients c ON c.id = p.client_id
        WHERE p.clinic_id = ? AND p.status != 'cancelado'
        ORDER BY COALESCE(p.paid_at, p.created_at) DESC
      `)
      .all(IDS.clinic)
      .catch(() => [] as Array<Record<string, unknown>>),
    database
      .prepare(`
        SELECT t.id, t.payment_id, t.client_id, t.amount_cents, t.payment_method, t.paid_at, t.notes, t.created_at
        FROM payment_transactions t
        WHERE t.clinic_id = ?
        ORDER BY COALESCE(t.paid_at, t.created_at) ASC
      `)
      .all(IDS.clinic)
      .catch(() => [] as Array<Record<string, unknown>>),
  ]);

  const pending = pendingResult ?? { total: 0 };
  const activeClients = activeClientsResult ?? { total: 0 };

  const upcomingAppointments: Array<AppointmentSummary & { clientPhone?: string | null }> = (
    upRowsRaw as Array<Record<string, unknown>>
  ).map((r) => ({
    ...mapAppointmentSummary(r),
    clientPhone: r.client_phone ? String(r.client_phone) : null,
  }));

  const pendingRequests: Array<AppointmentSummary & { clientPhone?: string | null }> = (
    pendRowsRaw as Array<Record<string, unknown>>
  ).map((r) => ({
    ...mapAppointmentSummary(r),
    clientPhone: r.client_phone ? String(r.client_phone) : null,
  }));

  const allAppointments: Array<AppointmentSummary & { clientPhone?: string | null }> = (
    allRowsRaw as Array<Record<string, unknown>>
  ).map((r) => ({
    ...mapAppointmentSummary(r),
    clientPhone: r.client_phone ? String(r.client_phone) : null,
  }));

  // Resumo Financeiro Real (Receita no mês, Hoje, Semana, Geral, Saldos em Aberto e Últimos Pagamentos)
  let receivedMonthCents = 0;
  let expensesMonthCents = 0;
  let receivedTodayCents = 0;
  let receivedWeekCents = 0;
  let receivedTotalCents = 0;
  let openReceivablesCents = 0;
  let openReceivablesCount = 0;
  let overdueCount = 0;
  const sevenDaysAgoDate = new Date(new Date(`${today}T12:00:00-03:00`).getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  type DashboardPaymentItem = {
    id: string;
    paymentId?: string;
    clientId: string | null;
    clientName: string;
    clientPhone: string | null;
    entryType?: string;
    description: string;
    movementLabel?: string;
    amountCents: number;
    paidAmountCents: number;
    remainingAmountCents: number;
    discountCents: number;
    paymentMethod: string;
    status: string;
    paidAt: string | null;
    dueAt: string | null;
    createdAt: string;
    isOverdue: boolean;
  };

  let openPayments: DashboardPaymentItem[] = [];
  let recentPayments: DashboardPaymentItem[] = [];

  try {
    const payRows = payRowsRaw as Array<Record<string, unknown>>;
    const txRows = txRowsRaw as Array<Record<string, unknown>>;

    const txsByPaymentId = new Map<string, Array<Record<string, unknown>>>();
    for (const tx of txRows) {
      const pid = String(tx.payment_id ?? '');
      if (!txsByPaymentId.has(pid)) txsByPaymentId.set(pid, []);
      txsByPaymentId.get(pid)!.push(tx);
    }

    const movementCandidates: DashboardPaymentItem[] = [];

    for (const r of payRows) {
      const pid = String(r.id);
      const entryType = String(r.entry_type ?? 'entrada');
      const statusVal = String(r.status ?? 'pago');
      const amountCents = Number(r.amount_cents ?? 0);
      let paidCents = Number(r.paid_amount_cents ?? 0);
      let remCents = Number(r.remaining_amount_cents ?? 0);

      if (statusVal === 'pago' && paidCents === 0 && remCents === 0 && amountCents > 0) {
        paidCents = amountCents;
      }
      if (statusVal === 'pendente' && remCents === 0 && amountCents > 0) {
        remCents = amountCents;
      }
      if (statusVal === 'parcial' && remCents === 0 && amountCents > paidCents) {
        remCents = Math.max(0, amountCents - paidCents);
      }

      const refDate = String(r.paid_at || r.created_at || '');
      const refDay = refDate.slice(0, 10);
      const dueAt = r.due_at ? String(r.due_at) : null;
      const isOverdue = Boolean((statusVal === 'pendente' || statusVal === 'parcial' || remCents > 0) && dueAt && dueAt.slice(0, 10) < today);
      const clientName = r.client_name
        ? String(r.client_name)
        : entryType === 'saida'
          ? 'Despesa Operacional'
          : 'Lançamento Avulso';

      const baseItem: DashboardPaymentItem = {
        id: pid,
        paymentId: pid,
        clientId: r.client_id ? String(r.client_id) : null,
        clientName,
        clientPhone: r.client_phone ? String(r.client_phone) : null,
        entryType,
        description: String(r.description ?? 'Atendimento'),
        amountCents,
        paidAmountCents: paidCents,
        remainingAmountCents: remCents,
        discountCents: Number(r.discount_cents ?? 0),
        paymentMethod: String(r.payment_method ?? 'pix'),
        status: statusVal,
        paidAt: r.paid_at ? String(r.paid_at) : null,
        dueAt,
        createdAt: String(r.created_at ?? ''),
        isOverdue,
      };

      if (entryType === 'entrada') {
        if (paidCents > 0) {
          receivedTotalCents += paidCents;
          if (refDate.startsWith(monthPrefix)) receivedMonthCents += paidCents;
          if (refDate.startsWith(today)) receivedTodayCents += paidCents;
          if (refDay >= sevenDaysAgoDate && refDay <= today) receivedWeekCents += paidCents;
        }

        if (remCents > 0 && openPayments.length < 8) {
          openReceivablesCents += remCents;
          openReceivablesCount += 1;
          if (isOverdue) overdueCount += 1;
          openPayments.push(baseItem);
        } else if (remCents > 0) {
          openReceivablesCents += remCents;
          openReceivablesCount += 1;
          if (isOverdue) overdueCount += 1;
        }
      } else if (entryType === 'saida') {
        if (paidCents > 0 && refDate.startsWith(monthPrefix)) {
          expensesMonthCents += paidCents;
        }
      }

      // Se este pagamento tiver transações parciais em payment_transactions, adiciona cada pagamento individualmente
      const pTxs = txsByPaymentId.get(pid) || [];
      if (pTxs.length > 1) {
        pTxs.forEach((tx, idx) => {
          const txCents = Number(tx.amount_cents ?? 0);
          const stepLabel =
            idx === 0
              ? '1º Pagamento (Entrada)'
              : idx === pTxs.length - 1 && remCents === 0
                ? `${idx + 1}º Pagamento (Quitação)`
                : `${idx + 1}º Pagamento Parcial`;
          movementCandidates.push({
            ...baseItem,
            id: `${pid}-tx-${String(tx.id)}`,
            paymentId: pid,
            movementLabel: stepLabel,
            paidAmountCents: txCents,
            paymentMethod: String(tx.payment_method ?? baseItem.paymentMethod),
            paidAt: tx.paid_at ? String(tx.paid_at) : baseItem.paidAt,
            createdAt: String(tx.created_at ?? baseItem.createdAt),
          });
        });
      } else {
        movementCandidates.push({
          ...baseItem,
          movementLabel:
            entryType === 'saida'
              ? 'Saída / Despesa'
              : remCents > 0 && paidCents > 0
                ? 'Entrada Parcial'
                : remCents > 0
                  ? 'Cobrança em Aberto'
                  : 'Pagamento à Vista',
        });
      }
    }

    movementCandidates.sort((a, b) => {
      const da = String(a.paidAt || a.createdAt || '');
      const db = String(b.paidAt || b.createdAt || '');
      return db.localeCompare(da);
    });
    recentPayments = movementCandidates.slice(0, 15);
  } catch {
    // ignore if table not ready
  }

  // Dados Clínicos & Pacientes Recentes
  let activePackagesCount = 0;
  let evolutionsMonthCount = 0;
  let pendingAnamneseCount = 0;
  let recentClients: Array<{
    id: string;
    name: string;
    phone: string;
    cpf: string | null;
    hasAnamnese: boolean;
    totalEvolutions: number;
    openBalanceCents: number;
  }> = [];

  try {
    const pkgRow = (await database.prepare(`
      SELECT COUNT(*) AS total FROM client_packages WHERE clinic_id = ? AND status = 'ativo'
    `).get(IDS.clinic)) as { total?: number } | undefined;
    activePackagesCount = Number(pkgRow?.total ?? 0);

    const evRow = (await database.prepare(`
      SELECT COUNT(*) AS total FROM clinical_evolutions WHERE session_date LIKE ?
    `).get(`${monthPrefix}%`)) as { total?: number } | undefined;
    evolutionsMonthCount = Number(evRow?.total ?? 0);

    const cliRows = (await database.prepare(`
      SELECT c.id, c.name, c.phone, cr.cpf, cr.consent_agreed,
             (SELECT COUNT(*) FROM clinical_evolutions e WHERE e.client_id = c.id) AS total_evolutions,
             (SELECT COALESCE(SUM(p.remaining_amount_cents), 0) FROM client_payments p WHERE p.client_id = c.id AND p.entry_type = 'entrada' AND p.status != 'cancelado') AS open_balance_cents
      FROM clients c
      LEFT JOIN client_records cr ON cr.client_id = c.id
      WHERE c.clinic_id = ? AND c.status = 'ativo'
      ORDER BY c.updated_at DESC
      LIMIT 20
    `).all(IDS.clinic)) as Array<Record<string, unknown>>;

    for (const c of cliRows) {
      const hasAnam = Boolean(c.consent_agreed && c.cpf);
      if (!hasAnam) pendingAnamneseCount += 1;
      if (recentClients.length < 6) {
        recentClients.push({
          id: String(c.id),
          name: String(c.name),
          phone: String(c.phone ?? ''),
          cpf: c.cpf ? String(c.cpf) : null,
          hasAnamnese: hasAnam,
          totalEvolutions: Number(c.total_evolutions ?? 0),
          openBalanceCents: Number(c.open_balance_cents ?? 0),
        });
      }
    }
  } catch {
    // ignore
  }

  const activeSessionsToday = appointments.filter((item) => item.status !== 'cancelado');

  return {
    date: today,
    appointments,
    upcomingAppointments,
    pendingRequests,
    allAppointments,
    stats: {
      sessionsToday: activeSessionsToday.length,
      completedToday: activeSessionsToday.filter((i) => i.status === 'concluido').length,
      confirmedToday: activeSessionsToday.filter((i) => i.status === 'confirmado' || i.status === 'em_atendimento').length,
      pending: pending.total,
      activeClients: activeClients.total,
    },
    financial: {
      receivedMonthCents,
      expensesMonthCents,
      netMonthCents: receivedMonthCents - expensesMonthCents,
      receivedTodayCents,
      receivedWeekCents,
      receivedTotalCents,
      openReceivablesCents,
      openReceivablesCount,
      overdueCount,
      openPayments,
      recentPayments,
    },
    clinical: {
      activePackagesCount,
      evolutionsMonthCount,
      pendingAnamneseCount,
      recentClients,
    },
    integrations: { whatsapp: 'ativo', payments: 'ativo' },
  };
}

// ==========================================
// PRONTUÁRIO ELETRÔNICO DO CLIENTE
// ==========================================

export async function logProntuarioAccess(
  clientId: string,
  actor: { userId: string; name: string },
  actionType: string,
  details: string,
) {
  const database = getDatabase();
  (await database.prepare(`
    INSERT INTO prontuario_access_logs (id, client_id, actor_user_id, actor_name, action_type, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), clientId, actor.userId, actor.name, actionType, details));

  let clientName = 'Paciente';
  try {
    const c = (await database.prepare('SELECT name FROM clients WHERE id = ?').get(clientId)) as { name: string } | undefined;
    if (c?.name) clientName = c.name;
  } catch {}

  const friendlyActionTitles: Record<string, string> = {
    visualizacao: 'Visualização de Prontuário Clínico',
    edicao_ficha: 'Atualização de Ficha Clínica / Anamnese',
    criacao_ficha: 'Criação de Ficha Clínica / Anamnese',
    nova_evolucao: 'Registro de Evolução Terapêutica',
    evolucao_criada: 'Registro de Evolução Terapêutica',
    evolucao_editada: 'Edição de Evolução Terapêutica',
    novo_objetivo: 'Cadastro de Objetivo Terapêutico',
    alteracao_objetivo: 'Atualização de Objetivo Terapêutico',
    tecnica_registrada: 'Aplicação de Técnica Hipnótica',
    documento_adicionado: 'Upload de Documento Clínico',
    documento_excluido: 'Exclusão de Documento',
    encaminhamento_registrado: 'Encaminhamento Multidisciplinar',
    exportacao_lgpd: 'Exportação de Dossiê LGPD (Art. 18)',
  };

  const title = friendlyActionTitles[actionType] || `Prontuário: ${actionType}`;

  await recordAuditLog({
    actorType: 'admin',
    actorId: actor.userId,
    actorName: actor.name,
    category: 'prontuario',
    action: actionType,
    title,
    description: `${actor.name} realizou ação no prontuário de "${clientName}": ${details}`,
    severity: actionType === 'documento_excluido' ? 'aviso' : 'info',
    details: { clientId, clientName, actionType, details },
  }).catch(() => null);
}

async function ensureDemoProntuario(clientId: string, clientName: string) {
  const database = getDatabase();
  if (!clientName.includes('Ana')) return;

  const existingRecord = (await database.prepare('SELECT client_id FROM client_records WHERE client_id = ?').get(clientId));
  if (existingRecord) return;

  // 1. Ficha inicial
  const demoEmergencyContacts = [
    { id: '1', name: 'Carlos Eduardo', phone: '11988887766', relationship: 'Cônjuge' },
    { id: '2', name: 'Helena Machado', phone: '11977775544', relationship: 'Mãe' },
  ];
  (await database.prepare(`
    INSERT INTO client_records (
      client_id, birth_date, cpf, gender, occupation,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      emergency_contacts,
      chief_complaint, health_history, medications, personal_background
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    clientId,
    '1992-04-15',
    '***.456.789-**',
    'Feminino',
    'Arquiteta / Gerente de Projetos',
    'Carlos Eduardo',
    '11988887766',
    'Cônjuge',
    JSON.stringify(demoEmergencyContacts),
    'Sintomas recorrentes de ansiedade no ambiente corporativo, dificuldade de desconexão após o expediente e episódios de insônia inicial há cerca de 6 meses.',
    'Nega histórico psiquiátrico prévio ou internações. Refere queixas gástricas ocasionais sob estresse agudo.',
    'Não faz uso de medicações controladas. Faz uso de chá de camomila e melatonina esporadicamente.',
    'Casada, reside em São Paulo. Relata bom suporte familiar e relacionamento estável, com sobrecarga relacionada a metas profissionais recentes.',
  ));

  // 2. Objetivos do acompanhamento
  const goalInsert = database.prepare(`
    INSERT INTO treatment_goals (id, client_id, title, description, status, progress_pct, target_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  (await goalInsert.run(
    randomUUID(),
    clientId,
    'Mapeamento de gatilhos e distorções cognitivas de autocrítica',
    'Identificar padrões de pensamentos automáticos de autocobrança e catastrofização no trabalho.',
    'em_andamento',
    75,
    '2026-12-15',
  ));
  (await goalInsert.run(
    randomUUID(),
    clientId,
    'Higiene do sono e desaceleração noturna',
    'Estabelecer rotina noturna sem telas 45 min antes de dormir e prática de respiração relaxante.',
    'alcancado',
    100,
    '2026-10-10',
  ));
  (await goalInsert.run(
    randomUUID(),
    clientId,
    'Comunicação assertiva e limites profissionais',
    'Treino de assertividade para negociação de prazos e recusa de demandas excessivas fora do horário.',
    'em_andamento',
    40,
    '2027-01-30',
  ));

  // 3. Evoluções clínicas
  const evolutionInsert = database.prepare(`
    INSERT INTO clinical_evolutions (
      id, client_id, professional_id, session_date, title, summary,
      evolution_text, interventions, homework_tasks, is_confidential, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const ev1Id = randomUUID();
  const ev2Id = randomUUID();
  (await evolutionInsert.run(
    ev1Id,
    clientId,
    IDS.professional,
    '2026-10-08',
    'Sessão Inicial - Anamnese e Enquadre Terapêutico',
    'Acolhimento da queixa principal, levantamento histórico e alinhamento de expectativas.',
    'Paciente compareceu pontualmente, comunicativa e bem orientada globalmente. Expressou forte desconforto com níveis elevados de ansiedade no ambiente corporativo. Compreendeu os princípios do sigilo ético e assinou o termo de consentimento. Pactuamos frequência semanal.',
    'Escuta clínica qualificada, psicoeducação inicial sobre ciclo ansioso e validação emocional.',
    'Anotar momentos de pico de ansiedade durante a semana com contexto e sensações corporais.',
    IDS.owner,
  ));
  (await evolutionInsert.run(
    ev2Id,
    clientId,
    IDS.professional,
    '2026-10-15',
    'Evolução 02 - Registro de Pensamentos Disfuncionais (RPD)',
    'Aplicação de RPD para pensamentos intrusivos em reuniões com diretoria.',
    'Discutimos as anotações da semana. Paciente identificou que a sensação de aperto no peito surge especialmente antes de apresentações. Introduzido o Registro de Pensamentos Disfuncionais (RPD). Boa receptividade ao questionamento socrático.',
    'Reestruturação cognitiva, identificação de pensamentos automáticos e treino de respiração diafragmática 4-4-6.',
    'Preenchimento do RPD em 2 situações de tensão ao longo dos próximos 7 dias.',
    IDS.owner,
  ));

  // 4. Técnicas utilizadas
  const techInsert = database.prepare(`
    INSERT INTO clinical_techniques (id, client_id, evolution_id, name, category, notes, outcome, applied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (await techInsert.run(
    randomUUID(),
    clientId,
    ev2Id,
    'Registro de Pensamentos Disfuncionais (RPD)',
    'Terapia Cognitivo-Comportamental (TCC)',
    'Excelente assimilação da relação entre pensamento, emoção e comportamento físico.',
    'muito_positiva',
    '2026-10-15',
  ));
  (await techInsert.run(
    randomUUID(),
    clientId,
    ev2Id,
    'Respiração Diafragmática e Relaxamento Guiado',
    'Técnicas de Regulação Fisiológica',
    'Utilizada para ancoragem no momento presente e redução de taquicardia.',
    'positiva',
    '2026-10-15',
  ));
  (await techInsert.run(
    randomUUID(),
    clientId,
    ev1Id,
    'Psicoeducação sobre Ansiedade',
    'Psicoeducação',
    'Esclarecimento do papel adaptativo da ansiedade e mecanismos de alarme.',
    'positiva',
    '2026-10-08',
  ));

  // 5. Documentos e termos
  const docInsert = database.prepare(`
    INSERT INTO client_documents (id, client_id, title, document_type, status, file_name, content, signed_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (await docInsert.run(
    randomUUID(),
    clientId,
    'Termo de Consentimento Livre e Esclarecido (TCLE)',
    'termo_consentimento',
    'assinado',
    'termo_consentimento_ana.pdf',
    'Termo padrão de consentimento para atendimento psicológico e tratamento de dados conforme LGPD.',
    '2026-10-08T09:15:00Z',
    IDS.owner,
  ));
  (await docInsert.run(
    randomUUID(),
    clientId,
    'Contrato de Prestação de Serviços de Saúde e Psicoterapia',
    'contrato_terapeutico',
    'assinado',
    'contrato_terapeutico_ana.pdf',
    'Definição de honorários, política de cancelamento com 24h de antecedência e sigilo profissional.',
    '2026-10-08T09:20:00Z',
    IDS.owner,
  ));

  // 6. Encaminhamentos e retornos
  const refInsert = database.prepare(`
    INSERT INTO client_referrals (id, client_id, specialty, professional_name, reason, referred_at, expected_return_at, status, return_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (await refInsert.run(
    randomUUID(),
    clientId,
    'Medicina do Sono / Clínica Geral',
    'Dr. Rodrigo Silveira',
    'Avaliação de queixa de insônia e exames laboratoriais complementares para descartar causas orgânicas.',
    '2026-10-09',
    '2026-11-10',
    'retornou',
    'Exames laboratoriais sem alterações significativas. Paciente orientada a priorizar psicoterapia e higiene do sono.',
  ));

  // 7. Histórico de acessos inicial
  (await database.prepare(`
    INSERT INTO prontuario_access_logs (id, client_id, actor_user_id, actor_name, action_type, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    clientId,
    IDS.owner,
    'Camila Machado',
    'abertura_prontuario',
    'Criação e abertura do prontuário eletrônico do cliente.',
    '2026-10-08T09:00:00Z',
  ));
}

export async function getProntuario(clientId: string, actor: { userId: string; name: string }): Promise<ProntuarioFull | null> {
  const database = getDatabase();
  const clientRow = (await database.prepare(`
    SELECT c.id, c.name, c.phone, c.email, c.status, c.created_at,
      MIN(CASE WHEN a.start_at >= ? AND a.status NOT IN ('cancelado', 'nao_compareceu') THEN a.start_at END) AS next_appointment_at,
      SUM(CASE WHEN a.status = 'concluido' THEN 1 ELSE 0 END) AS completed_appointments
    FROM clients c
    LEFT JOIN appointments a ON a.client_id = c.id
    WHERE c.id = ? AND c.clinic_id = ?
    GROUP BY c.id
  `).get(new Date().toISOString(), clientId, IDS.clinic)) as Record<string, unknown> | undefined;

  if (!clientRow) return null;

  const client: ClientSummary = {
    id: String(clientRow.id),
    name: String(clientRow.name),
    phone: String(clientRow.phone),
    email: clientRow.email ? String(clientRow.email) : null,
    status: clientRow.status as ClientSummary['status'],
    createdAt: String(clientRow.created_at),
    nextAppointmentAt: clientRow.next_appointment_at ? String(clientRow.next_appointment_at) : null,
    completedAppointments: Number(clientRow.completed_appointments ?? 0),
  };

  // Ensure demo client is seeded
  (await ensureDemoProntuario(clientId, client.name));

  // Log this viewing action
  (await logProntuarioAccess(clientId, actor, 'visualizacao', 'Acesso e consulta aos registros de atendimento.'));

  // 1. Ficha inicial
  const recordRow = (await database.prepare(`
    SELECT client_id, birth_date, cpf, rg, gender, occupation,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      emergency_contacts,
      chief_complaint, consultation_reason,
      has_health_conditions, health_conditions_details,
      has_psych_care, psych_care_details,
      consent_agreed, consent_agreed_at,
      health_history, medications, personal_background,
      epilepsy_history, psychiatric_history, previous_hypnosis, suggestibility_notes, emotional_triggers, safe_place,
      updated_at
    FROM client_records WHERE client_id = ?
  `).get(clientId)) as Record<string, unknown> | undefined;

  let parsedContacts: EmergencyContact[] = [];
  if (recordRow) {
    if (recordRow.emergency_contacts) {
      try {
        parsedContacts = JSON.parse(String(recordRow.emergency_contacts));
      } catch {
        parsedContacts = [];
      }
    }
    if (parsedContacts.length === 0 && recordRow.emergency_contact_name) {
      parsedContacts = [
        {
          id: '1',
          name: String(recordRow.emergency_contact_name),
          phone: recordRow.emergency_contact_phone ? String(recordRow.emergency_contact_phone) : null,
          relationship: recordRow.emergency_contact_relationship ? String(recordRow.emergency_contact_relationship) : null,
        },
      ];
    }
  }

  const record: ClientRecord | null = recordRow ? {
    clientId: String(recordRow.client_id),
    birthDate: recordRow.birth_date ? String(recordRow.birth_date) : null,
    cpf: recordRow.cpf ? String(recordRow.cpf) : null,
    rg: recordRow.rg ? String(recordRow.rg) : null,
    gender: recordRow.gender ? String(recordRow.gender) : null,
    occupation: recordRow.occupation ? String(recordRow.occupation) : null,
    emergencyContactName: recordRow.emergency_contact_name ? String(recordRow.emergency_contact_name) : null,
    emergencyContactPhone: recordRow.emergency_contact_phone ? String(recordRow.emergency_contact_phone) : null,
    emergencyContactRelationship: recordRow.emergency_contact_relationship ? String(recordRow.emergency_contact_relationship) : null,
    emergencyContacts: parsedContacts,
    chiefComplaint: recordRow.chief_complaint ? String(recordRow.chief_complaint) : (recordRow.consultation_reason ? String(recordRow.consultation_reason) : null),
    consultationReason: recordRow.consultation_reason ? String(recordRow.consultation_reason) : (recordRow.chief_complaint ? String(recordRow.chief_complaint) : null),
    hasHealthConditions: Boolean(recordRow.has_health_conditions),
    healthConditionsDetails: recordRow.health_conditions_details ? String(recordRow.health_conditions_details) : null,
    hasPsychCare: Boolean(recordRow.has_psych_care),
    psychCareDetails: recordRow.psych_care_details ? String(recordRow.psych_care_details) : null,
    consentAgreed: Boolean(recordRow.consent_agreed),
    consentAgreedAt: recordRow.consent_agreed_at ? String(recordRow.consent_agreed_at) : null,
    healthHistory: recordRow.health_history ? String(recordRow.health_history) : null,
    medications: recordRow.medications ? String(recordRow.medications) : null,
    personalBackground: recordRow.personal_background ? String(recordRow.personal_background) : null,
    epilepsyHistory: Boolean(recordRow.epilepsy_history),
    psychiatricHistory: recordRow.psychiatric_history ? String(recordRow.psychiatric_history) : null,
    previousHypnosis: recordRow.previous_hypnosis ? String(recordRow.previous_hypnosis) : null,
    suggestibilityNotes: recordRow.suggestibility_notes ? String(recordRow.suggestibility_notes) : null,
    emotionalTriggers: recordRow.emotional_triggers ? String(recordRow.emotional_triggers) : null,
    safePlace: recordRow.safe_place ? String(recordRow.safe_place) : null,
    updatedAt: String(recordRow.updated_at),
  } : null;

  // 2. Objetivos do acompanhamento
  const goals = ((await database.prepare(`
    SELECT id, client_id, title, description, status, progress_pct, target_date, achieved_at, created_at, updated_at
    FROM treatment_goals WHERE client_id = ? ORDER BY created_at DESC
  `).all(clientId)) as Record<string, unknown>[]).map((row): TreatmentGoal => ({
    id: String(row.id),
    clientId: String(row.client_id),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    status: row.status as TreatmentGoal['status'],
    progressPct: Number(row.progress_pct ?? 0),
    targetDate: row.target_date ? String(row.target_date) : null,
    achievedAt: row.achieved_at ? String(row.achieved_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));

  // 3. Histórico das sessões
  const sessions = ((await database.prepare(`
    SELECT a.id, a.client_id, c.name AS client_name, a.service_id, s.name AS service_name,
      a.modality, a.start_at, a.end_at, a.status, a.source, a.booking_kind, a.fit_in_reason,
      a.administrative_notes, a.client_package_id, a.session_number, a.updated_at
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    WHERE a.client_id = ? AND a.clinic_id = ?
    ORDER BY a.start_at DESC
  `).all(clientId, IDS.clinic)) as unknown[]).map(mapAppointmentSummary);

  // 4. Evolução e observações
  const evolutions = ((await database.prepare(`
    SELECT e.id, e.client_id, e.appointment_id, e.professional_id, e.session_date, e.title,
      e.summary, e.evolution_text, e.interventions, e.homework_tasks, e.is_confidential,
      e.induction_method, e.trance_depth, e.hypnotic_phenomena, e.post_hypnotic_suggestions,
      e.deinduction_notes, e.self_hypnosis_prescribed,
      e.created_by, u.name AS author_name, e.created_at, e.updated_at,
      e.finalized_at, e.finalized_by, e.finalized_by_name
    FROM clinical_evolutions e
    LEFT JOIN users u ON u.id = e.created_by
    WHERE e.client_id = ?
    ORDER BY e.session_date DESC, e.created_at DESC
  `).all(clientId)) as Record<string, unknown>[]).map((row): ClinicalEvolution => ({
    id: String(row.id),
    clientId: String(row.client_id),
    appointmentId: row.appointment_id ? String(row.appointment_id) : null,
    professionalId: String(row.professional_id),
    sessionDate: String(row.session_date),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : null,
    evolutionText: String(row.evolution_text),
    interventions: row.interventions ? String(row.interventions) : null,
    homeworkTasks: row.homework_tasks ? String(row.homework_tasks) : null,
    isConfidential: Boolean(row.is_confidential),
    inductionMethod: row.induction_method ? String(row.induction_method) : null,
    tranceDepth: row.trance_depth ? (row.trance_depth as ClinicalEvolution['tranceDepth']) : null,
    hypnoticPhenomena: row.hypnotic_phenomena ? String(row.hypnotic_phenomena) : null,
    postHypnoticSuggestions: row.post_hypnotic_suggestions ? String(row.post_hypnotic_suggestions) : null,
    deinductionNotes: row.deinduction_notes ? String(row.deinduction_notes) : null,
    selfHypnosisPrescribed: row.self_hypnosis_prescribed ? String(row.self_hypnosis_prescribed) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdByName: row.author_name ? String(row.author_name) : null,
    finalizedAt: row.finalized_at ? String(row.finalized_at) : null,
    finalizedBy: row.finalized_by ? String(row.finalized_by) : null,
    finalizedByName: row.finalized_by_name ? String(row.finalized_by_name) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));

  // 5. Técnicas utilizadas
  const techniques = ((await database.prepare(`
    SELECT id, client_id, evolution_id, name, category, notes, outcome, applied_at, created_at
    FROM clinical_techniques WHERE client_id = ? ORDER BY applied_at DESC, created_at DESC
  `).all(clientId)) as Record<string, unknown>[]).map((row): ClinicalTechnique => ({
    id: String(row.id),
    clientId: String(row.client_id),
    evolutionId: row.evolution_id ? String(row.evolution_id) : null,
    name: String(row.name),
    category: String(row.category),
    notes: row.notes ? String(row.notes) : null,
    outcome: row.outcome as ClinicalTechnique['outcome'],
    appliedAt: String(row.applied_at),
    createdAt: String(row.created_at),
  }));

  // 6. Documentos e termos
  const documents = ((await database.prepare(`
    SELECT id, client_id, title, document_type, document_type_label, status, file_name, file_data, content, signed_at, created_by, created_at
    FROM client_documents WHERE client_id = ? ORDER BY created_at DESC
  `).all(clientId)) as Record<string, unknown>[]).map((row): ClientDocument => ({
    id: String(row.id),
    clientId: String(row.client_id),
    title: String(row.title),
    documentType: String(row.document_type),
    documentTypeLabel: row.document_type_label ? String(row.document_type_label) : null,
    status: row.status as ClientDocument['status'],
    fileName: row.file_name ? String(row.file_name) : null,
    fileData: row.file_data ? (() => { try { return JSON.parse(String(row.file_data)); } catch { return null; } })() : null,
    content: row.content ? String(row.content) : null,
    signedAt: row.signed_at ? String(row.signed_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  }));

  // 7. Encaminhamentos e retornos
  const referrals = ((await database.prepare(`
    SELECT id, client_id, specialty, professional_name, reason, referred_at, expected_return_at, status, return_notes, created_at
    FROM client_referrals WHERE client_id = ? ORDER BY referred_at DESC
  `).all(clientId)) as Record<string, unknown>[]).map((row): ClientReferral => ({
    id: String(row.id),
    clientId: String(row.client_id),
    specialty: String(row.specialty),
    professionalName: row.professional_name ? String(row.professional_name) : null,
    reason: String(row.reason),
    referredAt: String(row.referred_at),
    expectedReturnAt: row.expected_return_at ? String(row.expected_return_at) : null,
    status: row.status as ClientReferral['status'],
    returnNotes: row.return_notes ? String(row.return_notes) : null,
    createdAt: String(row.created_at),
  }));

  // 8. Histórico de alterações e acessos
  const logs = ((await database.prepare(`
    SELECT id, client_id, actor_user_id, actor_name, action_type, details, created_at
    FROM prontuario_access_logs WHERE client_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(clientId)) as Record<string, unknown>[]).map((row): ProntuarioAccessLog => ({
    id: String(row.id),
    clientId: String(row.client_id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorName: String(row.actor_name),
    actionType: String(row.action_type),
    details: String(row.details),
    createdAt: String(row.created_at),
  }));

  return {
    client,
    record,
    goals,
    sessions,
    evolutions,
    techniques,
    documents,
    referrals,
    logs,
    packages: await listClientPackages(clientId),
  };
}

export async function saveClientRecord(clientId: string, input: ClientRecordInput, actor: { userId: string; name: string }): Promise<ClientRecord> {
  const database = getDatabase();
  const existing = (await database.prepare('SELECT client_id FROM client_records WHERE client_id = ?').get(clientId));
  const now = new Date().toISOString();

  // Process multiple contacts
  let contactsList: EmergencyContact[] = [];
  if (Array.isArray(input.emergencyContacts)) {
    contactsList = input.emergencyContacts as EmergencyContact[];
  } else if (typeof input.emergencyContacts === 'string') {
    try {
      contactsList = JSON.parse(input.emergencyContacts);
    } catch {
      contactsList = [];
    }
  }

  if (contactsList.length === 0 && input.emergencyContactName) {
    contactsList = [
      {
        id: '1',
        name: input.emergencyContactName,
        phone: input.emergencyContactPhone || null,
        relationship: input.emergencyContactRelationship || null,
      },
    ];
  }

  const primaryContact = contactsList[0] || null;
  const contactsJson = contactsList.length > 0 ? JSON.stringify(contactsList) : null;
  const primaryName = primaryContact?.name || input.emergencyContactName || null;
  const primaryPhone = primaryContact?.phone || input.emergencyContactPhone || null;
  const primaryRel = primaryContact?.relationship || input.emergencyContactRelationship || null;

  if (existing) {
    (await database.prepare(`
      UPDATE client_records
      SET birth_date = ?, cpf = ?, rg = ?, gender = ?, occupation = ?,
          emergency_contact_name = ?, emergency_contact_phone = ?, emergency_contact_relationship = ?,
          emergency_contacts = ?,
          chief_complaint = ?, consultation_reason = ?,
          has_health_conditions = ?, health_conditions_details = ?,
          has_psych_care = ?, psych_care_details = ?,
          consent_agreed = ?, consent_agreed_at = COALESCE(?, consent_agreed_at),
          health_history = ?, medications = ?, personal_background = ?,
          epilepsy_history = ?, psychiatric_history = ?, previous_hypnosis = ?,
          suggestibility_notes = ?, emotional_triggers = ?, safe_place = ?,
          updated_at = ?
      WHERE client_id = ?
    `).run(
      input.birthDate || null,
      input.cpf || null,
      input.rg || null,
      input.gender || null,
      input.occupation || null,
      primaryName,
      primaryPhone,
      primaryRel,
      contactsJson,
      input.chiefComplaint || input.consultationReason || null,
      input.consultationReason || input.chiefComplaint || null,
      input.hasHealthConditions ? 1 : 0,
      input.healthConditionsDetails || null,
      input.hasPsychCare ? 1 : 0,
      input.psychCareDetails || null,
      input.consentAgreed ? 1 : 0,
      input.consentAgreed ? (input.consentAgreedAt || now) : null,
      input.healthHistory || null,
      input.medications || null,
      input.personalBackground || null,
      input.epilepsyHistory ? 1 : 0,
      input.psychiatricHistory || null,
      input.previousHypnosis || null,
      input.suggestibilityNotes || null,
      input.emotionalTriggers || null,
      input.safePlace || null,
      now,
      clientId,
    ));
    (await logProntuarioAccess(clientId, actor, 'edicao_ficha', 'Atualização da ficha clínica e anamnese de hipnoterapia.'));
  } else {
    (await database.prepare(`
      INSERT INTO client_records (
        client_id, birth_date, cpf, rg, gender, occupation,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
        emergency_contacts,
        chief_complaint, consultation_reason,
        has_health_conditions, health_conditions_details,
        has_psych_care, psych_care_details,
        consent_agreed, consent_agreed_at,
        health_history, medications, personal_background,
        epilepsy_history, psychiatric_history, previous_hypnosis,
        suggestibility_notes, emotional_triggers, safe_place,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId,
      input.birthDate || null,
      input.cpf || null,
      input.rg || null,
      input.gender || null,
      input.occupation || null,
      primaryName,
      primaryPhone,
      primaryRel,
      contactsJson,
      input.chiefComplaint || input.consultationReason || null,
      input.consultationReason || input.chiefComplaint || null,
      input.hasHealthConditions ? 1 : 0,
      input.healthConditionsDetails || null,
      input.hasPsychCare ? 1 : 0,
      input.psychCareDetails || null,
      input.consentAgreed ? 1 : 0,
      input.consentAgreed ? (input.consentAgreedAt || now) : null,
      input.healthHistory || null,
      input.medications || null,
      input.personalBackground || null,
      input.epilepsyHistory ? 1 : 0,
      input.psychiatricHistory || null,
      input.previousHypnosis || null,
      input.suggestibilityNotes || null,
      input.emotionalTriggers || null,
      input.safePlace || null,
      now,
    ));
    (await logProntuarioAccess(clientId, actor, 'criacao_ficha', 'Preenchimento da ficha clínica de hipnoterapia.'));
  }

  if (input.cpf) {
    await unifyClientRecordsByIdentity(database, clientId, input.cpf.replace(/\D/g, ''), null, null);
  }

  return {
    clientId,
    birthDate: input.birthDate || null,
    cpf: input.cpf || null,
    rg: input.rg || null,
    gender: input.gender || null,
    occupation: input.occupation || null,
    emergencyContactName: primaryName,
    emergencyContactPhone: primaryPhone,
    emergencyContactRelationship: primaryRel,
    emergencyContacts: contactsList,
    chiefComplaint: input.chiefComplaint || input.consultationReason || null,
    consultationReason: input.consultationReason || input.chiefComplaint || null,
    hasHealthConditions: Boolean(input.hasHealthConditions),
    healthConditionsDetails: input.healthConditionsDetails || null,
    hasPsychCare: Boolean(input.hasPsychCare),
    psychCareDetails: input.psychCareDetails || null,
    consentAgreed: Boolean(input.consentAgreed),
    consentAgreedAt: input.consentAgreed ? (input.consentAgreedAt || now) : null,
    healthHistory: input.healthHistory || null,
    medications: input.medications || null,
    personalBackground: input.personalBackground || null,
    epilepsyHistory: Boolean(input.epilepsyHistory),
    psychiatricHistory: input.psychiatricHistory || null,
    previousHypnosis: input.previousHypnosis || null,
    suggestibilityNotes: input.suggestibilityNotes || null,
    emotionalTriggers: input.emotionalTriggers || null,
    safePlace: input.safePlace || null,
    updatedAt: now,
  };
}

export async function saveClientAnamneseDigital(
  clientId: string,
  input: {
    fullName: string;
    cpf: string;
    rg: string;
    birthDate: string;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactRelationship?: string | null;
    consultationReason: string;
    hasHealthConditions: boolean;
    healthConditionsDetails?: string | null;
    hasPsychCare: boolean;
    psychCareDetails?: string | null;
    epilepsyHistory?: boolean;
    consentAgreed: boolean;
  }
) {
  const database = getDatabase();
  const now = new Date().toISOString();

  const ecName = input.emergencyContactName?.trim() || null;
  const ecPhone = input.emergencyContactPhone?.trim() || null;
  const ecRel = input.emergencyContactRelationship?.trim() || null;
  const ecJson = ecName || ecPhone ? JSON.stringify([{ name: ecName || '', phone: ecPhone, relationship: ecRel }]) : null;

  // 1. Atualizar nome do cliente
  await database.prepare(`
    UPDATE clients SET name = ?, updated_at = ? WHERE id = ?
  `).run(input.fullName.trim(), now, clientId);

  // 2. Gravar dados na tabela client_records
  const existing = await database.prepare(`
    SELECT client_id FROM client_records WHERE client_id = ?
  `).get(clientId);

  if (existing) {
    await database.prepare(`
      UPDATE client_records
      SET cpf = ?, rg = ?, birth_date = ?,
          emergency_contact_name = COALESCE(?, emergency_contact_name),
          emergency_contact_phone = COALESCE(?, emergency_contact_phone),
          emergency_contact_relationship = COALESCE(?, emergency_contact_relationship),
          emergency_contacts = COALESCE(?, emergency_contacts),
          consultation_reason = ?, chief_complaint = ?,
          has_health_conditions = ?, health_conditions_details = ?,
          has_psych_care = ?, psych_care_details = ?,
          epilepsy_history = ?,
          consent_agreed = ?, consent_agreed_at = ?,
          updated_at = ?
      WHERE client_id = ?
    `).run(
      input.cpf.trim(),
      input.rg.trim(),
      input.birthDate.trim(),
      ecName,
      ecPhone,
      ecRel,
      ecJson,
      input.consultationReason.trim(),
      input.consultationReason.trim(),
      input.hasHealthConditions ? 1 : 0,
      input.healthConditionsDetails?.trim() || null,
      input.hasPsychCare ? 1 : 0,
      input.psychCareDetails?.trim() || null,
      input.epilepsyHistory ? 1 : 0,
      input.consentAgreed ? 1 : 0,
      now,
      now,
      clientId
    );
  } else {
    await database.prepare(`
      INSERT INTO client_records (
        client_id, cpf, rg, birth_date,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, emergency_contacts,
        consultation_reason, chief_complaint,
        has_health_conditions, health_conditions_details,
        has_psych_care, psych_care_details,
        epilepsy_history,
        consent_agreed, consent_agreed_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId,
      input.cpf.trim(),
      input.rg.trim(),
      input.birthDate.trim(),
      ecName,
      ecPhone,
      ecRel,
      ecJson,
      input.consultationReason.trim(),
      input.consultationReason.trim(),
      input.hasHealthConditions ? 1 : 0,
      input.healthConditionsDetails?.trim() || null,
      input.hasPsychCare ? 1 : 0,
      input.psychCareDetails?.trim() || null,
      input.epilepsyHistory ? 1 : 0,
      input.consentAgreed ? 1 : 0,
      now,
      now
    );
  }

  // 3. Registrar documento de consentimento assinado em client_documents
  try {
    const existingDoc = await database.prepare(`
      SELECT id FROM client_documents
      WHERE client_id = ? AND document_type = 'termo_consentimento'
    `).get(clientId) as { id: string } | undefined;

    if (existingDoc) {
      await database.prepare(`
        UPDATE client_documents
        SET status = 'assinado', signed_at = ?, content = ?
        WHERE id = ?
      `).run(
        now,
        `Termo de Consentimento Informado e Anamnese Digital aceito eletronicamente em ${now} por ${input.fullName.trim()} (CPF ${input.cpf.trim()}). Motivo: ${input.consultationReason.trim()}`,
        existingDoc.id
      );
    } else {
      await database.prepare(`
        INSERT INTO client_documents (
          id, client_id, title, document_type, status, content, signed_at, created_at
        ) VALUES (?, ?, ?, 'termo_consentimento', 'assinado', ?, ?, ?)
      `).run(
        randomUUID(),
        clientId,
        'Termo de Consentimento & Anamnese Digital',
        `Termo de Consentimento Informado e Anamnese Digital aceito eletronicamente em ${now} por ${input.fullName.trim()} (CPF ${input.cpf.trim()}). Motivo: ${input.consultationReason.trim()}`,
        now,
        now
      );
    }
  } catch {}

  if (input.cpf) {
    await unifyClientRecordsByIdentity(database, clientId, input.cpf.replace(/\D/g, ''), null, null);
  }

  // Gravar Auditoria LGPD e Anamnese do Paciente
  try {
    await recordAuditLog({
      clinicId: IDS.clinic,
      actorType: 'paciente',
      actorId: clientId,
      actorName: input.fullName.trim(),
      category: 'anamnese',
      action: 'submissao_ficha_anamnese',
      title: 'Ficha de Anamnese Digital Salva',
      description: `Ficha de Anamnese e histórico de saúde preenchidos pelo(a) paciente "${input.fullName.trim()}" (CPF: ${input.cpf.trim()}).`,
      severity: 'info',
      details: {
        clientId,
        name: input.fullName.trim(),
        cpf: input.cpf.trim(),
        consultationReason: input.consultationReason.trim(),
        hasHealthConditions: input.hasHealthConditions,
        hasPsychCare: input.hasPsychCare,
        consentAgreed: input.consentAgreed,
      },
    });

    if (input.consentAgreed) {
      await recordAuditLog({
        clinicId: IDS.clinic,
        actorType: 'paciente',
        actorId: clientId,
        actorName: input.fullName.trim(),
        category: 'consentimento_lgpd',
        action: 'consentimento_aceito',
        title: 'Consentimento LGPD & Termo Terapêutico Aceito',
        description: `Paciente "${input.fullName.trim()}" aceitou eletronicamente o Termo de Consentimento Informado e Tratamento de Dados LGPD.`,
        severity: 'info',
        details: {
          clientId,
          cpf: input.cpf.trim(),
          consentAgreed: true,
          termo: 'Termo de Consentimento & Anamnese Digital',
        },
      });
    }
  } catch (err) {
    console.error('[Audit] Falha ao registrar log de anamnese digital:', err);
  }
}

export async function createTreatmentGoal(clientId: string, input: TreatmentGoalInput, actor: { userId: string; name: string }): Promise<TreatmentGoal> {
  const database = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const achievedAt = input.status === 'alcancado' ? now : null;

  (await database.prepare(`
    INSERT INTO treatment_goals (id, client_id, title, description, status, progress_pct, target_date, achieved_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, clientId, input.title, input.description || null, input.status, input.progressPct, input.targetDate || null, achievedAt, now, now));

  (await logProntuarioAccess(clientId, actor, 'novo_objetivo', `Novo objetivo terapêutico definido: "${input.title}".`));

  return {
    id,
    clientId,
    title: input.title,
    description: input.description || null,
    status: input.status,
    progressPct: input.progressPct,
    targetDate: input.targetDate || null,
    achievedAt,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateTreatmentGoal(
  clientId: string,
  goalId: string,
  input: { status?: TreatmentGoal['status']; progressPct?: number; description?: string | null; targetDate?: string | null },
  actor: { userId: string; name: string },
): Promise<TreatmentGoal> {
  const database = getDatabase();
  const existing = (await database.prepare('SELECT * FROM treatment_goals WHERE id = ? AND client_id = ?').get(goalId, clientId)) as Record<string, unknown> | undefined;
  if (!existing) throw new Error('Objetivo não encontrado.');

  const now = new Date().toISOString();
  const nextStatus = input.status ?? (existing.status as TreatmentGoal['status']);
  const nextProgress = input.progressPct !== undefined ? input.progressPct : Number(existing.progress_pct ?? 0);
  const achievedAt = nextStatus === 'alcancado' ? (existing.achieved_at ? String(existing.achieved_at) : now) : null;

  (await database.prepare(`
    UPDATE treatment_goals
    SET status = ?, progress_pct = ?, description = COALESCE(?, description), target_date = COALESCE(?, target_date), achieved_at = ?, updated_at = ?
    WHERE id = ? AND client_id = ?
  `).run(nextStatus, nextProgress, input.description ?? null, input.targetDate ?? null, achievedAt, now, goalId, clientId));

  (await logProntuarioAccess(clientId, actor, 'alteracao_objetivo', `Atualização do objetivo "${existing.title}" para status: ${nextStatus} (${nextProgress}%).`));

  return {
    id: goalId,
    clientId,
    title: String(existing.title),
    description: input.description !== undefined ? input.description : (existing.description ? String(existing.description) : null),
    status: nextStatus,
    progressPct: nextProgress,
    targetDate: input.targetDate !== undefined ? input.targetDate : (existing.target_date ? String(existing.target_date) : null),
    achievedAt,
    createdAt: String(existing.created_at),
    updatedAt: now,
  };
}

export async function createClinicalEvolution(clientId: string, input: ClinicalEvolutionInput, actor: { userId: string; name: string }): Promise<ClinicalEvolution> {
  const database = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  (await database.prepare(`
    INSERT INTO clinical_evolutions (
      id, client_id, appointment_id, professional_id, session_date, title,
      summary, evolution_text, interventions, homework_tasks, is_confidential,
      induction_method, trance_depth, hypnotic_phenomena, post_hypnotic_suggestions,
      deinduction_notes, self_hypnosis_prescribed,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    clientId,
    input.appointmentId || null,
    IDS.professional,
    input.sessionDate,
    input.title,
    input.summary || null,
    input.evolutionText,
    input.interventions || null,
    input.homeworkTasks || null,
    input.isConfidential ? 1 : 0,
    input.inductionMethod || null,
    input.tranceDepth || null,
    input.hypnoticPhenomena || null,
    input.postHypnoticSuggestions || null,
    input.deinductionNotes || null,
    input.selfHypnosisPrescribed || null,
    actor.userId,
    now,
    now,
  ));

  (await logProntuarioAccess(clientId, actor, 'nova_evolucao', `Registro de sessão de hipnoterapia em ${input.sessionDate}: "${input.title}".`));

  return {
    id,
    clientId,
    appointmentId: input.appointmentId || null,
    professionalId: IDS.professional,
    sessionDate: input.sessionDate,
    title: input.title,
    summary: input.summary || null,
    evolutionText: input.evolutionText,
    interventions: input.interventions || null,
    homeworkTasks: input.homeworkTasks || null,
    isConfidential: input.isConfidential,
    inductionMethod: input.inductionMethod || null,
    tranceDepth: input.tranceDepth || null,
    hypnoticPhenomena: input.hypnoticPhenomena || null,
    postHypnoticSuggestions: input.postHypnoticSuggestions || null,
    deinductionNotes: input.deinductionNotes || null,
    selfHypnosisPrescribed: input.selfHypnosisPrescribed || null,
    createdBy: actor.userId,
    createdByName: actor.name,
    finalizedAt: null,
    finalizedBy: null,
    finalizedByName: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function finalizeEvolution(
  evolutionId: string,
  clientId: string,
  actor: { userId: string; name: string }
): Promise<{ ok: boolean; error?: string }> {
  const database = getDatabase();
  const now = new Date().toISOString();

  // Verificar se já finalizado
  const existing = (await database.prepare(
    'SELECT finalized_at FROM clinical_evolutions WHERE id = ? AND client_id = ?'
  ).get(evolutionId, clientId)) as { finalized_at: string | null } | undefined;

  if (!existing) return { ok: false, error: 'Evolução não encontrada.' };
  if (existing.finalized_at) return { ok: false, error: 'Este registro já foi finalizado e não pode ser alterado.' };

  (await database.prepare(`
    UPDATE clinical_evolutions
    SET finalized_at = ?, finalized_by = ?, finalized_by_name = ?, updated_at = ?
    WHERE id = ? AND client_id = ?
  `).run(now, actor.userId, actor.name, now, evolutionId, clientId));

  (await logProntuarioAccess(
    clientId,
    actor,
    'finalizacao_registro',
    `Registro de evolução clínica "${evolutionId}" finalizado e assinado digitalmente por ${actor.name} em ${now}. Integridade preservada conforme Lei 13.787/2018.`
  ));

  return { ok: true };
}

export async function createClinicalTechnique(clientId: string, input: ClinicalTechniqueInput, actor: { userId: string; name: string }): Promise<ClinicalTechnique> {
  const database = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  (await database.prepare(`
    INSERT INTO clinical_techniques (id, client_id, evolution_id, name, category, notes, outcome, applied_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, clientId, input.evolutionId || null, input.name, input.category, input.notes || null, input.outcome, input.appliedAt, now));

  (await logProntuarioAccess(clientId, actor, 'tecnica_aplicada', `Registro de técnica aplicada: "${input.name}" (${input.category}).`));

  return {
    id,
    clientId,
    evolutionId: input.evolutionId || null,
    name: input.name,
    category: input.category,
    notes: input.notes || null,
    outcome: input.outcome,
    appliedAt: input.appliedAt,
    createdAt: now,
  };
}

export async function createClientDocument(clientId: string, input: ClientDocumentInput, actor: { userId: string; name: string }): Promise<ClientDocument> {
  const database = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const signedAt = input.status === 'assinado' ? now : null;
  const fileDataJson = input.fileData ? (typeof input.fileData === 'string' ? input.fileData : JSON.stringify(input.fileData)) : null;

  (await database.prepare(`
    INSERT INTO client_documents (id, client_id, title, document_type, document_type_label, status, file_name, file_data, content, signed_at, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, clientId, input.title, input.documentType, input.documentTypeLabel || null, input.status, input.fileName || null, fileDataJson, input.content || null, signedAt, actor.userId, now));

  (await logProntuarioAccess(clientId, actor, 'documento_adicionado', `Inclusão de documento: "${input.title}" (${input.documentTypeLabel || input.documentType}).`));

  return {
    id,
    clientId,
    title: input.title,
    documentType: input.documentType,
    documentTypeLabel: input.documentTypeLabel || null,
    status: input.status,
    fileName: input.fileName || null,
    fileData: input.fileData ? (Array.isArray(input.fileData) ? input.fileData : null) : null,
    content: input.content || null,
    signedAt,
    createdBy: actor.userId,
    createdAt: now,
  };
}

export async function updateClientDocument(
  clientId: string,
  documentId: string,
  input: ClientDocumentInput,
  actor: { userId: string; name: string },
): Promise<ClientDocument> {
  const database = getDatabase();
  const now = new Date().toISOString();
  const fileDataJson = input.fileData
    ? typeof input.fileData === 'string'
      ? input.fileData
      : JSON.stringify(input.fileData)
    : null;

  // Preserve original signed_at if already signed; set if newly signed
  const existing = (await database.prepare(
    'SELECT signed_at, created_by, created_at FROM client_documents WHERE id = ? AND client_id = ?',
  ).get(documentId, clientId)) as { signed_at: string | null; created_by: string; created_at: string } | undefined;

  if (!existing) throw new Error('Documento não encontrado.');

  const signedAt =
    input.status === 'assinado'
      ? (existing.signed_at ?? now)
      : null;

  (await database.prepare(`
    UPDATE client_documents
    SET title = ?, document_type = ?, document_type_label = ?, status = ?, file_name = ?,
        file_data = ?, content = ?, signed_at = ?
    WHERE id = ? AND client_id = ?
  `).run(
    input.title,
    input.documentType,
    input.documentTypeLabel || null,
    input.status,
    input.fileName || null,
    fileDataJson,
    input.content || null,
    signedAt,
    documentId,
    clientId,
  ));

  (await logProntuarioAccess(clientId, actor, 'documento_editado', `Edição de documento: "${input.title}".`));

  return {
    id: documentId,
    clientId,
    title: input.title,
    documentType: input.documentType,
    documentTypeLabel: input.documentTypeLabel || null,
    status: input.status,
    fileName: input.fileName || null,
    fileData: input.fileData ? (Array.isArray(input.fileData) ? input.fileData : null) : null,
    content: input.content || null,
    signedAt,
    createdBy: existing.created_by,
    createdAt: existing.created_at,
  };
}

export async function deleteClientDocument(
  clientId: string,
  documentId: string,
  actor: { userId: string; name: string },
): Promise<void> {
  const database = getDatabase();
  const doc = (await database.prepare(
    'SELECT title FROM client_documents WHERE id = ? AND client_id = ?',
  ).get(documentId, clientId)) as { title: string } | undefined;

  if (!doc) throw new Error('Documento não encontrado.');

  (await database.prepare('DELETE FROM client_documents WHERE id = ? AND client_id = ?').run(documentId, clientId));
  (await logProntuarioAccess(clientId, actor, 'documento_excluido', `Exclusão de documento: "${doc.title}".`));
}

export async function createClientReferral(clientId: string, input: ClientReferralInput, actor: { userId: string; name: string }): Promise<ClientReferral> {
  const database = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  (await database.prepare(`
    INSERT INTO client_referrals (id, client_id, specialty, professional_name, reason, referred_at, expected_return_at, status, return_notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, clientId, input.specialty, input.professionalName || null, input.reason, input.referredAt, input.expectedReturnAt || null, input.status, input.returnNotes || null, now));

  (await logProntuarioAccess(clientId, actor, 'encaminhamento_registrado', `Encaminhamento para ${input.specialty}: "${input.reason}".`));

  return {
    id,
    clientId,
    specialty: input.specialty,
    professionalName: input.professionalName || null,
    reason: input.reason,
    referredAt: input.referredAt,
    expectedReturnAt: input.expectedReturnAt || null,
    status: input.status,
    returnNotes: input.returnNotes || null,
    createdAt: now,
  };
}

export async function updateClientReferralStatus(
  clientId: string,
  referralId: string,
  status: ClientReferral['status'],
  returnNotes: string | null,
  actor: { userId: string; name: string },
): Promise<ClientReferral> {
  const database = getDatabase();
  const existing = (await database.prepare('SELECT * FROM client_referrals WHERE id = ? AND client_id = ?').get(referralId, clientId)) as Record<string, unknown> | undefined;
  if (!existing) throw new Error('Encaminhamento não encontrado.');

  (await database.prepare(`
    UPDATE client_referrals
    SET status = ?, return_notes = COALESCE(?, return_notes)
    WHERE id = ? AND client_id = ?
  `).run(status, returnNotes, referralId, clientId));

  (await logProntuarioAccess(clientId, actor, 'retorno_encaminhamento', `Status de encaminhamento para ${existing.specialty} atualizado para "${status}".`));

  return {
    id: referralId,
    clientId,
    specialty: String(existing.specialty),
    professionalName: existing.professional_name ? String(existing.professional_name) : null,
    reason: String(existing.reason),
    referredAt: String(existing.referred_at),
    expectedReturnAt: existing.expected_return_at ? String(existing.expected_return_at) : null,
    status,
    returnNotes: returnNotes ?? (existing.return_notes ? String(existing.return_notes) : null),
    createdAt: String(existing.created_at),
  };
}

export type ProntuarioListItem = {
  clientId: string;
  name: string;
  phone: string;
  email: string | null;
  status: ClientSummary['status'];
  totalEvolutions: number;
  activeGoals: number;
  lastEvolutionDate: string | null;
  lastEvolutionTitle?: string | null;
  hasInitialRecord: boolean;
  consentAgreed?: boolean;
  cpf?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  occupation?: string | null;
  chiefComplaint?: string | null;
  totalDocuments?: number;
  totalTechniques?: number;
  completedAppointments?: number;
  nextAppointmentAt?: string | null;
  activePackagesRemainingSessions?: number;
};

export async function listProntuarios(search = '', status = 'todos'): Promise<ProntuarioListItem[]> {
  const database = getDatabase();
  const cleanSearch = search.trim();
  const term = `%${cleanSearch}%`;
  const digitsTerm = cleanSearch.replace(/\D/g, '') ? `%${cleanSearch.replace(/\D/g, '')}%` : term;
  const nowIso = new Date().toISOString();

  return ((await database.prepare(`
    SELECT
      c.id, c.name, c.phone, c.email, c.status,
      COUNT(DISTINCT e.id) AS total_evolutions,
      COUNT(DISTINCT CASE WHEN g.status = 'em_andamento' THEN g.id END) AS active_goals,
      MAX(e.session_date) AS last_evolution_date,
      (SELECT e2.title FROM clinical_evolutions e2 WHERE e2.client_id = c.id ORDER BY e2.session_date DESC, e2.created_at DESC LIMIT 1) AS last_evolution_title,
      MAX(CASE WHEN cr.client_id IS NOT NULL AND (COALESCE(cr.cpf, '') != '' OR COALESCE(cr.chief_complaint, '') != '' OR COALESCE(cr.consultation_reason, '') != '' OR cr.consent_agreed = 1) THEN 1 ELSE 0 END) AS has_initial_record,
      MAX(COALESCE(cr.consent_agreed, 0)) AS consent_agreed,
      MAX(cr.cpf) AS cpf,
      MAX(cr.birth_date) AS birth_date,
      MAX(cr.gender) AS gender,
      MAX(cr.occupation) AS occupation,
      MAX(COALESCE(NULLIF(cr.chief_complaint, ''), cr.consultation_reason)) AS chief_complaint,
      (SELECT COUNT(*) FROM client_documents cd WHERE cd.client_id = c.id) AS total_documents,
      (SELECT COUNT(*) FROM clinical_techniques ct WHERE ct.client_id = c.id) AS total_techniques,
      (SELECT COUNT(*) FROM appointments a WHERE a.client_id = c.id AND a.status = 'concluido') AS completed_appointments,
      (SELECT MIN(a2.start_at) FROM appointments a2 WHERE a2.client_id = c.id AND a2.start_at >= ? AND a2.status NOT IN ('cancelado', 'nao_compareceu')) AS next_appointment_at,
      (SELECT COALESCE(SUM(cp.total_sessions - cp.used_sessions), 0) FROM client_packages cp WHERE cp.client_id = c.id AND cp.status = 'ativo') AS active_packages_remaining_sessions
    FROM clients c
    LEFT JOIN clinical_evolutions e ON e.client_id = c.id
    LEFT JOIN treatment_goals g ON g.client_id = c.id
    LEFT JOIN client_records cr ON cr.client_id = c.id
    WHERE c.clinic_id = ?
      AND (
        ? = ''
        OR c.name LIKE ?
        OR c.phone LIKE ?
        OR COALESCE(c.email, '') LIKE ?
        OR COALESCE(cr.cpf, '') LIKE ?
        OR REPLACE(REPLACE(REPLACE(COALESCE(cr.cpf, ''), '.', ''), '-', ''), ' ', '') LIKE ?
      )
      AND (? = 'todos' OR c.status = ?)
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE
  `).all(nowIso, IDS.clinic, cleanSearch, term, term, term, term, digitsTerm, status, status)) as Record<string, unknown>[]).map((row) => ({
    clientId: String(row.id),
    name: String(row.name),
    phone: String(row.phone),
    email: row.email ? String(row.email) : null,
    status: row.status as ClientSummary['status'],
    totalEvolutions: Number(row.total_evolutions ?? 0),
    activeGoals: Number(row.active_goals ?? 0),
    lastEvolutionDate: row.last_evolution_date ? String(row.last_evolution_date) : null,
    lastEvolutionTitle: row.last_evolution_title ? String(row.last_evolution_title) : null,
    hasInitialRecord: Boolean(row.has_initial_record),
    consentAgreed: Boolean(row.consent_agreed),
    cpf: row.cpf ? String(row.cpf) : null,
    birthDate: row.birth_date ? String(row.birth_date) : null,
    gender: row.gender ? String(row.gender) : null,
    occupation: row.occupation ? String(row.occupation) : null,
    chiefComplaint: row.chief_complaint ? String(row.chief_complaint) : null,
    totalDocuments: Number(row.total_documents ?? 0),
    totalTechniques: Number(row.total_techniques ?? 0),
    completedAppointments: Number(row.completed_appointments ?? 0),
    nextAppointmentAt: row.next_appointment_at ? String(row.next_appointment_at) : null,
    activePackagesRemainingSessions: Number(row.active_packages_remaining_sessions ?? 0),
  }));
}

export async function exportClientLgpdDossier(clientId: string, actor: { userId: string; name: string }): Promise<Record<string, unknown>> {
  const full = (await getProntuario(clientId, actor));
  if (!full) {
    throw new Error('Cliente ou prontuário não encontrado');
  }
  (await logProntuarioAccess(clientId, actor, 'exportacao_lgpd', 'Geração de dossiê completo de dados do titular nos termos do Art. 18 da LGPD.'));
  return {
    titular: {
      nome: full.client.name,
      telefone: full.client.phone,
      email: full.client.email,
      cadastradoEm: full.client.createdAt,
    },
    profissionalResponsavel: {
      nome: 'Camila Machado',
      titulo: 'Terapeuta em Hipnose Clínica Multidimensional Integrativa',
      registro: 'CRT-SBHP/SC 805',
      sociedade: 'Sociedade Brasileira de Hipnose e Psicoterapia (SBHP)',
      cidade: 'Urussanga / SC',
    },
    fichaClinicaAnamnese: full.record,
    objetivosTerapeuticos: full.goals,
    historicoSessoes: full.sessions,
    evolucoesClinicasHipnoterapia: full.evolutions,
    tecnicasAplicadas: full.techniques,
    documentosTermos: full.documents.map((d: ClientDocument) => ({
      titulo: d.title,
      tipo: d.documentTypeLabel || d.documentType,
      status: d.status,
      conteudo: d.content,
      arquivosAnexados: d.fileData ? d.fileData.map((f: ClientDocumentFile) => ({ nome: f.name, tamanhoBytes: f.size, tipo: f.mimeType })) : null,
      data: d.createdAt,
    })),
    trilhaAuditoriaSeguranca: full.logs,
    avisoLegalLGPD: 'Dossiê do Titular gerado em estrita conformidade com o Artigo 18 da Lei Geral de Proteção de Dados (Lei 13.709/2018), Lei 13.787/2018 (Guarda e Conservação de Prontuários) e Código de Ética da SBHP.',
    geradoEm: new Date().toISOString(),
  };
}

/**
 * Unifica cadastros duplicados do mesmo cliente (identificado por CPF, Telefone ou E-mail)
 * transferindo todos os pagamentos, transações, agendamentos, documentos, pacotes, objetivos
 * e evoluções para o `targetClientId`.
 */
export async function unifyClientRecordsByIdentity(
  database: Database,
  targetClientId: string,
  cpfDigits?: string | null,
  phoneDigits?: string | null,
  emailLower?: string | null
) {
  const cleanCpf = (cpfDigits || '').replace(/\D/g, '');
  const cleanPhone = (phoneDigits || '').replace(/\D/g, '');
  const cleanEmail = (emailLower || '').trim().toLowerCase();

  if (cleanCpf.length !== 11 && cleanPhone.length < 10 && !cleanEmail) {
    return;
  }

  try {
    const candidates = (await database.prepare(`
      SELECT c.id, c.name, c.phone, c.email, c.password_hash,
             REPLACE(REPLACE(REPLACE(COALESCE(cr.cpf, ''), '.', ''), '-', ''), ' ', '') AS norm_cpf,
             REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(c.phone, ''), ' ', ''), '-', ''), '(', ''), ')', '') AS norm_phone
      FROM clients c
      LEFT JOIN client_records cr ON cr.client_id = c.id
      WHERE c.clinic_id = ? AND c.id != ?
    `).all(IDS.clinic, targetClientId)) as Array<{
      id: string;
      name: string;
      phone: string;
      email: string | null;
      password_hash: string | null;
      norm_cpf: string;
      norm_phone: string;
    }>;

    const duplicateIds: string[] = [];
    for (const cand of candidates) {
      const matchCpf = cleanCpf.length === 11 && cand.norm_cpf === cleanCpf;
      const matchPhone =
        cleanPhone.length >= 10 &&
        cand.norm_phone.length >= 10 &&
        (cand.norm_phone === cleanPhone || cand.norm_phone.slice(-10) === cleanPhone.slice(-10));
      const matchEmail = Boolean(cleanEmail && cand.email && cand.email.trim().toLowerCase() === cleanEmail);

      // Se bateu CPF (identificador único nacional) ou telefone/email sem conflito de outro CPF diferente
      if (matchCpf || ((matchPhone || matchEmail) && (!cand.norm_cpf || !cleanCpf || cand.norm_cpf === cleanCpf))) {
        duplicateIds.push(cand.id);
      }
    }

    if (duplicateIds.length === 0) return;

    const now = new Date().toISOString();
    for (const dupId of duplicateIds) {
      // 1. Transferir pagamentos e transações financeiras
      try {
        await database.prepare('UPDATE client_payments SET client_id = ?, updated_at = ? WHERE client_id = ?').run(targetClientId, now, dupId);
      } catch {}
      try {
        await database.prepare('UPDATE payment_transactions SET client_id = ? WHERE client_id = ?').run(targetClientId, dupId);
      } catch {}

      // 2. Transferir agendamentos, documentos, pacotes, metas, evoluções, técnicas, encaminhamentos e logs
      const tables = [
        'appointments',
        'client_documents',
        'client_packages',
        'treatment_goals',
        'clinical_evolutions',
        'clinical_techniques',
        'client_referrals',
        'prontuario_access_logs',
      ];
      for (const tbl of tables) {
        try {
          await database.prepare(`UPDATE ${tbl} SET client_id = ? WHERE client_id = ?`).run(targetClientId, dupId);
        } catch {}
      }

      // 3. Mesclar dados de client_records (CPF, RG, anamnese, contatos de emergência, etc.)
      try {
        const dupRec = (await database.prepare('SELECT * FROM client_records WHERE client_id = ?').get(dupId)) as Record<string, unknown> | undefined;
        if (dupRec) {
          const targetRec = (await database.prepare('SELECT * FROM client_records WHERE client_id = ?').get(targetClientId)) as Record<string, unknown> | undefined;
          if (!targetRec) {
            await database.prepare('UPDATE client_records SET client_id = ? WHERE client_id = ?').run(targetClientId, dupId);
          } else {
            await database.prepare(`
              UPDATE client_records
              SET cpf = COALESCE(NULLIF(cpf, ''), ?),
                  rg = COALESCE(NULLIF(rg, ''), ?),
                  birth_date = COALESCE(NULLIF(birth_date, ''), ?),
                  gender = COALESCE(NULLIF(gender, ''), ?),
                  marital_status = COALESCE(NULLIF(marital_status, ''), ?),
                  occupation = COALESCE(NULLIF(occupation, ''), ?),
                  address = COALESCE(NULLIF(address, ''), ?),
                  city = COALESCE(NULLIF(city, ''), ?),
                  state = COALESCE(NULLIF(state, ''), ?),
                  zip_code = COALESCE(NULLIF(zip_code, ''), ?),
                  emergency_contact_name = COALESCE(NULLIF(emergency_contact_name, ''), ?),
                  emergency_contact_phone = COALESCE(NULLIF(emergency_contact_phone, ''), ?),
                  emergency_contact_relationship = COALESCE(NULLIF(emergency_contact_relationship, ''), ?),
                  emergency_contacts = COALESCE(NULLIF(emergency_contacts, ''), ?),
                  chief_complaint = COALESCE(NULLIF(chief_complaint, ''), ?),
                  consultation_reason = COALESCE(NULLIF(consultation_reason, ''), ?),
                  symptom_history = COALESCE(NULLIF(symptom_history, ''), ?),
                  medical_history = COALESCE(NULLIF(medical_history, ''), ?),
                  medications = COALESCE(NULLIF(medications, ''), ?),
                  allergies = COALESCE(NULLIF(allergies, ''), ?),
                  previous_therapy = COALESCE(NULLIF(previous_therapy, ''), ?),
                  previous_hypnosis = COALESCE(NULLIF(previous_hypnosis, ''), ?),
                  family_context = COALESCE(NULLIF(family_context, ''), ?),
                  routine_habits = COALESCE(NULLIF(routine_habits, ''), ?),
                  general_observations = COALESCE(NULLIF(general_observations, ''), ?),
                  health_conditions_details = COALESCE(NULLIF(health_conditions_details, ''), ?),
                  psych_care_details = COALESCE(NULLIF(psych_care_details, ''), ?)
              WHERE client_id = ?
            `).run(
              dupRec.cpf ? String(dupRec.cpf) : null,
              dupRec.rg ? String(dupRec.rg) : null,
              dupRec.birth_date ? String(dupRec.birth_date) : null,
              dupRec.gender ? String(dupRec.gender) : null,
              dupRec.marital_status ? String(dupRec.marital_status) : null,
              dupRec.occupation ? String(dupRec.occupation) : null,
              dupRec.address ? String(dupRec.address) : null,
              dupRec.city ? String(dupRec.city) : null,
              dupRec.state ? String(dupRec.state) : null,
              dupRec.zip_code ? String(dupRec.zip_code) : null,
              dupRec.emergency_contact_name ? String(dupRec.emergency_contact_name) : null,
              dupRec.emergency_contact_phone ? String(dupRec.emergency_contact_phone) : null,
              dupRec.emergency_contact_relationship ? String(dupRec.emergency_contact_relationship) : null,
              dupRec.emergency_contacts ? String(dupRec.emergency_contacts) : null,
              dupRec.chief_complaint ? String(dupRec.chief_complaint) : null,
              dupRec.consultation_reason ? String(dupRec.consultation_reason) : null,
              dupRec.symptom_history ? String(dupRec.symptom_history) : null,
              dupRec.medical_history ? String(dupRec.medical_history) : null,
              dupRec.medications ? String(dupRec.medications) : null,
              dupRec.allergies ? String(dupRec.allergies) : null,
              dupRec.previous_therapy ? String(dupRec.previous_therapy) : null,
              dupRec.previous_hypnosis ? String(dupRec.previous_hypnosis) : null,
              dupRec.family_context ? String(dupRec.family_context) : null,
              dupRec.routine_habits ? String(dupRec.routine_habits) : null,
              dupRec.general_observations ? String(dupRec.general_observations) : null,
              dupRec.health_conditions_details ? String(dupRec.health_conditions_details) : null,
              dupRec.psych_care_details ? String(dupRec.psych_care_details) : null,
              targetClientId
            );
            await database.prepare('DELETE FROM client_records WHERE client_id = ?').run(dupId);
          }
        }
      } catch {}

      // 4. Remover preferências e registro duplicado de cliente (apenas se não tiver outra senha ativa)
      try {
        await database.prepare('DELETE FROM client_preferences WHERE client_id = ?').run(dupId);
        await database.prepare('DELETE FROM clients WHERE id = ?').run(dupId);
      } catch {}
    }
  } catch (err) {
    console.error('[unifyClientRecordsByIdentity]', err);
  }
}

export async function registerClientAccount(input: {
  name: string;
  phone: string;
  email?: string | null;
  password?: string;
  modality?: 'presencial' | 'online';
  cpf?: string | null;
  birthDate?: string | null;
}) {
  const database = getDatabase();
  const cleanPhone = input.phone.trim();
  const digitsOnly = cleanPhone.replace(/\D/g, '');
  const cpfDigits = (input.cpf || '').replace(/\D/g, '');
  const cleanEmail = input.email?.trim() ? input.email.trim().toLowerCase() : null;
  const passwordHash = input.password ? hashPassword(input.password) : null;
  const now = new Date().toISOString();

  // 1º Prioridade: Buscar cliente já existente no sistema interno pelo CPF (ou Telefone / E-mail)
  let existingByCpf: { id: string; name: string; phone: string; email: string | null; password_hash: string | null } | undefined;
  if (cpfDigits.length === 11) {
    existingByCpf = (await database.prepare(`
      SELECT c.id, c.name, c.phone, c.email, c.password_hash
      FROM clients c
      JOIN client_records cr ON cr.client_id = c.id
      WHERE c.clinic_id = ?
        AND REPLACE(REPLACE(REPLACE(COALESCE(cr.cpf, ''), '.', ''), '-', ''), ' ', '') = ?
      LIMIT 1
    `).get(IDS.clinic, cpfDigits)) as typeof existingByCpf;
  }

  const existingByPhone = (await database.prepare(`
    SELECT id, name, phone, email, password_hash
    FROM clients
    WHERE clinic_id = ?
      AND (
        REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?
        OR (LENGTH(?) >= 10 AND SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), -10) = SUBSTR(?, -10))
      )
    LIMIT 1
  `).get(IDS.clinic, digitsOnly, digitsOnly, digitsOnly)) as typeof existingByCpf;

  const existingByEmail = cleanEmail
    ? ((await database.prepare(`
        SELECT id, name, phone, email, password_hash
        FROM clients
        WHERE clinic_id = ? AND LOWER(COALESCE(email, '')) = ?
        LIMIT 1
      `).get(IDS.clinic, cleanEmail)) as typeof existingByCpf)
    : undefined;

  const existing = existingByCpf || existingByPhone || existingByEmail;

  let targetClientId: string;

  if (existing) {
    if (existing.password_hash) {
      throw new Error('Já existe uma conta cadastrada com este CPF, telefone ou e-mail. Por favor, acesse a aba "Entrar".');
    }
    // Vincular conta ao cliente já existente no sistema interno (preservando ID e histórico!)
    await database.prepare(`
      UPDATE clients
      SET name = ?, phone = ?, email = COALESCE(?, email), status = 'ativo', password_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(input.name.trim(), cleanPhone, cleanEmail, passwordHash, now, existing.id);

    targetClientId = existing.id;
  } else {
    // Criar novo cliente
    const newClientId = randomUUID();
    await database.prepare(`
      INSERT INTO clients (id, clinic_id, name, phone, email, status, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'ativo', ?, ?, ?)
    `).run(newClientId, IDS.clinic, input.name.trim(), cleanPhone, cleanEmail, passwordHash, now, now);

    targetClientId = newClientId;
  }

  // Configurar preferências padrão
  await database.prepare(`
    INSERT INTO client_preferences (client_id, whatsapp_opt_in, email_opt_in, preferred_modality, updated_at)
    VALUES (?, 1, ?, ?, ?)
    ON CONFLICT (client_id) DO UPDATE SET
      preferred_modality = EXCLUDED.preferred_modality,
      updated_at = EXCLUDED.updated_at
  `).run(targetClientId, cleanEmail ? 1 : 0, input.modality ?? 'presencial', now);

  // Salvar CPF e Data de Nascimento em client_records
  if (input.cpf || input.birthDate) {
    const existingRec = await database.prepare(`
      SELECT client_id FROM client_records WHERE client_id = ?
    `).get(targetClientId);

    if (existingRec) {
      await database.prepare(`
        UPDATE client_records
        SET cpf = COALESCE(?, cpf), birth_date = COALESCE(?, birth_date), updated_at = ?
        WHERE client_id = ?
      `).run(input.cpf?.trim() || null, input.birthDate?.trim() || null, now, targetClientId);
    } else {
      await database.prepare(`
        INSERT INTO client_records (client_id, cpf, birth_date, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(targetClientId, input.cpf?.trim() || null, input.birthDate?.trim() || null, now);
    }
  }

  // Unificar quaisquer outros registros internos com o mesmo CPF, Telefone ou E-mail (pagamentos, documentos, pacotes, agendamentos, prontuário)
  await unifyClientRecordsByIdentity(database, targetClientId, cpfDigits, digitsOnly, cleanEmail);

  return {
    id: targetClientId,
    name: input.name.trim(),
    phone: cleanPhone,
    email: cleanEmail,
  };
}

export async function authenticateClientAccount(identifier: string, password: string) {
  const database = getDatabase();
  const cleanId = identifier.trim();
  const digitsOnly = cleanId.replace(/\D/g, '');
  const lowerEmail = cleanId.toLowerCase();

  const client = (await database.prepare(`
    SELECT c.id, c.name, c.phone, c.email, c.password_hash, cr.cpf
    FROM clients c
    LEFT JOIN client_records cr ON cr.client_id = c.id
    WHERE c.clinic_id = ?
      AND (
        (LENGTH(?) >= 8 AND REPLACE(REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?)
        OR (LENGTH(?) = 11 AND REPLACE(REPLACE(REPLACE(COALESCE(cr.cpf, ''), '.', ''), '-', ''), ' ', '') = ?)
        OR (c.email IS NOT NULL AND LOWER(c.email) = ?)
      )
    ORDER BY CASE WHEN c.password_hash IS NOT NULL THEN 0 ELSE 1 END
    LIMIT 1
  `).get(IDS.clinic, digitsOnly, digitsOnly, digitsOnly, digitsOnly, lowerEmail)) as {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    password_hash: string | null;
    cpf: string | null;
  } | undefined;

  if (!client || !client.password_hash) {
    throw new Error('Conta não encontrada com estes dados ou senha ainda não configurada.');
  }

  if (!verifyPassword(password, client.password_hash)) {
    throw new Error('Senha incorreta. Verifique os dados informados.');
  }

  const now = new Date().toISOString();
  await database.prepare('UPDATE clients SET last_login_at = ? WHERE id = ?').run(now, client.id);

  // Ao autenticar, unifica automaticamente eventuais registros criados internamente com o mesmo CPF/telefone/e-mail
  await unifyClientRecordsByIdentity(database, client.id, client.cpf, client.phone, client.email);

  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
    email: client.email,
  };
}

export async function getClientPortalData(clientId: string) {
  const database = getDatabase();

  const client = (await database.prepare(`
    SELECT id, name, phone, email, status, created_at
    FROM clients
    WHERE id = ? AND clinic_id = ?
  `).get(clientId, IDS.clinic)) as {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    status: string;
    created_at: string;
  } | undefined;

  if (!client) {
    throw new Error('Cliente não encontrado.');
  }

  // Verificar CPF atual do cliente e unificar automaticamente qualquer cadastro interno com o mesmo CPF/telefone/e-mail
  const preRecord = (await database.prepare('SELECT cpf FROM client_records WHERE client_id = ?').get(clientId)) as { cpf?: string | null } | undefined;
  await unifyClientRecordsByIdentity(database, clientId, preRecord?.cpf || null, client.phone, client.email);

  const appointments = ((await database.prepare(`
    SELECT
      a.id, a.client_id, c.name AS client_name, a.service_id, s.name AS service_name,
      s.pricing_tiers AS service_pricing_tiers,
      a.modality, a.start_at, a.end_at, a.status, a.source, a.booking_kind,
      a.fit_in_reason, a.administrative_notes, a.client_package_id, a.session_number, a.updated_at
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    WHERE a.client_id = ? AND a.clinic_id = ?
    ORDER BY a.start_at DESC
  `).all(clientId, IDS.clinic)) as Record<string, unknown>[]).map((row): AppointmentSummary & { _pricingTiersRaw?: unknown } => ({
    id: String(row.id),
    clientId: String(row.client_id),
    clientName: String(row.client_name),
    serviceId: String(row.service_id),
    serviceName: String(row.service_name),
    modality: row.modality as 'presencial' | 'online',
    startAt: String(row.start_at),
    endAt: String(row.end_at),
    status: row.status as AppointmentSummary['status'],
    source: row.source as 'publico' | 'interno',
    bookingKind: row.booking_kind as 'regular' | 'encaixe',
    fitInReason: row.fit_in_reason ? String(row.fit_in_reason) : null,
    administrativeNotes: row.administrative_notes ? String(row.administrative_notes) : null,
    clientPackageId: row.client_package_id ? String(row.client_package_id) : null,
    sessionNumber: row.session_number != null ? Number(row.session_number) : null,
    updatedAt: String(row.updated_at),
    _pricingTiersRaw: row.service_pricing_tiers,
  }));

  const documents = ((await database.prepare(`
    SELECT id, title, document_type, document_type_label, status, file_name, created_at
    FROM client_documents
    WHERE client_id = ?
    ORDER BY created_at DESC
  `).all(clientId)) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    documentType: String(row.document_type),
    documentTypeLabel: row.document_type_label ? String(row.document_type_label) : null,
    status: String(row.status),
    fileName: row.file_name ? String(row.file_name) : null,
    createdAt: String(row.created_at),
  }));

  // Buscar dados de perfil cadastral e anamnese (client_records)
  const recordRow = (await database.prepare(`
    SELECT cpf, rg, birth_date, gender, occupation,
           emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
           consultation_reason, chief_complaint,
           has_health_conditions, health_conditions_details,
           has_psych_care, psych_care_details,
           epilepsy_history,
           consent_agreed, consent_agreed_at
    FROM client_records
    WHERE client_id = ?
  `).get(clientId)) as Record<string, unknown> | undefined;

  // Buscar pagamentos do cliente (pendentes, parciais/em aberto, parcelados e pagos) + histórico de transações
  let payments: Array<{
    id: string;
    description: string;
    serviceName: string | null;
    category: string;
    chargeType: string;
    installmentNumber: number | null;
    totalInstallments: number | null;
    amountCents: number;
    grossAmountCents: number;
    discountCents: number;
    paidAmountCents: number;
    remainingAmountCents: number;
    paymentMethod: string;
    status: string;
    isOverdue: boolean;
    paidAt: string | null;
    dueAt: string | null;
    receiptUrl: string | null;
    notes: string | null;
    transactions: Array<{
      id: string;
      amountCents: number;
      paymentMethod: string;
      paidAt: string;
      notes: string | null;
    }>;
    createdAt: string;
  }> = [];

  try {
    const paymentRows = (await database.prepare(`
      SELECT
        p.id, p.description, p.category, p.charge_type, p.installment_number, p.total_installments,
        p.amount_cents, p.paid_amount_cents, p.remaining_amount_cents, p.discount_cents,
        p.payment_method, p.status, p.paid_at, p.due_at, p.receipt_url, p.notes, p.created_at,
        p.entry_type, s.name AS service_name
      FROM client_payments p
      LEFT JOIN services s ON s.id = p.service_id
      WHERE p.client_id = ? AND COALESCE(p.entry_type, 'entrada') = 'entrada'
      ORDER BY COALESCE(p.due_at, p.paid_at, p.created_at) DESC
    `).all(clientId)) as Record<string, unknown>[];

    let txRows: Record<string, unknown>[] = [];
    try {
      txRows = (await database.prepare(`
        SELECT id, payment_id, amount_cents, payment_method, paid_at, notes
        FROM payment_transactions
        WHERE client_id = ?
        ORDER BY paid_at DESC
      `).all(clientId)) as Record<string, unknown>[];
    } catch {
      txRows = [];
    }

    const txByPayment = new Map<string, Array<{ id: string; amountCents: number; paymentMethod: string; paidAt: string; notes: string | null }>>();
    for (const t of txRows) {
      const pid = String(t.payment_id);
      if (!txByPayment.has(pid)) txByPayment.set(pid, []);
      txByPayment.get(pid)!.push({
        id: String(t.id),
        amountCents: Number(t.amount_cents ?? 0),
        paymentMethod: String(t.payment_method ?? 'pix'),
        paidAt: String(t.paid_at),
        notes: t.notes ? String(t.notes) : null,
      });
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    payments = paymentRows.map((r) => {
      const id = String(r.id);
      const amountCents = Number(r.amount_cents ?? 0);
      const discountCents = Number(r.discount_cents ?? 0);
      let paidAmountCents = Number(r.paid_amount_cents ?? 0);
      let remainingAmountCents = Number(r.remaining_amount_cents ?? 0);
      const statusVal = String(r.status ?? 'pago');
      const dueAt = r.due_at ? String(r.due_at) : null;

      if (statusVal === 'pago' && paidAmountCents === 0 && remainingAmountCents === 0 && amountCents > 0) {
        paidAmountCents = amountCents;
      }
      if (statusVal === 'pendente' && remainingAmountCents === 0 && amountCents > 0) {
        remainingAmountCents = amountCents;
      }
      if (statusVal === 'parcial' && remainingAmountCents === 0 && amountCents > paidAmountCents) {
        remainingAmountCents = Math.max(0, amountCents - paidAmountCents);
      }

      const isOverdue = Boolean((statusVal === 'pendente' || statusVal === 'parcial') && dueAt && dueAt.slice(0, 10) < todayStr);

      return {
        id,
        description: String(r.description),
        serviceName: r.service_name ? String(r.service_name) : null,
        category: String(r.category ?? 'sessao_avulsa'),
        chargeType: String(r.charge_type ?? 'avulso'),
        installmentNumber: r.installment_number != null ? Number(r.installment_number) : null,
        totalInstallments: r.total_installments != null ? Number(r.total_installments) : null,
        amountCents,
        grossAmountCents: amountCents + discountCents,
        discountCents,
        paidAmountCents,
        remainingAmountCents,
        paymentMethod: String(r.payment_method ?? 'pix'),
        status: statusVal,
        isOverdue,
        paidAt: r.paid_at ? String(r.paid_at) : null,
        dueAt,
        receiptUrl: r.receipt_url ? String(r.receipt_url) : null,
        notes: r.notes ? String(r.notes) : null,
        transactions: txByPayment.get(id) || [],
        createdAt: String(r.created_at),
      };
    });
  } catch {
    payments = [];
  }

  // Buscar pacotes do cliente
  let packages: Array<{
    id: string;
    serviceId: string | null;
    packageName: string;
    totalSessions: number;
    usedSessions: number;
    priceCents: number | null;
    status: string;
    createdAt: string;
  }> = [];

  try {
    // Sincronizar automaticamente agendamentos de pacotes com múltiplas sessões que não tinham registro em client_packages
    for (const apt of appointments) {
      if (!apt.clientPackageId && apt.status !== 'cancelado') {
        const tiers = parsePricingTiers(apt._pricingTiersRaw);
        if (tiers && tiers.length > 0) {
          const matchedTier =
            tiers.find((t) => (t.sessionCount ?? 1) > 1 && apt.administrativeNotes?.includes(t.name)) ||
            (tiers.length === 1 && (tiers[0].sessionCount ?? 1) > 1 ? tiers[0] : undefined);
          if (matchedTier && matchedTier.sessionCount && matchedTier.sessionCount > 1) {
            const pkgId = randomUUID();
            const now = new Date().toISOString();
            await database.prepare(`
              INSERT INTO client_packages (
                id, clinic_id, client_id, service_id, package_name,
                total_sessions, used_sessions, price_cents, status, notes,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'ativo', 'Pacote vinculado ao agendamento', ?, ?)
            `).run(
              pkgId,
              IDS.clinic,
              clientId,
              apt.serviceId,
              matchedTier.name,
              matchedTier.sessionCount,
              matchedTier.priceCents,
              now,
              now
            );
            await database.prepare(`
              UPDATE appointments SET client_package_id = ?, session_number = 1 WHERE id = ?
            `).run(pkgId, apt.id);
            apt.clientPackageId = pkgId;
            apt.sessionNumber = 1;
          }
        }
      }
    }

    const pkgRows = (await database.prepare(`
      SELECT p.id, p.service_id, p.package_name, p.total_sessions, p.used_sessions, p.price_cents, p.status, p.created_at,
             s.package_booking_mode
      FROM client_packages p
      LEFT JOIN services s ON s.id = p.service_id
      WHERE p.client_id = ? AND p.package_name IS NOT NULL
      ORDER BY p.created_at DESC
    `).all(clientId)) as Record<string, unknown>[];

    packages = await Promise.all(pkgRows.map(async (r) => {
      const pkgId = String(r.id);
      const serviceId = r.service_id ? String(r.service_id) : null;
      const bookingMode = normalizeBookingMode(r.package_booking_mode as string | null | undefined);
      const totalSessions = Number(r.total_sessions ?? 1);

      const counts = (await database.prepare(`
        SELECT
          COUNT(CASE WHEN status = 'concluido' THEN 1 END) as completed_count,
          COUNT(CASE WHEN status IN ('solicitado', 'confirmado', 'em_atendimento') THEN 1 END) as scheduled_count
        FROM appointments
        WHERE client_package_id = ?
      `).get(pkgId)) as { completed_count?: number; scheduled_count?: number } | undefined;

      const completedSessions = Number(counts?.completed_count ?? 0);
      const scheduledSessions = Number(counts?.scheduled_count ?? 0);
      const remainingToSchedule = Math.max(0, totalSessions - (completedSessions + scheduledSessions));
      const remainingSessions = Math.max(0, totalSessions - completedSessions);
      const pending = await getPackagePendingSession(database, pkgId, serviceId);

      return {
        id: pkgId,
        serviceId,
        packageName: String(r.package_name),
        totalSessions,
        usedSessions: completedSessions + scheduledSessions,
        remainingSessions,
        completedSessions,
        scheduledSessions,
        remainingToSchedule,
        priceCents: r.price_cents != null ? Number(r.price_cents) : null,
        status: String(r.status ?? 'ativo'),
        createdAt: String(r.created_at),
        bookingMode,
        pendingSession: pending,
      };
    }));
  } catch {
    packages = [];
  }

  let goals: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    progressPct: number;
    targetDate: string | null;
    achievedAt: string | null;
    createdAt: string;
  }> = [];
  try {
    const goalRows = (await database.prepare(`
      SELECT id, title, description, status, progress_pct, target_date, achieved_at, created_at
      FROM treatment_goals WHERE client_id = ? ORDER BY created_at DESC
    `).all(clientId)) as Record<string, unknown>[];
    goals = goalRows.map((g) => ({
      id: String(g.id),
      title: String(g.title),
      description: g.description ? String(g.description) : null,
      status: String(g.status ?? 'em_andamento'),
      progressPct: Number(g.progress_pct ?? 0),
      targetDate: g.target_date ? String(g.target_date) : null,
      achievedAt: g.achieved_at ? String(g.achieved_at) : null,
      createdAt: String(g.created_at),
    }));
  } catch {
    goals = [];
  }

  return {
    goals,
    client: {
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      status: client.status,
      createdAt: client.created_at,
      cpf: recordRow?.cpf ? String(recordRow.cpf) : null,
      rg: recordRow?.rg ? String(recordRow.rg) : null,
      birthDate: recordRow?.birth_date ? String(recordRow.birth_date) : null,
      gender: recordRow?.gender ? String(recordRow.gender) : null,
      occupation: recordRow?.occupation ? String(recordRow.occupation) : null,
      emergencyContactName: recordRow?.emergency_contact_name ? String(recordRow.emergency_contact_name) : null,
      emergencyContactPhone: recordRow?.emergency_contact_phone ? String(recordRow.emergency_contact_phone) : null,
      emergencyContactRelationship: recordRow?.emergency_contact_relationship ? String(recordRow.emergency_contact_relationship) : null,
    },
    anamnese: {
      fullName: client.name,
      cpf: recordRow?.cpf ? String(recordRow.cpf) : null,
      rg: recordRow?.rg ? String(recordRow.rg) : null,
      birthDate: recordRow?.birth_date ? String(recordRow.birth_date) : null,
      emergencyContactName: recordRow?.emergency_contact_name ? String(recordRow.emergency_contact_name) : null,
      emergencyContactPhone: recordRow?.emergency_contact_phone ? String(recordRow.emergency_contact_phone) : null,
      emergencyContactRelationship: recordRow?.emergency_contact_relationship ? String(recordRow.emergency_contact_relationship) : null,
      consultationReason: recordRow?.consultation_reason ? String(recordRow.consultation_reason) : (recordRow?.chief_complaint ? String(recordRow.chief_complaint) : null),
      hasHealthConditions: Boolean(recordRow?.has_health_conditions),
      healthConditionsDetails: recordRow?.health_conditions_details ? String(recordRow.health_conditions_details) : null,
      hasPsychCare: Boolean(recordRow?.has_psych_care),
      psychCareDetails: recordRow?.psych_care_details ? String(recordRow.psych_care_details) : null,
      hasEpilepsyHistory: Boolean(recordRow?.epilepsy_history),
      consentAgreed: Boolean(recordRow?.consent_agreed),
      consentAgreedAt: recordRow?.consent_agreed_at ? String(recordRow.consent_agreed_at) : null,
      isCompleted: Boolean(recordRow?.consent_agreed && recordRow?.cpf),
    },
    appointments: appointments.map(({ _pricingTiersRaw, ...apt }) => {
      void _pricingTiersRaw;
      return apt as AppointmentSummary;
    }),
    documents,
    payments,
    packages,
  };
}

// ─── Group Sessions (Agendamento em Grupo) ──────────────────────────────────

let groupSessionTablesEnsured = false;

async function ensureGroupSessionTables(): Promise<void> {
  if (groupSessionTablesEnsured) return;
  const database = getDatabase();
  await database.exec(`
    CREATE TABLE IF NOT EXISTS group_sessions (
      id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      service_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_minutes INTEGER DEFAULT 60,
      max_participants INTEGER NOT NULL DEFAULT 10,
      show_remaining_spots INTEGER DEFAULT 1,
      custom_remaining_spots INTEGER,
      show_on_home INTEGER DEFAULT 1,
      price_cents INTEGER,
      price_visible INTEGER DEFAULT 1,
      modality TEXT DEFAULT 'presencial',
      location_notes TEXT,
      audio_url TEXT,
      audio_name TEXT,
      status TEXT DEFAULT 'ativo',
      published INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS group_session_enrollments (
      id TEXT PRIMARY KEY,
      group_session_id TEXT NOT NULL,
      client_id TEXT,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      client_email TEXT,
      status TEXT DEFAULT 'confirmado',
      payment_method TEXT,
      payment_id TEXT,
      notes TEXT,
      enrolled_at TEXT,
      created_at TEXT,
      FOREIGN KEY (group_session_id) REFERENCES group_sessions(id)
    );
  `);
  for (const col of [
    'ALTER TABLE group_sessions ADD COLUMN duration_minutes INTEGER DEFAULT 60',
    'ALTER TABLE group_sessions ADD COLUMN show_remaining_spots INTEGER DEFAULT 1',
    'ALTER TABLE group_sessions ADD COLUMN custom_remaining_spots INTEGER',
    'ALTER TABLE group_sessions ADD COLUMN show_on_home INTEGER DEFAULT 1',
    'ALTER TABLE group_sessions ADD COLUMN audio_url TEXT',
    'ALTER TABLE group_sessions ADD COLUMN audio_name TEXT',
    'ALTER TABLE group_session_enrollments ADD COLUMN payment_id TEXT',
    'ALTER TABLE group_session_enrollments ADD COLUMN client_cpf TEXT',
    'ALTER TABLE group_session_enrollments ADD COLUMN client_birth_date TEXT',
  ]) {
    try {
      await database.prepare(col).run();
    } catch {
      // column already exists
    }
  }
  groupSessionTablesEnsured = true;
}

function calcDurationFromStartEnd(startTime: string, endTime?: string | null): number {
  if (!startTime || !endTime) return 60;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 60;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : 60;
}

export async function listGroupSessions(filters?: {
  status?: string;
  published?: boolean;
  from?: string;
  to?: string;
}): Promise<import('./domain').GroupSession[]> {
  await ensureGroupSessionTables();
  const database = getDatabase();
  let query = `
    SELECT
      gs.*,
      COALESCE(
        (SELECT COUNT(*) FROM group_session_enrollments e
         WHERE e.group_session_id = gs.id AND e.status != 'cancelado'),
        0
      ) AS current_participants
    FROM group_sessions gs
    WHERE gs.clinic_id = ?
  `;
  const params: unknown[] = [IDS.clinic];
  if (filters?.status) {
    query += ` AND gs.status = ?`;
    params.push(filters.status);
  }
  if (filters?.published !== undefined) {
    query += ` AND gs.published = ?`;
    params.push(filters.published ? 1 : 0);
  }
  if (filters?.from) {
    query += ` AND gs.date >= ?`;
    params.push(filters.from);
  }
  if (filters?.to) {
    query += ` AND gs.date <= ?`;
    params.push(filters.to);
  }
  query += ` ORDER BY gs.date ASC, gs.start_time ASC`;
  const rows = (await database.prepare(query).all(...params)) as Record<string, unknown>[];
  return rows.map(rowToGroupSession);
}

export async function getGroupSession(id: string): Promise<import('./domain').GroupSessionWithEnrollments | null> {
  await ensureGroupSessionTables();
  const database = getDatabase();
  const row = (await database.prepare(`
    SELECT
      gs.*,
      COALESCE(
        (SELECT COUNT(*) FROM group_session_enrollments e
         WHERE e.group_session_id = gs.id AND e.status != 'cancelado'),
        0
      ) AS current_participants
    FROM group_sessions gs
    WHERE gs.id = ? AND gs.clinic_id = ?
  `).get(id, IDS.clinic)) as Record<string, unknown> | undefined;
  if (!row) return null;
  const session = rowToGroupSession(row);
  const enrollmentRows = (await database.prepare(`
    SELECT * FROM group_session_enrollments
    WHERE group_session_id = ?
    ORDER BY enrolled_at ASC
  `).all(id)) as Record<string, unknown>[];
  const enrollments = enrollmentRows.map(rowToEnrollment);
  return { ...session, enrollments };
}

export async function createGroupSession(input: {
  title: string;
  description?: string | null;
  serviceId?: string | null;
  date: string;
  startTime: string;
  endTime?: string | null;
  durationMinutes?: number;
  maxParticipants: number;
  showRemainingSpots?: boolean;
  customRemainingSpots?: number | null;
  showOnHome?: boolean;
  priceCents?: number | null;
  priceVisible?: boolean;
  modality?: 'presencial' | 'online';
  locationNotes?: string | null;
  audioUrl?: string | null;
  audioName?: string | null;
  published?: boolean;
}): Promise<import('./domain').GroupSession> {
  await ensureGroupSessionTables();
  const database = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  const durationMinutes =
    Number(input.durationMinutes) > 0
      ? Number(input.durationMinutes)
      : calcDurationFromStartEnd(input.startTime, input.endTime);
  await database.prepare(`
    INSERT INTO group_sessions
      (id, clinic_id, service_id, title, description, date, start_time, end_time,
       duration_minutes, max_participants, show_remaining_spots, custom_remaining_spots, show_on_home,
       price_cents, price_visible, modality, location_notes,
       audio_url, audio_name, status, published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativo', ?, ?, ?)
  `).run(
    id, IDS.clinic, input.serviceId ?? null,
    input.title, input.description ?? null,
    input.date, input.startTime, input.endTime ?? null,
    durationMinutes, Math.max(0, Number(input.maxParticipants ?? 0)),
    input.showRemainingSpots !== false ? 1 : 0,
    input.customRemainingSpots != null ? Number(input.customRemainingSpots) : null,
    input.showOnHome !== false ? 1 : 0,
    input.priceCents ?? null,
    input.priceVisible !== false ? 1 : 0,
    input.modality ?? 'presencial',
    input.locationNotes ?? null,
    input.audioUrl ?? null,
    input.audioName ?? null,
    input.published !== false ? 1 : 0,
    now, now
  );
  const created = await getGroupSession(id);
  const { enrollments: _enrollments, ...rest } = created!;
  void _enrollments;
  return rest;
}

export async function updateGroupSession(
  id: string,
  input: Partial<{
    title: string;
    description: string | null;
    serviceId: string | null;
    date: string;
    startTime: string;
    endTime: string | null;
    durationMinutes: number;
    maxParticipants: number;
    showRemainingSpots: boolean;
    customRemainingSpots: number | null;
    showOnHome: boolean;
    priceCents: number | null;
    priceVisible: boolean;
    modality: 'presencial' | 'online';
    locationNotes: string | null;
    audioUrl: string | null;
    audioName: string | null;
    status: import('./domain').GroupSessionStatus;
    published: boolean;
  }>
): Promise<void> {
  await ensureGroupSessionTables();
  const database = getDatabase();
  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];
  if (input.title !== undefined) { setClauses.push('title = ?'); params.push(input.title); }
  if (input.description !== undefined) { setClauses.push('description = ?'); params.push(input.description); }
  if (input.serviceId !== undefined) { setClauses.push('service_id = ?'); params.push(input.serviceId); }
  if (input.date !== undefined) { setClauses.push('date = ?'); params.push(input.date); }
  if (input.startTime !== undefined) { setClauses.push('start_time = ?'); params.push(input.startTime); }
  if (input.endTime !== undefined) { setClauses.push('end_time = ?'); params.push(input.endTime); }
  if (input.startTime !== undefined || input.endTime !== undefined) {
    setClauses.push('duration_minutes = ?');
    params.push(calcDurationFromStartEnd(input.startTime ?? '19:00', input.endTime));
  } else if (input.durationMinutes !== undefined) {
    setClauses.push('duration_minutes = ?');
    params.push(input.durationMinutes);
  }
  if (input.maxParticipants !== undefined) { setClauses.push('max_participants = ?'); params.push(Math.max(0, input.maxParticipants)); }
  if (input.showRemainingSpots !== undefined) { setClauses.push('show_remaining_spots = ?'); params.push(input.showRemainingSpots ? 1 : 0); }
  if (input.customRemainingSpots !== undefined) { setClauses.push('custom_remaining_spots = ?'); params.push(input.customRemainingSpots); }
  if (input.showOnHome !== undefined) { setClauses.push('show_on_home = ?'); params.push(input.showOnHome ? 1 : 0); }
  if (input.priceCents !== undefined) { setClauses.push('price_cents = ?'); params.push(input.priceCents); }
  if (input.priceVisible !== undefined) { setClauses.push('price_visible = ?'); params.push(input.priceVisible ? 1 : 0); }
  if (input.modality !== undefined) { setClauses.push('modality = ?'); params.push(input.modality); }
  if (input.locationNotes !== undefined) { setClauses.push('location_notes = ?'); params.push(input.locationNotes); }
  if (input.audioUrl !== undefined) { setClauses.push('audio_url = ?'); params.push(input.audioUrl); }
  if (input.audioName !== undefined) { setClauses.push('audio_name = ?'); params.push(input.audioName); }
  if (input.status !== undefined) { setClauses.push('status = ?'); params.push(input.status); }
  if (input.published !== undefined) { setClauses.push('published = ?'); params.push(input.published ? 1 : 0); }
  params.push(id, IDS.clinic);
  await database.prepare(`UPDATE group_sessions SET ${setClauses.join(', ')} WHERE id = ? AND clinic_id = ?`).run(...params);
}

export async function deleteGroupSession(id: string): Promise<{ ok: boolean; error?: string }> {
  await ensureGroupSessionTables();
  const database = getDatabase();
  const count = (await database.prepare(
    `SELECT COUNT(*) AS cnt FROM group_session_enrollments WHERE group_session_id = ? AND status != 'cancelado'`
  ).get(id)) as { cnt: number } | undefined;
  if ((count?.cnt ?? 0) > 0) {
    return { ok: false, error: 'Sessão possui participantes confirmados. Cancele os participantes ou encerre a sessão em vez de excluir.' };
  }
  await database.prepare(`DELETE FROM group_session_enrollments WHERE group_session_id = ?`).run(id);
  await database.prepare(`DELETE FROM group_sessions WHERE id = ? AND clinic_id = ?`).run(id, IDS.clinic);
  return { ok: true };
}

export async function enrollInGroupSession(
  groupSessionId: string,
  clientData: {
    name: string;
    phone: string;
    cpf?: string | null;
    birthDate?: string | null;
    email?: string | null;
    paymentMethod?: string | null;
    notes?: string | null;
  }
): Promise<{
  ok: boolean;
  enrollmentId?: string;
  clientId?: string | null;
  paymentId?: string | null;
  priceCents?: number;
  sessionTitle?: string;
  date?: string;
  startTime?: string;
  error?: string;
}> {
  await ensureGroupSessionTables();
  const database = getDatabase();
  const session = (await database.prepare(`
    SELECT gs.*, COALESCE(
      (SELECT COUNT(*) FROM group_session_enrollments e
       WHERE e.group_session_id = gs.id AND e.status != 'cancelado'), 0
    ) AS current_participants
    FROM group_sessions gs
    WHERE gs.id = ? AND gs.clinic_id = ? AND gs.published = 1 AND gs.status = 'ativo'
  `).get(groupSessionId, IDS.clinic)) as Record<string, unknown> | undefined;
  if (!session) return { ok: false, error: 'Sessão em grupo não encontrada ou não está disponível para inscrições.' };
  const current = Number(session.current_participants ?? 0);
  const max = Number(session.max_participants ?? 0);
  if (max > 0 && current >= max) {
    return { ok: false, error: 'Todas as vagas desta sessão em grupo já foram preenchidas.' };
  }
  if (session.custom_remaining_spots != null && Number(session.custom_remaining_spots) <= 0) {
    return { ok: false, error: 'Todas as vagas desta sessão em grupo já foram preenchidas.' };
  }

  // Prevent duplicate active enrollment with same phone in the same group session
  const cleanPhone = clientData.phone.replace(/\D/g, '');
  const cleanCpf = clientData.cpf ? clientData.cpf.replace(/\D/g, '') : null;
  const cleanBirthDate = clientData.birthDate ? clientData.birthDate.trim() : null;
  const existingEnrollments = (await database.prepare(
    `SELECT client_phone FROM group_session_enrollments WHERE group_session_id = ? AND status != 'cancelado'`
  ).all(groupSessionId)) as Array<{ client_phone: string }>;
  if (existingEnrollments.some((e) => e.client_phone.replace(/\D/g, '') === cleanPhone && cleanPhone.length >= 10)) {
    return { ok: false, error: 'Você já possui uma vaga reservada nesta sessão em grupo com este WhatsApp.' };
  }

  let clientId: string | null = null;
  try {
    const allClients = (await database.prepare(
      `SELECT id, phone FROM clients WHERE clinic_id = ?`
    ).all(IDS.clinic)) as Array<{ id: string; phone: string }>;
    const matched = allClients.find((c) => c.phone.replace(/\D/g, '') === cleanPhone);
    if (matched) {
      clientId = matched.id;
    } else {
      clientId = randomUUID();
      const now = new Date().toISOString();
      await database.prepare(`
        INSERT INTO clients (id, clinic_id, name, phone, email, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'ativo', ?, ?)
      `).run(clientId, IDS.clinic, clientData.name.trim(), clientData.phone.trim(), clientData.email?.trim() || null, now, now);
    }

    if (clientId && (cleanCpf || cleanBirthDate)) {
      const nowRec = new Date().toISOString();
      const existingRec = await database.prepare('SELECT client_id FROM client_records WHERE client_id = ?').get(clientId);
      if (existingRec) {
        await database.prepare(`
          UPDATE client_records
          SET cpf = COALESCE(?, cpf),
              birth_date = COALESCE(?, birth_date),
              updated_at = ?
          WHERE client_id = ?
        `).run(cleanCpf || null, cleanBirthDate || null, nowRec, clientId);
      } else {
        await database.prepare(`
          INSERT INTO client_records (client_id, cpf, birth_date, updated_at)
          VALUES (?, ?, ?, ?)
        `).run(clientId, cleanCpf || null, cleanBirthDate || null, nowRec);
      }
    }
  } catch {
    clientId = null;
  }

  const enrollmentId = randomUUID();
  const now = new Date().toISOString();
  let paymentId: string | null = null;

  // Create financial pending payment if session has price
  const priceCents = session.price_cents != null ? Number(session.price_cents) : 0;
  if (priceCents > 0 && clientId) {
    try {
      paymentId = randomUUID();
      const method =
        clientData.paymentMethod === 'cartao'
          ? 'cartao_credito'
          : clientData.paymentMethod === 'dinheiro'
          ? 'dinheiro'
          : 'pix';
      const dueIso = zonedDateTimeToUtc(String(session.date), String(session.start_time || '09:00')).toISOString();
      await database.prepare(`
        INSERT INTO client_payments (
          id, clinic_id, client_id, appointment_id, service_id, client_package_id,
          entry_type, category, charge_type, description,
          amount_cents, paid_amount_cents, remaining_amount_cents, discount_cents,
          payment_method, status, due_at, notes, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, NULL, 'entrada', 'sessao_grupo', 'sessao', ?, ?, 0, ?, 0, ?, 'pendente', ?, ?, ?, ?)
      `).run(
        paymentId,
        IDS.clinic,
        clientId,
        session.service_id ? String(session.service_id) : null,
        `Sessão em Grupo: ${String(session.title)} (${String(session.date).split('-').reverse().join('/')} às ${String(session.start_time)})`,
        priceCents,
        priceCents,
        method,
        dueIso,
        'Inscrição realizada em Sessão em Grupo',
        now,
        now,
      );
    } catch {
      paymentId = null;
    }
  }

  await database.prepare(`
    INSERT INTO group_session_enrollments
      (id, group_session_id, client_id, client_name, client_phone, client_cpf, client_birth_date, client_email,
       status, payment_method, payment_id, notes, enrolled_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', ?, ?, ?, ?, ?)
  `).run(
    enrollmentId, groupSessionId, clientId,
    clientData.name.trim(), clientData.phone.trim(), cleanCpf || null, cleanBirthDate || null, clientData.email?.trim() || null,
    clientData.paymentMethod ?? null, paymentId, clientData.notes?.trim() || null,
    now, now
  );

  if (session.custom_remaining_spots != null && Number(session.custom_remaining_spots) > 0) {
    await database.prepare(
      `UPDATE group_sessions SET custom_remaining_spots = ?, updated_at = ? WHERE id = ?`
    ).run(Math.max(0, Number(session.custom_remaining_spots) - 1), now, groupSessionId);
  }

  return {
    ok: true,
    enrollmentId,
    clientId,
    paymentId,
    priceCents,
    sessionTitle: String(session.title),
    date: String(session.date),
    startTime: String(session.start_time),
  };
}

export async function cancelGroupEnrollment(enrollmentId: string): Promise<void> {
  await ensureGroupSessionTables();
  const database = getDatabase();
  const row = (await database.prepare(
    `SELECT payment_id FROM group_session_enrollments WHERE id = ?`
  ).get(enrollmentId)) as { payment_id?: string | null } | undefined;
  await database.prepare(
    `UPDATE group_session_enrollments SET status = 'cancelado' WHERE id = ?`
  ).run(enrollmentId);
  if (row?.payment_id) {
    try {
      await database.prepare(
        `UPDATE client_payments SET status = 'cancelado', updated_at = ? WHERE id = ? AND status = 'pendente'`
      ).run(new Date().toISOString(), row.payment_id);
    } catch {
      // ignore if payment already settled
    }
  }
}

export async function listGroupSessionEnrollments(
  groupSessionId: string
): Promise<import('./domain').GroupSessionEnrollment[]> {
  await ensureGroupSessionTables();
  const database = getDatabase();
  const rows = (await database.prepare(`
    SELECT * FROM group_session_enrollments WHERE group_session_id = ? ORDER BY enrolled_at ASC
  `).all(groupSessionId)) as Record<string, unknown>[];
  return rows.map(rowToEnrollment);
}

function rowToGroupSession(row: Record<string, unknown>): import('./domain').GroupSession {
  return {
    id: String(row.id),
    clinicId: String(row.clinic_id),
    serviceId: row.service_id ? String(row.service_id) : null,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    date: String(row.date),
    startTime: String(row.start_time),
    endTime: row.end_time ? String(row.end_time) : null,
    durationMinutes: Number(row.duration_minutes ?? 60),
    maxParticipants: row.max_participants != null ? Number(row.max_participants) : 10,
    currentParticipants: Number(row.current_participants ?? 0),
    showRemainingSpots: row.show_remaining_spots !== undefined ? Boolean(row.show_remaining_spots) : true,
    customRemainingSpots: row.custom_remaining_spots != null ? Number(row.custom_remaining_spots) : null,
    showOnHome: row.show_on_home !== undefined ? Boolean(row.show_on_home) : true,
    priceCents: row.price_cents != null ? Number(row.price_cents) : null,
    priceVisible: Boolean(row.price_visible ?? true),
    modality: (String(row.modality ?? 'presencial')) as 'presencial' | 'online',
    locationNotes: row.location_notes ? String(row.location_notes) : null,
    audioUrl: row.audio_url ? String(row.audio_url) : null,
    audioName: row.audio_name ? String(row.audio_name) : null,
    status: (String(row.status ?? 'ativo')) as import('./domain').GroupSessionStatus,
    published: Boolean(row.published ?? true),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function rowToEnrollment(row: Record<string, unknown>): import('./domain').GroupSessionEnrollment {
  return {
    id: String(row.id),
    groupSessionId: String(row.group_session_id),
    clientId: row.client_id ? String(row.client_id) : null,
    clientName: String(row.client_name),
    clientPhone: String(row.client_phone),
    clientCpf: row.client_cpf ? String(row.client_cpf) : null,
    clientBirthDate: row.client_birth_date ? String(row.client_birth_date) : null,
    clientEmail: row.client_email ? String(row.client_email) : null,
    status: (String(row.status ?? 'confirmado')) as import('./domain').GroupSessionEnrollmentStatus,
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    paymentId: row.payment_id ? String(row.payment_id) : null,
    notes: row.notes ? String(row.notes) : null,
    enrolledAt: String(row.enrolled_at ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}



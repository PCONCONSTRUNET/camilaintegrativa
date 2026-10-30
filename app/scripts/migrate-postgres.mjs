import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Lucasduda28123@db.phhsdjeduxahoeridpec.supabase.co:5432/postgres';

const schemaSql = `
-- Habilitar extensões úteis
CREATE EXTENSION IF NOT EXISTS citext;

-- Collation NOCASE compatível com SQLite
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'nocase') THEN
    CREATE COLLATION nocase (provider = icu, locale = 'und-u-ks-level2', deterministic = false);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Função de compatibilidade julianday (SQLite -> PostgreSQL)
CREATE OR REPLACE FUNCTION julianday(val text) RETURNS double precision AS $$
BEGIN
  RETURN EXTRACT(EPOCH FROM val::timestamptz) / 86400.0 + 2440587.5;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função de compatibilidade strftime (SQLite -> PostgreSQL)
CREATE OR REPLACE FUNCTION strftime(format text, timestr text) RETURNS text AS $$
BEGIN
  IF timestr = 'now' THEN
    RETURN TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  ELSE
    RETURN TO_CHAR(timestr::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Tabela de migrações
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Clínicas
CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Configurações da clínica
CREATE TABLE IF NOT EXISTS clinic_settings (
  clinic_id TEXT PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  booking_confirmation_mode TEXT NOT NULL DEFAULT 'manual' CHECK (booking_confirmation_mode IN ('manual', 'automatico')),
  minimum_notice_minutes INTEGER NOT NULL DEFAULT 720 CHECK (minimum_notice_minutes >= 0),
  cancellation_policy TEXT,
  public_phone TEXT,
  public_email TEXT,
  address TEXT,
  whatsapp_configured INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_configured IN (0, 1)),
  payment_gateway_configured INTEGER NOT NULL DEFAULT 0 CHECK (payment_gateway_configured IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Usuários
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email CITEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Membresias
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('proprietaria', 'administracao', 'recepcao', 'profissional')),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  UNIQUE (clinic_id, user_id)
);

-- Profissionais
CREATE TABLE IF NOT EXISTS professionals (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Serviços
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK (interval_minutes BETWEEN 0 AND 180),
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  price_visible INTEGER NOT NULL DEFAULT 0 CHECK (price_visible IN (0, 1)),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Modalidades do serviço
CREATE TABLE IF NOT EXISTS service_modalities (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  modality TEXT NOT NULL CHECK (modality IN ('presencial', 'online')),
  PRIMARY KEY (service_id, modality)
);

-- Horários de trabalho
CREATE TABLE IF NOT EXISTS working_hours (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  public_booking INTEGER NOT NULL DEFAULT 1 CHECK (public_booking IN (0, 1)),
  CHECK (start_time < end_time)
);
CREATE INDEX IF NOT EXISTS working_hours_lookup_idx
  ON working_hours (professional_id, weekday, public_booking, start_time, end_time);

-- Exceções de disponibilidade
CREATE TABLE IF NOT EXISTS availability_exceptions (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0, 1)),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS availability_exceptions_lookup_idx
  ON availability_exceptions (professional_id, date, available, start_time, end_time);

-- Feriados
CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (clinic_id, date)
);

-- Clientes
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'pendente')),
  administrative_notes TEXT,
  password_hash TEXT,
  last_login_at TEXT,
  demo_data INTEGER NOT NULL DEFAULT 0 CHECK (demo_data IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  UNIQUE (clinic_id, phone)
);

-- Preferências do cliente
CREATE TABLE IF NOT EXISTS client_preferences (
  client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_opt_in IN (0, 1)),
  email_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (email_opt_in IN (0, 1)),
  preferred_modality TEXT CHECK (preferred_modality IN ('presencial', 'online')),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Agendamentos
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id TEXT NOT NULL REFERENCES professionals(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  modality TEXT NOT NULL CHECK (modality IN ('presencial', 'online')),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'nao_compareceu')),
  source TEXT NOT NULL CHECK (source IN ('publico', 'interno')),
  administrative_notes TEXT,
  booking_kind TEXT NOT NULL DEFAULT 'regular' CHECK (booking_kind IN ('regular', 'encaixe')),
  fit_in_reason TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  CHECK (start_at < end_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_unique_active_start
  ON appointments (professional_id, start_at)
  WHERE status NOT IN ('cancelado', 'nao_compareceu');
CREATE INDEX IF NOT EXISTS appointments_schedule_idx ON appointments (professional_id, start_at, end_at, status);
CREATE INDEX IF NOT EXISTS appointments_client_idx ON appointments (client_id, start_at DESC);

-- Eventos de agendamento
CREATE TABLE IF NOT EXISTS appointment_events (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Bloqueios de agenda
CREATE TABLE IF NOT EXISTS time_blocks (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reason TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  CHECK (start_at < end_at)
);
CREATE INDEX IF NOT EXISTS time_blocks_schedule_idx ON time_blocks (professional_id, start_at, end_at);

-- Ficha Clínica / Prontuário do Cliente
CREATE TABLE IF NOT EXISTS client_records (
  client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  birth_date TEXT,
  cpf TEXT,
  gender TEXT,
  occupation TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  emergency_contacts TEXT,
  chief_complaint TEXT,
  health_history TEXT,
  medications TEXT,
  personal_background TEXT,
  epilepsy_history INTEGER DEFAULT 0,
  psychiatric_history TEXT,
  previous_hypnosis TEXT,
  suggestibility_notes TEXT,
  emotional_triggers TEXT,
  safe_place TEXT,
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Objetivos do tratamento
CREATE TABLE IF NOT EXISTS treatment_goals (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'alcancado', 'ajustado', 'pausado')),
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  target_date TEXT,
  achieved_at TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS treatment_goals_client_idx ON treatment_goals(client_id, created_at DESC);

-- Evoluções clínicas
CREATE TABLE IF NOT EXISTS clinical_evolutions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  professional_id TEXT NOT NULL REFERENCES professionals(id),
  session_date TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  evolution_text TEXT NOT NULL,
  interventions TEXT,
  homework_tasks TEXT,
  is_confidential INTEGER NOT NULL DEFAULT 1 CHECK (is_confidential IN (0, 1)),
  induction_method TEXT,
  trance_depth TEXT,
  hypnotic_phenomena TEXT,
  post_hypnotic_suggestions TEXT,
  deinduction_notes TEXT,
  self_hypnosis_prescribed TEXT,
  finalized_at TEXT,
  finalized_by TEXT,
  finalized_by_name TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS clinical_evolutions_client_idx ON clinical_evolutions(client_id, session_date DESC);

-- Técnicas clínicas
CREATE TABLE IF NOT EXISTS clinical_techniques (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  evolution_id TEXT REFERENCES clinical_evolutions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  notes TEXT,
  outcome TEXT NOT NULL DEFAULT 'positiva' CHECK (outcome IN ('muito_positiva', 'positiva', 'neutra', 'necessita_ajuste')),
  applied_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS clinical_techniques_client_idx ON clinical_techniques(client_id, applied_at DESC);

-- Documentos do cliente
CREATE TABLE IF NOT EXISTS client_documents (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('termo_consentimento', 'contrato_terapeutico', 'atestado', 'declaracao', 'relatorio_psicologico', 'outro')),
  document_type_label TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('pendente_assinatura', 'assinado', 'ativo', 'arquivado')),
  file_name TEXT,
  file_data TEXT,
  content TEXT,
  signed_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS client_documents_client_idx ON client_documents(client_id, created_at DESC);

-- Encaminhamentos
CREATE TABLE IF NOT EXISTS client_referrals (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  professional_name TEXT,
  reason TEXT NOT NULL,
  referred_at TEXT NOT NULL,
  expected_return_at TEXT,
  status TEXT NOT NULL DEFAULT 'aguardando_retorno' CHECK (status IN ('aguardando_retorno', 'retornou', 'concluido', 'cancelado')),
  return_notes TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS client_referrals_client_idx ON client_referrals(client_id, referred_at DESC);

-- Log de acesso ao prontuário
CREATE TABLE IF NOT EXISTS prontuario_access_logs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  actor_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS prontuario_access_logs_client_idx ON prontuario_access_logs(client_id, created_at DESC);

-- Pagamentos do cliente
CREATE TABLE IF NOT EXISTS client_payments (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  appointment_id TEXT REFERENCES appointments(id),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  payment_method TEXT NOT NULL DEFAULT 'pix',
  status TEXT NOT NULL DEFAULT 'pago',
  paid_at TEXT,
  due_at TEXT,
  receipt_url TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS idx_client_payments_client ON client_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_paid_at ON client_payments(paid_at);

-- Tabelas auxiliares
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  status TEXT NOT NULL DEFAULT 'ativa',
  preferences TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS form_templates (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS form_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES form_templates(id),
  version INTEGER NOT NULL,
  published_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  UNIQUE(template_id, version)
);

CREATE TABLE IF NOT EXISTS form_fields (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES form_versions(id),
  field_type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  options_json TEXT,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS form_responses (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  version_id TEXT NOT NULL REFERENCES form_versions(id),
  answers_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  form_response_id TEXT REFERENCES form_responses(id),
  consent_type TEXT NOT NULL,
  granted INTEGER NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_records (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id),
  professional_id TEXT NOT NULL REFERENCES professionals(id),
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS session_record_versions (
  id TEXT PRIMARY KEY,
  session_record_id TEXT NOT NULL REFERENCES session_records(id),
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  authored_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  UNIQUE(session_record_id, version)
);

CREATE TABLE IF NOT EXISTS private_documents (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'restrito',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS charges (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  appointment_id TEXT REFERENCES appointments(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'nao_pago',
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  charge_id TEXT NOT NULL REFERENCES charges(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  method TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  external_reference TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  refunded_at TEXT NOT NULL,
  reason TEXT,
  created_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  occurred_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS package_offerings (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  name TEXT NOT NULL,
  sessions INTEGER NOT NULL CHECK(sessions > 0),
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  validity_days INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS client_packages (
  id TEXT PRIMARY KEY,
  offering_id TEXT NOT NULL REFERENCES package_offerings(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  purchased_sessions INTEGER NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS package_usages (
  id TEXT PRIMARY KEY,
  client_package_id TEXT NOT NULL REFERENCES client_packages(id),
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  reversed_at TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  UNIQUE(client_package_id, appointment_id)
);

CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  event_type TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS notification_rules (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  event_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  offset_minutes INTEGER,
  template_id TEXT REFERENCES message_templates(id),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS notification_jobs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  appointment_id TEXT REFERENCES appointments(id),
  rule_id TEXT REFERENCES notification_rules(id),
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando_configuracao',
  deduplication_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS notification_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES notification_jobs(id),
  attempted_at TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_code TEXT,
  error_summary TEXT
);

CREATE TABLE IF NOT EXISTS integration_settings (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nao_configurada',
  configuration_json TEXT,
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  UNIQUE(clinic_id, provider)
);

CREATE TABLE IF NOT EXISTS public_site_content (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  content_key TEXT NOT NULL,
  content_json TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  UNIQUE(clinic_id, content_key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);
CREATE INDEX IF NOT EXISTS audit_logs_lookup_idx ON audit_logs (clinic_id, resource_type, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  client_id TEXT REFERENCES clients(id),
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recebida',
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  reviewed_by TEXT REFERENCES users(id)
);

-- Migração 009 & 010: Pacotes de Sessões, Múltiplos Valores e Créditos
ALTER TABLE services ADD COLUMN IF NOT EXISTS pricing_tiers TEXT;

ALTER TABLE client_packages ALTER COLUMN offering_id DROP NOT NULL;
ALTER TABLE client_packages ALTER COLUMN purchased_sessions DROP NOT NULL;
ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS clinic_id TEXT REFERENCES clinics(id);
ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS service_id TEXT REFERENCES services(id);
ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS package_name TEXT;
ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS total_sessions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS used_sessions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS price_cents INTEGER;
ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE client_packages ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_package_id TEXT REFERENCES client_packages(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS session_number INTEGER;

-- Migração 011: Ficha de Anamnese Digital Simplificada
ALTER TABLE client_records ADD COLUMN IF NOT EXISTS rg TEXT;
ALTER TABLE client_records ADD COLUMN IF NOT EXISTS consultation_reason TEXT;
ALTER TABLE client_records ADD COLUMN IF NOT EXISTS has_health_conditions INTEGER DEFAULT 0;
ALTER TABLE client_records ADD COLUMN IF NOT EXISTS health_conditions_details TEXT;
ALTER TABLE client_records ADD COLUMN IF NOT EXISTS has_psych_care INTEGER DEFAULT 0;
ALTER TABLE client_records ADD COLUMN IF NOT EXISTS psych_care_details TEXT;
ALTER TABLE client_records ADD COLUMN IF NOT EXISTS consent_agreed INTEGER DEFAULT 0;
ALTER TABLE client_records ADD COLUMN IF NOT EXISTS consent_agreed_at TEXT;

-- Migração 012: Regra de agendamento de sessões de pacotes ('sequencial' padrão | 'livre')
ALTER TABLE services ADD COLUMN IF NOT EXISTS package_booking_mode TEXT NOT NULL DEFAULT 'sequencial';

-- Migração 013: Módulo Financeiro Completo com Parcelamento e Pagamentos Parciais
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS paid_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS remaining_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS service_id TEXT REFERENCES services(id);
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS client_package_id TEXT REFERENCES client_packages(id);
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS parent_payment_id TEXT REFERENCES client_payments(id);
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS installment_number INTEGER;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS total_installments INTEGER;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS charge_type TEXT DEFAULT 'avulso';

UPDATE client_payments SET paid_amount_cents = amount_cents, remaining_amount_cents = 0 WHERE status = 'pago' AND (paid_amount_cents = 0 OR paid_amount_cents IS NULL);
UPDATE client_payments SET paid_amount_cents = 0, remaining_amount_cents = amount_cents WHERE status = 'pendente' AND (remaining_amount_cents = 0 OR remaining_amount_cents IS NULL);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  payment_id TEXT NOT NULL REFERENCES client_payments(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id),
  amount_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  paid_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_payment ON payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_client ON payment_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_paid_at ON payment_transactions(paid_at);

-- Migração 014: Entradas e Saídas Manuais com Categorias e Fluxo de Caixa
ALTER TABLE client_payments ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'entrada';
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'outros';
CREATE INDEX IF NOT EXISTS idx_client_payments_entry_type ON client_payments(entry_type);
CREATE INDEX IF NOT EXISTS idx_client_payments_category ON client_payments(category);

-- Marcar migrações como aplicadas
INSERT INTO schema_migrations (version) VALUES
  ('001_initial'),
  ('002_smart_agenda'),
  ('003_prontuario'),
  ('004_multiple_emergency_contacts'),
  ('005_document_files'),
  ('006_hypnotherapy_niche'),
  ('007_evolution_finalization'),
  ('008_client_payments'),
  ('009_service_pricing_tiers'),
  ('010_client_packages'),
  ('011_simplified_anamnese'),
  ('012_package_booking_mode'),
  ('013_financial_system'),
  ('014_financial_incomes_and_expenses')
ON CONFLICT (version) DO NOTHING;
`;

export async function runPostgresMigrations(targetConnectionString = connectionString) {
  const client = new Client({
    connectionString: targetConnectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Aplicando migrations no PostgreSQL (Supabase)...');
  await client.query(schemaSql);
  console.log('Migrations PostgreSQL aplicadas com sucesso!');
  await client.end();
}

if (process.argv[1]?.endsWith('migrate-postgres.mjs')) {
  runPostgresMigrations().catch((err) => {
    console.error('Falha ao migrar PostgreSQL:', err);
    process.exit(1);
  });
}

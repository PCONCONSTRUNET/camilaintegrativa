PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

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
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('proprietaria', 'administracao', 'recepcao', 'profissional')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (clinic_id, user_id)
);

CREATE TABLE IF NOT EXISTS professionals (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS service_modalities (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  modality TEXT NOT NULL CHECK (modality IN ('presencial', 'online')),
  PRIMARY KEY (service_id, modality)
);

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

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0, 1)),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (clinic_id, date)
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'pendente')),
  administrative_notes TEXT,
  demo_data INTEGER NOT NULL DEFAULT 0 CHECK (demo_data IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (clinic_id, phone)
);

CREATE TABLE IF NOT EXISTS client_preferences (
  client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_opt_in IN (0, 1)),
  email_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (email_opt_in IN (0, 1)),
  preferred_modality TEXT CHECK (preferred_modality IN ('presencial', 'online')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

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
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start_at < end_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_unique_active_start
  ON appointments (professional_id, start_at)
  WHERE status NOT IN ('cancelado', 'nao_compareceu');
CREATE INDEX IF NOT EXISTS appointments_schedule_idx ON appointments (professional_id, start_at, end_at, status);
CREATE INDEX IF NOT EXISTS appointments_client_idx ON appointments (client_id, start_at DESC);

CREATE TABLE IF NOT EXISTS appointment_events (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS time_blocks (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reason TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS time_blocks_schedule_idx ON time_blocks (professional_id, start_at, end_at);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  status TEXT NOT NULL DEFAULT 'ativa',
  preferences TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS form_templates (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS form_versions (
  id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES form_templates(id), version INTEGER NOT NULL,
  published_at TEXT, created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), UNIQUE(template_id, version)
);
CREATE TABLE IF NOT EXISTS form_fields (
  id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES form_versions(id), field_type TEXT NOT NULL,
  label TEXT NOT NULL, description TEXT, required INTEGER NOT NULL DEFAULT 0, options_json TEXT, position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS form_responses (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), client_id TEXT NOT NULL REFERENCES clients(id),
  version_id TEXT NOT NULL REFERENCES form_versions(id), answers_json TEXT NOT NULL, submitted_at TEXT NOT NULL, created_by TEXT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), client_id TEXT NOT NULL REFERENCES clients(id),
  form_response_id TEXT REFERENCES form_responses(id), consent_type TEXT NOT NULL, granted INTEGER NOT NULL, recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_records (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id),
  professional_id TEXT NOT NULL REFERENCES professionals(id), status TEXT NOT NULL DEFAULT 'rascunho', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS session_record_versions (
  id TEXT PRIMARY KEY, session_record_id TEXT NOT NULL REFERENCES session_records(id), version INTEGER NOT NULL,
  content_json TEXT NOT NULL, authored_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), UNIQUE(session_record_id, version)
);
CREATE TABLE IF NOT EXISTS private_documents (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), client_id TEXT NOT NULL REFERENCES clients(id),
  storage_key TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, visibility TEXT NOT NULL DEFAULT 'restrito', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS charges (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), client_id TEXT NOT NULL REFERENCES clients(id),
  appointment_id TEXT REFERENCES appointments(id), amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0), due_at TEXT,
  status TEXT NOT NULL DEFAULT 'nao_pago', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, charge_id TEXT NOT NULL REFERENCES charges(id), amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  method TEXT NOT NULL, paid_at TEXT NOT NULL, external_reference TEXT, created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id), amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  refunded_at TEXT NOT NULL, reason TEXT, created_by TEXT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), description TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  occurred_at TEXT NOT NULL, created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS package_offerings (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), name TEXT NOT NULL, sessions INTEGER NOT NULL CHECK(sessions > 0),
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0), validity_days INTEGER, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS client_packages (
  id TEXT PRIMARY KEY, offering_id TEXT NOT NULL REFERENCES package_offerings(id), client_id TEXT NOT NULL REFERENCES clients(id),
  purchased_sessions INTEGER NOT NULL, expires_at TEXT, status TEXT NOT NULL DEFAULT 'ativo', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS package_usages (
  id TEXT PRIMARY KEY, client_package_id TEXT NOT NULL REFERENCES client_packages(id), appointment_id TEXT NOT NULL REFERENCES appointments(id),
  quantity INTEGER NOT NULL DEFAULT 1, reversed_at TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), UNIQUE(client_package_id, appointment_id)
);

CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), event_type TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS notification_rules (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), event_type TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
  offset_minutes INTEGER, template_id TEXT REFERENCES message_templates(id), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS notification_jobs (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), appointment_id TEXT REFERENCES appointments(id),
  rule_id TEXT REFERENCES notification_rules(id), scheduled_for TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aguardando_configuracao', deduplication_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS notification_attempts (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES notification_jobs(id), attempted_at TEXT NOT NULL, status TEXT NOT NULL,
  provider_code TEXT, error_summary TEXT
);
CREATE TABLE IF NOT EXISTS integration_settings (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), provider TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'nao_configurada',
  configuration_json TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), UNIQUE(clinic_id, provider)
);

CREATE TABLE IF NOT EXISTS public_site_content (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), content_key TEXT NOT NULL, content_json TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0, updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), UNIQUE(clinic_id, content_key)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), actor_user_id TEXT REFERENCES users(id), action TEXT NOT NULL,
  resource_type TEXT NOT NULL, resource_id TEXT, metadata_json TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS audit_logs_lookup_idx ON audit_logs (clinic_id, resource_type, resource_id, created_at DESC);
CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL REFERENCES clinics(id), client_id TEXT REFERENCES clients(id), request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recebida', requested_at TEXT NOT NULL, completed_at TEXT, reviewed_by TEXT REFERENCES users(id)
);

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('001_initial');

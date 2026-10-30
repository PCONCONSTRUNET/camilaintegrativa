-- Migration 010: Pacotes de Sessões e Controle de Créditos
CREATE TABLE IF NOT EXISTS client_packages (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  service_id TEXT REFERENCES services(id),
  package_name TEXT NOT NULL,
  total_sessions INTEGER NOT NULL DEFAULT 1,
  used_sessions INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'ativo',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_client_packages_client ON client_packages(client_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_status ON client_packages(status);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_package_id TEXT REFERENCES client_packages(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS session_number INTEGER;

INSERT INTO schema_migrations (version) VALUES ('010_client_packages') ON CONFLICT DO NOTHING;

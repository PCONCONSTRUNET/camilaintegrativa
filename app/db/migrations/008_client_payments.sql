-- Migration 008: Registro de Pagamentos e Histórico Financeiro do Cliente
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_client_payments_client ON client_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_paid_at ON client_payments(paid_at);

INSERT INTO schema_migrations (version) VALUES ('008_client_payments');

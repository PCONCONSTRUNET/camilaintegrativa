-- Migration 014: Entradas e Saídas Manuais com Categorias e Fluxo de Caixa

CREATE TABLE IF NOT EXISTS client_payments_v2 (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  client_id TEXT REFERENCES clients(id),
  appointment_id TEXT REFERENCES appointments(id),
  service_id TEXT REFERENCES services(id),
  client_package_id TEXT REFERENCES client_packages(id),
  parent_payment_id TEXT REFERENCES client_payments_v2(id),
  installment_number INTEGER,
  total_installments INTEGER,
  entry_type TEXT NOT NULL DEFAULT 'entrada', -- 'entrada' | 'saida'
  category TEXT NOT NULL DEFAULT 'outros',
  charge_type TEXT DEFAULT 'avulso',
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  paid_amount_cents INTEGER NOT NULL DEFAULT 0,
  remaining_amount_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
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

DROP TABLE IF EXISTS client_payments;
ALTER TABLE client_payments_v2 RENAME TO client_payments;

CREATE INDEX IF NOT EXISTS idx_client_payments_client ON client_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_entry_type ON client_payments(entry_type);
CREATE INDEX IF NOT EXISTS idx_client_payments_category ON client_payments(category);
CREATE INDEX IF NOT EXISTS idx_client_payments_paid_at ON client_payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_client_payments_due_at ON client_payments(due_at);

INSERT INTO schema_migrations (version) VALUES ('014_financial_incomes_and_expenses');


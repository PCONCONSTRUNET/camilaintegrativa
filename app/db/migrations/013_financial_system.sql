-- Migration 013: Módulo Financeiro Completo com Parcelamento e Pagamentos Parciais

ALTER TABLE client_payments ADD COLUMN paid_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_payments ADD COLUMN remaining_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_payments ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_payments ADD COLUMN service_id TEXT REFERENCES services(id);
ALTER TABLE client_payments ADD COLUMN client_package_id TEXT REFERENCES client_packages(id);
ALTER TABLE client_payments ADD COLUMN parent_payment_id TEXT REFERENCES client_payments(id);
ALTER TABLE client_payments ADD COLUMN installment_number INTEGER;
ALTER TABLE client_payments ADD COLUMN total_installments INTEGER;
ALTER TABLE client_payments ADD COLUMN charge_type TEXT DEFAULT 'avulso';

UPDATE client_payments SET paid_amount_cents = amount_cents, remaining_amount_cents = 0 WHERE status = 'pago';
UPDATE client_payments SET paid_amount_cents = 0, remaining_amount_cents = amount_cents WHERE status = 'pendente';

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  payment_id TEXT NOT NULL REFERENCES client_payments(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id),
  amount_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_payment ON payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_client ON payment_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_paid_at ON payment_transactions(paid_at);

INSERT INTO schema_migrations (version) VALUES ('013_financial_system');


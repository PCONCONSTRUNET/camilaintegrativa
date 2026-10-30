const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = path.join(__dirname, '..', '.data', 'clinica.sqlite');
const db = new DatabaseSync(dbPath);

const cols = db.prepare('PRAGMA table_info(client_payments)').all().map(c => c.name);
console.log('Existing columns:', cols);

function addCol(name, def) {
  if (!cols.includes(name)) {
    console.log('Adding column', name);
    db.exec(`ALTER TABLE client_payments ADD COLUMN ${name} ${def}`);
  }
}

addCol('paid_amount_cents', 'INTEGER NOT NULL DEFAULT 0');
addCol('remaining_amount_cents', 'INTEGER NOT NULL DEFAULT 0');
addCol('discount_cents', 'INTEGER NOT NULL DEFAULT 0');
addCol('service_id', 'TEXT REFERENCES services(id)');
addCol('client_package_id', 'TEXT REFERENCES client_packages(id)');
addCol('parent_payment_id', 'TEXT REFERENCES client_payments(id)');
addCol('installment_number', 'INTEGER');
addCol('total_installments', 'INTEGER');
addCol('charge_type', "TEXT DEFAULT 'avulso'");

db.exec("UPDATE client_payments SET paid_amount_cents = amount_cents, remaining_amount_cents = 0 WHERE status = 'pago' AND (paid_amount_cents = 0 OR paid_amount_cents IS NULL)");
db.exec("UPDATE client_payments SET paid_amount_cents = 0, remaining_amount_cents = amount_cents WHERE status = 'pendente' AND (remaining_amount_cents = 0 OR remaining_amount_cents IS NULL)");

db.exec(`
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
`);

console.log('Migration 013 executed successfully!');


import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Lucasduda28123@db.phhsdjeduxahoeridpec.supabase.co:5432/postgres';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Conectado ao PostgreSQL (Supabase). Aplicando migrações 013 e 014...');

  await client.query(`
    -- Permitir despesas sem cliente
    ALTER TABLE client_payments ALTER COLUMN client_id DROP NOT NULL;

    -- Colunas do sistema financeiro avançado
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS service_id TEXT REFERENCES services(id);
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS client_package_id TEXT REFERENCES client_packages(id);
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS parent_payment_id TEXT REFERENCES client_payments(id);
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS installment_number INTEGER;
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS total_installments INTEGER;
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'entrada';
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'outros';
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS charge_type TEXT DEFAULT 'avulso';
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS paid_amount_cents INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS remaining_amount_cents INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;

    -- Tabela de histórico de transações / baixas parciais
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL REFERENCES clinics(id),
      payment_id TEXT NOT NULL REFERENCES client_payments(id) ON DELETE CASCADE,
      client_id TEXT REFERENCES clients(id),
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
    CREATE INDEX IF NOT EXISTS idx_client_payments_entry_type ON client_payments(entry_type);
    CREATE INDEX IF NOT EXISTS idx_client_payments_category ON client_payments(category);
    CREATE INDEX IF NOT EXISTS idx_client_payments_due_at ON client_payments(due_at);

    UPDATE client_payments SET paid_amount_cents = amount_cents, remaining_amount_cents = 0 WHERE status = 'pago' AND (paid_amount_cents = 0 OR paid_amount_cents IS NULL);
    UPDATE client_payments SET paid_amount_cents = 0, remaining_amount_cents = amount_cents WHERE status = 'pendente' AND (remaining_amount_cents = 0 OR remaining_amount_cents IS NULL);
  `);

  console.log('Migrações 013 e 014 aplicadas no PostgreSQL com sucesso!');
  await client.end();
}

main().catch(err => {
  console.error('Erro na migração:', err);
  process.exit(1);
});


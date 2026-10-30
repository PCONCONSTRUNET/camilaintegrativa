-- 003_prontuario.sql
-- Registros de Atendimento e Prontuário do Cliente

-- 1. Ficha inicial do cliente (dados aprofundados, anamnese inicial e contatos)
CREATE TABLE IF NOT EXISTS client_records (
  client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  birth_date TEXT,
  cpf TEXT,
  gender TEXT,
  occupation TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  chief_complaint TEXT,
  health_history TEXT,
  medications TEXT,
  personal_background TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 2. Objetivos do acompanhamento
CREATE TABLE IF NOT EXISTS treatment_goals (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'alcancado', 'ajustado', 'pausado')),
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  target_date TEXT,
  achieved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS treatment_goals_client_idx ON treatment_goals(client_id, created_at DESC);

-- 3. Evolução e observações clínicas das sessões
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
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS clinical_evolutions_client_idx ON clinical_evolutions(client_id, session_date DESC);

-- 4. Técnicas utilizadas no acompanhamento
CREATE TABLE IF NOT EXISTS clinical_techniques (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  evolution_id TEXT REFERENCES clinical_evolutions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  notes TEXT,
  outcome TEXT NOT NULL DEFAULT 'positiva' CHECK (outcome IN ('muito_positiva', 'positiva', 'neutra', 'necessita_ajuste')),
  applied_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS clinical_techniques_client_idx ON clinical_techniques(client_id, applied_at DESC);

-- 5. Documentos e termos (termos de consentimento, contratos, atestados, relatórios)
CREATE TABLE IF NOT EXISTS client_documents (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('termo_consentimento', 'contrato_terapeutico', 'atestado', 'declaracao', 'relatorio_psicologico', 'outro')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('pendente_assinatura', 'assinado', 'ativo', 'arquivado')),
  file_name TEXT,
  content TEXT,
  signed_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS client_documents_client_idx ON client_documents(client_id, created_at DESC);

-- 6. Encaminhamentos e retornos
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS client_referrals_client_idx ON client_referrals(client_id, referred_at DESC);

-- 7. Histórico de alterações e acessos (Auditoria de segurança e sigilo ético)
CREATE TABLE IF NOT EXISTS prontuario_access_logs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  actor_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS prontuario_access_logs_client_idx ON prontuario_access_logs(client_id, created_at DESC);

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('003_prontuario');

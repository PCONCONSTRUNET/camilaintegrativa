-- 004_multiple_emergency_contacts.sql
-- Adiciona suporte a múltiplos contatos de emergência (JSON) na ficha do cliente

ALTER TABLE client_records ADD COLUMN emergency_contacts TEXT;

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('004_multiple_emergency_contacts');

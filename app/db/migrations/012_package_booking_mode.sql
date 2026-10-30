-- Migration 012: Regra de agendamento de sessões de pacotes
-- 'sequencial' (padrão): o cliente só agenda a próxima sessão depois que a anterior for concluída.
-- 'livre': o cliente pode agendar todas as sessões do pacote de uma vez.
ALTER TABLE services ADD COLUMN package_booking_mode TEXT NOT NULL DEFAULT 'sequencial';

INSERT INTO schema_migrations (version) VALUES ('012_package_booking_mode') ON CONFLICT DO NOTHING;


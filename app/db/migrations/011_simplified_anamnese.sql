-- Migration 011: Ficha de Anamnese Digital Simplificada
ALTER TABLE client_records ADD COLUMN rg TEXT;
ALTER TABLE client_records ADD COLUMN consultation_reason TEXT;
ALTER TABLE client_records ADD COLUMN has_health_conditions INTEGER DEFAULT 0;
ALTER TABLE client_records ADD COLUMN health_conditions_details TEXT;
ALTER TABLE client_records ADD COLUMN has_psych_care INTEGER DEFAULT 0;
ALTER TABLE client_records ADD COLUMN psych_care_details TEXT;
ALTER TABLE client_records ADD COLUMN consent_agreed INTEGER DEFAULT 0;
ALTER TABLE client_records ADD COLUMN consent_agreed_at TEXT;

INSERT INTO schema_migrations (version) VALUES ('011_simplified_anamnese') ON CONFLICT DO NOTHING;


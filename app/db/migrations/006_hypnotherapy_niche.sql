-- 006_hypnotherapy_niche.sql
-- Adaptações específicas para Hipnose Clínica e Psicoterapia Integrativa (CRT-SBHP/SC 805)

-- 1. Campos de anamnese especializada para Hipnoterapia
ALTER TABLE client_records ADD COLUMN epilepsy_history INTEGER DEFAULT 0;
ALTER TABLE client_records ADD COLUMN psychiatric_history TEXT;
ALTER TABLE client_records ADD COLUMN previous_hypnosis TEXT;
ALTER TABLE client_records ADD COLUMN suggestibility_notes TEXT;
ALTER TABLE client_records ADD COLUMN emotional_triggers TEXT;
ALTER TABLE client_records ADD COLUMN safe_place TEXT;

-- 2. Campos de evolução clínica para Hipnoterapia
ALTER TABLE clinical_evolutions ADD COLUMN induction_method TEXT;
ALTER TABLE clinical_evolutions ADD COLUMN trance_depth TEXT;
ALTER TABLE clinical_evolutions ADD COLUMN hypnotic_phenomena TEXT;
ALTER TABLE clinical_evolutions ADD COLUMN post_hypnotic_suggestions TEXT;
ALTER TABLE clinical_evolutions ADD COLUMN deinduction_notes TEXT;
ALTER TABLE clinical_evolutions ADD COLUMN self_hypnosis_prescribed TEXT;

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('006_hypnotherapy_niche');

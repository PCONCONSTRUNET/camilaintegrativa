-- Migration 007: Finalização e Assinatura de Registros Clínicos
-- Conformidade: Lei 13.787/2018 (integridade de prontuários)
-- Após finalizado, o registro é somente-leitura e preserva autoria.

ALTER TABLE clinical_evolutions ADD COLUMN finalized_at TEXT NULL;
ALTER TABLE clinical_evolutions ADD COLUMN finalized_by TEXT NULL;
ALTER TABLE clinical_evolutions ADD COLUMN finalized_by_name TEXT NULL;

INSERT INTO schema_migrations (version) VALUES ('007_evolution_finalization');

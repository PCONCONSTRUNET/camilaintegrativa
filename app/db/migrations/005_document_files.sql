-- 005_document_files.sql
-- Adiciona suporte a múltiplos arquivos/fotos em documentos do prontuário

ALTER TABLE client_documents ADD COLUMN file_data TEXT;
ALTER TABLE client_documents ADD COLUMN document_type_label TEXT;

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('005_document_files');

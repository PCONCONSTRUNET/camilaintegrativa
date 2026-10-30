# Modelo de dados

O schema completo está em `db/migrations/001_initial.sql`.

## Núcleo operacional

- `clinics` → `clinic_settings`: unidade e regras globais.
- `users` → `memberships` → `professionals`: identidade, papel e atuação.
- `services` → `service_modalities`: catálogo publicável, duração, intervalo e preço em centavos.
- `working_hours`, `availability_exceptions`, `holidays`, `time_blocks`: disponibilidade recorrente e exceções.
- `clients` → `client_preferences`: cadastro administrativo e preferências de contato.
- `appointments` → `appointment_events`: estado atual e histórico imutável de mudanças.

## Módulos preparados para fases seguintes

- Formulários: `form_templates`, `form_versions`, `form_fields`, `form_responses`, `consent_records`.
- Registros restritos: `session_records`, `session_record_versions`, `private_documents`.
- Financeiro: `charges`, `payments`, `refunds`, `expenses`.
- Pacotes: `package_offerings`, `client_packages`, `package_usages`.
- Comunicação: `message_templates`, `notification_rules`, `notification_jobs`, `notification_attempts`.
- Governança: `integration_settings`, `public_site_content`, `audit_logs`, `privacy_requests`.

## Decisões de integridade

- Valores monetários usam centavos inteiros.
- Datas de agenda são gravadas como instantes UTC e apresentadas em `America/Sao_Paulo`.
- Estados possuem constraints; relações críticas têm chaves estrangeiras.
- Uso de pacote possui unicidade por pacote/agendamento para apoiar idempotência.
- Registros de sessão têm versões; alteração não deve apagar o conteúdo anterior.
- `clinic_id` aparece nas entidades de contexto para futura expansão e isolamento.

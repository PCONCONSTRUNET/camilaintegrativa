# Arquitetura

## Estado atual

- Next.js 16.4 com App Router, React 19 e TypeScript estrito.
- Interface responsiva com CSS/tokens centralizados e ícones Lucide.
- Route Handlers para operações públicas e administrativas.
- Zod na fronteira HTTP para validar entrada no servidor.
- SQLite nativo do Node 24 em desenvolvimento, com WAL, chaves estrangeiras, constraints e transações.
- Sessão administrativa em cookie HttpOnly/SameSite=Strict, assinada com HMAC-SHA256.

## Camadas

1. `src/app`: páginas e endpoints HTTP.
2. `src/lib/validation.ts`: contratos de entrada.
3. `src/lib/repository.ts`: regras de disponibilidade, conflitos, clientes e agenda.
4. `src/lib/db.ts`: conexão, migração e seed apenas de demonstração.
5. `db/migrations`: modelo persistente versionável.

As páginas administrativas e cada endpoint protegido repetem a verificação da sessão. Esconder uma tela nunca é tratado como autorização suficiente.

## Reserva concorrente

A disponibilidade exibida é informativa. No envio, o servidor abre `BEGIN IMMEDIATE`, consulta novamente sobreposição de horários e só então cria cliente/agendamento/evento. Um índice parcial impede duas reservas ativas com o mesmo início. Para produção em Postgres, a regra deve migrar para transação com constraint de exclusão por intervalo.

## Caminho para produção

SQLite é a persistência funcional local da Fase 1, não a recomendação final para hospedagem distribuída. Antes da produção:

1. Migrar a implementação do repositório para PostgreSQL/Supabase.
2. Adotar autenticação gerenciada com MFA/OTP e sessões revogáveis.
3. Aplicar RLS e testes de isolamento por `clinic_id`.
4. Usar armazenamento privado para documentos e segredos em cofre de ambiente.
5. Configurar backups, monitoramento e rate limiting distribuído.

## Segurança atual e limites

- Segredos não são enviados ao navegador.
- Produção recusa login sem variáveis de ambiente.
- APIs administrativas validam sessão.
- Entradas públicas são limitadas e validadas.
- Ainda faltam rate limit, RLS/Postgres, recuperação de conta, MFA, backup externo e revisão especializada. Não se declara conformidade integral com LGPD.

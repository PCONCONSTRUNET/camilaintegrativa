# Checklist de funcionalidades

Legenda: `[x]` implementado e verificado nesta fase; `[ ]` pendente; `[~]` parcialmente implementado.

## Fase 0

- [x] Visão do produto, arquitetura, modelo de dados, roadmap, decisões e pendências.
- [x] Tokens visuais e componentes base responsivos.
- [x] Layout público e administrativo coerentes.
- [x] Migração SQL com entidades previstas no prompt.
- [x] Persistência local real e seed explicitamente demonstrativo.
- [x] Login administrativo e APIs protegidas por sessão.
- [~] Papéis modelados; autorização granular por recurso entra com a equipe real.
- [ ] Postgres/Supabase, RLS, storage privado, MFA/OTP e recuperação de conta.

## Fase 1

- [x] Site público com navegação, serviços, fluxo e perguntas frequentes.
- [x] SEO básico, sitemap e bloqueio de indexação de rotas privadas.
- [x] Catálogo de serviços persistido e publicado.
- [x] Horários calculados a partir de jornada, ocupação e antecedência mínima.
- [x] Reserva pública validada no servidor e transação contra conflito simultâneo.
- [x] Criação/atualização de cliente durante a reserva.
- [x] Cadastro administrativo e busca/filtro de clientes.
- [x] Agenda diária interna com estados e histórico de alteração.
- [x] Dashboard com contagens reais e sem receita fictícia.
- [~] Configurações básicas persistidas; interface completa de edição pendente.
- [ ] Criar agendamento interno e encaixe pela interface.
- [ ] Criar bloqueios/férias pela interface.
- [ ] Reagendamento e recorrência.
- [ ] Rate limit persistente para login e agendamento.
- [ ] Testes automatizados de concorrência e navegador em 360/768/1280px.

## Fase 2

- [ ] Construtor/versionamento de formulários e respostas.
- [ ] Registros restritos com versões/adendos.
- [ ] Documentos privados.
- [ ] Financeiro, pagamentos, reembolsos e despesas.
- [ ] Pacotes e consumo idempotente.
- [ ] Auditoria completa e relatórios base.
- [ ] Permissões completas e testes de autorização por papel.

## Fase 3

- [ ] Portal do cliente com acesso seguro.
- [ ] Cancelamento/reagendamento conforme política.
- [ ] Lista de espera e recorrências completas.
- [ ] WhatsApp oficial, fila, tentativas e deduplicação.
- [ ] Gateway de pagamento e webhooks assinados.
- [ ] Google Calendar autorizado.
- [ ] Relatórios avançados e CSV.

## Fase 4

- [ ] Revisão de segurança, LGPD e requisitos profissionais.
- [ ] WCAG AA e auditoria de acessibilidade.
- [ ] E2E, cenários de falha, carga e concorrência.
- [ ] Backups, recuperação, monitoramento e deploy.
- [ ] Homologação de todo conteúdo pela proprietária.

## Verificações da entrega de 2026-10-22

- [x] `npm run lint` sem erros.
- [x] `npm run build` e TypeScript sem erros.
- [x] Home, agendamento, login, robots e sitemap responderam HTTP 200.
- [x] API administrativa sem sessão respondeu HTTP 401.
- [x] Login local criou sessão e liberou o dashboard.
- [x] Reserva pública foi persistida e apareceu nas métricas.
- [x] Segunda reserva para o mesmo horário foi recusada com HTTP 409.
- [x] Alteração administrativa de status foi persistida com evento de histórico.
- [x] Inspeção visual local da home e do fluxo de agendamento em navegador headless.

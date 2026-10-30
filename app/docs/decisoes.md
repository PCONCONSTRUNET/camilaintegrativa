# Decisões técnicas

## 2026-10-22 — Persistência local primeiro

Adotado SQLite nativo do Node 24 para tornar a Fase 1 executável sem inventar credenciais externas. O acesso está isolado em repositório para futura troca por Postgres/Supabase.

## 2026-10-22 — Confirmação manual

Reservas públicas nascem como `solicitado`. A clínica altera para `confirmado`; o evento é registrado. Não há envio fictício de WhatsApp.

## 2026-10-22 — Conteúdo conservador

Foram removidas promessas, depoimentos e afirmações clínicas não validadas. O site sinaliza conteúdo demonstrativo e pendências institucionais.

## 2026-10-22 — Autenticação provisória de desenvolvimento

Cookie assinado protege painel e APIs. Credenciais locais são somente para demonstração. Produção exige autenticação gerenciada, segredo forte e credenciais definidas no ambiente.

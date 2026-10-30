# Clínica — Fase 0 e núcleo da Fase 1

Sistema local em Next.js 16 para site público, reservas, clientes e agenda administrativa.

## Requisitos

- Node.js 24 (o banco local usa `node:sqlite`).
- Dependências já instaladas com `npm install`.

## Executar

```powershell
Copy-Item .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`. O banco é criado em `.data/clinica.sqlite` no primeiro acesso.

No desenvolvimento, sem `.env.local`, o painel aceita somente as credenciais demonstrativas:

- E-mail: `admin@clinica.local`
- Senha: `clinica-demo`

Esses valores não funcionam em produção. Configure `CLINICA_AUTH_SECRET`, `CLINICA_ADMIN_EMAIL` e `CLINICA_ADMIN_PASSWORD`.

## Rotas principais

- `/` — site público.
- `/agendar` — solicitação de horário persistente.
- `/entrar` — login administrativo.
- `/admin` — dashboard.
- `/admin/agenda` — agenda diária.
- `/admin/clientes` — clientes.
- `/admin/configuracoes` — estado das integrações e pendências.

## Verificação

```powershell
npm run build
npm run lint
```

Leia `docs/checklist-funcionalidades.md` antes de considerar uma fase concluída. O sistema ainda não deve ser publicado com dados reais sensíveis; os limites e itens de produção estão em `docs/arquitetura.md`.

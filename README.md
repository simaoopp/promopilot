# PromoPilot

SaaS operacional para campanhas, etiquetas, catálogo de artigos, dossiers comerciais e processos de loja, com Supabase, histórico e fundação multi-tenant.

## Arquitetura atual

- **Frontend/Render**: aplicação e API leve.
- **Cloud Run Job**: processamento pesado de emails automáticos, PDFs e Playwright.
- **Supabase**: autenticação, base de dados, RLS e storage privado.
- **Resend**: envio de emails.
- **Secret Manager**: credenciais sensíveis do worker.

## Estado SaaS

O projeto inclui fundação SaaS enterprise:

- organizações;
- membros por organização;
- lojas por organização;
- roles por organização;
- planos/subscrições/limites;
- usage events;
- audit logs;
- jobs;
- webhooks/API keys;
- storage privado por `organization_id`;
- staging e testes de permissões.

A ativação multi-tenant completa deve ser feita primeiro em staging, com backfill de `organization_id` e testes de isolamento entre tenants.

## Segurança essencial

No Render deve existir apenas:

```env
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
AUTOMATIC_CAMPAIGN_BUCKET=automatic-campaign-pdfs
CAMPAIGN_EMAIL_SEND_ENABLED=0
CAMPAIGN_EMAIL_WORKER_ENABLED=0
CAMPAIGN_EMAIL_WORKER_RUN_ON_START=0
WARM_ARTICLES_CACHE=0
NODE_OPTIONS=--max-old-space-size=384
```

Não colocar no Render:

```env
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
CAMPAIGN_IMAP_PASS=
```

`SUPABASE_SERVICE_ROLE_KEY` fica apenas no Google Cloud Secret Manager para o Cloud Run Job ou serviços backend seguros.

## Cloud Run Worker

O worker é one-shot. Ele executa, processa emails elegíveis, gera PDFs e termina.

Playwright está alinhado em `1.60.0` com a imagem Docker:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS runner
```

## Migrations principais

- `20260521_controlled_articles_rpc.sql`
- `20260521_security_hardening_rls.sql`
- `20260522_saas_enterprise_core.sql`

Aplicar primeiro em staging.

## QA

```bash
npm run qa:all
```

Executa:

- QA estático;
- SaaS readiness check;
- smoke check do backend.

## Documentação importante

- `docs/SAAS_FULL_CHECKLIST_STATUS.md`
- `docs/OUTSIDE_PROJECT_ACTIONS.md`
- `docs/STAGING_AND_PERMISSION_TESTS.md`
- `docs/SECURITY.md`
- `docs/RUNBOOK.md`
- `docs/BILLING_PLAN.md`

## Caminho correto para SaaS real

1. Criar staging real.
2. Aplicar migrations em staging.
3. Criar Organização A/B e users A/B.
4. Executar testes RLS multi-tenant.
5. Fazer backup de produção.
6. Fazer backfill de `organization_id`.
7. Só depois ativar RLS multi-tenant em produção.

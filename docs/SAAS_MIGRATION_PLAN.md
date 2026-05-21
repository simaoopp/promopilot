# Plano de migração para SaaS sem quebrar o produto atual

## Estratégia

A migração deve ser incremental. Não é seguro adicionar `organization_id` obrigatório em tudo de uma vez numa aplicação já usada.

## Fase 0 — Estado atual estável

Manter:

- Render sem service role.
- Cloud Run Job para emails automáticos.
- RLS ativa.
- Bucket privado.
- Pesquisa de artigos por RPC.
- Limpeza de campanhas automáticas com 5 dias.

## Fase 1 — Fundação multi-tenant não destrutiva

Aplicar a migration:

```text
supabase/migrations/20260521_saas_foundation_non_breaking.sql
```

Ela cria tabelas base e funções auxiliares sem trocar imediatamente as policies existentes.

Objetivo:

- criar `organizations`;
- criar `organization_members`;
- criar `stores` SaaS;
- criar `subscriptions`;
- criar `usage_events`;
- criar `audit_logs`;
- adicionar `organization_id` nullable às tabelas existentes quando existirem.

## Fase 2 — Backfill

Criar uma organização inicial para o uso atual.

Depois preencher `organization_id` nos dados existentes.

Nada deve ser tornado `NOT NULL` antes de o backfill estar validado.

## Fase 3 — RLS por organização em staging

Criar policies por organização em ambiente staging.

Testar:

- owner;
- admin;
- manager;
- store_user;
- viewer;
- Cliente A vs Cliente B;
- PDFs/storage;
- campanhas manuais;
- campanhas automáticas;
- importação de artigos;
- pesquisa de artigos.

## Fase 4 — Produção controlada

Ativar policies multi-tenant em produção só depois de:

- staging passar;
- backups confirmados;
- rollback definido;
- admin interno validado;
- logs e alertas configurados.

## Fase 5 — Comercialização

Só vender como SaaS depois de existir:

- onboarding;
- limites por plano;
- gestão de clientes;
- suporte;
- documentação;
- backups;
- monitorização;
- auditoria mínima.

# Runbook — Staging, Backfill `organization_id` e Testes Multi-Tenant

Este documento é o procedimento obrigatório para ativar a fundação SaaS de forma controlada.

## Objetivo

Validar que o produto passa a funcionar com fronteira real por organização antes de qualquer ativação comercial:

- cada utilizador pertence a uma organização;
- os dados existentes recebem `organization_id`;
- artigos e campanhas deixam de depender apenas de `store` como fronteira de segurança;
- pesquisas de artigos passam a ser filtradas por organização;
- PDFs usam path com `{organization_id}/...`;
- RLS impede acesso cruzado entre tenants.

## Ordem obrigatória em staging

1. Criar Supabase staging separado.
2. Restaurar uma cópia sanitizada ou seed realista da produção.
3. Aplicar migrations antigas.
4. Aplicar `20260522_saas_enterprise_core.sql`.
5. Aplicar `20260523_saas_tenant_backfill_activation.sql`.
6. Correr `supabase/tests/rls_multitenant_permissions.executable.sql`.
7. Configurar Render staging com `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` de staging.
8. Configurar Cloud Run Job staging com secrets de staging.
9. Definir `CAMPAIGN_DEFAULT_ORGANIZATION_ID` no Cloud Run staging com o ID da organização criada/backfilled.
10. Testar login, pesquisa de artigos, campanha manual, PDF e email automático.
11. Só depois considerar aplicação em produção.

## Como descobrir o ID da organização criada pelo backfill

```sql
select id, name, slug, status
from public.organizations
order by created_at;
```

Usa esse `id` em:

```env
CAMPAIGN_DEFAULT_ORGANIZATION_ID=<organization_id>
```

## Validações obrigatórias

```sql
select count(*) as articles_without_org
from public.articles
where organization_id is null;

select count(*) as automatic_campaigns_without_org
from public.automatic_campaigns
where organization_id is null;

select id, name, public
from storage.buckets
where id = 'automatic-campaign-pdfs';
```

Esperado:

- `articles_without_org = 0`;
- `automatic_campaigns_without_org = 0`;
- `public = false`.

## Teste de permissões

Executar:

```sql
-- supabase/tests/rls_multitenant_permissions.executable.sql
```

O teste deve terminar com:

```text
RLS MULTI-TENANT PERMISSION TESTS: OK
```

## Produção

Antes de produção:

1. Backup completo da base.
2. Exportar lista de buckets/storage crítica.
3. Aplicar migrations em janela controlada.
4. Aplicar `20260523_saas_tenant_backfill_activation.sql`.
5. Confirmar contagens sem `organization_id` nulo.
6. Definir `CAMPAIGN_DEFAULT_ORGANIZATION_ID` no Cloud Run production.
7. Executar Cloud Run Job manualmente uma vez.
8. Testar user normal e admin.
9. Monitorizar logs por 24h.

## O que não fazer

- Não ativar constraints estritas antes de validar staging.
- Não colocar `SUPABASE_SERVICE_ROLE_KEY` no Render.
- Não voltar a abrir `articles` com `select` direto para users normais.
- Não tornar `automatic-campaign-pdfs` público.
- Não aplicar billing/templates comerciais antes de validar isolamento multi-tenant.

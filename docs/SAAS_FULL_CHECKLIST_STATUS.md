# Estado da checklist SaaS sénior

Este documento transforma a checklist original numa matriz objetiva de estado.

## Classificação atual depois desta entrega

- Código e fundação técnica SaaS: forte.
- Produção controlada atual: pronta, desde que as envs e migrations estejam aplicadas.
- SaaS multi-tenant completo: preparado no código para staging, backfill e teste de isolamento; produção só depois de executar o runbook em ambiente real.

## Done no projeto

- Fundação multi-tenant criada: `organizations`, `organization_members`, `stores`, `invitations`, `subscriptions`, `plans`, `plan_limits`, `usage_events`, `audit_logs`, `app_jobs`, `processed_emails`, `api_keys`, `webhooks`.
- Funções RLS: `is_org_member`, `has_org_role`, `is_platform_admin`, `can_access_store`.
- Storage privado por path `{organization_id}/...`.
- Cloud Run Job separado para email/PDF.
- Render sem service role obrigatório.
- Pesquisa de artigos por RPC controlada.
- Limpeza automática de campanhas antigas.
- Request ID, error handler normalizado, tenant context e audit service.
- Painel admin backend inicial: organizations, audit logs e jobs.
- Staging templates, Cloud Build staging e docs.
- Teste template e teste executável de permissões multi-tenant.
- QA estático e SaaS readiness check.

## Falta fora do código

- Criar Supabase staging real.
- Criar Render staging real.
- Criar Cloud Run staging real.
- Criar secrets staging.
- Aplicar migrations em staging.
- Criar users e tenants de teste.
- Executar `supabase/tests/rls_multitenant_permissions.executable.sql` em staging.
- Fazer backup de produção antes de backfill.
- Aplicar `20260523_saas_tenant_backfill_activation.sql` em produção apenas depois de staging aprovado.
- Definir `CAMPAIGN_DEFAULT_ORGANIZATION_ID` no Cloud Run com o ID real da organização.
- Ativar billing real, se fores vender self-service.
- Configurar observabilidade externa e alertas.
- Testar restore de backup.
- Criar termos, privacidade, DPA/GDPR e contrato B2B.

## Próxima fase obrigatória

1. Criar staging real fora do código.
2. Aplicar migrations em staging, incluindo `20260523_saas_tenant_backfill_activation.sql`.
3. Executar teste multi-tenant executável.
4. Validar UI com duas organizações.
5. Aplicar o mesmo processo em produção com backup e monitorização.
6. Depois avançar para billing/limites e painel admin visual.

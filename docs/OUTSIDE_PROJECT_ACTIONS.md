# Ações obrigatórias fora do código

Estas ações não podem ser feitas apenas dentro do repositório. São necessárias para passar de app interna para SaaS controlado.

## 1. Criar staging real

Criar recursos separados:

- Supabase staging;
- Render staging;
- Cloud Run Job staging;
- Artifact Registry/Cloud Build staging ou trigger separado;
- Secret Manager secrets de staging;
- Storage bucket staging;
- email/Gmail de teste;
- Resend API key ou domínio de teste;
- domínio/subdomínio staging.

## 2. Aplicar migrations em staging

Ordem recomendada:

1. migrations históricas;
2. `20260521_security_hardening_rls.sql`;
3. `20260521_controlled_articles_rpc.sql`;
4. `20260522_saas_enterprise_core.sql`;
5. `20260523_saas_tenant_backfill_activation.sql`.

## 3. Backfill e ativação tenant

Depois da migration `20260523`, confirmar:

```sql
select id, name, slug from public.organizations;
select count(*) from public.articles where organization_id is null;
select count(*) from public.automatic_campaigns where organization_id is null;
```

Copiar o `organizations.id` correto para:

```env
CAMPAIGN_DEFAULT_ORGANIZATION_ID=<organization_id>
```

em Cloud Run Job staging e, depois de validado, production.

## 4. Testes de isolamento

Executar em staging:

```sql
supabase/tests/rls_multitenant_permissions.executable.sql
```

Validar manualmente:

- User A não vê Organização B;
- User B não vê Organização A;
- PDF da Organização A não abre para B;
- pesquisa de artigos só devolve artigos da organização ativa;
- admin de uma organização não gere outra organização.

## 5. Produção

Antes de aplicar em produção:

- fazer backup;
- exportar lista de objetos storage relevantes;
- comunicar janela de manutenção, se aplicável;
- aplicar migrations;
- validar contagens;
- definir `CAMPAIGN_DEFAULT_ORGANIZATION_ID`;
- executar job manual;
- monitorizar Cloud Run, Render e Supabase por 24h.

## 6. Ainda não concluído fora do código

- billing Stripe/Paddle;
- termos legais, privacidade, cookies, DPA/GDPR;
- observabilidade externa com alertas;
- teste real de restore;
- painel admin visual completo;
- event-driven email via Gmail API watch + Pub/Sub.

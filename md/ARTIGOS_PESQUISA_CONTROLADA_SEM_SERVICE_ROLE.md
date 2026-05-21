# Pesquisa controlada de artigos sem `service_role` no Render

Este projeto não deve depender de `SUPABASE_SERVICE_ROLE_KEY` no Render para carregar artigos.

A base tem cerca de 250 mil artigos. Carregar tudo para o browser ou para a memória do Render é lento, inseguro e desnecessário. A solução adotada é pesquisa server-side controlada:

- Render usa apenas `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`;
- o utilizador envia o seu JWT no pedido à API;
- a API cria um cliente Supabase com esse JWT;
- o Supabase executa RPCs controladas;
- a tabela `articles` mantém RLS ativa;
- users normais não fazem `select * from articles`;
- users normais só chamam `search_articles_for_labels` e `get_article_for_label`;
- as RPCs devolvem apenas campos necessários e têm limite rígido.

## Migration necessária

Aplicar no Supabase SQL Editor:

```text
supabase/migrations/20260521_controlled_articles_rpc.sql
```

Esta migration cria:

- `public.current_user_role()`;
- `public.current_user_store()`;
- `public.is_admin()`;
- policy `articles_admin_all`;
- RPC `public.search_articles_for_labels(...)`;
- RPC `public.get_article_for_label(...)`;
- índices úteis para pesquisa.

## Render

No Render, manter apenas:

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
PLAYWRIGHT_BROWSERS_PATH=
```

## Google Cloud

`SUPABASE_SERVICE_ROLE_KEY` continua apenas no Secret Manager do Google Cloud, usado pelo Cloud Run Job para processos automáticos controlados.

## Comportamento esperado

- Ao abrir a página, o catálogo completo não carrega.
- Ao escrever pelo menos 2 caracteres, a app pesquisa no servidor.
- O resultado vem limitado, por defeito 50/100 artigos.
- Scan por EAN/código faz pesquisa remota exata quando o artigo não está em cache recente.
- Admin continua a poder ter permissões administrativas via RLS/policies.

## Verificações rápidas

```sql
select id, name, public
from storage.buckets
where id = 'automatic-campaign-pdfs';
```

Esperado:

```text
public = false
```

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'articles', 'campaigns', 'automatic_campaigns')
order by tablename;
```

Esperado:

```text
rowsecurity = true
```

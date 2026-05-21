# Regras Supabase/RLS para produção

Este ficheiro contém as regras de segurança que devem ser aplicadas no Supabase para deixar a aplicação pronta para produção com isolamento por utilizador/loja.

A migration pronta está em:

```text
supabase/migrations/20260521_security_hardening_rls.sql
```

## Como aplicar

1. Abre o Supabase.
2. Vai a **SQL Editor**.
3. Cola e executa o conteúdo completo de `supabase/migrations/20260521_security_hardening_rls.sql`.
4. Confirma que não há erros.
5. Depois define pelo menos um administrador.

Exemplo para promover o teu utilizador a admin:

```sql
update public.profiles
set role = 'admin'
where id = 'COLOCA_AQUI_O_UUID_DO_TEU_USER';
```

Se preferires por email:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('teu-email@example.com');
```

## Modelo de segurança aplicado

### `public.articles`

- Sem acesso direto para `anon` ou `authenticated`.
- A aplicação deve consultar artigos através da API do backend.
- O backend usa `SUPABASE_SERVICE_ROLE_KEY`.

Regra efetiva:

```sql
alter table public.articles enable row level security;
revoke all on public.articles from anon, authenticated;
```

### `public.profiles`

- Cada utilizador vê e atualiza apenas o seu próprio perfil.
- Admins podem ver perfis.
- Utilizadores não conseguem autopromover-se, porque `role` e `allowed_stores` ficam protegidos por trigger.

Campos protegidos:

```text
role
allowed_stores
id
created_at
```

### `public.campaigns`

- Campanhas manuais ficam isoladas por loja.
- Um utilizador só vê campanhas da sua loja ou das lojas permitidas em `allowed_stores`.
- Admins veem tudo.

### `public.automatic_campaigns`

- Cloud Run/backend cria e atualiza campanhas automáticas via `service_role`.
- Utilizadores autenticados só podem ler/apagar campanhas automáticas da sua loja.
- Inserts/updates diretos pelo frontend ficam bloqueados.
- `raw_email_text` deixa de ser exposto ao frontend.

### `storage.objects` / bucket `automatic-campaign-pdfs`

- Bucket privado.
- Sem leitura pública.
- Leitura direta só é permitida se o objeto estiver associado a uma campanha da loja do utilizador.
- O fluxo recomendado continua a ser gerar signed URL curto pelo backend.

## Funções criadas

A migration cria estas funções auxiliares:

```sql
public.current_profile_store()
public.current_profile_role()
public.is_app_admin()
public.can_access_store(target_store text)
```

Estas funções são usadas nas policies para evitar repetir lógica e para manter as regras consistentes.

## Variáveis relacionadas no Render

No Render, define:

```env
ADMIN_EMAILS=teu-email@example.com
CORS_ORIGINS=https://teu-site.netlify.app
ALLOW_LOCALHOST_CORS=0
API_RATE_LIMIT_MAX=600
ADMIN_RATE_LIMIT_MAX=60
JSON_BODY_LIMIT=2mb
CAMPAIGN_STORE_RAW_EMAIL=0
```

`ADMIN_EMAILS` protege endpoints administrativos no backend. A policy do Supabase usa `profiles.role`; portanto, para produção, deves também marcar o teu perfil como `admin` na tabela `profiles`.

## Checklist pós-migration

Depois de aplicar:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('articles', 'profiles', 'campaigns', 'automatic_campaigns');
```

Deve devolver `rowsecurity = true` para todas.

Confirma também:

```sql
select id, store, role, allowed_stores
from public.profiles;
```

Pelo menos o teu utilizador principal deve ter:

```text
role = admin
```

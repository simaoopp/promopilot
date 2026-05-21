# Staging Supabase

Ambiente obrigatório antes de activar multi-tenant em produção.

## Ordem

1. Criar projeto Supabase separado.
2. Aplicar todas as migrations por ordem.
3. Criar dois utilizadores reais: User A e User B.
4. Aplicar `supabase/tests/rls_multitenant_permissions.template.sql` adaptado.
5. Testar isolamento entre organizações.
6. Só depois preparar backfill de produção.

Nunca testar migrations multi-tenant diretamente em produção.

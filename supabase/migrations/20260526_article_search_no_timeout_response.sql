-- Hotfix operacional: manter a pesquisa de artigos fora do caminho crítico da homepage.
-- Esta migration não altera dados. Serve como marcador/documentação para a release.
-- A correção principal está no backend/frontend:
-- 1) Homepage não chama /api/artigos automaticamente.
-- 2) /api/artigos devolve resposta degradada controlada quando o Supabase devolve 57014.
select pg_notify('pgrst', 'reload schema');

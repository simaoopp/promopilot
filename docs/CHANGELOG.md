# Changelog

## 2026-05-24 - Etiquetas sem colunas sem dados

- Removidas da tabela da página `Etiquetas` as colunas `Armazém` e `Stock`, porque o fluxo atual não recebe esses dados.
- Atualizado o `colSpan` dos estados vazios/loading da tabela de artigos de 9 para 7 colunas.
- Removidos `Armazém` e `Stock` do cartão de resultado do scan para manter a UI consistente.

## 2026-05-24 - Auth refresh token recovery

- Adicionada recuperação defensiva para sessões Supabase locais com refresh token inválido/revogado.
- Limpeza local de chaves Auth quando GoTrue devolve `Invalid Refresh Token` / `Refresh Token Not Found`.
- Pesquisa de artigos passa a tratar sessão expirada com mensagem controlada para novo login.


## Prioridade 0 — estabilização produção Expert

- Documentado runbook final em `docs/PRODUCTION_STABILIZATION_P0.md`.
- Clarificado modo Resend Inbound como fluxo oficial e IMAP como legado/pausado.
- Alinhado teste de catálogo com limite real de 1000 linhas por página.
- Corrigido aviso de boot sobre ausência de `SUPABASE_SERVICE_ROLE_KEY` no Render/API normal.
- Clarificados exemplos de env para manter service role fora do frontend e do Render normal.

## SaaS Enterprise Foundation

- Fundação multi-tenant não destrutiva.
- Request ID e error handler normalizado.
- Tenant context middleware.
- Audit logs e usage events.
- Admin API inicial.
- Staging config e RLS test template.
- Documentação operacional e segurança.

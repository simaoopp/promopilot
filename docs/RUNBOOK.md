# Runbook operacional

## Cloud Run Job falha

1. Abrir Cloud Run → Jobs → Executions.
2. Filtrar por última execução falhada.
3. Procurar `requestId`, `campaign_id`, `message_id`.
4. Confirmar secrets: Resend, Supabase, IMAP.
5. Se erro for Playwright, confirmar versão Docker = `server/package.json`.

## Email não enviado

1. Verificar logs do Cloud Run Job.
2. Verificar Resend activity.
3. Confirmar `CAMPAIGN_EMAIL_SEND_ENABLED=1` no Job.
4. Confirmar domínio Resend verificado.

## Artigos não carregam

1. Confirmar `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no Render.
2. Confirmar RPC `search_articles_for_labels(text,integer,integer)`.
3. Confirmar utilizador autenticado.
4. Confirmar RLS/functions aplicadas.

## Suspeita de fuga entre tenants

1. Desativar tenant afetado em `organizations.status='suspended'`.
2. Recolher request IDs.
3. Exportar `audit_logs`.
4. Validar RLS em staging com mesmo cenário.

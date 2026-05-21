# Segurança

## Chaves

- `SUPABASE_SERVICE_ROLE_KEY`: apenas Cloud Run/ambiente backend seguro.
- `SUPABASE_PUBLISHABLE_KEY`: pode estar no Render/frontend com RLS ativa.
- `RESEND_API_KEY`: apenas Cloud Run worker.
- `CAMPAIGN_IMAP_PASS`: apenas Secret Manager.
- `GEMINI_API_KEY`: backend seguro ou Cloud Run AI service.

## Multi-tenant

Toda tabela SaaS nova usa `organization_id` e RLS por organização.

## Storage

PDFs devem ser guardados em:

```text
{organization_id}/campaigns/{campaign_id}/file.pdf
```

Bucket privado e acesso por signed URL.

## Auditoria

Ações críticas devem chamar `writeAuditLog`.

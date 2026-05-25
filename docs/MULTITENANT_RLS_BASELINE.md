# Multi-tenant RLS baseline

This document records the staging-approved baseline for tenant isolation.

## Scope

Validated in staging:

- `organization_id` is mandatory on critical business tables.
- `campaigns` and `automatic_campaigns` no longer rely on store-only policies.
- `articles`, `campaign_items`, `processed_emails`, `price_history`, and `stores` have organization-aware RLS policies.
- PDF storage paths are organization-prefixed.
- The staging PDF bucket is private and has organization-aware storage policies.
- Cloud Run staging writes automatic PDFs under `organization_id/date/message/store.pdf`.

## Main tables covered

- `articles`
- `campaigns`
- `automatic_campaigns`
- `campaign_items`
- `processed_emails`
- `price_history`
- `stores`

## Access model

### Organization data

- Members can read data for organizations they belong to.
- Owners, admins, and managers can write tenant operational data.
- Platform admins keep cross-tenant access through `is_platform_admin()`.

### Campaign store scope

Legacy `store text` is still supported for campaigns, but access is now checked through:

```sql
public.can_access_store_in_org(organization_id, store)
```

This ensures the store check is always bounded by `organization_id`.

### Storage

PDF object paths must use:

```text
<organization_id>/<yyyy-mm-dd>/<message_or_campaign_id>/<store>.pdf
```

The helper:

```sql
public.storage_object_org_id(name)
```

extracts the first path segment and validates it as a UUID.

## Production caution

The migration intentionally keeps the legacy production storage policy:

```text
automatic_campaign_pdfs_select_store_scope
```

Do not remove it in production until every production PDF object is confirmed to use organization-prefixed paths.

## Staging validation already performed

- Cliente A cannot read Cliente B campaigns.
- Cliente B cannot read Cliente A campaigns.
- Cliente A cannot read Cliente B articles.
- Cliente B cannot read Cliente A articles.
- Cliente A/B cannot read PDF objects belonging to `Etiquetas Promo` organization.
- Staging Cloud Run writes PDFs into `automatic-campaign-pdfs-staging` under `organization_id/...`.

## Apply order

1. Apply migration to staging.
2. Run the RLS baseline test.
3. Run the Resend/Cloud Run staging smoke test with email sending disabled.
4. Tag staging.
5. Prepare a separate production rollout checklist before applying to production.

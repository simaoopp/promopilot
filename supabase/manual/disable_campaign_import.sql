-- Manual emergency disable, after reverting the frontend/API feature release.
-- Preserves every snapshot, source row, supplier template and audit entry.
-- Does not alter articles, campaigns, UUIDs, permissions or Cloud Run workers.
begin;
revoke execute on function public.campaign_import_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
commit;
-- To re-enable after correcting the issue and validating in staging:
-- grant execute on function public.campaign_import_action(uuid,uuid,text,jsonb) to authenticated;

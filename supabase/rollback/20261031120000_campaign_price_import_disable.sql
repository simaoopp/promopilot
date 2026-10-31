-- Operational rollback: disable new preparations/confirmations, retain history,
-- audit, catalogue snapshots and the campaign guard. No catalogue writes.
begin;
revoke execute on function public.campaign_price_import(uuid,text,text,jsonb) from authenticated;
notify pgrst,'reload schema';
commit;
-- Also build the frontend with REACT_APP_CAMPAIGN_PRICE_IMPORT_ENABLED=0.
-- Keep the imported-price printing fixes. Reverting them could apply legacy
-- PVP3 / .99 formatting to saved imported prices.
-- Re-enable only after review by applying the additive migration again.

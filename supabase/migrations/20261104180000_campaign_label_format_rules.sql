-- Configuração A5/A6, isolada por organização. Não altera artigos nem campanhas.
BEGIN;
CREATE TABLE IF NOT EXISTS public.campaign_label_format_rules (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  a5_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  a6_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT label_rules_a5_array CHECK (jsonb_typeof(a5_terms) = 'array' AND jsonb_array_length(a5_terms) <= 100),
  CONSTRAINT label_rules_a6_array CHECK (jsonb_typeof(a6_terms) = 'array' AND jsonb_array_length(a6_terms) <= 100)
);
-- Limites também aplicados no servidor; entradas nunca podem conter objetos,
-- valores numéricos ou strings enormes.
CREATE OR REPLACE FUNCTION public.validate_campaign_label_terms(p_terms jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_typeof(p_terms) = 'array'
    AND jsonb_array_length(p_terms) <= 100
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_terms) AS element(value)
      WHERE jsonb_typeof(element.value) <> 'string' OR length(trim(element.value #>> '{}')) < 2
        OR length(element.value #>> '{}') > 80
    );
$$;
ALTER TABLE public.campaign_label_format_rules
  ADD CONSTRAINT label_rules_terms_safe CHECK (
    public.validate_campaign_label_terms(a5_terms) AND public.validate_campaign_label_terms(a6_terms)
  );
ALTER TABLE public.campaign_label_format_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_label_format_rules FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_label_format_rules FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.campaign_label_format_rules TO authenticated;
CREATE POLICY campaign_label_rules_read ON public.campaign_label_format_rules
FOR SELECT TO authenticated USING (public.platform_permission(organization_id, 'campaigns.read'));
CREATE POLICY campaign_label_rules_insert ON public.campaign_label_format_rules
FOR INSERT TO authenticated WITH CHECK (public.platform_permission(organization_id, 'campaigns.manage'));
CREATE POLICY campaign_label_rules_update ON public.campaign_label_format_rules
FOR UPDATE TO authenticated USING (public.platform_permission(organization_id, 'campaigns.manage'))
WITH CHECK (public.platform_permission(organization_id, 'campaigns.manage'));
COMMIT;

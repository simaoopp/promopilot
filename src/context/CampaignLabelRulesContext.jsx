import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePermissions } from "./PermissionContext";
import { supabase } from "../lib/supabase";
import { DEFAULT_LABEL_RULES, validarTermosEtiquetas } from "../shared/campaign-label/formatRules";

const RulesContext = createContext(null);
const TABLE = "campaign_label_format_rules";

export function CampaignLabelRulesProvider({ children }) {
  const { context, can } = usePermissions();
  const organizationId = context?.organizationId || null;
  const [loaded, setLoaded] = useState({ organizationId: null, rules: DEFAULT_LABEL_RULES, loading: false, error: "" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!organizationId) {
      setLoaded({ organizationId: null, rules: DEFAULT_LABEL_RULES, loading: false, error: "" });
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setLoaded({ organizationId, rules: DEFAULT_LABEL_RULES, loading: true, error: "" });
    (async () => {
      const { data, error } = await supabase.from(TABLE).select("a5_terms,a6_terms").eq("organization_id", organizationId).abortSignal(controller.signal).maybeSingle();
      clearTimeout(timeout);
      if (!active) return;
      if (error) {
        setLoaded({ organizationId, rules: DEFAULT_LABEL_RULES, loading: false, error: "As regras personalizadas não foram carregadas. Confirma o Supabase e a migração antes de imprimir." });
      } else {
        setLoaded({ organizationId, rules: { a5: Array.isArray(data?.a5_terms) ? data.a5_terms : [], a6: Array.isArray(data?.a6_terms) ? data.a6_terms : [] }, loading: false, error: "" });
      }
    })().catch(() => {
      clearTimeout(timeout);
      if (active) setLoaded({ organizationId, rules: DEFAULT_LABEL_RULES, loading: false, error: "Falha de ligação às regras de impressão." });
    });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [organizationId, revision]);

  const refresh = useCallback(() => setRevision(n => n + 1), []);
  const save = useCallback(async (rules) => {
    if (!organizationId || !can("campaigns.manage")) throw new Error("Sem permissão de administração desta organização.");
    const a5 = validarTermosEtiquetas(rules?.a5 || []);
    const a6 = validarTermosEtiquetas(rules?.a6 || []);
    const { error } = await supabase.from(TABLE).upsert({
      organization_id: organizationId, a5_terms: a5, a6_terms: a6,
    }, { onConflict: "organization_id" });
    if (error) throw new Error("Não foi possível guardar as regras. Verifica a migração SQL e as permissões da organização.");
    refresh();
  }, [organizationId, can, refresh]);

  const value = useMemo(() => {
    const current = loaded.organizationId === organizationId ? loaded : { rules: DEFAULT_LABEL_RULES, loading: !!organizationId, error: "" };
    return { ...current, organizationId, save, refresh, canManage: can("campaigns.manage") };
  }, [loaded, organizationId, save, refresh, can]);
  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>;
}

export function useCampaignLabelRules() {
  return useContext(RulesContext) || { rules: DEFAULT_LABEL_RULES, loading: false, error: "", canManage: false };
}

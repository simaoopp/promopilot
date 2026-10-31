import { supabase } from "../../../lib/supabase";
import { currentOrganizationId, getAccessCacheScope } from "../../../services/platformService";

export async function createImportApi(store) {
  const organizationId = await currentOrganizationId();
  const scope = getAccessCacheScope();
  return async (action, payload = {}) => {
    if (getAccessCacheScope() !== scope) throw new Error("O contexto de acesso mudou. Abra novamente o importador.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const { data, error } = await supabase.rpc("campaign_price_import", {
        p_organization_id: organizationId, p_store: store, p_action: action, p_payload: payload,
      }).abortSignal(controller.signal);
      if (getAccessCacheScope() !== scope) throw new Error("O contexto de acesso mudou. Abra novamente o importador.");
      if (error) {
        const messages = {
          "42501": "Sem permissão para importar nesta organização e loja.",
          "40001": "Esta importação já foi confirmada com outros dados. Inicie uma nova importação.",
          "23505": "Já existe um modelo com esse nome. Escolha outro nome ou atualize o modelo existente.",
          "22023": "Existem dados inválidos. Reveja as linhas e as colunas selecionadas.",
          "PGRST202": "O importador ainda não foi instalado na base de dados. Contacte o administrador.",
        };
        throw new Error(messages[error.code] || "Não foi possível concluir o pedido. Pode repetir sem duplicar a importação.");
      }
      if (!data || typeof data !== "object") throw new Error("Resposta de importação inválida.");
      return data;
    } finally { clearTimeout(timer); }
  };
}

import React, { useState } from "react";
import "../features/platform/ceo.css";
import { Link } from "react-router-dom";
import AppLoading from "./AppLoading";
import { usePermissions } from "../context/PermissionContext";
import { selectAccess } from "../services/platformService";
import { classifyAuthError } from "../utils/authErrors";

export default function FeatureRoute({ page, permission, ceo = false, children }) {
  const { context, loading, error, status, refresh, can, hasPage } = usePermissions();
  const [switching, setSwitching] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  async function chooseOrganization(event) {
    const id = event.target.value;
    if (!id || switching) return;
    setSwitching(true); setSelectionError("");
    try { await selectAccess(id, null); window.location.reload(); }
    catch (failure) { setSelectionError(classifyAuthError(failure).message); setSwitching(false); }
  }
  if (loading) return <AppLoading message="A verificar permissões…" />;
  if (error) return <main className="pp-access-state" role="alert">
    <span className="pp-kicker">Acesso</span>
    <h1>{status === "permission_error" ? "Acesso à organização não autorizado" : "Não foi possível verificar o acesso"}</h1>
    <p>{error}</p><button className="primary" type="button" onClick={refresh}>Tentar novamente</button>
  </main>;
  const allowed = ceo ? context?.platformAdmin === true : (!page || hasPage(page)) && (!permission || can(permission));
  if (!allowed) return <main className="pp-access-state" role="alert">
    <span className="pp-kicker">Acesso restrito</span>
    <h1>{!context?.organizationId && !ceo ? "A conta não tem uma organização selecionada" : "Esta área não está disponível para a sua conta"}</h1>
    <p>A tua conta está autenticada. Confirma a organização selecionada ou contacta o responsável pelos acessos.</p>
    {!!context?.organizations?.length && <label>Organização
      <select value={context.organizationId || ""} disabled={switching} onChange={chooseOrganization}>
        <option value="">Selecionar organização</option>
        {context.organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </select>
    </label>}
    {selectionError && <p>{selectionError}</p>}
    {context?.platform?.support_email && <p><a href={`mailto:${context.platform.support_email}`}>{context.platform.support_email}</a></p>}
    <Link to={context?.platformAdmin ? "/ceo" : context?.pages?.[0]?.path || "/"}>Ir para uma área disponível</Link>
  </main>;
  return children;
}

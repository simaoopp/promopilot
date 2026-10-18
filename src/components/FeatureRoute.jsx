import React from "react";
import "../features/platform/ceo.css";
import { Link } from "react-router-dom";
import AppLoading from "./AppLoading";
import { usePermissions } from "../context/PermissionContext";

export default function FeatureRoute({ page, permission, ceo = false, children }) {
  const { context, loading, error, refresh, can, hasPage } = usePermissions();
  if (loading) return <AppLoading message="A verificar permissões…" />;
  if (error) return <main className="pp-access-state" role="alert"><span className="pp-kicker">Acesso</span><h1>Não foi possível verificar o acesso</h1><p>{error}</p><button className="primary" type="button" onClick={refresh}>Tentar novamente</button></main>;
  const allowed = ceo ? context?.platformAdmin === true : (!page || hasPage(page)) && (!permission || can(permission));
  if (!allowed) return <main className="pp-access-state"><span className="pp-kicker">Acesso restrito</span><h1>Esta área não está disponível para a sua conta</h1><p>Confirme a organização selecionada ou contacte o responsável pelos acessos.</p>{context?.platform?.support_email && <p><a href={`mailto:${context.platform.support_email}`}>{context.platform.support_email}</a></p>}<Link to={context?.platformAdmin ? "/ceo" : context?.pages?.[0]?.path || "/"}>Ir para uma área disponível</Link></main>;
  return children;
}

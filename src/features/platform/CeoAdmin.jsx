import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import { usePermissions } from "../../context/PermissionContext";
import { ceoChange } from "../../services/platformService";
import { useCeoData } from "./useCeoData";
import "./ceo.css";

const ROLES = ["owner", "admin", "manager", "store_user", "viewer", "support"];
const ROLE_NAMES = { owner: "Proprietário", admin: "Administrador", manager: "Gerente", store_user: "Colaborador", viewer: "Consulta", support: "Suporte" };
const STATUS_NAMES = { active: "Ativa", trialing: "Em avaliação", past_due: "Pagamento pendente", suspended: "Suspensa", cancelled: "Cancelada", disabled: "Desativada", invited: "Convidado", manual: "Manual", unassigned: "Sem organização" };
const NAV = [["", "Visão geral"], ["organizations", "Organizações"], ["stores", "Estabelecimentos"], ["users", "Utilizadores"], ["modules", "Módulos e páginas"], ["permissions", "Permissões"], ["plans", "Planos e subscrições"], ["audit", "Auditoria"], ["settings", "Configurações"]];
const date = value => value ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const option = value => ({ value, label: STATUS_NAMES[value] || ROLE_NAMES[value] || value });
const field = (key, label, extra = {}) => ({ key, label, ...extra });

function Badge({ status }) { return <span className={`ceo-badge ${["active", "available", "manual"].includes(status) ? "is-active" : ""}`}>{STATUS_NAMES[status] || status || "Sem plano"}</span>; }
function State({ loading, error, empty, children }) {
  if (loading) return <div className="ceo-state" role="status"><span className="ceo-spinner" /> A carregar dados…</div>;
  if (error) return <div className="ceo-state ceo-error" role="alert">{error}</div>;
  if (empty) return <div className="ceo-state">Ainda não existem registos para esta seleção.</div>;
  return children;
}
function Title({ eyebrow = "Administração", title, children }) { return <header className="ceo-heading"><div><span className="pp-kicker">{eyebrow}</span><h1>{title}</h1></div>{children}</header>; }
function Table({ columns, rows, rowKey = "id" }) {
  return <div className="ceo-table-scroll"><table className="ceo-table"><thead><tr>{columns.map(column => <th key={column.label} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row[rowKey] || index}>{columns.map(column => <td key={column.label}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
}
function Pager({ data, offset, setOffset }) {
  if (!data) return null;
  return <div className="ceo-pager"><span>{data.total ? `${offset + 1}–${Math.min(offset + 50, data.total)} de ${data.total}` : "0 registos"}</span><button type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Anterior</button><button type="button" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>Seguinte</button></div>;
}
function Search({ value, onChange, label = "Pesquisar" }) {
  const [input, setInput] = useState(value || "");
  return <form className="ceo-search" onSubmit={event => { event.preventDefault(); onChange(input.trim()); }}><label><span className="sr-only">{label}</span><input type="search" placeholder={label} value={input} onChange={event => setInput(event.target.value)} maxLength={160} /></label><button type="submit">Pesquisar</button></form>;
}
function Toggle({ checked, label, disabled, onChange }) {
  return <button className="ceo-switch" type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span aria-hidden="true" /></button>;
}

function StoreSelect({ organizationId, value, disabled, onChange }) {
  const [query, setQuery] = useState(""); const [offset, setOffset] = useState(0);
  const state = useCeoData("stores", { organizationId, query, offset });
  return <div><input type="search" aria-label="Procurar estabelecimento" placeholder="Procurar estabelecimento" value={query} disabled={disabled} onChange={event => { setQuery(event.target.value); setOffset(0); }} />
    <select aria-label="Estabelecimento do utilizador" value={value || ""} disabled={disabled || state.loading} onChange={event => onChange(event.target.value)}><option value="">Todas as lojas autorizadas</option>{value && !state.data?.items?.some(store => store.id === value) && <option value={value}>Manter estabelecimento atual</option>}{(state.data?.items || []).map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select>
    {state.error && <p role="alert">{state.error}</p>}<Pager data={state.data} offset={offset} setOffset={setOffset} /></div>;
}

function EditDialog({ config, onClose, onSave, busy }) {
  const dialog = useRef(null);
  const [values, setValues] = useState(config.initial || {});
  const [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current; const previous = document.activeElement;
    node.showModal();
    return () => { node.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  async function submit(event) {
    event.preventDefault(); setError("");
    try {
      const payload = { ...values };
      for (const f of config.fields) {
        if (f.type === "json") payload[f.key] = JSON.parse(payload[f.key] || "{}");
        if (f.type === "list") payload[f.key] = String(payload[f.key] || "").split(",").map(value => value.trim()).filter(Boolean);
        if (f.nullable && !payload[f.key]) payload[f.key] = null;
      }
      if (await onSave(config.entity, payload)) onClose();
    } catch (caught) { setError(caught instanceof SyntaxError ? "As configurações devem conter JSON válido." : caught.message); }
  }
  return <dialog ref={dialog} className="ceo-dialog" aria-labelledby="ceo-dialog-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <form onSubmit={submit}><header><h2 id="ceo-dialog-title">{config.title}</h2><button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}>×</button></header>
      {config.note && <p>{config.note}</p>}
      {config.fields.map(f => <label className="ceo-field" key={f.key}>{f.label}
        {f.resource === "stores" ? <StoreSelect organizationId={values.organization_id} value={values[f.key]} disabled={busy} onChange={value => setValues(current => ({ ...current, [f.key]: value }))} /> : f.options ? <select required={f.required !== false} value={values[f.key] ?? ""} disabled={busy || f.disabled} onChange={event => setValues(current => ({ ...current, [f.key]: event.target.value }))}><option value="">{f.emptyLabel || "Selecionar"}</option>{f.options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          : ["json", "textarea"].includes(f.type) ? <textarea rows={f.type === "json" ? 5 : 3} value={values[f.key] ?? ""} maxLength={8000} onChange={event => setValues(current => ({ ...current, [f.key]: event.target.value }))} disabled={busy} />
            : <input type={f.type === "list" ? "text" : f.type || "text"} required={f.required !== false} maxLength={f.maxLength || 254} value={values[f.key] ?? ""} disabled={busy || f.disabled} onChange={event => setValues(current => ({ ...current, [f.key]: event.target.value }))} />}
      </label>)}
      {error && <p className="ceo-error" role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="ceo-primary" type="submit" disabled={busy}>{busy ? "A guardar…" : "Guardar alterações"}</button></footer>
    </form>
  </dialog>;
}

function OrganizationPicker({ value, onChange, revision }) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const state = useCeoData("organizations", { query, offset, revision });
  return <div className="ceo-org-picker"><Search value={query} onChange={q => { setQuery(q); setOffset(0); }} label="Procurar organização" /><State {...state}>
    <label className="ceo-field">Organização<select value={value} onChange={event => onChange(event.target.value)}><option value="">Selecionar organização</option>{(state.data?.items || []).map(org => <option key={org.id} value={org.id}>{org.name} · {STATUS_NAMES[org.status] || org.status}</option>)}</select></label>
    <Pager data={state.data} offset={offset} setOffset={setOffset} />
  </State></div>;
}

function Dashboard({ revision }) {
  const state = useCeoData("dashboard", { revision });
  const data = state.data || {};
  return <><Title title="Uma visão de toda a plataforma" eyebrow="PromoPilot · CEO" /><State {...state}>
    <div className="ceo-metrics">{[["Organizações", data.organizations], ["Estabelecimentos", data.stores], ["Contas de utilizador", data.users], ["Ativas / em avaliação", data.active], ["Suspensas", data.suspended], ["POS autorizado", data.pos]].map(([name, value]) => <article className="ceo-metric" key={name}><span>{name}</span><strong>{value}</strong></article>)}</div>
    <div className="ceo-columns"><section className="ceo-card"><h2>Módulos autorizados</h2><p>Número de organizações com acesso efetivo. Não representa utilização.</p><div className="ceo-module-counts">{(data.modules || []).map(module => <div key={module.module_key}><span>{module.name}</span><strong>{module.organizations_enabled}</strong></div>)}</div></section>
      <section className="ceo-card"><h2>Distribuição por plano</h2>{(data.plans || []).map(plan => <div className="ceo-stat-line" key={plan.id}><span>{plan.name}</span><strong>{plan.subscriptions}</strong></div>)}<Link to="/ceo/plans">Gerir autorizações dos planos →</Link></section></div>
  </State></>;
}

function Organizations({ revision, edit }) {
  const [query, setQuery] = useState(""); const [offset, setOffset] = useState(0); const [status, setStatus] = useState("");
  const state = useCeoData("organizations", { query, status, offset, revision });
  return <><Title title="Organizações"><button className="ceo-primary" type="button" onClick={() => edit({ title: "Nova organização", entity: "organization", fields: [field("name", "Nome"), field("slug", "Identificador único", { maxLength: 80 })] })}>+ Criar organização</button></Title>
    <label className="ceo-field">Estado<select value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}><option value="">Todos</option>{["active","trialing","past_due","suspended","cancelled"].map(key => <option key={key} value={key}>{STATUS_NAMES[key]}</option>)}</select></label><Search value={query} onChange={q => { setQuery(q); setOffset(0); }} label="Pesquisar pelo nome" /><State {...state} empty={state.data?.items?.length === 0}><Table rows={state.data?.items || []} columns={[
      { label: "Organização", render: org => <><Link className="ceo-title-link" to={`/ceo/organizations/${org.id}`}>{org.name}</Link><small className="ceo-id">{org.id}</small></> },
      { label: "Estado", render: org => <Badge status={org.status} /> }, { label: "Lojas / pessoas", render: org => `${org.stores_count} / ${org.users_count}` },
      { label: "Plano", render: org => org.plan_name || "Sem plano" }, { label: "Módulos ativos", render: org => <span className="ceo-tags">{org.active_modules?.map(key => <span key={key}>{key}</span>)}</span> }, { label: "Criada", render: org => date(org.created_at) },
    ]} /></State><Pager data={state.data} offset={offset} setOffset={setOffset} /></>;
}

function OrganizationModules({ organizationId, revision, change, busy }) {
  const state = useCeoData("organization", { organizationId, revision });
  return <State {...state}><div className="ceo-module-grid">{(state.data?.modules || []).map(module => <article className="ceo-module-card" key={module.module_key}>
    <div className="ceo-module-title"><h3>{module.name}</h3><Toggle label={`Autorizar ${module.name}`} checked={module.effective} disabled={busy || module.status !== "available"} onChange={enabled => change("organization_feature", { organization_id: organizationId, module_key: module.module_key, enabled })} /></div>
    <p>{module.description}</p><span className="ceo-badge">{module.source === "migration" ? "Acesso preservado" : module.source === "ceo" ? "Decisão administrativa" : module.source === "plan" ? "Incluído no plano" : "Sem autorização"}</span>
    {!module.implemented && <small>Operações ainda não implementadas</small>}{module.dependencies?.length > 0 && <small>Requer: {module.dependencies.join(", ")}</small>}
    {module.override !== null && <button className="ceo-text-button" type="button" disabled={busy} onClick={() => change("organization_feature", { organization_id: organizationId, module_key: module.module_key, mode: "inherit" })}>Usar regras do plano</button>}
  </article>)}</div></State>;
}

function StoreList({ organizationId, revision, edit }) {
  const [query, setQuery] = useState(""); const [offset, setOffset] = useState(0);
  const state = useCeoData("stores", { organizationId, query, offset, revision });
  function open(store) {
    edit({ title: store ? "Editar estabelecimento" : "Novo estabelecimento", entity: "store",
      note: store ? "O nome mantém a ligação ao histórico de campanhas. Pode alterar o estado e as configurações." : "O código deve ser único dentro da organização.",
      initial: { organization_id: organizationId, ...store, store_id: store?.id, settings: JSON.stringify(store?.settings || {}, null, 2) },
      fields: [field("name", "Nome", { disabled: !!store }), field("email", "Email operacional da loja", { type: "email", required: false }), ...(!store ? [field("code", "Código")] : [field("status", "Estado", { options: ["active", "disabled"].map(option) }), field("settings", "Configurações (JSON)", { type: "json" })])] });
  }
  return <><div className="ceo-toolbar"><Search value={query} onChange={q => { setQuery(q); setOffset(0); }} label="Pesquisar estabelecimento" />{organizationId && <button type="button" className="ceo-primary" onClick={() => open()}>+ Estabelecimento</button>}</div><State {...state} empty={state.data?.items?.length === 0}><Table rows={state.data?.items || []} columns={[
    { label: "Estabelecimento", render: store => <><strong>{store.name}</strong><small>{store.code}</small></> }, { label: "Organização", render: store => <Link to={`/ceo/organizations/${store.organization_id}/stores`}>{store.organization_name}</Link> },
    { label: "Estado", render: store => <Badge status={store.status} /> }, { label: "Gestão", render: store => <button type="button" onClick={() => open(store)}>Editar</button> },
  ]} /></State><Pager data={state.data} offset={offset} setOffset={setOffset} /></>;
}

function UserList({ organizationId, revision, edit }) {
  const [query, setQuery] = useState(""); const [offset, setOffset] = useState(0);
  const state = useCeoData("users", { organizationId, query, offset, revision });
  // Membership edits are always scoped to a selected organization.
  const stores = useCeoData("stores", { organizationId, revision, enabled: !!organizationId });
  function open(user) {
    edit({ title: user ? "Editar acesso" : "Associar conta existente", entity: "membership", initial: { organization_id: organizationId, ...user, store_id: user?.store_id || "" },
      note: "A conta tem de existir no Supabase Auth. Desativar o acesso preserva o histórico.",
      fields: [...(!user ? [field("email", "Email da conta", { type: "email" })] : []), field("role", "Função", { options: ROLES.map(option) }), field("status", "Estado", { options: ["active", "invited", "disabled"].map(option) }),
        field("store_id", "Estabelecimento", { resource: "stores", required: false, nullable: true })] });
  }
  return <><div className="ceo-toolbar"><Search value={query} onChange={q => { setQuery(q); setOffset(0); }} label="Pesquisar email" />{organizationId && <button className="ceo-primary" type="button" disabled={stores.loading || !!stores.error} onClick={() => open()}>+ Associar utilizador</button>}</div>
    <State {...state} empty={state.data?.items?.length === 0}><Table rows={state.data?.items || []} columns={[
      { label: "Utilizador", render: user => <><strong>{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}</strong><small>{user.email}</small></> }, { label: "Organização", render: user => user.organization_id ? <Link to={`/ceo/organizations/${user.organization_id}/users`}>{user.organization_name}</Link> : "Sem organização" },
      { label: "Função / loja", render: user => <>{ROLE_NAMES[user.role] || user.role}<small>{user.store_name || "Todas as lojas autorizadas"}</small></> }, { label: "Estado", render: user => <Badge status={user.status} /> },
      { label: "Acesso", render: user => organizationId ? <button type="button" disabled={stores.loading} onClick={() => open(user)}>Editar</button> : <Link to={user.organization_id ? `/ceo/organizations/${user.organization_id}/users` : "/ceo/organizations"}>Gerir</Link> },
    ]} /></State><Pager data={state.data} offset={offset} setOffset={setOffset} /></>;
}

function Permissions({ organizationId, revision, change, busy }) {
  const state = useCeoData("permissions", { organizationId, revision });
  const catalog = useCeoData("catalog", { revision });
  const [target, setTarget] = useState("role"); const [role, setRole] = useState("store_user");
  const [userId, setUserId] = useState(""); const [storeId, setStoreId] = useState("");
  const [userQuery, setUserQuery] = useState(""); const [userOffset, setUserOffset] = useState(0);
  const [storeQuery, setStoreQuery] = useState(""); const [storeOffset, setStoreOffset] = useState(0);
  const users = useCeoData("users", { organizationId, revision, query: userQuery, offset: userOffset });
  const stores = useCeoData("stores", { organizationId, revision, query: storeQuery, offset: storeOffset });
  const data = state.data || {};
  const values = target === "store" ? catalog.data?.modules || [] : catalog.data?.permissions || [];
  return <><p className="ceo-note">Uma autorização individual nunca ultrapassa um módulo bloqueado na organização ou na loja. As recusas individuais têm prioridade.</p>
    <div className="ceo-filter-grid"><label className="ceo-field">Configurar<select value={target} onChange={event => setTarget(event.target.value)}><option value="role">Função</option><option value="user">Utilizador</option><option value="store">Estabelecimento</option></select></label>
      {target === "role" && <label className="ceo-field">Função<select value={role} onChange={event => setRole(event.target.value)}>{ROLES.map(key => <option key={key} value={key}>{ROLE_NAMES[key]}</option>)}</select></label>}
      {target === "user" && <div><Search value={userQuery} onChange={q => { setUserQuery(q); setUserOffset(0); setUserId(""); }} label="Procurar email" /><label className="ceo-field">Utilizador<select value={userId} onChange={event => setUserId(event.target.value)}><option value="">Selecionar utilizador</option>{(users.data?.items || []).map(user => <option key={user.user_id} value={user.user_id}>{user.email}</option>)}</select></label><Pager data={users.data} offset={userOffset} setOffset={setUserOffset} /></div>}
      {target !== "role" && <div><Search value={storeQuery} onChange={q => { setStoreQuery(q); setStoreOffset(0); setStoreId(""); }} label="Procurar loja" /><label className="ceo-field">Estabelecimento<select value={storeId} onChange={event => setStoreId(event.target.value)}><option value="">{target === "user" ? "Todas as lojas autorizadas" : "Selecionar loja"}</option>{(stores.data?.items || []).map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><Pager data={stores.data} offset={storeOffset} setOffset={setStoreOffset} /></div>}
    </div><State loading={state.loading || catalog.loading} error={state.error || catalog.error || users.error || stores.error}>
      <Table rowKey={target === "store" ? "module_key" : "permission_key"} rows={values} columns={[
        { label: target === "store" ? "Módulo" : "Permissão", render: item => <><strong>{item.name || item.description || item.permission_key}</strong><small className="ceo-id">{item.permission_key || item.module_key}</small></> },
        { label: "Regra", render: item => {
          const rule = target === "role" ? data.roles?.find(row => row.role === role && row.permission_key === item.permission_key)
            : target === "user" ? data.users?.find(row => row.user_id === userId && (row.store_id || "") === storeId && row.permission_key === item.permission_key)
              : data.stores?.find(row => row.store_id === storeId && row.module_key === item.module_key);
          const value = rule ? String(target === "store" ? rule.enabled : rule.allowed) : "inherit";
          return <select aria-label={`Regra ${item.permission_key || item.module_key}`} value={target === "role" && value === "inherit" ? "false" : value} disabled={busy || (target === "user" && !userId) || (target === "store" && !storeId)} onChange={event => {
            const value = event.target.value;
            change(`${target}_permission` === "store_permission" ? "store_feature" : `${target}_permission`, {
              organization_id: organizationId, role, user_id: userId || null, store_id: storeId || null,
              permission_key: item.permission_key, module_key: item.module_key,
              ...(value === "inherit" ? { mode: "inherit" } : target === "store" ? { enabled: value === "true" } : { allowed: value === "true" }),
            });
          }}>{target !== "role" && <option value="inherit">Herdar {target === "store" ? "da organização" : "da função"}</option>}<option value="true">Permitir</option><option value="false">Bloquear</option></select>;
        } },
      ]} />
    </State></>;
}

function Audit({ organizationId, revision }) {
  const [offset, setOffset] = useState(0);
  const state = useCeoData("audit", { organizationId, offset, revision });
  return <><State {...state} empty={state.data?.items?.length === 0}><Table rows={state.data?.items || []} columns={[
    { label: "Data", render: entry => date(entry.created_at) }, { label: "Ação", render: entry => <><strong>{entry.entity_type}</strong><small>{entry.action}</small></> }, { label: "Responsável", render: entry => <span className="ceo-id">{entry.user_id || "Operação de servidor / migração"}</span> },
    { label: "Alteração", render: entry => <details><summary>Ver antes / depois</summary><div className="ceo-audit-values"><strong>Antes</strong><pre>{JSON.stringify(entry.before, null, 2)}</pre><strong>Depois</strong><pre>{JSON.stringify(entry.after, null, 2)}</pre></div></details> },
  ]} /></State><Pager data={state.data} offset={offset} setOffset={setOffset} /></>;
}

function Subscription({ organizationId, revision, edit }) {
  const state = useCeoData("organization", { organizationId, revision });
  const catalog = useCeoData("catalog", { revision });
  const sub = state.data?.subscription;
  return <State loading={state.loading || catalog.loading} error={state.error || catalog.error}><section className="ceo-card"><h2>{catalog.data?.plans?.find(plan => plan.id === sub?.plan_id)?.name || "Sem plano atribuído"}</h2><Badge status={sub?.status} /><p>Fornecedor: {sub?.provider || "Não configurado"}</p><p>As autorizações adicionais são geridas no separador Módulos.</p>
    {(!sub || sub.provider === "manual") ? <button type="button" onClick={() => edit({ title: "Associar plano manual", entity: "subscription", initial: { organization_id: organizationId, plan_id: sub?.plan_id || "" }, note: "Esta operação não efetua cobranças.", fields: [field("plan_id", "Plano", { options: (catalog.data?.plans || []).map(plan => ({ value: plan.id, label: plan.name })) })] })}>Alterar plano manual</button> : <p>A subscrição paga é gerida no respetivo fornecedor de faturação.</p>}
  </section><div className="ceo-tags">{state.data?.modules?.filter(module => module.effective).map(module => <span key={module.module_key}>{module.name} · {module.source === "plan" ? "plano" : "autorização administrativa"}</span>)}</div></State>;
}

function OrganizationDetails(props) {
  const { id, section = "general" } = useParams();
  const state = useCeoData("organization", { organizationId: id, revision: props.revision });
  const org = state.data?.organization;
  const sections = [["general", "Geral"], ["stores", "Lojas"], ["users", "Utilizadores"], ["modules", "Módulos"], ["permissions", "Permissões"], ["subscription", "Subscrição"], ["audit", "Auditoria"]];
  const tabs = { stores: StoreList, users: UserList, modules: OrganizationModules, permissions: Permissions, subscription: Subscription, audit: Audit };
  const Component = tabs[section];
  return <><Link className="ceo-back" to="/ceo/organizations">← Organizações</Link><State {...state} empty={!org}>
    <Title title={org?.name} eyebrow="Organização"><Badge status={org?.status} /></Title>
    <div className="ceo-tabs">{sections.map(([key, label]) => <NavLink key={key} to={`/ceo/organizations/${id}/${key}`} className={section === key ? "active" : ""}>{label}</NavLink>)}</div>
    {Component ? <Component key={`${id}-${section}`} {...props} organizationId={id} /> : <section className="ceo-card"><h2>Informações gerais</h2><dl className="ceo-facts"><div><dt>Identificador</dt><dd className="ceo-id">{org?.id}</dd></div><div><dt>Slug</dt><dd>{org?.slug}</dd></div><div><dt>Criada</dt><dd>{date(org?.created_at)}</dd></div></dl><button type="button" onClick={() => props.edit({ title: "Editar organização", entity: "organization", initial: { organization_id: id, name: org.name, status: org.status, settings: JSON.stringify(org.settings || {}, null, 2) }, fields: [field("name", "Nome"), field("status", "Estado", { options: ["active", "trialing", "past_due", "suspended", "cancelled"].map(option) }), field("settings", "Configurações (JSON)", { type: "json" })] })}>Editar organização</button></section>}
  </State></>;
}

function Modules({ revision, change, busy, edit }) {
  const state = useCeoData("catalog", { revision });
  function open(module) {
    edit({ title: module ? "Editar módulo" : "Registar módulo futuro", entity: "module", initial: { ...module, dependencies: module?.dependencies?.join(", ") || "", status: module?.status || "available" },
      note: "O registo define autorizações. Uma nova funcionalidade continua a exigir a implementação das suas operações.", fields: [field("module_key", "Chave técnica", { disabled: !!module, maxLength: 51 }), field("name", "Nome"), field("description", "Descrição", { type: "textarea", required: false }), field("dependencies", "Dependências (chaves separadas por vírgulas)", { type: "list", required: false }), field("status", "Disponibilidade", { options: [{ value: "available", label: "Disponível" }, { value: "disabled", label: "Desativado globalmente" }] })] });
  }
  return <><Title title="Módulos e páginas"><button type="button" className="ceo-primary" onClick={() => open()}>+ Registar módulo</button></Title><State {...state}>
    <div className="ceo-module-grid">{state.data?.modules?.map(module => <article className="ceo-module-card" key={module.module_key}><div className="ceo-module-title"><h2>{module.name}</h2><Badge status={module.status === "available" ? "active" : "disabled"} /></div><p>{module.description}</p><small className="ceo-id">{module.module_key}</small><small>{module.implemented ? "Implementado" : "Operações futuras"}{module.dependencies?.length ? ` · Requer ${module.dependencies.join(", ")}` : ""}</small><button type="button" onClick={() => open(module)}>Configurar</button></article>)}</div>
    <section className="ceo-card"><h2>Páginas da aplicação</h2><p>A disponibilidade da página acumula-se com as permissões do módulo.</p><Table rowKey="page_key" rows={state.data?.pages || []} columns={[
      { label: "Página", render: page => <>{page.name}<small>{page.path}</small></> }, { label: "Permissão", render: page => page.permission_key }, { label: "Disponível", render: page => <Toggle checked={page.visible} label={`Disponibilizar ${page.name}`} disabled={busy} onChange={visible => change("page", { page_key: page.page_key, visible })} /> },
    ]} /></section>
  </State></>;
}

function Plans(props) {
  const state = useCeoData("catalog", { revision: props.revision });
  const [planId, setPlanId] = useState(""); const [organizationId, setOrganizationId] = useState("");
  return <><Title title="Planos e subscrições" /><State {...state}><div className="ceo-plan-grid">{state.data?.plans?.map(plan => <button type="button" key={plan.id} className={`ceo-plan ${planId === plan.id ? "selected" : ""}`} aria-pressed={planId === plan.id} onClick={() => setPlanId(plan.id)}><strong>{plan.name}</strong><span>{plan.status || "Plano registado"}</span><span>{plan.price_monthly_cents != null ? new Intl.NumberFormat("pt-PT", { style: "currency", currency: plan.currency || "EUR" }).format(plan.price_monthly_cents / 100) : "Preço não definido"}</span></button>)}</div>
    {planId && <section className="ceo-card"><h2>Módulos incluídos no plano</h2><p>Altera a autorização herdada. As exceções administrativas das organizações têm prioridade. Os preços não são alterados.</p><Table rowKey="module_key" rows={state.data?.modules || []} columns={[
      { label: "Módulo", render: module => module.name }, { label: "Incluído", render: module => <Toggle checked={state.data?.plan_features?.some(row => row.plan_id === planId && row.module_key === module.module_key && row.enabled) || false} label={`Incluir ${module.name}`} disabled={props.busy} onChange={enabled => props.change("plan_feature", { plan_id: planId, module_key: module.module_key, enabled })} /> },
    ]} /></section>}
  </State><h2>Subscrição de uma organização</h2><OrganizationPicker value={organizationId} onChange={setOrganizationId} revision={props.revision} />{organizationId && <Subscription {...props} organizationId={organizationId} />}</>;
}

function Settings(props) {
  const state = useCeoData("settings", { revision: props.revision });
  const { context } = usePermissions();
  const settings = state.data?.settings;
  return <><Title title="Configurações da plataforma" /><State {...state}><section className="ceo-card"><h2>{settings?.display_name}</h2><p>{settings?.support_email}</p><button type="button" onClick={() => props.edit({ title: "Configurações gerais", entity: "settings", initial: settings, fields: [field("display_name", "Nome da plataforma"), field("support_email", "Email de suporte", { type: "email" })] })}>Editar</button></section>
    <section className="ceo-card"><div className="ceo-toolbar"><h2>Administradores globais</h2>{context?.platformRole === "ceo" && <button type="button" onClick={() => props.edit({ title: "Gerir acesso global", entity: "platform_admin", note: "Apenas uma conta existente e verificada. Não pode alterar o seu próprio acesso.", fields: [field("user_id", "ID da conta verificada (Supabase Auth)"), field("role", "Função global", { options: [{ value: "ceo", label: "CEO" }, { value: "admin", label: "Administrador da plataforma" }] }), field("status", "Estado", { options: ["active", "disabled"].map(option) })] })}>Gerir acesso global</button>}</div><Table rowKey="user_id" rows={state.data?.admins || []} columns={[
      { label: "Conta", render: admin => <>{admin.email}<small className="ceo-id">{admin.user_id}</small></> }, { label: "Função", render: admin => admin.role }, { label: "Estado", render: admin => <Badge status={admin.status} /> },
    ]} /></section><section className="ceo-card"><h2>Referência da migração</h2><p>Snapshot capturado: {date(state.data?.snapshot?.captured_at)}</p><small className="ceo-id">Expert: {state.data?.snapshot?.expert_id || "Sem referência"}</small><p>A comparação do snapshot e os testes em produção são efetuados através do procedimento de publicação documentado.</p></section>
  </State></>;
}

function ScopedPermissions(props) {
  const [organizationId, setOrganizationId] = useState("");
  return <><Title title="Permissões" /><OrganizationPicker value={organizationId} onChange={setOrganizationId} revision={props.revision} />{organizationId && <Permissions key={organizationId} {...props} organizationId={organizationId} />}</>;
}

export default function CeoAdmin() {
  const [revision, setRevision] = useState(0); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [notice, setNotice] = useState(null); const [dialog, setDialog] = useState(null);
  const { refresh } = usePermissions();
  async function change(entity, data, throwError = false) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setNotice(null);
    try {
      await ceoChange(entity, data); setRevision(value => value + 1); await refresh();
      setNotice({ text: "Alterações guardadas e registadas na auditoria.", error: false }); return true;
    } catch (error) {
      setNotice({ text: error.message, error: true }); if (throwError) throw error; return false;
    } finally { busyRef.current = false; setBusy(false); }
  }
  const props = { revision, busy, change, edit: setDialog };
  return <div className="ceo-layout"><aside className="ceo-nav"><div className="ceo-wordmark">CEO <span>Admin</span></div><p>Controlo da plataforma</p><nav aria-label="Administração CEO">{NAV.map(([path, label]) => <NavLink key={path} to={`/ceo${path ? `/${path}` : ""}`} end={!path}>{label}</NavLink>)}</nav><Link className="ceo-return" to="/Homepage">← Voltar à operação</Link></aside>
    <main className="ceo-main"><div className="ceo-topline"><span>Administração global</span><button type="button" disabled={busy} onClick={() => { setRevision(value => value + 1); refresh(); }}>Atualizar dados ↻</button></div>
      {notice && <div className={`ceo-notice ${notice.error ? "ceo-error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.text}<button type="button" aria-label="Fechar mensagem" onClick={() => setNotice(null)}>×</button></div>}
      <Routes><Route index element={<Dashboard {...props} />} /><Route path="organizations" element={<Organizations {...props} />} /><Route path="organizations/:id" element={<OrganizationDetails {...props} />} /><Route path="organizations/:id/:section" element={<OrganizationDetails {...props} />} />
        <Route path="stores" element={<><Title title="Estabelecimentos" /><StoreList {...props} /></>} /><Route path="users" element={<><Title title="Utilizadores" /><UserList {...props} /></>} /><Route path="modules" element={<Modules {...props} />} /><Route path="permissions" element={<ScopedPermissions {...props} />} /><Route path="plans" element={<Plans {...props} />} /><Route path="audit" element={<><Title title="Auditoria" /><Audit {...props} /></>} /><Route path="settings" element={<Settings {...props} />} /><Route path="*" element={<Navigate to="/ceo" replace />} /></Routes>
    </main>{dialog && <EditDialog config={dialog} busy={busy} onClose={() => setDialog(null)} onSave={(entity, data) => change(entity, data, true)} />}
  </div>;
}

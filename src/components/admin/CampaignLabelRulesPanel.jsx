import React, { useEffect, useMemo, useState } from "react";
import { useCampaignLabelRules } from "../../context/CampaignLabelRulesContext";
import { explicarFormatoAutomaticoEtiqueta, validarTermosEtiquetas } from "../../shared/campaign-label/formatRules";
import "./CampaignLabelRulesPanel.css";

const toLines = list => (Array.isArray(list) ? list : []).join("\n");
const fromLines = text => String(text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);

export default function CampaignLabelRulesPanel({ open, onClose }) {
  const { rules, loading, error, save, canManage, organizationId } = useCampaignLabelRules();
  const [a5, setA5] = useState("");
  const [a6, setA6] = useState("");
  const [example, setExample] = useState("SmartTV TCL 43 polegadas");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setA5(toLines(rules.a5)); setA6(toLines(rules.a6));
    setMessage(""); setFormError("");
  }, [open, rules, organizationId]);

  const preview = useMemo(() => explicarFormatoAutomaticoEtiqueta(example, {
    a5: fromLines(a5), a6: fromLines(a6),
  }), [example, a5, a6]);
  if (!open) return null;
  if (!canManage) return null;

  async function submit(event) {
    event.preventDefault(); setWorking(true); setMessage(""); setFormError("");
    try {
      const next = { a5: validarTermosEtiquetas(fromLines(a5)), a6: validarTermosEtiquetas(fromLines(a6)) };
      await save(next);
      setMessage("Regras guardadas para esta organização. As campanhas passam a utilizar a nova seleção.");
    } catch (cause) { setFormError(cause.message || "Não foi possível guardar."); }
    finally { setWorking(false); }
  }

  return <div className="label-rules-overlay no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="label-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="label-rules-title">
      <header className="label-rules-header"><div><small>Administração · Organização</small><h2 id="label-rules-title">Regras de etiquetas A5 / A6</h2></div><button type="button" onClick={onClose} aria-label="Fechar">✕</button></header>
      <p>O modo automático reconhece <strong>categorias completas</strong> (televisões, máquinas, frigoríficos, fogões, etc.), independentemente da marca, modelo ou dimensão. <strong>Tudo o resto é A6.</strong></p>
      <p>Adiciona aqui apenas <strong>novas palavras ou abreviaturas</strong>, uma por linha, sem alterar o código. As regras base A5 já estão incluídas e não precisam de ser repetidas.</p>
      {loading && <p role="status">A carregar as regras desta organização…</p>}
      {error && <p role="alert" className="label-rules-error">{error}</p>}
      <form onSubmit={submit}>
        <div className="label-rules-fields">
          <label><strong>Adicionar a A5</strong><span>Ex.: Frio industrial, Máquina especial</span><textarea rows={7} value={a5} onChange={e => setA5(e.target.value)} placeholder={"Frio industrial\nMáq. especial"}/></label>
          <label><strong>Exceções A6</strong><span>Expressões que devem permanecer A6 mesmo quando coincidem com A5.</span><textarea rows={7} value={a6} onChange={e => setA6(e.target.value)} placeholder={"Miniatura TV\nBrinquedo frigorífico"}/></label>
        </div>
        <div className="label-rules-preview"><label htmlFor="label-rules-example">Testar uma descrição antes de guardar</label><input id="label-rules-example" value={example} onChange={e => setExample(e.target.value)} placeholder="Descrição do artigo"/><strong>{preview.formato.toUpperCase()}</strong><span>{preview.motivo}</span></div>
        <p className="label-rules-note">As peças e acessórios continuam A6 por defeito. As exceções A6 têm prioridade sobre as expressões A5 personalizadas. As alterações aplicam-se a esta organização, não às outras.</p>
        {formError && <p role="alert" className="label-rules-error">{formError}</p>}
        {message && <p role="status" className="label-rules-success">{message}</p>}
        <footer><button type="button" onClick={onClose}>Fechar</button><button type="submit" disabled={working || loading || !!error || !organizationId}>{working ? "A guardar..." : "Guardar regras"}</button></footer>
      </form>
    </section>
  </div>;
}

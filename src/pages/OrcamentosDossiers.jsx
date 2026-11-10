import React, { useEffect, useMemo, useRef, useState } from "react";
import { extractQuoteDossier, generateQuoteDossierPdf } from "../services/quoteDossierService";

import { useAuth } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionContext";
import { dossierDraftScope, normalizeDossierDraft } from "../features/quote-dossiers/dossierDraftStore";
import useDossierDraft from "../features/quote-dossiers/useDossierDraft";
import DossierErrorBoundary from "../features/quote-dossiers/DossierErrorBoundary";
import { resizeDossierImage } from "../features/quote-dossiers/dossierImage";

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary);
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

function splitFeatures(value = "") {
  return String(value || "")
    .split("\n");
}

function joinFeatures(features = []) {
  return Array.isArray(features) ? features.join("\n") : String(features || "");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function safeFilename(value = "") {
  return String(value || "dossier-orcamento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "dossier-orcamento";
}

function Field({ label, children }) {
  return (
    <label className="quote-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function OrcamentosDossiers() {
  const { user } = useAuth();
  const { context } = usePermissions();
  const scope = dossierDraftScope(user?.id, context?.organizationId, context?.storeId);
  if (!scope) return <main className="quote-dossiers-page"><p role="alert">Seleciona uma organização autorizada para abrir o dossier.</p></main>;
  return <DossierErrorBoundary key={scope}><DossierEditor scope={scope} /></DossierErrorBoundary>;
}

function DossierEditor({ scope }) {
  const [file, setFile] = useState(null);
  const { draft, status: draftStatus, restored, update: updateDraft, clear: clearDraft } = useDossierDraft(scope);
  const { dossier, items } = draft;
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [imageLoading, setImageLoading] = useState({});
  const [confirmAction, setConfirmAction] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [generatedPdf, setGeneratedPdf] = useState(null);
  const [generatedFilename, setGeneratedFilename] = useState("dossier-orcamento.pdf");

  const fileInputRef = useRef(null);
  const alive = useRef(false), epoch = useRef(0), request = useRef(null), imageRequests = useRef(new Map());
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; request.current?.abort(); };
  }, []);
  function changed(updater) { setGeneratedPdf(null); updateDraft(updater); }
  function newDossier() {
    setConfirmAction("");
    epoch.current++; request.current?.abort(); imageRequests.current.clear();
    clearDraft(); setFile(null); setGeneratedPdf(null); setSuccess(""); setError("");
    setLoadingExtract(false); setLoadingGenerate(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const totalItems = useMemo(() => items.length, [items]);

  function updateDossierField(field, value) {
    changed(current => ({ ...current, dossier: { ...current.dossier, [field]: value } }));
  }

  function updateItem(index, field, value) {
    changed(current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }
  function updateItemFeatures(index, value) { updateItem(index, "features", splitFeatures(value)); }
  async function handleImageChange(index, imageFile) {
    if (!imageFile) return;
    const documentVersion = epoch.current, imageRequest = {};
    imageRequests.current.set(index, imageRequest);
    setImageLoading(current => ({ ...current, [index]: true }));
    const active = () => alive.current && documentVersion === epoch.current && imageRequests.current.get(index) === imageRequest;
    try {
      setError("");
      const imageDataUrl = await resizeDossierImage(imageFile);
      if (active()) updateItem(index, "imageDataUrl", imageDataUrl);
    } catch (imageError) {
      if (active()) setError(imageError?.message || "Erro ao carregar fotografia.");
    } finally {
      if (active()) setImageLoading(current => ({ ...current, [index]: false }));
    }
  }
  function handleImagePaste(index, event) {
    const entry = Array.from(event.clipboardData?.items || []).find(item => item.kind === "file" && item.type.startsWith("image/"));
    const imageFile = entry?.getAsFile() || Array.from(event.clipboardData?.files || []).find(file => file.type.startsWith("image/"));
    if (!imageFile) return; // Text/links keep their normal paste behavior.
    event.preventDefault();
    if (!loadingExtract && !loadingGenerate) handleImageChange(index, imageFile);
  }

  async function handleExtract(confirmed = false) {
    if (!file) {
      setError("Carrega primeiro o PDF do orçamento.");
      return;
    }

    if (dossier && confirmed !== true) { setConfirmAction("replace"); return; }
    setConfirmAction("");
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    const documentVersion = ++epoch.current;
    const active = () => alive.current && documentVersion === epoch.current && !controller.signal.aborted;
    try {
      setLoadingExtract(true);
      setError("");
      setSuccess("");
      setGeneratedPdf(null);

      if (file.size > 30 * 1024 * 1024) throw new Error("O PDF excede 30 MB. Reduz o tamanho do ficheiro.");
      const pdfBase64 = await fileToBase64(file);
      if (!active()) return;
      const result = await extractQuoteDossier({
        filename: file.name,
        pdfBase64,
      }, { signal: controller.signal });
      if (!active()) return;

      const extractedDossier = result?.dossier || {};
      const extractedItems = Array.isArray(extractedDossier.items) ? extractedDossier.items : [];

      const nextDraft = normalizeDossierDraft({ dossier: extractedDossier, items: extractedItems, filename: file.name });
      changed(nextDraft);
      setSuccess(`Orçamento extraído com ${extractedItems.length} equipamento(s). Revê os dados antes de gerar o PDF.`);
    } catch (extractError) {
      if (active()) setError(extractError?.message || "Erro ao extrair orçamento.");
    } finally {
      if (active()) setLoadingExtract(false);
    }
  }

  async function handleGenerate() {
    if (!dossier || !items.length) {
      setError("Extrai e revê o orçamento antes de gerar o PDF.");
      return;
    }

    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    const documentVersion = epoch.current;
    const active = () => alive.current && documentVersion === epoch.current && !controller.signal.aborted;
    try {
      setLoadingGenerate(true);
      setError("");
      setSuccess("");

      const blob = await generateQuoteDossierPdf({
        dossier,
        items,
      }, { signal: controller.signal });
      if (!active()) return;

      const filename = `${safeFilename(`dossier-${dossier.budgetNumber || dossier.customerName || "orcamento"}`)}.pdf`;

      setGeneratedPdf(blob);
      setGeneratedFilename(filename);
      setSuccess("Dossier PDF gerado com sucesso.");
      openBlob(blob);
    } catch (generateError) {
      if (active()) setError(generateError?.message || "Erro ao gerar PDF.");
    } finally {
      if (active()) setLoadingGenerate(false);
    }
  }

  function handleDownloadGenerated() {
    if (!generatedPdf) return;
    downloadBlob(generatedPdf, generatedFilename);
  }

  if (draftStatus === "loading") return <main className="quote-dossiers-page"><p role="status">A recuperar o rascunho…</p></main>;

  const busy = loadingExtract || loadingGenerate || Object.values(imageLoading).some(Boolean);
  return (
    <main className="quote-dossiers-page">
      <section className="quote-hero">
        <div>
          <p className="eyebrow">Orçamentos</p>
          <h1>Dossiers técnicos manuais</h1>
          <p>
            Carrega o PDF do orçamento, confirma os dados extraídos, adiciona manualmente fotografias, descrição e características, e gera o dossier final para entregar ao cliente.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          Escolher PDF
        </button>
      </section>

      <section className="quote-card">
        <div className="quote-upload-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={(event) => { setFile(event.target.files?.[0] || null); setConfirmAction(""); }}
          />

          <div className="quote-file-info">
            <strong>{file ? file.name : draft.filename || "Nenhum PDF selecionado"}</strong>
            <span>PDF original do orçamento Primavera/ORC.</span>
          </div>

          <button type="button" className="btn btn-primary" onClick={() => handleExtract()} disabled={!file || busy}>
            {loadingExtract ? "A extrair..." : "Extrair orçamento"}
          </button>
        </div>

        {dossier && <div className="quote-draft-status">
          <p role="status">{draftStatus === "memory" ? "Não foi possível guardar neste navegador. O rascunho está em memória; evita fechar ou atualizar esta página." : draftStatus === "saving" ? "A guardar rascunho…" : restored ? "Rascunho recuperado. Podes continuar de onde paraste." : "Rascunho guardado neste separador durante 24 h."}</p>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmAction("clear")} disabled={busy}>Novo dossier</button>
        </div>}
        {draftStatus === "clear_error" && <div className="quote-alert quote-alert-error" role="alert">
          <p>Não foi possível eliminar a cópia guardada. Ao atualizar a página, o rascunho anterior poderá reaparecer.</p>
          <button type="button" className="btn btn-secondary" onClick={clearDraft}>Repetir eliminação</button>
        </div>}
        {confirmAction && <div className="quote-confirm" role="alert">
          <p>{confirmAction === "clear" ? "Eliminar este rascunho e começar um novo dossier?" : "Substituir este rascunho pelos dados do PDF selecionado?"} As edições atuais serão removidas.</p>
          <div className="quote-confirm-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmAction("")}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={() => confirmAction === "clear" ? newDossier() : handleExtract(true)}>{confirmAction === "clear" ? "Eliminar rascunho" : "Substituir rascunho"}</button>
          </div>
        </div>}
        {error && <div role="alert" className="quote-alert quote-alert-error">{error}</div>}
        {success && <div className="quote-alert quote-alert-success">{success}</div>}
      </section>

      {dossier && (
        <>
          <fieldset className="quote-card quote-edit-fields" disabled={busy}>
            <div className="quote-section-header">
              <div>
                <p className="eyebrow">Resumo</p>
                <h2>Dados do orçamento</h2>
              </div>
              <span>{totalItems} equipamento(s)</span>
            </div>

            <div className="quote-grid">
              <Field label="N.º orçamento">
                <input value={dossier.budgetNumber || ""} onChange={(event) => updateDossierField("budgetNumber", event.target.value)} />
              </Field>

              <Field label="Cliente">
                <input value={dossier.customerName || ""} onChange={(event) => updateDossierField("customerName", event.target.value)} />
              </Field>

              <Field label="Data">
                <input value={dossier.date || ""} onChange={(event) => updateDossierField("date", event.target.value)} />
              </Field>

              <Field label="Total">
                <input value={dossier.total || ""} onChange={(event) => updateDossierField("total", event.target.value)} />
              </Field>
            </div>

            <Field label="Observações">
              <textarea
                rows={3}
                value={dossier.notes || ""}
                onChange={(event) => updateDossierField("notes", event.target.value)}
              />
            </Field>
          </fieldset>

          <fieldset className="quote-card quote-edit-fields" disabled={busy}>
            <div className="quote-section-header">
              <div>
                <p className="eyebrow">Equipamentos</p>
                <h2>Revisão antes de gerar</h2>
              </div>

              <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={busy || !items.length}>
                {loadingGenerate ? "A gerar PDF..." : "Gerar dossier PDF"}
              </button>
            </div>

            <div className="quote-items-list">
              {items.map((item, index) => (
                <article className="quote-item-card" key={`${item.articleCode || item.ean || "item"}-${index}`}>
                  <div className="quote-item-title">
                    <span>{index + 1}</span>
                    <div>
                      <h3>{[item.brand, item.reference].filter(Boolean).join(" ") || item.rawDescription}</h3>
                      <p>{item.articleCode || "Sem código"} · EAN {item.ean || "—"}</p>
                    </div>
                  </div>

                  <div className="quote-item-layout">
                    <div className="quote-image-uploader" onPaste={event => handleImagePaste(index, event)}>
                      <div className="quote-image-paste" role="group" tabIndex={busy ? -1 : 0} aria-label={`Fotografia do equipamento ${index + 1}. Foca esta área e cola com Ctrl+V ou Command+V.`}>
                      {item.imageDataUrl ? (
                        <img src={item.imageDataUrl} alt={item.reference || item.rawDescription} />
                      ) : (
                        <div className="quote-image-placeholder">Sem fotografia</div>
                      )}
                      <span className="quote-image-paste-hint" role="status">{imageLoading[index] ? "A preparar fotografia…" : "Clica aqui e cola a fotografia · Ctrl+V / ⌘V"}</span>
                      </div>

                      <label className="btn btn-secondary">
                        Carregar foto
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => handleImageChange(index, event.target.files?.[0])}
                        />
                      </label>
                    </div>

                    <div className="quote-item-fields">
                      <div className="quote-grid quote-grid-compact">
                        <Field label="Marca">
                          <input value={item.brand || ""} onChange={(event) => updateItem(index, "brand", event.target.value)} />
                        </Field>

                        <Field label="Referência">
                          <input value={item.reference || ""} onChange={(event) => updateItem(index, "reference", event.target.value)} />
                        </Field>

                        <Field label="Categoria">
                          <input value={item.category || ""} onChange={(event) => updateItem(index, "category", event.target.value)} />
                        </Field>

                        <Field label="Valor">
                          <input value={item.total || ""} onChange={(event) => updateItem(index, "total", event.target.value)} />
                        </Field>
                      </div>

                      <Field label="Descrição geral manual">
                        <textarea
                          rows={3}
                          value={item.technicalDescription || ""}
                          onChange={(event) => updateItem(index, "technicalDescription", event.target.value)}
                        />
                      </Field>

                      <Field label="Características manuais (uma por linha)">
                        <textarea
                          rows={6}
                          value={joinFeatures(item.features)}
                          onChange={(event) => updateItemFeatures(index, event.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="quote-actions-bottom">
              <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={busy || !items.length}>
                {loadingGenerate ? "A gerar PDF..." : "Gerar dossier PDF"}
              </button>

              {generatedPdf && (
                <button type="button" className="btn btn-secondary" onClick={handleDownloadGenerated}>
                  Descarregar último PDF
                </button>
              )}
            </div>
          </fieldset>
        </>
      )}
    </main>
  );
}

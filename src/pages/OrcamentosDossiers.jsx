import React, { useMemo, useRef, useState } from "react";
import { extractQuoteDossier, generateQuoteDossierPdf } from "../services/quoteDossierService";

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
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinFeatures(features = []) {
  return Array.isArray(features) ? features.join("\n") : String(features || "");
}

function resizeImageFile(file, { maxWidth = 900, maxHeight = 520, quality = 0.78 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = Math.round(image.width * ratio);
        const height = Math.round(image.height * ratio);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      image.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    reader.readAsDataURL(file);
  });
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
  const [file, setFile] = useState(null);
  const [dossier, setDossier] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [generatedPdf, setGeneratedPdf] = useState(null);
  const [generatedFilename, setGeneratedFilename] = useState("dossier-orcamento.pdf");

  const fileInputRef = useRef(null);

  const totalItems = useMemo(() => items.length, [items]);

  function updateDossierField(field, value) {
    setDossier((current) => ({
      ...(current || {}),
      [field]: value,
    }));
  }

  function updateItem(index, field, value) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  }

  function updateItemFeatures(index, value) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              features: splitFeatures(value),
            }
          : item,
      ),
    );
  }

  async function handleImageChange(index, imageFile) {
    if (!imageFile) return;

    try {
      setError("");
      const imageDataUrl = await resizeImageFile(imageFile);
      updateItem(index, "imageDataUrl", imageDataUrl);
    } catch (imageError) {
      setError(imageError?.message || "Erro ao carregar fotografia.");
    }
  }

  async function handleExtract() {
    if (!file) {
      setError("Carrega primeiro o PDF do orçamento.");
      return;
    }

    try {
      setLoadingExtract(true);
      setError("");
      setSuccess("");
      setGeneratedPdf(null);

      const pdfBase64 = await fileToBase64(file);
      const result = await extractQuoteDossier({
        filename: file.name,
        pdfBase64,
      });

      const extractedDossier = result?.dossier || {};
      const extractedItems = Array.isArray(extractedDossier.items) ? extractedDossier.items : [];

      setDossier({
        budgetNumber: extractedDossier.budgetNumber || "",
        customerName: extractedDossier.customerName || "",
        date: extractedDossier.date || "",
        total: extractedDossier.total || "",
        notes:
          extractedDossier.notes ||
          "Rever fotografias, descrição, características e medidas antes de entregar ao cliente.",
      });

      setItems(extractedItems);
      setSuccess(`Orçamento extraído com ${extractedItems.length} equipamento(s). Revê os dados antes de gerar o PDF.`);
    } catch (extractError) {
      setError(extractError?.message || "Erro ao extrair orçamento.");
    } finally {
      setLoadingExtract(false);
    }
  }

  async function handleGenerate() {
    if (!dossier || !items.length) {
      setError("Extrai e revê o orçamento antes de gerar o PDF.");
      return;
    }

    try {
      setLoadingGenerate(true);
      setError("");
      setSuccess("");

      const blob = await generateQuoteDossierPdf({
        dossier,
        items,
      });

      const filename = `${safeFilename(`dossier-${dossier.budgetNumber || dossier.customerName || "orcamento"}`)}.pdf`;

      setGeneratedPdf(blob);
      setGeneratedFilename(filename);
      setSuccess("Dossier PDF gerado com sucesso.");
      openBlob(blob);
    } catch (generateError) {
      setError(generateError?.message || "Erro ao gerar PDF.");
    } finally {
      setLoadingGenerate(false);
    }
  }

  function handleDownloadGenerated() {
    if (!generatedPdf) return;
    downloadBlob(generatedPdf, generatedFilename);
  }

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
          disabled={loadingExtract}
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
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />

          <div className="quote-file-info">
            <strong>{file ? file.name : "Nenhum PDF selecionado"}</strong>
            <span>PDF original do orçamento Primavera/ORC.</span>
          </div>

          <button type="button" className="btn btn-primary" onClick={handleExtract} disabled={!file || loadingExtract}>
            {loadingExtract ? "A extrair..." : "Extrair orçamento"}
          </button>
        </div>

        {error && <div className="quote-alert quote-alert-error">{error}</div>}
        {success && <div className="quote-alert quote-alert-success">{success}</div>}
      </section>

      {dossier && (
        <>
          <section className="quote-card">
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
          </section>

          <section className="quote-card">
            <div className="quote-section-header">
              <div>
                <p className="eyebrow">Equipamentos</p>
                <h2>Revisão antes de gerar</h2>
              </div>

              <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={loadingGenerate || !items.length}>
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
                    <div className="quote-image-uploader">
                      {item.imageDataUrl ? (
                        <img src={item.imageDataUrl} alt={item.reference || item.rawDescription} />
                      ) : (
                        <div className="quote-image-placeholder">Sem fotografia</div>
                      )}

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
              <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={loadingGenerate || !items.length}>
                {loadingGenerate ? "A gerar PDF..." : "Gerar dossier PDF"}
              </button>

              {generatedPdf && (
                <button type="button" className="btn btn-secondary" onClick={handleDownloadGenerated}>
                  Descarregar último PDF
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

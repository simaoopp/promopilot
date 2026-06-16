import pdfParse from "pdf-parse";

export function decodeBase64Pdf(base64Pdf = "") {
  const normalized = String(base64Pdf || "")
    .replace(/^data:application\/pdf;base64,/i, "")
    .replace(/\s+/g, "");

  if (!normalized) {
    throw new Error("PDF em falta.");
  }

  return Buffer.from(normalized, "base64");
}

export async function extractTextFromPdfBase64(base64Pdf = "") {
  const buffer = decodeBase64Pdf(base64Pdf);
  const parsed = await pdfParse(buffer);

  return {
    text: String(parsed?.text || "").trim(),
    pages: Number(parsed?.numpages || 0),
    info: parsed?.info || {},
  };
}

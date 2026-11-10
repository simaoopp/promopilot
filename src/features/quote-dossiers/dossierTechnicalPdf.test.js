import { normalizeTechnicalPdf, prepareTechnicalPdf, TECHNICAL_PDF_MAX_BYTES, formatTechnicalPdfSize } from "./dossierTechnicalPdf";
const content = "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n";
const file = (name = "Ficha.pdf", type = "application/pdf", bytes = content) => new File([bytes], name, { type });

test("PDF bytes and filename are preserved as a native Blob", async () => {
  const sheet = await prepareTechnicalPdf(file());
  expect(sheet.name).toBe("Ficha.pdf"); expect(sheet.blob).toBeInstanceOf(Blob);
  expect(sheet.blob.type).toBe("application/pdf"); expect(sheet.size).toBe(content.length);
  const reader = new FileReader(); const text = new Promise(resolve => { reader.onload = () => resolve(reader.result); });
  reader.readAsText(sheet.blob); expect(await text).toBe(content);
});
test.each(["", "application/octet-stream"])("a PDF with browser MIME '%s' is accepted by extension and signature", async type => {
  await expect(prepareTechnicalPdf(file("FICHA.PDF", type))).resolves.toMatchObject({ name: "FICHA.pdf" });
});
test("wrong MIME, fake extension, truncated and empty documents are rejected", async () => {
  await expect(prepareTechnicalPdf(file("a.pdf", "image/png"))).rejects.toThrow("ficheiro PDF");
  await expect(prepareTechnicalPdf(file("a.pdf", "application/pdf", "<html>not a PDF</html>"))).rejects.toThrow("cabeçalho");
  await expect(prepareTechnicalPdf(file("a.pdf", "application/pdf", "%PDF-1.7\ntruncated"))).rejects.toThrow("incompleto");
  await expect(prepareTechnicalPdf(file("a.pdf", "application/pdf", ""))).rejects.toThrow("vazia");
});
test("oversized files fail before starting FileReader", async () => {
  const value = file(); Object.defineProperty(value, "size", { value: TECHNICAL_PDF_MAX_BYTES + 1 });
  const read = jest.spyOn(FileReader.prototype, "readAsArrayBuffer");
  try { await expect(prepareTechnicalPdf(value)).rejects.toThrow("10 MB"); expect(read).not.toHaveBeenCalled(); }
  finally { read.mockRestore(); }
});
test("cancelled reads do not finish attaching a PDF", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(prepareTechnicalPdf(file(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});
test("stored attachments cannot inject external/blob URLs or change metadata to hide their size", () => {
  expect(normalizeTechnicalPdf({ name: "fake.pdf", url: "https://example.test/private" })).toBeNull();
  expect(normalizeTechnicalPdf({ blob: new Blob(["html"], { type: "text/html" }) })).toBeNull();
  const normalized = normalizeTechnicalPdf({ name: "../fi\u0000\u001f\u007f\u009f\u202echa.pdf", size: 1, blob: file(), token: "never-store" });
  expect(normalized.name).not.toMatch(/[\/\u202e]/); expect(normalized.size).toBe(content.length);
  expect(Array.from(normalized.name).some(character => character.codePointAt(0) < 32 || (character.codePointAt(0) >= 127 && character.codePointAt(0) <= 159))).toBe(false);
  expect(normalized.token).toBeUndefined();
});
test("small and large PDF sizes are readable", () => {
  expect(formatTechnicalPdfSize(100)).toBe("1 KB"); expect(formatTechnicalPdfSize(1024 * 1024)).toBe("1 MB");
});

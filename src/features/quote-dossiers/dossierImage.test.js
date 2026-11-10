import { resizeDossierImage } from "./dossierImage";
let image;
beforeEach(() => {
  jest.useFakeTimers();
  global.Image = jest.fn(() => { image = { width: 1200, height: 800 }; return image; });
  URL.createObjectURL = jest.fn(() => "blob:qa"); URL.revokeObjectURL = jest.fn();
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
test("invalid and oversized photos reject without allocating a canvas", async () => {
  await expect(resizeDossierImage({ type: "text/plain", size: 1 })).rejects.toThrow("PNG");
  await expect(resizeDossierImage({ type: "image/png", size: 13000000 })).rejects.toThrow("12 MB");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test("an unavailable canvas rejects the asynchronous image operation rather than throwing globally", async () => {
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const result = resizeDossierImage({ type: "image/png", size: 3 });
  const assertion = expect(result).rejects.toThrow("navegador");
  image.onload(); await assertion; expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:qa");
});
test("decoded photos are resized and temporary object URLs are released", async () => {
  const context = { fillRect: jest.fn(), drawImage: jest.fn() };
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,cGhvdG8=");
  const result = resizeDossierImage({ type: "image/png", size: 3 }); image.onload();
  await expect(result).resolves.toContain("data:image/jpeg;");
  expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 780, 520); expect(URL.revokeObjectURL).toHaveBeenCalled();
});
test("image timeouts settle the operation and release the preview", async () => {
  const result = resizeDossierImage({ type: "image/png", size: 3 }); const assertion = expect(result).rejects.toThrow("demasiado tempo");
  jest.advanceTimersByTime(20000); await assertion; expect(URL.revokeObjectURL).toHaveBeenCalled();
});

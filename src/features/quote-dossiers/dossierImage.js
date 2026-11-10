export function resizeDossierImage(file, { maxWidth = 900, maxHeight = 520, quality = 0.78 } = {}) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(?:png|jpeg|webp)$/i.test(file?.type || "")) { reject(new Error("Escolhe uma fotografia PNG, JPEG ou WebP.")); return; }
    if (file.size > 12 * 1024 * 1024) { reject(new Error("A fotografia excede 12 MB. Reduz o tamanho antes de carregar.")); return; }
    let image, url, timer, finished = false;
    const finish = (error, data) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (image) { image.onload = image.onerror = null; image.src = ""; }
      if (url) URL.revokeObjectURL(url);
      if (error) reject(error); else resolve(data);
    };
    try {
      url = URL.createObjectURL(file); image = new Image();
      timer = setTimeout(() => finish(new Error("A fotografia demorou demasiado tempo a abrir. Tenta outra imagem.")), 20000);
      image.onerror = () => finish(new Error("Não foi possível ler a fotografia. Tenta outra imagem."));
      image.onload = () => {
        try {
          if (!image.width || !image.height || image.width * image.height > 40000000) throw new Error("A fotografia é demasiado grande ou inválida. Reduz as dimensões.");
          const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Não foi possível preparar a fotografia neste navegador.");
          context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const data = canvas.toDataURL("image/jpeg", quality);
          if (!data.startsWith("data:image/jpeg;base64,")) throw new Error("Não foi possível preparar a fotografia.");
          finish(null, data);
        } catch (error) { finish(error); }
      };
      image.src = url;
    } catch { finish(new Error("Não foi possível abrir a fotografia neste navegador.")); }
  });
}

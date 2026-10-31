export const LIMITS = Object.freeze({
  bytes: 10 * 1024 * 1024,
  expandedBytes: 40 * 1024 * 1024,
  rows: 10000,
  columns: 80,
  cells: 200000,
  cellLength: 1000,
  sheets: 20,
  batch: 200,
});
export const FIELDS = {
  code: "Artigo / referência",
  barcode: "EAN / código de barras",
  description: "Descrição",
  promo: "PVP2 Agora",
  previous: "Preço anterior da tabela (comparação)",
  start: "Início",
  end: "Fim",
  information: "Informação / tipo de alteração",
};
export const STATES = {
  valid: "Promoção válida",
  missing: "Artigo não encontrado",
  ambiguous: "Código ambíguo",
  price: "Preço inválido",
  no_discount: "Sem desconto",
  duplicate: "Linha duplicada",
  ignored: "Linha ignorada",
  review: "Revisão necessária",
  blocked: "Atualização / reposição de PVP",
};
export function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// No floating point arithmetic until the final display boundary. Ambiguous 1.234
// is rejected in auto mode; the user can explicitly choose PT or international.
export function moneyCents(input, locale = "auto") {
  let value = String(input ?? "")
    .trim()
    .replace(/^(?:EUR|€)\s*|\s*(?:EUR|€)$/gi, "")
    .trim();
  if (!value || /[^\d.,\s\u00a0\u202f]/u.test(value)) return null;
  value = value.replace(/[\s\u00a0\u202f]/gu, "");
  let decimal = locale === "pt" ? "," : locale === "en" ? "." : "";
  if (!decimal) {
    if (value.includes(",") && value.includes("."))
      decimal = value.lastIndexOf(",") > value.lastIndexOf(".") ? "," : ".";
    else if (/[.,]/.test(value)) {
      if (!/^\d+[.,]\d{1,2}$/.test(value)) return null;
      decimal = value.includes(",") ? "," : ".";
    }
  }
  const group = decimal === "," ? "." : ",";
  const parts = decimal ? value.split(decimal) : [value];
  if (parts.length > 2 || (parts.length === 2 && !/^\d{1,2}$/.test(parts[1])))
    return null;
  const integer = parts[0];
  if (
    integer.includes(group) &&
    !new RegExp(`^\\d{1,3}(?:\\${group}\\d{3})+$`).test(integer)
  )
    return null;
  const digits = integer.split(group).join("");
  if (!/^\d{1,8}$/.test(digits)) return null;
  const cents = Number(digits) * 100 + Number((parts[1] || "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 999999999
    ? cents
    : null;
}
export function discount(before, now) {
  if (
    !Number.isSafeInteger(before) ||
    !Number.isSafeInteger(now) ||
    now <= 0 ||
    before <= now
  )
    return null;
  return {
    saving: before - now,
    basisPoints: Math.round(((before - now) * 10000) / before),
  };
}
export function dateIso(value, year) {
  const text = String(value || "").trim();
  let parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  let y, m, d;
  if (parts) [, y, m, d] = parts;
  else {
    parts = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(text);
    if (!parts) return "";
    [, d, m, y = String(year)] = parts;
  }
  if (Number(y) < 2000 || Number(y) > 2200) return "";
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() + 1 === Number(m) &&
    date.getUTCDate() === Number(d)
    ? date.toISOString().slice(0, 10)
    : "";
}
export function headersFor(sheet, config) {
  const width = sheet.rows.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  );
  return Array.from({ length: width }, (_, col) =>
    config.headerCount
      ? sheet.rows
          .slice(config.headerStart, config.headerStart + config.headerCount)
          .map((row) => row[col] || "")
          .filter(Boolean)
          .join(" · ")
      : `Coluna ${col + 1}`,
  );
}
const synonyms = {
  code: /^(artigo|codigo|referencia|ref\.?|sku|item code|reference)$/,
  barcode: /^(ean|barcode|codigo de barras|gtin)$/,
  description: /^(descricao|produto|designacao|description|product)$/,
  promo:
    /^(preco promocional|preco campanha|oferta|promo|promocao|campaign price|sale price)$/,
  previous: /^(preco anterior|antes|old price)$/,
  start: /^(inicio|data inicio|desde|start)$/,
  information: /^(info|informacao|observacoes|tipo de alteracao)$/,
  end: /^(fim|data fim|validade|ate|end)$/,
};
export function suggestMapping(headers, rows = []) {
  const mapping = {},
    confidence = {};
  for (const [field, pattern] of Object.entries(synonyms)) {
    const matches = headers.flatMap((header, index) =>
      fold(header)
        .split(" · ")
        .some((part) => pattern.test(part.replace(/\s*\(.*\)$/, "")))
        ? [index]
        : [],
    );
    if (matches.length === 1) {
      mapping[field] = matches[0];
      confidence[field] = "alta";
    }
  }
  if (mapping.code === undefined) {
    const candidates = headers.flatMap((_, col) => {
      const values = rows
        .slice(0, 20)
        .map((row) => String(row[col] || ""))
        .filter(Boolean);
      return values.length &&
        values.every((v) => /^\d{2}\.\d{3}\.\d{3}\.\d{5}$/.test(v))
        ? [col]
        : [];
    });
    if (candidates.length === 1) {
      mapping.code = candidates[0];
      confidence.code = "média";
    }
  }
  // Even a high confidence promo suggestion still requires an explicit checkbox.
  return { mapping, confidence };
}
export function validateConfig(config) {
  if (
    !config ||
    !Number.isInteger(config.dataStart) ||
    config.dataStart < 0 ||
    config.dataStart >= LIMITS.rows ||
    !Number.isInteger(config.headerStart) ||
    config.headerStart < 0 ||
    !Number.isInteger(config.headerCount) ||
    config.headerCount < 0 ||
    config.headerCount > 5 ||
    (config.headerCount > 0 &&
      config.dataStart < config.headerStart + config.headerCount) ||
    !["auto", "pt", "en"].includes(config.locale) ||
    config.priceConfirmed !== true
  )
    throw new Error(
      "Confirme os cabeçalhos, o formato dos preços e a coluna PVP2 Agora.",
    );
  const mapping = config.mapping || {};
  for (const [key, value] of Object.entries(mapping)) {
    if (
      !(key in FIELDS) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value >= LIMITS.columns
    )
      throw new Error("Mapeamento inválido.");
  }
  if (mapping.code === undefined && mapping.barcode === undefined)
    throw new Error("Associe Artigo ou EAN.");
  if (mapping.promo === undefined && config.manualPrice !== true)
    throw new Error("Associe PVP2 Agora ou escolha introdução manual.");
  const columns = Object.values(mapping);
  if (new Set(columns).size !== columns.length)
    throw new Error("Uma coluna não pode representar dois campos.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(config.startDate || "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(config.endDate || "") ||
    !dateIso(config.startDate) ||
    !dateIso(config.endDate) ||
    config.endDate < config.startDate
  )
    throw new Error("Defina um período válido para a campanha.");
  return config;
}
export function normalizeRow(raw, config, sourceIndex, flags = []) {
  const get = (key) => String(raw[config.mapping[key]] ?? "").trim();
  const blank = raw.every((cell) => !String(cell).trim());
  const code = get("code"),
    barcode = get("barcode");
  const promoInput = config.manualPrice ? "" : get("promo");
  const start =
    config.mapping.start === undefined
      ? config.startDate
      : dateIso(get("start"), config.startDate.slice(0, 4));
  const end =
    config.mapping.end === undefined
      ? config.endDate
      : dateIso(get("end"), config.endDate.slice(0, 4));
  return {
    raw,
    sourceIndex,
    code,
    barcode,
    description: get("description"),
    promoInput,
    promoCents: moneyCents(promoInput, config.locale),
    previousCents: moneyCents(get("previous"), config.locale),
    start,
    end,
    excluded: blank,
    review:
      flags.length > 0 || !start || !end || end < start || (!code && !barcode),
    flags,
  };
}
export function templateCompatible(template, sheet, type) {
  const config = template.config;
  return (
    config &&
    config.fileType === type &&
    config.sheet === sheet.name &&
    JSON.stringify(config.headers) === JSON.stringify(headersFor(sheet, config))
  );
}
export function campaignItems(rows, session, existing = []) {
  const codes = new Set(
    existing.map((item) => String(item.codigo ?? item.artigo)),
  );
  return rows.flatMap((row) => {
    if (row.state !== "valid" || codes.has(row.code)) return [];
    codes.add(row.code);
    return {
      id: `import-${session.id}-${row.row_index}`,
      article_id: row.article_id,
      codigo: row.code,
      descricao: row.description,
      ean: row.barcode || "",
      pn: "",
      antes: row.before_cents / 100,
      atual: row.promo_cents / 100,
      pv3: row.before_cents / 100,
      dataInicio: row.start_date,
      dataFim: row.end_date,
      dataInicioIso: row.start_date,
      dataFimIso: row.end_date,
      selecionado: true,
      formato_auto: "a6",
      tipo_registo: "campanha",
      alterado: "CAMPANHA",
      info: "Promoção",
      origemDados: {
        informacao: row.source_info || "",
        importSession: session.id,
      },
      importacao: {
        version: 1,
        sessionId: session.id,
        organizationId: session.organization_id,
        rowIndex: row.row_index,
        articleId: row.article_id,
        beforeCents: row.before_cents,
        nowCents: row.promo_cents,
        capturedAt: row.captured_at,
        source: session.source,
        config: session.config,
      },
    };
  });
}

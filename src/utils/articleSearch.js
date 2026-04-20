export function normalizeArticleText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeArticleCompact(value = "") {
  return normalizeArticleText(value).replace(/[^a-z0-9]/g, "");
}

function buildFieldVariants(value = "") {
  const text = normalizeArticleText(value);
  return {
    text,
    compact: text.replace(/[^a-z0-9]/g, ""),
  };
}

export function prepareArticleForSearch(item = {}, index = 0) {
  const artigo = buildFieldVariants(item.artigo || item.artigo_interno || "");
  const descricao = buildFieldVariants(item.descricao || item.descricao_oficial || "");
  const codigoBarras = buildFieldVariants(
    item.codigoBarras || item.codigo_barras || item.ean || "",
  );
  const marca = buildFieldVariants(item.marca || item.brand || "");
  const modelo = buildFieldVariants(item.modelo || "");

  const combinedText = [
    artigo.text,
    descricao.text,
    codigoBarras.text,
    marca.text,
    modelo.text,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const combinedCompact = [
    artigo.compact,
    descricao.compact,
    codigoBarras.compact,
    marca.compact,
    modelo.compact,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    ...item,
    _id:
      item._id ||
      [
        item.artigo || item.artigo_interno || "",
        item.armazem || "",
        item.codigoBarras || item.codigo_barras || "",
        index,
      ]
        .join("-")
        .replace(/^-+|-+$/g, ""),
    _searchIndex: {
      artigo,
      descricao,
      codigoBarras,
      marca,
      modelo,
      combinedText,
      combinedCompact,
    },
  };
}

export function prepareArticlesForSearch(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) =>
    prepareArticleForSearch(item, index),
  );
}

export function scorePreparedArticle(item = {}, rawQuery = "") {
  const search = item._searchIndex || prepareArticleForSearch(item)._searchIndex;
  const normalized = normalizeArticleText(rawQuery);
  const compact = normalizeArticleCompact(rawQuery);

  if (!normalized || normalized.length < 2) {
    return 0;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  let score = 0;

  const exactFields = [
    search.artigo.compact,
    search.codigoBarras.compact,
    search.modelo.compact,
  ];
  if (compact && exactFields.includes(compact)) {
    score += 1200;
  }

  const prefixChecks = [
    search.artigo.compact,
    search.codigoBarras.compact,
    search.modelo.compact,
    search.descricao.compact,
    search.marca.compact,
  ];

  if (compact && prefixChecks.some((field) => field && field.startsWith(compact))) {
    score += 700;
  }

  const textPrefixChecks = [
    search.artigo.text,
    search.codigoBarras.text,
    search.modelo.text,
    search.descricao.text,
    search.marca.text,
  ];

  if (normalized && textPrefixChecks.some((field) => field && field.startsWith(normalized))) {
    score += 420;
  }

  if (compact && search.combinedCompact.includes(compact)) {
    score += 280;
  }

  if (normalized && search.combinedText.includes(normalized)) {
    score += 190;
  }

  if (
    words.length > 1 &&
    words.every(
      (word) =>
        search.combinedText.includes(word) ||
        search.combinedCompact.includes(normalizeArticleCompact(word)),
    )
  ) {
    score += 160 + words.length * 18;
  }

  if (search.artigo.compact.includes(compact) && compact) score += 120;
  if (search.codigoBarras.compact.includes(compact) && compact) score += 120;
  if (search.modelo.compact.includes(compact) && compact) score += 100;
  if (search.descricao.compact.includes(compact) && compact) score += 90;
  if (search.marca.compact.includes(compact) && compact) score += 80;

  return score;
}

export function filterAndRankPreparedArticles(items = [], rawQuery = "", { limit = Infinity } = {}) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({ item, score: scorePreparedArticle(item, rawQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return String(left.item.artigo || "").localeCompare(
        String(right.item.artigo || ""),
        "pt",
      );
    })
    .slice(0, Number.isFinite(limit) ? limit : undefined)
    .map((entry) => entry.item);
}

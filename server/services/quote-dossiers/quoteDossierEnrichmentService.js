import { enrichItemFromVerifiedWeb } from "./quoteDossierWebEnrichmentService.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSET_DIR = path.join(__dirname, "assets");

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeEan(value = "") {
  return clean(value).replace(/\D+/g, "");
}

function uniqueLines(lines = []) {
  const seen = new Set();

  return lines
    .map((line) => clean(line))
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase();

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

function loadAssetDataUrl(filename = "") {
  if (!filename) return "";

  const assetPath = path.join(ASSET_DIR, filename);

  if (!fs.existsSync(assetPath)) return "";

  const ext = path.extname(assetPath).toLowerCase();
  const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const base64 = fs.readFileSync(assetPath).toString("base64");

  return `data:${mimeType};base64,${base64}`;
}

function normalizeTitle(value = "") {
  return clean(value)
    .replace(/\s+-\s+/g, " - ")
    .replace(/\bInd\.\b/gi, "Indução")
    .replace(/\bM[aá]q\.\b/gi, "Máquina")
    .replace(/\bLoi[çc]a\b/gi, "Loiça");
}

const CURATED_PRODUCTS = {
  "8059019105536": {
    title: "CANDY CA38FL7N20WXB",
    category: "Micro-ondas de encastre com grill",
    reference: "CA38FL7N20WXB",
    imageAsset: "8059019105536.png",
    description:
      "Micro-ondas de encastre Candy Wave 600, em acabamento preto, com capacidade de 20 litros e função micro-ondas com grill. É uma solução adequada para integração em mobiliário de cozinha, combinando aquecimento, descongelação e grelhador num equipamento compacto.",
    features: [
      "Capacidade total: 20 litros.",
      "Função micro-ondas + grelhador.",
      "Instalação de encastre e acabamento preto.",
      "Comandos eletrónicos e 5 níveis de potência.",
      "Programa de descongelação e bloqueio para crianças.",
      "Prato giratório incluído.",
      "Dimensões aproximadas: 595 x 337 x 385 mm (L x P x A).",
    ],
    sourceLabel: "Catálogo técnico validado internamente",
  },
  "8434778019674": {
    title: "TEKA HLB 8300 BK",
    category: "Forno multifunções de encastre",
    reference: "111000053 / HLB 8300 BK",
    imageAsset: "8434778019674.png",
    description:
      "Forno multifunções de encastre Teka HLB 8300, em vidro preto, indicado para utilização doméstica diária. A capacidade interior de 71 litros e as 6 funções de confeção permitem maior versatilidade na preparação de refeições.",
    features: [
      "Forno multifunções com 6 funções de confeção.",
      "Capacidade total: 71 litros.",
      "Sistema de limpeza HydroClean PRO.",
      "Classe de eficiência energética A+.",
      "Instalação de encastre.",
      "Acabamento em vidro preto.",
    ],
    sourceLabel: "Catálogo técnico validado internamente",
  },
  "8434778012491": {
    title: "TEKA IZC 64010 BK MSS",
    category: "Placa de indução",
    reference: "IZC 64010 BK MSS",
    imageAsset: "8434778012491.png",
    description:
      "Placa de indução Teka com 4 zonas de cozinhado e controlo Touch Control MultiSlider. Foi concebida para instalação de encastre em bancada, oferecendo rapidez de aquecimento, programação de tempo e funções de segurança.",
    features: [
      "Placa de indução com 4 zonas de cozinhado.",
      "Touch Control MultiSlider com bloqueio de segurança.",
      "Programador do tempo de cozinhado e detetor de recipiente.",
      "2 zonas de Ø 185 mm e 2 zonas de Ø 150 mm.",
      "Funções Power Plus, bloqueio infantil e indicador de calor residual.",
      "Potência máxima nominal: 7200 W.",
      "Dimensões aproximadas: 600 x 510 x 58 mm (L x P x A); encastre: 560 x 490 x 54 mm.",
    ],
    sourceLabel: "Catálogo técnico validado internamente",
  },
  "7333394034669": {
    title: "AEG FSB34707Z",
    category: "Máquina de lavar loiça de encastre",
    reference: "FSB34707Z",
    imageAsset: "7333394034669.png",
    description:
      "Máquina de lavar loiça AEG de encastre total, com 60 cm, pertencente à Série 5000 AirDry. A tecnologia AirDry favorece a secagem natural através da abertura automática da porta no final do ciclo.",
    features: [
      "Máquina de lavar loiça de 60 cm para encastre total.",
      "Capacidade indicada: 14 talheres.",
      "Sistema AirDry, com abertura automática da porta cerca de 10 cm na fase final de secagem.",
      "Sensor de carga/sujidade para ajustar o ciclo de lavagem às necessidades reais.",
      "Programa rápido de 30 minutos para lavagens mais curtas.",
      "Classe de eficiência energética C indicada para o modelo.",
      "Nível de ruído indicado por retalhistas verificados: 44 dB(A).",
    ],
    sourceLabel: "Catálogo técnico validado internamente",
  },
  "8806097163985": {
    title: "SAMSUNG RS70F64KETEF",
    category: "Frigorífico americano Side by Side",
    reference: "RS70F64KETEF",
    imageAsset: "8806097163985.png",
    description:
      "Frigorífico americano Samsung em inox, com elevada capacidade de armazenamento e integração SmartThings. É indicado para utilização familiar, oferecendo grande volume útil e funções de gestão inteligente de energia.",
    features: [
      "Capacidade total indicada: 640 litros.",
      "Volume aproximado: 420 litros no frigorífico e 220 litros no congelador.",
      "Tecnologia SpaceMax para maior capacidade interior sem aumento significativo das dimensões exteriores.",
      "Conetividade Wi-Fi e integração com SmartThings.",
      "Modo Energia IA para apoio à monitorização e gestão do consumo.",
      "Tecnologias de frio Samsung indicadas: All-Around Cooling, No Frost, Power Cool e Power Freeze.",
      "Dimensões aproximadas: 912 x 1784 x 726 mm (L x A x P).",
    ],
    sourceLabel: "Catálogo técnico validado internamente",
  },
  "8806097064466": {
    title: "SAMSUNG DV90DG52A0AEEP",
    category: "Máquina de secar roupa com bomba de calor",
    reference: "DV90DG52A0AEEP",
    imageAsset: "8806097064466.png",
    description:
      "Máquina de secar roupa Samsung de 9 kg, com tecnologia de bomba de calor, orientada para uma secagem eficiente e para o cuidado dos tecidos. Integra funções inteligentes através da aplicação SmartThings.",
    features: [
      "Capacidade de secagem: 9 kg.",
      "Tecnologia de bomba de calor.",
      "Função Hygiene Care para apoio à higienização da roupa.",
      "Conetividade Wi-Fi e controlo/monitorização através de SmartThings.",
      "Modo Energia IA para acompanhamento do consumo energético.",
      "Motor Digital Inverter, tambor Diamond, luz interior no tambor e bloqueio para crianças indicados por retalhistas verificados.",
      "Consumo indicado por retalhista verificado: 105 kWh por 100 ciclos.",
    ],
    sourceLabel: "Catálogo técnico validado internamente",
  },
};

function categoryFallback(description = "") {
  const text = String(description || "").toLowerCase();

  if (/micro|microondas|micro-ondas/.test(text)) return "Micro-ondas de encastre";
  if (/chamin[eé]|exaustor|camp[âa]nula/.test(text)) return "Chaminé/exaustor";
  if (/forno/.test(text)) return "Forno multifunções";
  if (/placa|ind[.\s]?/.test(text)) return "Placa de indução";
  if (/lavar.*loi[çc]a/.test(text)) return "Máquina de lavar loiça";
  if (/lava[-\s]?loi[çc]a/.test(text)) return "Lava-loiça";
  if (/torneira|misturadora/.test(text)) return "Torneira misturadora";
  if (/garrafeira|winechef|wine/.test(text)) return "Garrafeira";
  if (/side by side|french door|frigor/.test(text)) return "Frigorífico";
  if (/secar roupa/.test(text)) return "Máquina de secar roupa";

  return "Equipamento";
}

function genericFeatures(item = {}) {
  return uniqueLines([
    item.reference ? `Referência/modelo identificado: ${item.reference}.` : "",
    item.ean ? `EAN identificado: ${item.ean}.` : "",
    "Quantidade, preço e referência importados automaticamente do orçamento Primavera/ORC.",
    "Confirmar medidas, requisitos de instalação, ventilação, ligações elétricas/hidráulicas e compatibilidade com o mobiliário existente.",
  ]);
}

function genericDescription(item = {}) {
  const title = clean(item.title || item.description || item.rawDescription || item.reference || "equipamento");
  const category = clean(item.category || categoryFallback(title));

  return `${category} incluído no orçamento, identificado como ${title}. A informação técnica, fotografia, medidas e requisitos de instalação devem ser confirmados antes da encomenda definitiva e da instalação.`;
}

function mergeItemWithCurated(item = {}, product = null) {
  const ean = normalizeEan(item.ean);
  const title = normalizeTitle(product?.title || item.title || item.description || item.rawDescription || item.reference || "");
  const imageDataUrl = product?.imageAsset ? loadAssetDataUrl(product.imageAsset) : "";

  const merged = {
    ...item,
    ean,
    title,
    description: title || item.description || "",
    rawDescription: item.rawDescription || item.description || title,
    category: product?.category || item.category || categoryFallback(title),
    reference: product?.reference || item.reference || "",
    technicalDescription: product?.description || item.technicalDescription || genericDescription({ ...item, title }),
    features: uniqueLines(product?.features || item.features || genericFeatures({ ...item, title })),
    imageDataUrl: item.imageDataUrl || imageDataUrl,
    enrichment: {
      status: product ? "matched" : "generic",
      source: product ? "curated_catalog" : "generic_fallback",
      confidence: product ? 0.98 : 0.35,
      sourceLabel: product?.sourceLabel || "Informação gerada a partir do orçamento; requer validação",
    },
  };

  if (!merged.features.length) {
    merged.features = genericFeatures(merged);
  }

  return merged;
}

function itemMatchKeys(item = {}) {
  return [
    normalizeEan(item.ean),
    clean(item.reference).toLowerCase(),
    clean(item.title).toLowerCase(),
    clean(item.description).toLowerCase(),
    clean(item.rawDescription).toLowerCase(),
  ].filter(Boolean);
}

function findCuratedProduct(item = {}) {
  const keys = itemMatchKeys(item);

  for (const key of keys) {
    if (CURATED_PRODUCTS[key]) return CURATED_PRODUCTS[key];
  }

  for (const product of Object.values(CURATED_PRODUCTS)) {
    const haystack = [
      product.title,
      product.reference,
      product.category,
      product.description,
    ]
      .join(" ")
      .toLowerCase();

    if (keys.some((key) => key.length >= 5 && haystack.includes(key))) {
      return product;
    }
  }

  return null;
}

export async function enrichQuoteDossier(dossier = {}) {
  const items = Array.isArray(dossier.items) ? dossier.items : [];

  const enrichedItems = [];

  for (const item of items) {
    const curated = findCuratedProduct(item);

    if (curated) {
      enrichedItems.push(mergeItemWithCurated(item, curated));
      continue;
    }

    const webItem = await enrichItemFromVerifiedWeb(item);

    if (webItem) {
      enrichedItems.push(webItem);
      continue;
    }

    enrichedItems.push(mergeItemWithCurated(item, null));
  }

  const matchedCount = enrichedItems.filter((item) => item.enrichment?.status === "matched").length;

  return {
    ...dossier,
    items: enrichedItems,
    enrichmentSummary: {
      total: enrichedItems.length,
      matched: matchedCount,
      generic: enrichedItems.length - matchedCount,
      mode: String(process.env.QUOTE_DOSSIER_WEB_ENRICHMENT || "").toLowerCase() === "1" ? "curated_catalog_plus_verified_web_v2" : "curated_catalog_v1",
    },
  };
}

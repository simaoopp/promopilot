import * as XLSX from "xlsx";
import { parseFragment } from "parse5";
import { Inflate } from "pako";
import { LIMITS } from "./model.js";

const fail = (message) => {
  throw new Error(message);
};
function guardSheet(sheet) {
  if (sheet.rows.length > LIMITS.rows)
    fail(`Máximo de ${LIMITS.rows} linhas por folha. Divida a tabela.`);
  let count = 0;
  for (const row of sheet.rows) {
    if (row.length > LIMITS.columns)
      fail(`Máximo de ${LIMITS.columns} colunas.`);
    count += row.length;
    if (row.some((cell) => String(cell).length > LIMITS.cellLength))
      fail("Uma célula excede 1000 caracteres.");
  }
  if (count > LIMITS.cells) fail("Tabela demasiado grande. Divida a tabela.");
  return sheet;
}

export function delimited(text, separator) {
  const rows = [],
    row = [];
  let cell = "",
    quoted = false,
    ended = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
    ended = false;
    if (row.length > LIMITS.columns) fail("Demasiadas colunas.");
  };
  const pushRow = () => {
    pushCell();
    rows.push(row.splice(0));
    if (rows.length > LIMITS.rows) fail("Demasiadas linhas.");
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          ended = true;
        }
      } else cell += ch;
    } else if (ch === '"' && !cell && !ended) quoted = true;
    else if (ch === separator) pushCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else {
      if (ended && ch.trim()) fail("Aspas inválidas na tabela.");
      cell += ch;
    }
    if (cell.length > LIMITS.cellLength)
      fail("Uma célula excede 1000 caracteres.");
  }
  if (quoted) fail("A tabela contém aspas por fechar.");
  if (cell || row.length || ended) pushRow();
  return rows;
}
function textRows(text, type, separator) {
  if (type === "md" || /^\s*\|?.+\|.+\r?\n\s*\|?\s*:?-{3,}/m.test(text)) {
    return text
      .split(/\r?\n/)
      .filter((line) => line.includes("|"))
      .map((line) =>
        line
          .trim()
          .replace(/^\||\|$/g, "")
          .split(/(?<!\\)\|/)
          .map((cell) => cell.trim().replace(/\\\|/g, "|")),
      )
      .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
  }
  let delim = separator;
  if (!delim) {
    const candidates = ["\t", ";", ","]
      .map((value) => {
        try {
          const rows = delimited(text, value).slice(0, 15);
          const widths = rows.map((r) => r.length);
          const width = Math.max(0, ...widths);
          return {
            value,
            score:
              width > 1
                ? widths.filter((w) => w === width).length * 100 + width
                : 0,
          };
        } catch (error) {
          return { value, score: -1, error };
        }
      })
      .sort((a, b) => b.score - a.score);
    if (candidates[0].score < 0) throw candidates[0].error;
    delim = candidates[0].value;
  }
  return delimited(text.replace(/^\uFEFF/, ""), delim);
}
function htmlSheets(text) {
  // parse5 creates an inert syntax tree: scripts, CSS and remote images never run.
  const root = parseFragment(text),
    tables = [];
  const walk = (node, fn) => {
    fn(node);
    for (const child of node.childNodes || []) walk(child, fn);
  };
  walk(root, (node) => {
    if (node.tagName === "table") tables.push(node);
  });
  if (!tables.length) fail("Não foi encontrada uma tabela HTML.");
  return tables.map((table, index) => {
    const trs = [];
    const collect = (node) => {
      for (const child of node.childNodes || []) {
        if (child.tagName === "table") continue;
        if (child.tagName === "tr") trs.push(child);
        else collect(child);
      }
    };
    collect(table);
    if (trs.length > LIMITS.rows) fail("Demasiadas linhas HTML.");
    const rows = [];
    trs.forEach((tr, ri) => {
      rows[ri] ||= [];
      let col = 0;
      for (const td of tr.childNodes || []) {
        if (!["td", "th"].includes(td.tagName)) continue;
        while (rows[ri][col] !== undefined) col++;
        let content = "";
        const getText = (node) => {
          if (["script", "style", "table"].includes(node.tagName)) return;
          if (node.nodeName === "#text") content += node.value;
          if (node.tagName === "br") content += "\n";
          for (const child of node.childNodes || []) getText(child);
        };
        getText(td);
        const span = (name) =>
          Math.max(
            1,
            Number(td.attrs?.find((attr) => attr.name === name)?.value) || 1,
          );
        const height = span("rowspan"),
          width = span("colspan");
        if (
          !Number.isInteger(height) ||
          !Number.isInteger(width) ||
          height > 100 ||
          col + width > LIMITS.columns ||
          ri + height > LIMITS.rows
        )
          fail("Células HTML unidas fora dos limites.");
        for (let y = ri; y < ri + height; y++)
          for (let x = col; x < col + width; x++) {
            rows[y] ||= [];
            rows[y][x] = content.trim();
          }
        col += width;
      }
    });
    return {
      name: `Tabela ${index + 1}`,
      rows: rows.map((row) => Array.from(row, (value) => value || "")),
      flags: {},
    };
  });
}
function guardZip(bytes) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) fail("Ficheiro ZIP incompleto.");
  const entries = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true),
    total = 0;
  if (entries > 2000 || view.getUint16(end + 4, true) !== 0)
    fail("Arquivo demasiado complexo.");
  for (let i = 0; i < entries; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50)
      fail("Arquivo malformado.");
    if (view.getUint16(pos + 8, true) & 1)
      fail("Ficheiros protegidos por palavra-passe não são suportados.");
    const expanded = view.getUint32(pos + 24, true),
      compressed = view.getUint32(pos + 20, true);
    const method = view.getUint16(pos + 10, true),
      local = view.getUint32(pos + 42, true);
    total += expanded;
    if (total > LIMITS.expandedBytes)
      fail("O ficheiro descomprimido excede 40 MB.");
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50)
      fail("Cabeçalho ZIP inválido.");
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    if (start + compressed > bytes.length || ![0, 8].includes(method))
      fail("Compressão não suportada ou arquivo incompleto.");
    if (method === 0 && compressed !== expanded)
      fail("Dimensões ZIP inconsistentes.");
    if (method === 8) {
      // Independently check actual expansion in bounded chunks. Do not trust ZIP
      // sizes alone before handing the archive to the spreadsheet parser.
      let actual = 0;
      const inflater = new Inflate({ raw: true, chunkSize: 65536 });
      inflater.onData = (chunk) => {
        actual += chunk.length;
        if (actual > expanded || actual > LIMITS.expandedBytes)
          fail("Dimensões ZIP inconsistentes.");
      };
      inflater.push(bytes.subarray(start, start + compressed), true);
      if (inflater.err || actual !== expanded || !inflater.ended)
        fail("Dados ZIP inválidos.");
    }
    pos +=
      46 +
      view.getUint16(pos + 28, true) +
      view.getUint16(pos + 30, true) +
      view.getUint16(pos + 32, true);
  }
}
export function extractTable({
  bytes,
  text,
  name = "Tabela colada",
  separator = "",
}) {
  const type = name.includes(".")
    ? name.split(".").pop().toLowerCase()
    : "clipboard";
  if (bytes && !(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (
    (bytes?.byteLength || new TextEncoder().encode(text || "").length) >
    LIMITS.bytes
  )
    fail("O limite por ficheiro é 10 MB.");
  let sheets;
  if (["xlsx", "xls", "ods"].includes(type)) {
    if (!bytes?.length) fail("Ficheiro vazio.");
    if (type !== "xls" && (bytes[0] !== 0x50 || bytes[1] !== 0x4b))
      fail("O conteúdo não corresponde ao formato do ficheiro.");
    if (type === "xls" && ![0xd0, 0x09].includes(bytes[0]))
      fail("O conteúdo não corresponde a um ficheiro XLS.");
    guardZip(bytes);
    const workbook = XLSX.read(bytes, {
      type: "array",
      cellNF: true,
      cellHTML: false,
      cellDates: false,
      dateNF: "yyyy-mm-dd",
      bookVBA: false,
      sheetRows: LIMITS.rows + 1,
    });
    if (workbook.SheetNames.length > LIMITS.sheets)
      fail("Máximo de 20 folhas.");
    sheets = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName],
        rows = [],
        flags = {};
      if (!sheet["!ref"]) return { name: sheetName, rows, flags };
      const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"]);
      if (
        range.e.r >= LIMITS.rows ||
        range.e.c >= LIMITS.columns ||
        (range.e.r + 1) * (range.e.c + 1) > LIMITS.cells
      )
        fail("Folha demasiado grande. Divida a tabela.");
      for (let r = 0; r <= range.e.r; r++) {
        const row = [];
        for (let c = 0; c <= range.e.c; c++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })];
          let value = cell
            ? String(
                cell.t === "n" && cell.z
                  ? XLSX.SSF.format(cell.z, cell.v)
                  : (cell.w ?? cell.v ?? ""),
              )
            : "";
          if (
            cell?.f ||
            (cell?.t === "n" &&
              (!Number.isFinite(cell.v) || Math.abs(cell.v) >= 1e15)) ||
            cell?.t === "e"
          ) {
            (flags[r] ||= []).push(
              `Coluna ${c + 1}: fórmula, erro ou número sem precisão garantida; confirmar na origem.`,
            );
          }
          if (cell?.t === "n" && XLSX.SSF.is_date(cell.z || "")) {
            const date = XLSX.SSF.parse_date_code(cell.v);
            if (date)
              value = `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
          }
          row.push(value);
        }
        rows.push(row);
      }
      // Expand merged headers without shifting columns or guessing data identities.
      for (const merge of sheet["!merges"] || []) {
        if (merge.e.r >= LIMITS.rows || merge.e.c >= LIMITS.columns)
          fail("Células unidas fora dos limites.");
        for (let r = merge.s.r; r <= merge.e.r; r++)
          for (let c = merge.s.c; c <= merge.e.c; c++)
            if (rows[r] && !rows[r][c])
              rows[r][c] = rows[merge.s.r]?.[merge.s.c] || "";
      }
      return { name: sheetName, rows, flags };
    });
  } else {
    if (!["clipboard", "csv", "tsv", "txt", "md", "html", "htm"].includes(type))
      fail(
        "Formato não suportado. Converta PDF ou imagem para uma tabela e reveja os dados antes de importar.",
      );
    if (text === undefined) {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        text = new TextDecoder("windows-1252").decode(bytes);
      }
    }
    sheets = /<table[\s>]/i.test(text)
      ? htmlSheets(text)
      : [
          {
            name: "Tabela 1",
            rows: textRows(
              text,
              type,
              separator || (type === "tsv" ? "\t" : ""),
            ),
            flags: {},
          },
        ];
  }
  if (!sheets.some((sheet) => sheet.rows.length)) fail("A tabela está vazia.");
  if (
    sheets.length > LIMITS.sheets ||
    sheets.reduce(
      (n, sheet) => n + sheet.rows.reduce((k, row) => k + row.length, 0),
      0,
    ) > LIMITS.cells
  )
    fail("Demasiadas células no ficheiro.");
  return { type, sheets: sheets.map(guardSheet) };
}

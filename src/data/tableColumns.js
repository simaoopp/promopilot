export const TABLE_COLUMNS = [
  { key: "codigo", label: "CODIGO", tipo: "text" },
  { key: "descricao", label: "DESCRICAO", tipo: "text" },
  { key: "pn", label: "PN", tipo: "text" },
  { key: "ean", label: "EAN" },
  { key: "antes", label: "PVP2 ANTES" },
  { key: "atual", label: "PVP2 ATUAL" },
  { key: "pv3", label: "PV3" },
  { key: "estado", label: "ESTADO", tipo: "text" },
  { key: "ae", label: "AE", tipo: "number" },
  { key: "aea", label: "AEA", tipo: "number" },
  { key: "aev", label: "AEV", tipo: "number" },
  { key: "a10", label: "A10", tipo: "number" },
  { key: "a1e", label: "A1E", tipo: "number" },
  { key: "data", label: "DATA" },
  { key: "dataInicio", label: "DATA INICIO" },
  { key: "dataFim", label: "DATA FIM" },
  { key: "alterado", label: "ALTERADO PRIMAVERA" },
  { key: "info", label: "INFORMAÇÃO", tipo: "text" },
];

export const FILTERABLE_COLUMNS = TABLE_COLUMNS.filter((col) => col.tipo);

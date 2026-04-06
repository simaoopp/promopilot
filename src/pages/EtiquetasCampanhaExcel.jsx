import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import logo from "../logo.png";
import Barcode from "../components/Barcode";
import FilterMenu from "../components/FilterMenu";

import { formatarEuro, parseNumero } from "../utils/formatters";
import {
  aplicarFiltroTexto,
  compararNumero,
  dividirEmPaginas,
} from "../utils/filters";
import { TABLE_COLUMNS } from "../data/tableColumns";

function normalizarCabecalho(texto) {
  return String(texto || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function mapearLinhaExcel(row, index) {
  const normalizado = {};

  Object.keys(row || {}).forEach((key) => {
    normalizado[normalizarCabecalho(key)] = row[key];
  });

  console.log(`Linha ${index} normalizada:`, normalizado);

  return {
    id: `excel-${index}`,
    codigo: normalizado["CODIGO"] || normalizado["CÓDIGO"] || "",
    descricao: normalizado["DESCRICAO"] || normalizado["DESCRIÇÃO"] || "",
    pn: normalizado["PN"] || "",
    ean: normalizado["EAN"] || "",
    antes: parseNumero(normalizado["PVP2 ANTES"] || 0),
    atual: parseNumero(normalizado["PVP2 ATUAL"] || 0),
    pv3: normalizado["PV3"] || "",
    estado: normalizado["ESTADO"] || "",
    ae: normalizado["AE"] || "",
    aea: normalizado["AEA"] || "",
    aev: normalizado["AEV"] || "",
    a10: normalizado["A10"] || "",
    a1e: normalizado["A1E"] || "",
    data: normalizado["DATA"] || "",
    dataInicio:
      normalizado["DATA INICIO"] ||
      normalizado["DATA_INICIO"] ||
      normalizado["DATA INÍCIO"] ||
      "",
    dataFim: normalizado["DATA FIM"] || normalizado["DATA_FIM"] || "",
    alterado:
      normalizado["ALTERADO PRIMAVERA"] || normalizado["ALTERADO"] || "",
    info:
      normalizado["INFORMAÇÃO"] ||
      normalizado["INFORMACAO"] ||
      normalizado["INFO"] ||
      "",
    selecionado: false,
  };
}

export default function EtiquetasExcelPage() {
  const [titulo, setTitulo] = useState("PROMO");
  const [anoValidade, setAnoValidade] = useState(new Date().getFullYear());
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nomeFicheiro, setNomeFicheiro] = useState("");

  const [filtroAberto, setFiltroAberto] = useState(null);
  const [ordenacao, setOrdenacao] = useState({
    coluna: "",
    direcao: "",
  });

  const [filtros, setFiltros] = useState({
    codigo: { contains: "", equals: "" },
    descricao: { contains: "", equals: "" },
    pn: { contains: "", equals: "" },
    estado: { contains: "", equals: "" },
    info: { contains: "", equals: "" },
    ae: { op: "", valor: "" },
    aea: { op: "", valor: "" },
    aev: { op: "", valor: "" },
    a10: { op: "", valor: "" },
    a1e: { op: "", valor: "" },
  });

  useEffect(() => {
    function handleClickOutside(event) {
      const clicouDentroDeFiltro = event.target.closest(".filter-th");
      if (!clicouDentroDeFiltro) {
        setFiltroAberto(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function atualizarFiltroPopup(campo, chave, valor) {
    setFiltros((prev) => ({
      ...prev,
      [campo]: {
        ...prev[campo],
        [chave]: valor,
      },
    }));
  }

  function limparFiltro(campo, tipo = "text") {
    setFiltros((prev) => ({
      ...prev,
      [campo]:
        tipo === "text" ? { contains: "", equals: "" } : { op: "", valor: "" },
    }));
  }

  function ordenarLista(lista) {
    if (!ordenacao.coluna || !ordenacao.direcao) return lista;

    const copia = [...lista];

    copia.sort((a, b) => {
      const va = a[ordenacao.coluna];
      const vb = b[ordenacao.coluna];

      const aNum = Number(va);
      const bNum = Number(vb);
      const ambosNumeros = !Number.isNaN(aNum) && !Number.isNaN(bNum);

      if (ambosNumeros) {
        return ordenacao.direcao === "asc" ? aNum - bNum : bNum - aNum;
      }

      const aText = String(va || "").toLowerCase();
      const bText = String(vb || "").toLowerCase();

      return ordenacao.direcao === "asc"
        ? aText.localeCompare(bText, "pt")
        : bText.localeCompare(aText, "pt");
    });

    return copia;
  }

  async function carregarExcel(event) {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setNomeFicheiro(file.name);

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);

      const nomeSheet =
        workbook.SheetNames.find(
          (name) => normalizarCabecalho(name) === "RELATORIO DIARIO ALTERACOES"
        ) || workbook.SheetNames[0];

      const sheet = workbook.Sheets[nomeSheet];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      console.log("Sheet escolhida:", nomeSheet);
      console.log("Total de linhas lidas:", rows.length);
      console.log("Primeira linha bruta:", rows[0]);

      const linhas = rows
        .map((row, index) => mapearLinhaExcel(row, index))
        .filter((item) => item.codigo || item.descricao || item.ean);

      console.log("Total de linhas válidas:", linhas.length);

      if (!linhas.length) {
        throw new Error("Sem linhas válidas");
      }

      setDados(linhas);
    } catch (error) {
      console.error("Erro ao ler Excel:", error);
      alert("Não foi possível ler o ficheiro Excel.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  const dadosFiltrados = useMemo(() => {
    const filtrados = dados.filter((item) => {
      const codigoOk = aplicarFiltroTexto(item.codigo, filtros.codigo);
      const descricaoOk = aplicarFiltroTexto(item.descricao, filtros.descricao);
      const pnOk = aplicarFiltroTexto(item.pn, filtros.pn);
      const estadoOk = aplicarFiltroTexto(item.estado, filtros.estado);
      const infoOk = aplicarFiltroTexto(item.info, filtros.info);

      const aeOk = compararNumero(item.ae, filtros.ae.op, filtros.ae.valor);
      const aeaOk = compararNumero(item.aea, filtros.aea.op, filtros.aea.valor);
      const aevOk = compararNumero(item.aev, filtros.aev.op, filtros.aev.valor);
      const a10Ok = compararNumero(item.a10, filtros.a10.op, filtros.a10.valor);
      const a1eOk = compararNumero(item.a1e, filtros.a1e.op, filtros.a1e.valor);

      return (
        codigoOk &&
        descricaoOk &&
        pnOk &&
        estadoOk &&
        infoOk &&
        aeOk &&
        aeaOk &&
        aevOk &&
        a10Ok &&
        a1eOk
      );
    });

    return ordenarLista(filtrados);
  }, [dados, filtros, ordenacao]);

  const selecionados = dados.filter((item) => item.selecionado);
  const paginas = dividirEmPaginas(selecionados, 4);

  function alternarSelecionado(id) {
    setDados((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selecionado: !item.selecionado } : item
      )
    );
  }

  function selecionarTodosFiltrados() {
    const ids = new Set(dadosFiltrados.map((item) => item.id));
    setDados((prev) =>
      prev.map((item) =>
        ids.has(item.id) ? { ...item, selecionado: true } : item
      )
    );
  }

  function desmarcarTodosFiltrados() {
    const ids = new Set(dadosFiltrados.map((item) => item.id));
    setDados((prev) =>
      prev.map((item) =>
        ids.has(item.id) ? { ...item, selecionado: false } : item
      )
    );
  }

  function limparSelecao() {
    setDados((prev) => prev.map((item) => ({ ...item, selecionado: false })));
  }

  function imprimirSelecionados() {
    if (selecionados.length === 0) {
      alert("Seleciona pelo menos um artigo.");
      return;
    }
    window.print();
  }

  return (
    <>
      <div className="page-content no-print">
        <div className="page-header">
          <div>
            <h1 className="page-title">Etiquetas de Campanha em Excel</h1>
            <p className="page-subtitle">
              Importa um ficheiro Excel, filtra os artigos e imprime apenas as
              etiquetas selecionadas.
            </p>
          </div>
        </div>

        <div className="control-card">
          <div className="toolbar-grid">
            <label className="input-group">
              <span>Título da campanha</span>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: ASUS PROMO"
              />
            </label>

            <label className="input-group">
              <span>Ano de validade</span>
              <input
                type="number"
                value={anoValidade}
                onChange={(e) => setAnoValidade(e.target.value)}
                placeholder="2026"
              />
            </label>
          </div>

          <div className="input-group">
            <span>Importar ficheiro Excel</span>
            <input
              type="file"
              accept=".xlsx,.xls,.xlsb,.csv,.ods"
              onChange={carregarExcel}
            />
            {nomeFicheiro ? <small>Ficheiro: {nomeFicheiro}</small> : null}
            {loading ? <small>A carregar Excel...</small> : null}
          </div>

          <div className="toolbar-actions">
            <button
              className="btn btn-secondary"
              onClick={selecionarTodosFiltrados}
            >
              Selecionar filtrados
            </button>
            <button
              className="btn btn-secondary"
              onClick={desmarcarTodosFiltrados}
            >
              Desmarcar filtrados
            </button>
            <button className="btn btn-secondary" onClick={limparSelecao}>
              Limpar seleção
            </button>
            <button className="btn btn-success" onClick={imprimirSelecionados}>
              Imprimir selecionados
            </button>
          </div>

          <div className="resumo-cards">
            <div className="resumo-card">
              <span className="resumo-label">Total artigos</span>
              <strong>{dados.length}</strong>
            </div>
            <div className="resumo-card">
              <span className="resumo-label">Filtrados</span>
              <strong>{dadosFiltrados.length}</strong>
            </div>
            <div className="resumo-card">
              <span className="resumo-label">Selecionados</span>
              <strong>{selecionados.length}</strong>
            </div>
          </div>
        </div>

        <div className="table-card">
          <div className="table-card-header">
            <h2>Lista de artigos</h2>
          </div>

          <div className="table-panel">
            <table>
              <thead>
                <tr>
                  <th>Selecionar</th>

                  {TABLE_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={col.tipo ? "filter-th" : undefined}
                    >
                      {col.tipo ? (
                        <>
                          <button
                            type="button"
                            className="filter-button"
                            onClick={() =>
                              setFiltroAberto(
                                filtroAberto === col.key ? null : col.key
                              )
                            }
                          >
                            {col.label}
                          </button>

                          <FilterMenu
                            coluna={col.label}
                            tipo={col.tipo}
                            aberto={filtroAberto === col.key}
                            filtro={filtros[col.key]}
                            onClose={() => setFiltroAberto(null)}
                            onUpdate={(chave, valor) =>
                              atualizarFiltroPopup(col.key, chave, valor)
                            }
                            onSort={(direcao) =>
                              setOrdenacao({ coluna: col.key, direcao })
                            }
                            onClear={() => limparFiltro(col.key, col.tipo)}
                          />
                        </>
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {dadosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="19" className="empty-cell">
                      Importa um ficheiro Excel para carregar os artigos.
                    </td>
                  </tr>
                ) : (
                  dadosFiltrados.map((item) => (
                    <tr
                      key={item.id}
                      className={item.selecionado ? "linha-selecionada" : ""}
                      onClick={() => alternarSelecionado(item.id)}
                    >
                      <td
                        className="col-select"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={item.selecionado}
                          readOnly
                        />
                      </td>

                      <td>{item.codigo}</td>
                      <td>{item.descricao}</td>
                      <td>{item.pn}</td>
                      <td>{item.ean}</td>
                      <td>{formatarEuro(item.antes)}€</td>
                      <td>{formatarEuro(item.atual)}€</td>
                      <td>{item.pv3}</td>
                      <td>{item.estado}</td>
                      <td>{item.ae}</td>
                      <td>{item.aea}</td>
                      <td>{item.aev}</td>
                      <td>{item.a10}</td>
                      <td>{item.a1e}</td>
                      <td>{item.data}</td>
                      <td>{item.dataInicio}</td>
                      <td>{item.dataFim}</td>
                      <td>{item.alterado}</td>
                      <td>{item.info}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="print-area">
        {paginas.map((pagina, pageIndex) => (
          <div key={pageIndex} className="sheet">
            {pagina.map((item) => {
              const desconto = Math.max(0, item.antes - item.atual);

              return (
                <div
                  key={item.id}
                  className={`label ${
                    formatoEtiqueta === "a5" ? "label-a5" : "label-a6"
                  }`}
                >
                  <div className="label-inner">
                    <div className="topbar">
                      <img src={logo} alt="Expert" className="print-logo" />
                    </div>

                    <div className="content">
                      <div className="topo">
                        <div className="codigo">{item.codigo}</div>
                        <div className="titulo">{titulo}</div>
                        <div className="descricao">{item.descricao}</div>
                      </div>

                      <div className="precos">
                        <div className="linha-preco">
                          <span className="antes">
                            {formatarEuro(item.antes)}€
                          </span>
                        </div>

                        <div className="linha-preco desconto-linha">
                          <span className="desconto">
                            -{formatarEuro(desconto)}€
                          </span>
                        </div>

                        <div className="linha-preco">
                          <span className="atual">
                            {formatarEuro(item.atual)}€
                          </span>
                        </div>
                      </div>

                      <div className="rodape">
                        <Barcode value={item.ean} />

                        <div className="validade">
                          {item.dataInicio || item.dataFim
                            ? `VÁLIDO DE ${item.dataInicio || "-"}${
                                item.dataInicio ? `/${anoValidade}` : ""
                              } A ${item.dataFim || "-"}${
                                item.dataFim ? `/${anoValidade}` : ""
                              }`
                            : "VÁLIDO ENQUANTO DURAR O STOCK"}
                        </div>

                        <div className="nota">
                          Limitado ao stock existente e não acumulável com
                          outras promoções.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

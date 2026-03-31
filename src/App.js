import React, { useMemo, useState } from "react";
import "./styles.css";
import logo from "./logo.png";
import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

const CABECALHOS = [
  "CODIGO",
  "DESCRICAO",
  "PN",
  "EAN",
  "PVP2 ANTES",
  "PVP2 ATUAL",
  "PV3",
  "ESTADO",
  "AE",
  "AEA",
  "AEV",
  "A10",
  "A1E",
  "DATA",
  "DATA INICIO",
  "DATA FIM",
  "ALTERADO PRIMAVERA",
  "INFORMAÇÃO",
];

function formatarEuro(valor) {
  const numero = Number(valor || 0);

  const temCentimos = numero % 1 !== 0;

  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: temCentimos ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(numero);
}

function parseNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let texto = String(valor).trim();
  texto = texto.replace(/\s/g, "");

  if (texto.includes(",") && texto.includes(".")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (texto.includes(",")) {
    texto = texto.replace(",", ".");
  }

  const numero = Number(texto);
  return Number.isNaN(numero) ? 0 : numero;
}

function parseTabelaColada(texto) {
  const linhas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (linhas.length === 0) return [];

  const primeiraLinha = linhas[0].toUpperCase();
  const temCabecalho =
    primeiraLinha.includes("CODIGO") || primeiraLinha.includes("DESCRICAO");

  const linhasDados = temCabecalho ? linhas.slice(1) : linhas;

  const resultado = [];

  for (let i = 0; i < linhasDados.length; i += 1) {
    const linha = linhasDados[i];

    let partes = linha.split("\t").map((p) => p.trim());

    if (partes.length < 10) {
      partes = linha.split(/\s{2,}/).map((p) => p.trim());
    }

    if (partes.length < 4) continue;

    const row = {
      id: `row-${i}`,
      codigo: partes[0] || "",
      descricao: partes[1] || "",
      pn: partes[2] || "",
      ean: partes[3] || "",
      antes: parseNumero(partes[4] || 0),
      atual: parseNumero(partes[5] || 0),
      pv3: partes[6] || "",
      estado: partes[7] || "",
      ae: partes[8] || "",
      aea: partes[9] || "",
      aev: partes[10] || "",
      a10: partes[11] || "",
      a1e: partes[12] || "",
      data: partes[13] || "",
      dataInicio: partes[14] || "",
      dataFim: partes[15] || "",
      alterado: partes[16] || "",
      info: partes[17] || "",
      selecionado: false,
    };

    resultado.push(row);
  }

  return resultado;
}

function compararNumero(valorItem, operador, valorFiltro) {
  if (operador === "" || valorFiltro === "") return true;

  const a = Number(valorItem || 0);
  const b = Number(valorFiltro || 0);

  if (Number.isNaN(a) || Number.isNaN(b)) return false;

  switch (operador) {
    case "=":
      return a === b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    default:
      return true;
  }
}

function Barcode({ value }) {
  const ref = useRef();

  useEffect(() => {
    if (value) {
      JsBarcode(ref.current, value, {
        format: "EAN13",
        displayValue: false,
        height: 18,
        width: 1,
        margin: 0,
      });
    }
  }, [value]);

  return <svg ref={ref}></svg>;
}

export default function App() {
  const [titulo, setTitulo] = useState("PROMO");
  const [textoColado, setTextoColado] = useState("");
  const [anoValidade, setAnoValidade] = useState(new Date().getFullYear());
  const [dados, setDados] = useState([]);
  const [filtros, setFiltros] = useState({
    codigo: "",
    descricao: "",
    pn: "",
    estado: "",
    info: "",
    ae: { op: "", valor: "" },
    aea: { op: "", valor: "" },
    aev: { op: "", valor: "" },
    a10: { op: "", valor: "" },
    a1e: { op: "", valor: "" },
  });

  function dividirEmPaginas(lista, porPagina = 4) {
    const paginas = [];
    for (let i = 0; i < lista.length; i += porPagina) {
      paginas.push(lista.slice(i, i + porPagina));
    }
    return paginas;
  }

  function atualizarFiltroNumerico(campo, chave, valor) {
    setFiltros((prev) => ({
      ...prev,
      [campo]: {
        ...prev[campo],
        [chave]: valor,
      },
    }));
  }

  function carregarTextoColado() {
    const linhas = parseTabelaColada(textoColado);
    setDados(linhas);
  }

  function atualizarFiltro(campo, valor) {
    setFiltros((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  }

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

  const dadosFiltrados = useMemo(() => {
    return dados.filter((item) => {
      const codigoOk = item.codigo
        .toLowerCase()
        .includes(filtros.codigo.toLowerCase());

      const descricaoOk = item.descricao
        .toLowerCase()
        .includes(filtros.descricao.toLowerCase());

      const pnOk = item.pn.toLowerCase().includes(filtros.pn.toLowerCase());

      const estadoOk = item.estado
        .toLowerCase()
        .includes(filtros.estado.toLowerCase());

      const infoOk = item.info
        .toLowerCase()
        .includes(filtros.info.toLowerCase());

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
  }, [dados, filtros]);

  const selecionados = dados.filter((item) => item.selecionado);
  const paginas = dividirEmPaginas(selecionados, 4);

  function imprimirSelecionados() {
    if (selecionados.length === 0) {
      alert("Seleciona pelo menos um artigo.");
      return;
    }
    window.print();
  }
  return (
    <div className="app">
      <div className="toolbar no-print">
        <h1>Etiquetas Promocionais</h1>

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
          <span>Colar tabela recebida por email</span>
          <textarea
            className="paste-box"
            value={textoColado}
            onChange={(e) => setTextoColado(e.target.value)}
            placeholder="Cola aqui a tabela completa do email"
          />
        </div>

        <div className="toolbar-actions">
          <button onClick={carregarTextoColado}>Carregar tabela</button>
          <button onClick={selecionarTodosFiltrados}>
            Selecionar filtrados
          </button>
          <button onClick={desmarcarTodosFiltrados}>Desmarcar filtrados</button>
          <button onClick={limparSelecao}>Limpar seleção</button>
          <button onClick={imprimirSelecionados}>Imprimir selecionados</button>
        </div>

        <div className="resumo">
          <span>Total artigos: {dados.length}</span>
          <span>Filtrados: {dadosFiltrados.length}</span>
          <span>Selecionados: {selecionados.length}</span>
        </div>
      </div>

      <div className="table-panel no-print">
        <table>
          <thead>
            <tr>
              <th className="col-select">
                <th>Selecionar</th>
              </th>
              <th>
                CODIGO
                <input
                  type="text"
                  placeholder="Filtrar"
                  value={filtros.codigo}
                  onChange={(e) => atualizarFiltro("codigo", e.target.value)}
                />
              </th>
              <th>
                DESCRICAO
                <input
                  type="text"
                  placeholder="Filtrar"
                  value={filtros.descricao}
                  onChange={(e) => atualizarFiltro("descricao", e.target.value)}
                />
              </th>
              <th>
                PN
                <input
                  type="text"
                  placeholder="Filtrar"
                  value={filtros.pn}
                  onChange={(e) => atualizarFiltro("pn", e.target.value)}
                />
              </th>
              <th>EAN</th>
              <th>PVP2 ANTES</th>
              <th>PVP2 ATUAL</th>
              <th>PV3</th>
              <th>
                ESTADO
                <input
                  type="text"
                  placeholder="Filtrar"
                  value={filtros.estado}
                  onChange={(e) => atualizarFiltro("estado", e.target.value)}
                />
              </th>
              <th>
                AE
                <div className="filter-number">
                  <select
                    value={filtros.ae.op}
                    onChange={(e) =>
                      atualizarFiltroNumerico("ae", "op", e.target.value)
                    }
                  >
                    <option value="">-</option>
                    <option value="=">=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                  </select>
                  <input
                    type="number"
                    value={filtros.ae.valor}
                    onChange={(e) =>
                      atualizarFiltroNumerico("ae", "valor", e.target.value)
                    }
                    placeholder="valor"
                  />
                </div>
              </th>

              <th>
                AEA
                <div className="filter-number">
                  <select
                    value={filtros.aea.op}
                    onChange={(e) =>
                      atualizarFiltroNumerico("aea", "op", e.target.value)
                    }
                  >
                    <option value="">-</option>
                    <option value="=">=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                  </select>
                  <input
                    type="number"
                    value={filtros.aea.valor}
                    onChange={(e) =>
                      atualizarFiltroNumerico("aea", "valor", e.target.value)
                    }
                    placeholder="valor"
                  />
                </div>
              </th>

              <th>
                AEV
                <div className="filter-number">
                  <select
                    value={filtros.aev.op}
                    onChange={(e) =>
                      atualizarFiltroNumerico("aev", "op", e.target.value)
                    }
                  >
                    <option value="">-</option>
                    <option value="=">=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                  </select>
                  <input
                    type="number"
                    value={filtros.aev.valor}
                    onChange={(e) =>
                      atualizarFiltroNumerico("aev", "valor", e.target.value)
                    }
                    placeholder="valor"
                  />
                </div>
              </th>

              <th>
                A10
                <div className="filter-number">
                  <select
                    value={filtros.a10.op}
                    onChange={(e) =>
                      atualizarFiltroNumerico("a10", "op", e.target.value)
                    }
                  >
                    <option value="">-</option>
                    <option value="=">=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                  </select>
                  <input
                    type="number"
                    value={filtros.a10.valor}
                    onChange={(e) =>
                      atualizarFiltroNumerico("a10", "valor", e.target.value)
                    }
                    placeholder="valor"
                  />
                </div>
              </th>

              <th>
                A1E
                <div className="filter-number">
                  <select
                    value={filtros.a1e.op}
                    onChange={(e) =>
                      atualizarFiltroNumerico("a1e", "op", e.target.value)
                    }
                  >
                    <option value="">-</option>
                    <option value="=">=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                  </select>
                  <input
                    type="number"
                    value={filtros.a1e.valor}
                    onChange={(e) =>
                      atualizarFiltroNumerico("a1e", "valor", e.target.value)
                    }
                    placeholder="valor"
                  />
                </div>
              </th>
              <th>DATA</th>
              <th>DATA INICIO</th>
              <th>DATA FIM</th>
              <th>ALTERADO PRIMAVERA</th>
              <th>
                INFORMAÇÃO
                <input
                  type="text"
                  placeholder="Filtrar"
                  value={filtros.info}
                  onChange={(e) => atualizarFiltro("info", e.target.value)}
                />
              </th>
            </tr>
          </thead>

          <tbody>
            {dadosFiltrados.length === 0 ? (
              <tr>
                <td colSpan="19" className="empty-cell">
                  Cola a tabela do email e carrega em “Carregar tabela”.
                </td>
              </tr>
            ) : (
              dadosFiltrados.map((item) => (
                <tr key={item.id}>
                  <td className="col-select">
                    <input
                      type="checkbox"
                      checked={item.selecionado}
                      onChange={() => alternarSelecionado(item.id)}
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
      <div className="print-area">
        {paginas.map((pagina, pageIndex) => (
          <div key={pageIndex} className="sheet">
            {pagina.map((item) => {
              const desconto = Math.max(0, item.antes - item.atual);

              return (
                <div key={item.id} className="label">
                  <div className="topbar">
                    <img src={logo} alt="Expert" />
                  </div>

                  <div className="content">
                    <div className="topo">
                      <div className="codigo">{item.codigo}</div>
                      <div className="titulo">{titulo}</div>
                      <div className="descricao">{item.descricao}</div>
                    </div>

                    <div className="precos">
                      <div className="linha-preco">
                        <span className="texto-lado">ANTES</span>
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
                        <span className="texto-lado">ATUAL</span>
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
                        Limitado ao stock existente e não acumulável com outras
                        promoções.
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

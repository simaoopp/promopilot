import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import logo from "./logo.png";
import JsBarcode from "jsbarcode";

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

    resultado.push({
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
    });
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

function aplicarFiltroTexto(valor, filtro) {
  const texto = String(valor || "").toLowerCase();
  const contains = String(filtro?.contains || "").toLowerCase();
  const equals = String(filtro?.equals || "").toLowerCase();

  if (contains && !texto.includes(contains)) return false;
  if (equals && texto !== equals) return false;

  return true;
}

function dividirEmPaginas(lista, porPagina = 4) {
  const paginas = [];
  for (let i = 0; i < lista.length; i += porPagina) {
    paginas.push(lista.slice(i, i + porPagina));
  }
  return paginas;
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

function FilterMenu({
  coluna,
  tipo = "text",
  aberto,
  filtro,
  onClose,
  onUpdate,
  onSort,
  onClear,
}) {
  if (!aberto) return null;

  return (
    <div className="filter-popup">
      <div className="filter-popup-header">
        <strong>{coluna}</strong>
        <button type="button" className="filter-close" onClick={onClose}>
          ×
        </button>
      </div>

      {tipo === "text" && (
        <>
          <div className="filter-section">
            <button type="button" onClick={() => onSort("asc")}>
              Ordenar A → Z
            </button>
            <button type="button" onClick={() => onSort("desc")}>
              Ordenar Z → A
            </button>
          </div>

          <div className="filter-section">
            <label>Contém</label>
            <input
              type="text"
              value={filtro?.contains || ""}
              onChange={(e) => onUpdate("contains", e.target.value)}
            />
          </div>

          <div className="filter-section">
            <label>Igual a</label>
            <input
              type="text"
              value={filtro?.equals || ""}
              onChange={(e) => onUpdate("equals", e.target.value)}
            />
          </div>
        </>
      )}

      {tipo === "number" && (
        <>
          <div className="filter-section">
            <button type="button" onClick={() => onSort("asc")}>
              Ordem crescente
            </button>
            <button type="button" onClick={() => onSort("desc")}>
              Ordem decrescente
            </button>
          </div>

          <div className="filter-section">
            <label>Operador</label>
            <select
              value={filtro?.op || ""}
              onChange={(e) => onUpdate("op", e.target.value)}
            >
              <option value="">-</option>
              <option value="=">=</option>
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
              <option value="<">&lt;</option>
              <option value="<=">&lt;=</option>
            </select>
          </div>

          <div className="filter-section">
            <label>Valor</label>
            <input
              type="number"
              value={filtro?.valor || ""}
              onChange={(e) => onUpdate("valor", e.target.value)}
            />
          </div>
        </>
      )}

      <div className="filter-section">
        <button type="button" onClick={onClear}>
          Limpar filtro
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [titulo, setTitulo] = useState("PROMO");
  const [textoColado, setTextoColado] = useState("");
  const [anoValidade, setAnoValidade] = useState(new Date().getFullYear());
  const [dados, setDados] = useState([]);
  const [menuAberto, setMenuAberto] = useState(false);
  const [loading, setLoading] = useState(true);

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
    const timer = setTimeout(() => setLoading(false), 1800);
    return () => clearTimeout(timer);
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

  function carregarTextoColado() {
    try {
      const linhas = parseTabelaColada(textoColado);

      if (!textoColado.trim()) throw new Error("Sem conteúdo");
      if (!linhas.length) throw new Error("Sem linhas válidas");

      const erro = linhas.some((item) => {
        const nomeInvalido = !item.descricao || item.descricao.length < 3;
        const precoAntesInvalido = !item.antes || Number(item.antes) <= 0;
        const precoAtualInvalido = !item.atual || Number(item.atual) <= 0;
        const eanInvalido =
          !item.ean || String(item.ean).replace(/\D/g, "").length < 8;

        const dataInvalida = (data) => {
          if (!data || data === "-") return false;

          const texto = data.trim();

          const formatoMesTexto = /^\d{1,2}\/[a-z]{3}\.?$/i; // ex: 27/mar.
          const formatoMesNumero = /^\d{1,2}\/\d{2}$/; // ex: 27/03

          return !formatoMesTexto.test(texto) && !formatoMesNumero.test(texto);
        };

        const datasInvalidas =
          dataInvalida(item.dataInicio) || dataInvalida(item.dataFim);

        return (
          nomeInvalido ||
          precoAntesInvalido ||
          precoAtualInvalido ||
          eanInvalido ||
          datasInvalidas
        );
      });

      if (erro) throw new Error("Dados inválidos");

      setDados(linhas);
    } catch (error) {
      alert("Verifique se os dados inseridos estão corretos.");
    }
  }

  function alternarSelecionado(id) {
    setDados((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selecionado: !item.selecionado } : item
      )
    );
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

  if (loading) {
    return (
      <div className="splash-screen">
        <img src={logo} alt="Expert" className="splash-logo" />
        <div className="splash-loader"></div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar-site no-print">
        <button
          className="menu-button"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
        >
          ☰
        </button>

        <img src={logo} alt="Expert" className="logo-topbar" />
        <div className="topbar-title">Etiquetas de Campanha</div>
      </div>

      <div
        className={`sidebar-overlay ${menuAberto ? "show" : ""}`}
        onClick={() => setMenuAberto(false)}
      ></div>

      <aside className={`sidebar no-print ${menuAberto ? "open" : ""}`}>
        <div className="sidebar-header">
          <img src={logo} alt="Expert" className="logo-sidebar" />
          <button
            className="close-sidebar"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
          >
            ×
          </button>
        </div>

        <div className="sidebar-body">
          <button
            className="sidebar-link"
            onClick={() => {
              setMenuAberto(false);
              document
                .querySelector(".print-area")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Etiquetas de Campanha
          </button>
        </div>
      </aside>

      <div className="toolbar no-print">
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
              <th>Selecionar</th>

              <th className="filter-th">
                <button
                  type="button"
                  className="filter-button"
                  onClick={() =>
                    setFiltroAberto(filtroAberto === "codigo" ? null : "codigo")
                  }
                >
                  CODIGO
                </button>
                <FilterMenu
                  coluna="CODIGO"
                  tipo="text"
                  aberto={filtroAberto === "codigo"}
                  filtro={filtros.codigo}
                  onClose={() => setFiltroAberto(null)}
                  onUpdate={(chave, valor) =>
                    atualizarFiltroPopup("codigo", chave, valor)
                  }
                  onSort={(direcao) =>
                    setOrdenacao({ coluna: "codigo", direcao })
                  }
                  onClear={() => limparFiltro("codigo", "text")}
                />
              </th>

              <th className="filter-th">
                <button
                  type="button"
                  className="filter-button"
                  onClick={() =>
                    setFiltroAberto(
                      filtroAberto === "descricao" ? null : "descricao"
                    )
                  }
                >
                  DESCRICAO
                </button>
                <FilterMenu
                  coluna="DESCRICAO"
                  tipo="text"
                  aberto={filtroAberto === "descricao"}
                  filtro={filtros.descricao}
                  onClose={() => setFiltroAberto(null)}
                  onUpdate={(chave, valor) =>
                    atualizarFiltroPopup("descricao", chave, valor)
                  }
                  onSort={(direcao) =>
                    setOrdenacao({ coluna: "descricao", direcao })
                  }
                  onClear={() => limparFiltro("descricao", "text")}
                />
              </th>

              <th className="filter-th">
                <button
                  type="button"
                  className="filter-button"
                  onClick={() =>
                    setFiltroAberto(filtroAberto === "pn" ? null : "pn")
                  }
                >
                  PN
                </button>
                <FilterMenu
                  coluna="PN"
                  tipo="text"
                  aberto={filtroAberto === "pn"}
                  filtro={filtros.pn}
                  onClose={() => setFiltroAberto(null)}
                  onUpdate={(chave, valor) =>
                    atualizarFiltroPopup("pn", chave, valor)
                  }
                  onSort={(direcao) => setOrdenacao({ coluna: "pn", direcao })}
                  onClear={() => limparFiltro("pn", "text")}
                />
              </th>

              <th>EAN</th>
              <th>PVP2 ANTES</th>
              <th>PVP2 ATUAL</th>
              <th>PV3</th>

              <th className="filter-th">
                <button
                  type="button"
                  className="filter-button"
                  onClick={() =>
                    setFiltroAberto(filtroAberto === "estado" ? null : "estado")
                  }
                >
                  ESTADO
                </button>
                <FilterMenu
                  coluna="ESTADO"
                  tipo="text"
                  aberto={filtroAberto === "estado"}
                  filtro={filtros.estado}
                  onClose={() => setFiltroAberto(null)}
                  onUpdate={(chave, valor) =>
                    atualizarFiltroPopup("estado", chave, valor)
                  }
                  onSort={(direcao) =>
                    setOrdenacao({ coluna: "estado", direcao })
                  }
                  onClear={() => limparFiltro("estado", "text")}
                />
              </th>

              <th className="filter-th">
                <button
                  type="button"
                  className="filter-button"
                  onClick={() =>
                    setFiltroAberto(filtroAberto === "ae" ? null : "ae")
                  }
                >
                  AE
                </button>
                <FilterMenu
                  coluna="AE"
                  tipo="number"
                  aberto={filtroAberto === "ae"}
                  filtro={filtros.ae}
                  onClose={() => setFiltroAberto(null)}
                  onUpdate={(chave, valor) =>
                    atualizarFiltroPopup("ae", chave, valor)
                  }
                  onSort={(direcao) => setOrdenacao({ coluna: "ae", direcao })}
                  onClear={() => limparFiltro("ae", "number")}
                />
              </th>

              <th className="filter-th">
                <button
                  type="button"
                  className="filter-button"
                  onClick={() =>
                    setFiltroAberto(filtroAberto === "aea" ? null : "aea")
                  }
                >
                  AEA
                </button>
                <FilterMenu
                  coluna="AEA"
                  tipo="number"
                  aberto={filtroAberto === "aea"}
                  filtro={filtros.aea}
                  onClose={() => setFiltroAberto(null)}
                  onUpdate={(chave, valor) =>
                    atualizarFiltroPopup("aea", chave, valor)
                  }
                  onSort={(direcao) => setOrdenacao({ coluna: "aea", direcao })}
                  onClear={() => limparFiltro("aea", "number")}
                />
              </th>

              <th className="filter-th">
                <button
                  type="button"
                  className="filter-button"
                  onClick={() =>
                    setFiltroAberto(filtroAberto === "aev" ? null : "aev")
                  }
                >
                  AEV
                </button>
                <FilterMenu
                  coluna="AEV"
                  tipo="number"
                  aberto={filtroAberto === "aev"}
                  filtro={filtros.aev}
                  onClose={() => setFiltroAberto(null)}
                  onUpdate={(chave, valor) =>
                    atualizarFiltroPopup("aev", chave, valor)
                  }
                  onSort={(direcao) => setOrdenacao({ coluna: "aev", direcao })}
                  onClear={() => limparFiltro("aev", "number")}
                />
              </th>

              <th className="filter-th">
                <button
                  type="button"
                  className="filter-button"
                  onClick={() =>
                    setFiltroAberto(filtroAberto === "a10" ? null : "a10")
                  }
                >
                  A10
                </button>
                <FilterMenu
                  coluna="A10"
                  tipo="number"
                  aberto={filtroAberto === "a10"}
                  filtro={filtros.a10}
                  onClose={() => setFiltroAberto(null)}
                  onUpdate={(chave, valor) =>
                    atualizarFiltroPopup("a10", chave, valor)
                  }
                  onSort={(direcao) => setOrdenacao({ coluna: "a10", direcao })}
                  onClear={() => limparFiltro("a10", "number")}
                />
              </th>

              <th className="filter-th">
                <button
                  type="button"
                  className="filter-button"
                  onClick={() =>
                    setFiltroAberto(filtroAberto === "a1e" ? null : "a1e")
                  }
                >
                  A1E
                </button>
                <FilterMenu
                  coluna="A1E"
                  tipo="number"
                  aberto={filtroAberto === "a1e"}
                  filtro={filtros.a1e}
                  onClose={() => setFiltroAberto(null)}
                  onUpdate={(chave, valor) =>
                    atualizarFiltroPopup("a1e", chave, valor)
                  }
                  onSort={(direcao) => setOrdenacao({ coluna: "a1e", direcao })}
                  onClear={() => limparFiltro("a1e", "number")}
                />
              </th>

              <th>DATA</th>
              <th>DATA INICIO</th>
              <th>DATA FIM</th>
              <th>ALTERADO PRIMAVERA</th>

              <th className="filter-th">
                <button
                  type="button"
                  className="filter-button"
                  onClick={() =>
                    setFiltroAberto(filtroAberto === "info" ? null : "info")
                  }
                >
                  INFORMAÇÃO
                </button>
                <FilterMenu
                  coluna="INFORMAÇÃO"
                  tipo="text"
                  aberto={filtroAberto === "info"}
                  filtro={filtros.info}
                  onClose={() => setFiltroAberto(null)}
                  onUpdate={(chave, valor) =>
                    atualizarFiltroPopup("info", chave, valor)
                  }
                  onSort={(direcao) =>
                    setOrdenacao({ coluna: "info", direcao })
                  }
                  onClear={() => limparFiltro("info", "text")}
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

import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PromoPilotMark from "../components/brand/PromoPilotMark";
import { presentation } from "../config/presentation";
import "../styles/presentation.css";

const views = [
  { name: "Campanhas", title: "Da seleção à ação.", text: "Reúna artigos, confirme preços e escolha as datas.", rows: [["Lista de artigos", "Preparada"], ["Preços e validade", "A rever"], ["Etiquetas", "Prontas para imprimir"]] },
  { name: "Etiquetas", title: "Detalhes que se destacam.", text: "Prepare etiquetas claras para os artigos da sua loja.", rows: [["Comunicação em loja", "Clara"], ["Apresentação", "Cuidada"], ["Impressão", "Ao seu ritmo"]] },
  { name: "Propostas", title: "Apresente com confiança.", text: "Organize artigos e preços numa proposta cuidada.", rows: [["Seleção de artigos", "Reunida"], ["Dossier comercial", "Organizado"], ["Proposta", "Pronta a apresentar"]] },
];
const mail = `mailto:${presentation.email}?subject=${encodeURIComponent("Pedido de orçamento — PromoPilot")}`;

export default function Presentation() {
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const view = views[active];
  useEffect(() => {
    const previous = document.title;
    document.title = "PromoPilot | Mais tempo para a sua loja";
    const nodes = root.current.querySelectorAll("[data-reveal]");
    let observer;
    if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
      }), { threshold: 0.12 });
      nodes.forEach(node => { node.classList.add("reveal-ready"); observer.observe(node); });
    }
    return () => { document.title = previous; observer?.disconnect(); };
  }, []);
  return <div className="pp-public" ref={root}>
    <a className="pp-public-skip" href="#conteudo">Saltar para o conteúdo</a>
    <header className="pp-public-nav">
      <Link to="/" aria-label="PromoPilot — início"><PromoPilotMark tone="light" /></Link>
      <nav aria-label="Navegação principal"><a href="#produto">Produto</a><a href="#planos">Planos</a><Link to="/login" className="pp-public-login">Entrar <span aria-hidden="true">↗</span></Link></nav>
    </header>
    <main id="conteudo">
      <section className="pp-public-hero">
        <div className="pp-public-orbit" aria-hidden="true" />
        <div className="pp-public-hero-copy">
          <span className="pp-public-eyebrow">A SUA LOJA. UM NOVO RITMO.</span>
          <h1>Menos tarefas.<br /><span>Mais loja.</span></h1>
          <p>Campanhas, etiquetas e propostas.<br />O trabalho da sua equipa, num só lugar.</p>
          <div className="pp-public-actions"><a href={mail} className="pp-public-button">Pedir orçamento <span aria-hidden="true">↗</span></a><a href="#produto" className="pp-public-secondary">Explorar o PromoPilot ↓</a></div>
        </div>
        <div className="pp-public-showcase" aria-label="Campanhas, etiquetas e propostas ligadas num único fluxo de trabalho">
          <div className="pp-public-showcase-grid" aria-hidden="true" />
          <div className="pp-public-showcase-caption"><span>O SEU DIA, ORGANIZADO.</span><span aria-hidden="true">↗</span></div>
          <div className="pp-public-flow-art" aria-hidden="true">
            <svg className="pp-public-flow-lines" viewBox="0 0 480 360" fill="none"><ellipse cx="240" cy="180" rx="190" ry="122"/><ellipse cx="240" cy="180" rx="140" ry="90"/><path d="M85 91L240 180L389 94M240 180V295"/></svg>
            <div className="pp-public-flow-core"><svg viewBox="0 0 48 48" fill="none"><path d="M12 35V13h13a9 9 0 0 1 0 18h-5"/><path d="m24 18 6 4-6 4"/></svg></div>
            <div className="pp-public-flow-tile pp-public-flow-campaign"><span className="pp-public-tile-symbol">↗</span><div><small>PREPARE</small><strong>Campanhas</strong></div><div className="pp-public-mini-bars"><i/><i/><i/></div></div>
            <div className="pp-public-flow-tile pp-public-flow-label"><span className="pp-public-tile-symbol">◇</span><div><small>DÊ DESTAQUE</small><strong>Etiquetas</strong></div><div className="pp-public-mini-label"><i/><i/></div></div>
            <div className="pp-public-flow-tile pp-public-flow-proposal"><span className="pp-public-tile-symbol">≡</span><div><small>APRESENTE</small><strong>Propostas</strong></div><span className="pp-public-flow-check">✓</span></div>
          </div>
          <div className="pp-public-showcase-footer"><span className="pp-public-flow-dot" aria-hidden="true"/><p>Do planeamento à loja.<br /><strong>Tudo no mesmo lugar.</strong></p><span aria-hidden="true">01 — 03</span></div>
        </div>
      </section>
      <div className="pp-public-strip"><span>Prepare com clareza</span><span>Apresente com cuidado</span><span>Trabalhe com confiança</span></div>
      <section id="produto" className="pp-public-section" data-reveal>
        <div className="pp-public-section-heading"><span className="pp-public-eyebrow">DA PREPARAÇÃO À APRESENTAÇÃO</span><h2>Uma rotina.<br /><span>Muito mais simples.</span></h2></div>
        <div className="pp-public-product">
          <div><div className="pp-public-switch" role="group" aria-label="Explorar funcionalidades">{views.map((item, index) => <button key={item.name} type="button" aria-pressed={active === index} onClick={() => setActive(index)}>{item.name}</button>)}</div><div className="pp-public-product-copy" key={view.name}><h3>{view.title}</h3><p>{view.text}</p></div></div>
          <div className="pp-public-workflow" aria-live="polite" aria-atomic="true">{view.rows.map(([label, status], index) => <div key={label}><span className="pp-public-number">0{index + 1}</span><strong>{label}</strong><small>{status}</small></div>)}</div>
        </div>
      </section>
      <section className="pp-public-benefits pp-public-section" data-reveal><article><span>01 / ORGANIZE</span><h3>Menos dispersão.</h3><p>Reúna a preparação das campanhas num único espaço.</p></article><article><span>02 / PREPARE</span><h3>Ao seu ritmo.</h3><p>Defina as datas e reveja os detalhes antes de avançar.</p></article><article><span>03 / APRESENTE</span><h3>Uma imagem cuidada.</h3><p>Dê consistência às etiquetas e às propostas da sua loja.</p></article></section>
      <section id="planos" className="pp-public-section pp-public-budget" data-reveal><div><span className="pp-public-eyebrow">PLANOS PROMOPILOT</span><h2>À medida<br /><span>da sua loja.</span></h2><p>Conte-nos o que a sua equipa precisa.<br />Preparamos uma proposta para o seu negócio.</p></div><div className="pp-public-budget-card"><span className="pp-public-eyebrow">UMA PROPOSTA PARA SI</span><h3>Sob orçamento</h3><p>Planos e condições definidos de acordo com as suas necessidades.</p><a href={mail} className="pp-public-button">Pedir orçamento <span aria-hidden="true">↗</span></a><a href={`mailto:${presentation.email}`} className="pp-public-email">{presentation.email}</a></div></section>
      <section className="pp-public-closing" data-reveal><span className="pp-public-eyebrow">MAIS TEMPO PARA O QUE IMPORTA</span><h2>A sua equipa.<br />A sua loja. O seu ritmo.</h2><a href={mail} className="pp-public-secondary">Vamos conversar ↗</a></section>
    </main>
    <footer className="pp-public-footer"><Link to="/" aria-label="PromoPilot — início"><PromoPilotMark tone="light" /></Link><span>Ferramentas para o dia a dia da loja.</span><Link to="/login">Acesso de clientes ↗</Link></footer>
  </div>;
}

import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PromoPilotMark from "../components/brand/PromoPilotMark";
import { presentation } from "../config/presentation";
import "../styles/presentation.css";

const views = [
  { name: "Campanhas", title: "Da seleção à ação.", text: "Reúna artigos, confirme preços e escolha as datas.", rows: [["Lista de artigos", "Preparada"], ["Preços e validade", "A rever"], ["Etiquetas", "Prontas para imprimir"]] },
  { name: "Etiquetas", title: "Detalhes que se destacam.", text: "Prepare etiquetas claras para os artigos da sua loja.", rows: [["Código e descrição", "Organizados"], ["Preço promocional", "Em destaque"], ["Impressão", "Ao seu ritmo"]] },
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
        <div className="pp-public-stage" aria-label="Exemplo ilustrativo de uma campanha">
          <div className="pp-public-stage-top"><span><i /> PromoPilot</span><small>EXEMPLO ILUSTRATIVO</small></div>
          <div className="pp-public-stage-inner"><span className="pp-public-eyebrow">A PRÓXIMA CAMPANHA</span><h2>Pronta para<br />ganhar destaque.</h2>
            <div className="pp-public-sample"><div><small>ARTIGO DE DEMONSTRAÇÃO</small><strong>Auscultadores sem fios</strong><span>01.670.001.00003</span></div><div className="pp-public-sample-price"><del>79,99 €</del><b>59,99 €</b></div></div>
            <div className="pp-public-stage-bottom"><span>Artigos → Revisão → Etiquetas</span><span aria-hidden="true">↗</span></div>
          </div>
        </div>
      </section>
      <div className="pp-public-strip"><span>Campanhas manuais e Excel</span><span>Pesquisa de artigos</span><span>Etiquetas e propostas</span></div>
      <section id="produto" className="pp-public-section" data-reveal>
        <div className="pp-public-section-heading"><span className="pp-public-eyebrow">DO PRIMEIRO ARTIGO À ÚLTIMA ETIQUETA</span><h2>Uma rotina.<br /><span>Muito mais simples.</span></h2></div>
        <div className="pp-public-product">
          <div><div className="pp-public-switch" role="group" aria-label="Explorar funcionalidades">{views.map((item, index) => <button key={item.name} type="button" aria-pressed={active === index} onClick={() => setActive(index)}>{item.name}</button>)}</div><div className="pp-public-product-copy" key={view.name}><h3>{view.title}</h3><p>{view.text}</p></div></div>
          <div className="pp-public-workflow" aria-live="polite" aria-atomic="true">{view.rows.map(([label, status], index) => <div key={label}><span className="pp-public-number">0{index + 1}</span><strong>{label}</strong><small>{status}</small></div>)}</div>
        </div>
      </section>
      <section className="pp-public-benefits pp-public-section" data-reveal><article><span>01 / ENCONTRE</span><h3>Os artigos certos.</h3><p>Pesquise ou cole uma lista de códigos.</p></article><article><span>02 / PREPARE</span><h3>Ao seu ritmo.</h3><p>Escolha 15 dias, 30 dias ou datas à medida.</p></article><article><span>03 / APRESENTE</span><h3>Com clareza.</h3><p>Etiquetas e propostas com tudo no lugar.</p></article></section>
      <section id="planos" className="pp-public-section pp-public-budget" data-reveal><div><span className="pp-public-eyebrow">PLANOS PROMOPILOT</span><h2>À medida<br /><span>da sua loja.</span></h2><p>Conte-nos o que a sua equipa precisa.<br />Preparamos uma proposta para o seu negócio.</p></div><div className="pp-public-budget-card"><span className="pp-public-eyebrow">UMA PROPOSTA PARA SI</span><h3>Sob orçamento</h3><p>Planos e condições definidos de acordo com as suas necessidades.</p><a href={mail} className="pp-public-button">Pedir orçamento <span aria-hidden="true">↗</span></a><a href={`mailto:${presentation.email}`} className="pp-public-email">{presentation.email}</a></div></section>
      <section className="pp-public-closing" data-reveal><span className="pp-public-eyebrow">O PRÓXIMO PASSO COMEÇA AQUI</span><h2>Dê mais espaço<br />ao que importa.</h2><a href={mail} className="pp-public-secondary">Vamos falar sobre a sua loja ↗</a></section>
    </main>
    <footer className="pp-public-footer"><Link to="/" aria-label="PromoPilot — início"><PromoPilotMark tone="light" /></Link><span>Ferramentas para o dia a dia da loja.</span><Link to="/login">Acesso de clientes ↗</Link></footer>
  </div>;
}

import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import PromoPilotMark from "../components/brand/PromoPilotMark";
import { presentation } from "../config/presentation";
import "../styles/presentation.css";

const features = [
  ["01", "Campanhas prontas para a loja", "Reúna os artigos, confirme os preços e prepare as etiquetas de campanha num só lugar."],
  ["02", "Encontre o artigo certo", "Pesquise por código, EAN ou descrição. Cole uma lista de códigos e veja quais foram encontrados."],
  ["03", "Mais controlo antes de imprimir", "Reveja os artigos e os avisos de validação. Ajuste os preços quando permitido e escolha a duração da campanha."],
  ["04", "Propostas bem apresentadas", "Organize os orçamentos em dossiers e prepare propostas comerciais com imagens, preços e resumo."],
];
const questions = [
  ["Posso trabalhar com uma lista de códigos?", "Sim. Pode colar uma lista, pesquisar códigos exatos e identificar os códigos não encontrados. Os duplicados são removidos."],
  ["O EAN aparece na revisão da campanha?", "Sim. A lista de revisão apresenta o EAN quando está disponível no artigo, juntamente com o código e o estado de validação."],
  ["Posso escolher a duração da campanha?", "Pode usar as opções de 15 ou 30 dias, ou definir as datas da campanha."],
  ["Também posso importar artigos de Excel?", "O PromoPilot inclui um fluxo de importação Excel para preparar etiquetas em lote."],
];

export default function Presentation() {
  useEffect(() => {
    const previous = document.title;
    document.title = "PromoPilot | Campanhas, etiquetas e propostas";
    return () => { document.title = previous; };
  }, []);
  const email = presentation.email.trim();
  const phone = presentation.phone.trim();
  const phoneHref = phone.replace(/[^+\d]/g, "");
  return (
    <div className="pp-presentation">
      <a className="pp-web-skip" href="#conteudo">Saltar para o conteúdo</a>
      <header className="pp-web-header">
        <Link to="/apresentacao" aria-label="PromoPilot — apresentação"><PromoPilotMark /></Link>
        <nav aria-label="Navegação da apresentação">
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#planos">Planos</a>
          <a href="#contactos">Contactos</a>
        </nav>
        <Link className="pp-web-button pp-web-button-small" to="/login">Entrar <span aria-hidden="true">↗</span></Link>
      </header>
      <main id="conteudo">
        <section className="pp-web-hero pp-web-container">
          <div>
            <span className="pp-web-kicker">PARA O DIA A DIA DA SUA LOJA</span>
            <h1>Boas campanhas.<br /><em>Menos complicações.</em></h1>
            <p>Dos artigos às etiquetas, dos orçamentos às propostas. O PromoPilot reúne as ferramentas para preparar o trabalho da sua equipa com mais clareza.</p>
            <div className="pp-web-actions">
              <a className="pp-web-button" href="#planos">Conhecer os planos <span aria-hidden="true">→</span></a>
              <a className="pp-web-text-link" href="#funcionalidades">Explorar funcionalidades</a>
            </div>
            <div className="pp-web-hero-notes"><span>Campanhas e etiquetas</span><span>Artigos e EAN</span><span>Propostas comerciais</span></div>
          </div>
          <div className="pp-web-preview" aria-label="Exemplo ilustrativo de uma revisão de campanha">
            <div className="pp-web-preview-bar"><span className="pp-web-dot" /> PromoPilot <span>Exemplo ilustrativo</span></div>
            <div className="pp-web-preview-body">
              <span className="pp-web-kicker">TUDO PRONTO PARA REVER</span>
              <h2>A próxima campanha<br />começa aqui.</h2>
              <div className="pp-web-preview-tabs"><span>Lista de artigos</span><span>15 dias</span><span>30 dias</span></div>
              <div className="pp-web-product"><span className="pp-web-product-icon" aria-hidden="true">01</span><div><strong>Artigo de demonstração</strong><small>Código · EAN · Preço</small></div><span className="pp-web-status">Validado</span></div>
              <div className="pp-web-product"><span className="pp-web-product-icon" aria-hidden="true">02</span><div><strong>Artigo de demonstração</strong><small>Revisão dos preços</small></div><span className="pp-web-status pp-web-status-review">A rever</span></div>
              <div className="pp-web-preview-footer"><span>Confirme. Prepare. Imprima.</span><span aria-hidden="true">↗</span></div>
            </div>
          </div>
        </section>
        <section id="funcionalidades" className="pp-web-features">
          <div className="pp-web-container">
            <div className="pp-web-section-title"><div><span className="pp-web-kicker">UMA ROTINA MAIS SIMPLES</span><h2>Da pesquisa à apresentação.<br />Tudo com o mesmo cuidado.</h2></div><p>Ferramentas práticas para as tarefas que se repetem todos os dias.</p></div>
            <div className="pp-web-feature-grid">{features.map(([number, title, text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
          </div>
        </section>
        <section className="pp-web-container pp-web-workflow">
          <div><span className="pp-web-kicker">COMO FUNCIONA</span><h2>Três passos.<br />Uma campanha preparada.</h2></div>
          <ol><li><strong>Escolha os artigos</strong><p>Pesquise individualmente ou cole a sua lista de códigos.</p></li><li><strong>Reveja os detalhes</strong><p>Confirme preços, EAN, avisos e datas da campanha.</p></li><li><strong>Prepare as etiquetas</strong><p>Conclua a seleção e avance para a impressão.</p></li></ol>
        </section>
        <section id="planos" className="pp-web-plans pp-web-container">
          <div className="pp-web-section-title"><div><span className="pp-web-kicker">PLANOS PROMOPILOT</span><h2>O próximo passo para a sua loja.</h2></div></div>
          {presentation.plans.length > 0 ? <div className="pp-web-plan-grid">{presentation.plans.map(plan => <article key={plan.name} className={`pp-web-plan ${plan.highlighted ? "pp-web-plan-highlight" : ""}`}><h3>{plan.name}</h3><p>{plan.description}</p><div className="pp-web-price">{plan.price}<small>{plan.period}</small></div><ul>{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul><a className="pp-web-button" href="#contactos">Saber mais sobre este plano</a></article>)}</div> : <div className="pp-web-pending"><h3>Informação comercial em preparação</h3><p>Os planos, preços e condições de adesão serão disponibilizados nesta página.</p></div>}
        </section>
        <section className="pp-web-container pp-web-faq"><div><span className="pp-web-kicker">PERGUNTAS FREQUENTES</span><h2>Antes de começar.</h2></div><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
        <section id="contactos" className="pp-web-container pp-web-contact"><div><span className="pp-web-kicker">VAMOS CONVERSAR</span><h2>Vamos preparar<br />a sua próxima campanha?</h2><p>Conheça melhor o PromoPilot e esclareça as suas dúvidas.</p></div><div className="pp-web-contact-links">{email && <a href={`mailto:${email}`}><small>Email</small><strong>{email}</strong><span aria-hidden="true">↗</span></a>}{phoneHref && <a href={`tel:${phoneHref}`}><small>Telefone</small><strong>{phone}</strong><span aria-hidden="true">↗</span></a>}{!email && !phoneHref && <p>Os contactos comerciais serão disponibilizados em breve.</p>}<Link className="pp-web-existing" to="/login">Já utiliza o PromoPilot? Entre na sua conta →</Link></div></section>
      </main>
      <footer className="pp-web-footer pp-web-container"><PromoPilotMark /><span>Campanhas, etiquetas e propostas.</span><a href="#conteudo">Voltar ao início ↑</a></footer>
    </div>
  );
}

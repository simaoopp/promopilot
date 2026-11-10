import React from "react";

export default class DossierErrorBoundary extends React.Component {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {
    console.warn("[dossiers]", { operation: "render", code: "DOSSIER_RENDER_FAILED" });
  }
  render() {
    if (this.state.failed) return <main className="quote-dossiers-page"><section className="quote-card" role="alert">
      <h1>Não foi possível apresentar o dossier</h1>
      <p>Tenta recuperar o rascunho sem voltar a importar o orçamento.</p>
      <button type="button" className="btn btn-primary" onClick={() => this.setState(state => ({ failed: false, attempt: state.attempt + 1 }))}>Recuperar dossier</button>
    </section></main>;
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

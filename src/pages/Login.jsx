import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import ForcePasswordChangeModal from "../components/ForcePasswordChangeModal";
import PromoPilotMark from "../components/brand/PromoPilotMark";
import { useAuth } from "../context/AuthContext";
import { PROMOPILOT_BRAND, PROMOPILOT_MODULES } from "../brand/promopilot";
import "../styles/styles.css";

export default function Login() {
  const {
    user,
    loadingAuth,
    loadingProfile,
    signIn,
    onboardingRequired,
    requiresPasswordChange,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const mostrarModalOnboarding = !!user && !loadingProfile && onboardingRequired;

  if (loadingAuth || (user && loadingProfile)) {
    return (
      <div className="login-page pp-login-page">
        <div className="pp-login-loading">
          <PromoPilotMark tone="light" />
          <p>A carregar...</p>
        </div>
      </div>
    );
  }

  if (user && !onboardingRequired) {
    return <Navigate to="/Homepage" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      const emailLimpo = String(email || "").trim();
      await signIn(emailLimpo, senha);
    } catch (_err) {
      setErro("Email ou palavra-passe inválidos.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-page pp-login-page">
      <div className="pp-login-bg-grid" aria-hidden="true" />
      <div className="pp-login-orb pp-login-orb-one" aria-hidden="true" />
      <div className="pp-login-orb pp-login-orb-two" aria-hidden="true" />

      <main className="pp-login-layout">
        <section className="pp-login-intro" aria-label="Apresentação PromoPilot">
          <PromoPilotMark tone="light" className="pp-login-brand" />

          <div className="pp-login-hero-copy">
            <span className="pp-kicker">Ferramentas para loja</span>
            <h1>{PROMOPILOT_BRAND.claim}</h1>
            <p>
              Tudo no mesmo sítio: pesquisa artigos, prepara campanhas, imprime
              etiquetas e cria dossiers de orçamento com uma apresentação mais cuidada.
            </p>
          </div>

          <div className="pp-login-module-grid">
            {PROMOPILOT_MODULES.map((module) => (
              <article key={module.key} className="pp-login-module-card">
                <strong>{module.label}</strong>
                <span>{module.description}</span>
              </article>
            ))}
          </div>

          <div className="pp-login-trust-row">
            <span>Simples para usar</span>
            <span>Rápido para vender</span>
            <span>Pronto para imprimir</span>
          </div>
        </section>

        <section className="login-card pp-login-card" aria-label="Autenticação">
          {!user && (
            <>
              <div className="pp-login-card-header">
                <span className="pp-card-chip">Acesso reservado</span>
                <h2>Entrar no PromoPilot</h2>
                <p>Use o seu email e palavra-passe para continuar.</p>
              </div>

              <form onSubmit={handleSubmit} className="login-form pp-login-form">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="seu.email@empresa.pt"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={carregando}
                  required
                />

                <label htmlFor="senha">Palavra-passe</label>
                <div className="login-password-wrap">
                  <input
                    id="senha"
                    type={mostrarSenha ? "text" : "password"}
                    placeholder="A sua palavra-passe"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    autoComplete="current-password"
                    disabled={carregando}
                    required
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setMostrarSenha((prev) => !prev)}
                    aria-label={mostrarSenha ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                    aria-pressed={mostrarSenha}
                    disabled={carregando}
                  >
                    {mostrarSenha ? "Ocultar" : "Mostrar"}
                  </button>
                </div>

                <button type="submit" className="login-submit pp-login-submit" disabled={carregando}>
                  <span>{carregando ? "A entrar..." : "Entrar"}</span>
                </button>

                {erro && <p className="login-erro">{erro}</p>}
              </form>

              <div className="pp-login-footer-note">
                <strong>Antes de imprimir</strong>
                <span>Confirme sempre o artigo, o preço e a validade da campanha.</span>
              </div>
            </>
          )}
        </section>
      </main>

      {mostrarModalOnboarding && (
        <ForcePasswordChangeModal
          open={true}
          requirePassword={requiresPasswordChange}
        />
      )}
    </div>
  );
}

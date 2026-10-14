import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import ForcePasswordChangeModal from "../components/ForcePasswordChangeModal";
import PasswordRecoveryModal from "../components/PasswordRecoveryModal";
import PromoPilotMark from "../components/brand/PromoPilotMark";
import AppLoading from "../components/AppLoading";
import { useAuth } from "../context/AuthContext";

import "../styles/styles.css";
import "../styles/login-access.css";

export default function Login() {
  const {
    user,
    loadingAuth,
    loadingProfile,
    signIn,
    onboardingRequired,
    requiresPasswordChange,
    passwordRecovery,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const mostrarModalOnboarding = !!user && !loadingProfile && onboardingRequired;

  if (loadingAuth || (user && loadingProfile)) {
    return <AppLoading message="A preparar o acesso à sua conta…" />;
  }

  if (user && !onboardingRequired && !passwordRecovery) {
    const nextCandidate =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : "";
    const safeNext =
      nextCandidate && nextCandidate.startsWith("/") && !nextCandidate.startsWith("//")
        ? nextCandidate
        : "/Homepage";

    return <Navigate to={safeNext} replace />;
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
    <div className="login-page pp-login-page pp-access-page">
      <div className="pp-login-bg-grid" aria-hidden="true" />
      <div className="pp-login-orb pp-login-orb-one" aria-hidden="true" />
      <div className="pp-login-orb pp-login-orb-two" aria-hidden="true" />

      <main className="pp-login-layout">
        <Link className="pp-access-back" to="/">← Voltar ao início</Link>
        <Link className="pp-access-brand" to="/" aria-label="PromoPilot — início"><PromoPilotMark tone="light" /></Link>

        <section className="login-card pp-login-card" aria-label="Autenticação">
          {!user && (
            <>
              <div className="pp-login-card-header">
                <span className="pp-card-chip">Acesso reservado</span>
                <h1>Bem-vindo de volta.</h1>
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

                {erro && <p className="login-erro" role="alert">{erro}</p>}
              </form>

              <div className="pp-login-footer-note">
                <span>Precisa de acesso ou de ajuda?</span>
                <a href="mailto:geral@promopilot.pt">geral@promopilot.pt</a>
              </div>
            </>
          )}
        </section>
      </main>

      {passwordRecovery && user && (
        <PasswordRecoveryModal open={true} />
      )}

      {mostrarModalOnboarding && !passwordRecovery && (
        <ForcePasswordChangeModal
          open={true}
          requirePassword={requiresPasswordChange}
        />
      )}
    </div>
  );
}

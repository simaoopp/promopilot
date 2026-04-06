import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../favicon.png";

export default function Login() {
  const { user, loadingAuth, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  if (!loadingAuth && user) {
    return <Navigate to="/EtiquetasCampanha" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      await signIn(email, senha);

      if (senha === "123") {
        sessionStorage.setItem("force_password_change", "true");
      } else {
        sessionStorage.removeItem("force_password_change");
      }
    } catch (err) {
      setErro("Email ou senha inválidos.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-orb login-bg-orb-3" />

      <div className="login-stage">
        <div className="login-shape shape-blob-1" />
        <div className="login-shape shape-blob-2" />
        <div className="login-shape shape-blob-3" />
        <div className="login-shape shape-pill-1" />
        <div className="login-shape shape-pill-2" />
        <div className="login-shape shape-pill-3" />
        <div className="login-shape shape-ring-1" />
        <div className="login-shape shape-ring-2" />

        <div className="login-card glass">
          <div className="login-card-glow" />

          <div className="login-brand">
            <img src={logo} alt="Expert" className="login-logo" />
            <div className="login-brand-text">
              <p className="login-brand-mini">Expert Administração</p>
              <h1>Login</h1>
              <p className="login-subtitle">
                Entre com o seu email e palavra-passe para aceder ao sistema.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="seu.email@susiarte.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setMostrarSenha((prev) => !prev)}
              >
                {mostrarSenha ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            <button
              type="submit"
              className="login-submit"
              disabled={carregando}
            >
              <span>{carregando ? "A entrar..." : "Entrar"}</span>
            </button>

            {erro && <p className="login-erro">{erro}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../logo.png";

function passwordValida(password) {
  const limpa = String(password || "").trim();

  const minLength = limpa.length >= 8;
  const hasLetter = /[A-Za-zÀ-ÿ]/.test(limpa);
  const hasNumber = /\d/.test(limpa);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-\\/\[\];'`~+=]/.test(limpa);

  const passwordsProibidas = [
    "123",
    "1234",
    "12345",
    "123456",
    "password",
    "admin",
    "qwerty",
  ];

  const notCommon = !passwordsProibidas.includes(limpa.toLowerCase());

  return minLength && hasLetter && hasNumber && hasSpecial && notCommon;
}

export default function Sidebar({
  menuAberto,
  setMenuAberto,
  titulo = "Expert Administração",
}) {
  const location = useLocation();
  const { user, profile, signOut, updatePassword } = useAuth();

  const [submenuEtiquetasAberto, setSubmenuEtiquetasAberto] = useState(false);
  const [loadingLogout, setLoadingLogout] = useState(false);

  const [menuContaAberto, setMenuContaAberto] = useState(false);
  const [modalPasswordAberto, setModalPasswordAberto] = useState(false);
  const [novaPassword, setNovaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [erroPassword, setErroPassword] = useState("");
  const [sucessoPassword, setSucessoPassword] = useState("");

  const contaMenuRef = useRef(null);

  const rotaEtiquetasAtiva = useMemo(() => {
    return (
      location.pathname === "/Etiquetas" ||
      location.pathname === "/EtiquetasCampanha" ||
      location.pathname === "/EtiquetasCampanhaExcel"
    );
  }, [location.pathname]);

  const nomeUtilizador = useMemo(() => {
    const nome = [profile?.first_name, profile?.last_name]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");

    return nome || String(user?.email || "").trim() || "Conta";
  }, [profile?.first_name, profile?.last_name, user?.email]);

  useEffect(() => {
    if (rotaEtiquetasAtiva) {
      setSubmenuEtiquetasAberto(true);
    }
  }, [rotaEtiquetasAtiva]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setMenuAberto(false);
        setMenuContaAberto(false);
        setModalPasswordAberto(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [setMenuAberto]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        contaMenuRef.current &&
        !contaMenuRef.current.contains(event.target)
      ) {
        setMenuContaAberto(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function fecharTudo() {
    setMenuAberto(false);
  }

  function toggleSubmenu() {
    setSubmenuEtiquetasAberto((prev) => !prev);
  }

  function isActive(path) {
    if (path === "/Homepage") {
      return location.pathname === "/Homepage" || location.pathname === "/";
    }

    return location.pathname === path;
  }

  function abrirModalPassword() {
    setErroPassword("");
    setSucessoPassword("");
    setNovaPassword("");
    setConfirmarPassword("");
    setMenuContaAberto(false);
    setModalPasswordAberto(true);
  }

  function fecharModalPassword() {
    setModalPasswordAberto(false);
    setErroPassword("");
    setSucessoPassword("");
    setNovaPassword("");
    setConfirmarPassword("");
  }

  async function handleLogout() {
    try {
      setLoadingLogout(true);
      await signOut();
      setMenuContaAberto(false);
      fecharTudo();
    } catch (error) {
      console.error("Erro ao sair:", error.message);
    } finally {
      setLoadingLogout(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setErroPassword("");
    setSucessoPassword("");

    const passwordTrimmed = String(novaPassword || "").trim();
    const confirmTrimmed = String(confirmarPassword || "").trim();

    if (!passwordValida(passwordTrimmed)) {
      setErroPassword(
        "A nova palavra-passe deve ter pelo menos 8 caracteres, incluir letras, números e 1 carácter especial, e não pode ser demasiado comum.",
      );
      return;
    }

    if (passwordTrimmed !== confirmTrimmed) {
      setErroPassword("As palavras-passe não coincidem.");
      return;
    }

    try {
      setLoadingPassword(true);
      await updatePassword(passwordTrimmed);
      setSucessoPassword("Palavra-passe atualizada com sucesso.");

      setTimeout(() => {
        fecharModalPassword();
      }, 1200);
    } catch (error) {
      setErroPassword(error?.message || "Erro ao atualizar a palavra-passe.");
    } finally {
      setLoadingPassword(false);
    }
  }

  return (
    <>
      <div className="topbar-site no-print">
        <button
          type="button"
          className="menu-button"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
          aria-expanded={menuAberto}
          aria-controls="sidebar-navigation"
        >
          ☰
        </button>

        <img src={logo} alt="Expert" className="logo-topbar" />
        <div className="topbar-title">{titulo}</div>

        <div className="topbar-spacer" />

        <div className="topbar-account" ref={contaMenuRef}>
          <button
            type="button"
            className="topbar-account-button"
            onClick={() => setMenuContaAberto((prev) => !prev)}
          >
            <span className="topbar-account-name">{nomeUtilizador}</span>
            <span
              className={`topbar-account-arrow ${menuContaAberto ? "open" : ""}`}
            >
              ▾
            </span>
          </button>

          {menuContaAberto && (
            <div className="topbar-account-menu">
              <button
                type="button"
                className="topbar-account-menu-item"
                onClick={abrirModalPassword}
              >
                Alterar palavra-passe
              </button>

              <button
                type="button"
                className="topbar-account-menu-item topbar-account-menu-item-danger"
                onClick={handleLogout}
                disabled={loadingLogout}
              >
                {loadingLogout ? "A sair..." : "Sair"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className={`sidebar-overlay ${menuAberto ? "show" : ""}`}
        onClick={fecharTudo}
        aria-hidden={!menuAberto}
      />

      <aside
        id="sidebar-navigation"
        className={`sidebar no-print ${menuAberto ? "open" : ""}`}
        aria-hidden={!menuAberto}
      >
        <div className="sidebar-header">
          <img src={logo} alt="Expert" className="logo-sidebar" />

          <button
            type="button"
            className="close-sidebar"
            onClick={fecharTudo}
            aria-label="Fechar menu"
          >
            ×
          </button>
        </div>

        <div className="sidebar-body">
          <Link
            to="/Homepage"
            className={`sidebar-link ${isActive("/Homepage") ? "active" : ""}`}
            onClick={fecharTudo}
          >
            <span>Início</span>
          </Link>

          <button
            type="button"
            className="sidebar-link"
            onClick={toggleSubmenu}
            aria-expanded={submenuEtiquetasAberto}
            aria-controls="submenu-etiquetas"
          >
            <span>Etiquetas</span>
            <span className={`arrow ${submenuEtiquetasAberto ? "open" : ""}`}>
              ▸
            </span>
          </button>

          {submenuEtiquetasAberto && (
            <div id="submenu-etiquetas" className="sidebar-submenu">
              <Link
                to="/Etiquetas"
                className={`sidebar-sublink ${
                  isActive("/Etiquetas") ? "active" : ""
                }`}
                onClick={fecharTudo}
              >
                Etiquetas
              </Link>

              <Link
                to="/EtiquetasCampanha"
                className={`sidebar-sublink ${
                  isActive("/EtiquetasCampanha") ? "active" : ""
                }`}
                onClick={fecharTudo}
              >
                Etiquetas de Campanha
              </Link>

              <Link
                to="/EtiquetasCampanhaExcel"
                className={`sidebar-sublink ${
                  isActive("/EtiquetasCampanhaExcel") ? "active" : ""
                }`}
                onClick={fecharTudo}
              >
                Etiquetas de Campanha (Excel)
              </Link>
            </div>
          )}
        </div>
      </aside>

      {modalPasswordAberto && (
        <div className="force-password-overlay">
          <div
            className="force-password-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
          >
            <h2 id="change-password-title">Alterar palavra-passe</h2>

            <p>Defina uma nova palavra-passe para a sua conta.</p>

            <form
              onSubmit={handleChangePassword}
              className="force-password-form"
            >
              <label htmlFor="nova-password-topbar">Nova palavra-passe</label>
              <input
                id="nova-password-topbar"
                type="password"
                value={novaPassword}
                onChange={(e) => setNovaPassword(e.target.value)}
                placeholder="Nova palavra-passe"
                autoComplete="new-password"
                required
                disabled={loadingPassword}
              />

              <label htmlFor="confirmar-password-topbar">
                Confirmar palavra-passe
              </label>
              <input
                id="confirmar-password-topbar"
                type="password"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                placeholder="Confirmar palavra-passe"
                autoComplete="new-password"
                required
                disabled={loadingPassword}
              />

              <div className="force-password-rules">
                Mínimo 8 caracteres, com letras, números e pelo menos 1 carácter
                especial.
              </div>

              {erroPassword && (
                <p className="force-password-error">{erroPassword}</p>
              )}

              {sucessoPassword && (
                <p className="force-password-success">{sucessoPassword}</p>
              )}

              <div className="popup-actions popup-actions-pro">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loadingPassword}
                >
                  {loadingPassword ? "A guardar..." : "Guardar"}
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={fecharModalPassword}
                  disabled={loadingPassword}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

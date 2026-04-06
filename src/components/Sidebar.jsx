import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../logo.png";

export default function Sidebar({
  menuAberto,
  setMenuAberto,
  titulo = "Expert Administração",
}) {
  const [submenuEtiquetasAberto, setSubmenuEtiquetasAberto] = useState(false);
  const location = useLocation();
  const { signOut } = useAuth();

  function fecharTudo() {
    setMenuAberto(false);
  }

  function toggleSubmenu() {
    setSubmenuEtiquetasAberto((prev) => !prev);
  }

  async function handleLogout() {
    try {
      await signOut();
      fecharTudo();
    } catch (error) {
      console.error("Erro ao sair:", error.message);
    }
  }

  return (
    <>
      <div className="topbar-site no-print">
        <button
          className="menu-button"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
        >
          ☰
        </button>

        <img src={logo} alt="Expert" className="logo-topbar" />
        <div className="topbar-title">{titulo}</div>
      </div>

      <div
        className={`sidebar-overlay ${menuAberto ? "show" : ""}`}
        onClick={fecharTudo}
      ></div>

      <aside className={`sidebar no-print ${menuAberto ? "open" : ""}`}>
        <div className="sidebar-header">
          <img src={logo} alt="Expert" className="logo-sidebar" />
          <button
            className="close-sidebar"
            onClick={fecharTudo}
            aria-label="Fechar menu"
          >
            ×
          </button>
        </div>

        <div className="sidebar-body">
          <button className="sidebar-link" onClick={toggleSubmenu}>
            <span>Etiquetas</span>
            <span className={`arrow ${submenuEtiquetasAberto ? "open" : ""}`}>
              ▸
            </span>
          </button>

          {submenuEtiquetasAberto && (
            <div className="sidebar-submenu">
              <Link
                to="/EtiquetasCampanha"
                className={`sidebar-sublink ${
                  location.pathname === "/EtiquetasCampanha" ||
                  location.pathname === "/"
                    ? "active"
                    : ""
                }`}
                onClick={fecharTudo}
              >
                Etiquetas de Campanha
              </Link>

              <Link
                to="/Etiquetas"
                className={`sidebar-sublink ${
                  location.pathname === "/Etiquetas" ? "active" : ""
                }`}
                onClick={fecharTudo}
              >
                Etiquetas
              </Link>
            </div>
          )}

          <button
            className="sidebar-link sidebar-logout"
            onClick={handleLogout}
          >
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}

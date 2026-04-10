import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../logo.png";

export default function Sidebar({
  menuAberto,
  setMenuAberto,
  titulo = "Expert Administração",
}) {
  const location = useLocation();
  const { signOut } = useAuth();

  const [submenuEtiquetasAberto, setSubmenuEtiquetasAberto] = useState(false);
  const [loadingLogout, setLoadingLogout] = useState(false);

  const rotaEtiquetasAtiva = useMemo(() => {
    return (
      location.pathname === "/Etiquetas" ||
      location.pathname === "/EtiquetasCampanha" ||
      location.pathname === "/EtiquetasCampanhaExcel"
    );
  }, [location.pathname]);

  useEffect(() => {
    if (rotaEtiquetasAtiva) {
      setSubmenuEtiquetasAberto(true);
    }
  }, [rotaEtiquetasAtiva]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setMenuAberto(false);
      }
    }

    if (menuAberto) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuAberto, setMenuAberto]);

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

  async function handleLogout() {
    try {
      setLoadingLogout(true);
      await signOut();
      fecharTudo();
    } catch (error) {
      console.error("Erro ao sair:", error.message);
    } finally {
      setLoadingLogout(false);
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

          <button
            type="button"
            className="sidebar-link sidebar-logout"
            onClick={handleLogout}
            disabled={loadingLogout}
          >
            {loadingLogout ? "A sair..." : "Sair"}
          </button>
        </div>
      </aside>
    </>
  );
}
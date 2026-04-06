import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import Sidebar from "./components/Sidebar";
import EtiquetasPage from "./pages/EtiquetasCampanha";
import EtiquetasExcelPage from "./pages/EtiquetasCampanhaExcel";
import Etiquetas from "./pages/Etiquetas";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import logo from "./logo.png";
import ForcePasswordChangeModal from "./components/ForcePasswordChangeModal";

export default function App() {
  const [menuAberto, setMenuAberto] = useState(false);
  const [loadingInicial, setLoadingInicial] = useState(true);
  const { user, loadingAuth } = useAuth();
  const [forcarTrocaPassword, setForcarTrocaPassword] = useState(false);

  useEffect(() => {
    if (user && sessionStorage.getItem("force_password_change") === "true") {
      setForcarTrocaPassword(true);
    } else {
      setForcarTrocaPassword(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingInicial(false);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  if (loadingInicial || loadingAuth) {
    return (
      <div className="splash-screen">
        <img src={logo} alt="Expert" className="splash-logo" />
        <div className="splash-loader"></div>
      </div>
    );
  }

  return (
    <div className={user ? "app" : "app app-login"}>
      {user && (
        <Sidebar
          menuAberto={menuAberto}
          setMenuAberto={setMenuAberto}
          titulo="Expert Administração"
        />
      )}

      <Routes>
        <Route
          path="/"
          element={
            <Navigate to={user ? "/EtiquetasCampanha" : "/login"} replace />
          }
        />

        <Route
          path="/login"
          element={
            user ? <Navigate to="/EtiquetasCampanha" replace /> : <Login />
          }
        />

        <Route
          path="/EtiquetasCampanha"
          element={
            <ProtectedRoute>
              <EtiquetasPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/Etiquetas"
          element={
            <ProtectedRoute>
              <Etiquetas />
            </ProtectedRoute>
          }
        />

        <Route
          path="/EtiquetasCampanhaExcel"
          element={
            <ProtectedRoute>
              <EtiquetasExcelPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={
            <Navigate to={user ? "/EtiquetasCampanha" : "/login"} replace />
          }
        />
      </Routes>
      <ForcePasswordChangeModal
        open={forcarTrocaPassword}
        onSuccess={() => setForcarTrocaPassword(false)}
      />
    </div>
  );
}

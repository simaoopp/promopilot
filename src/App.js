import React, { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import EtiquetasPage from "./pages/EtiquetasCampanha";
import EtiquetasExcelPage from "./pages/EtiquetasCampanhaExcel";
import Etiquetas from "./pages/Etiquetas";
import Homepage from "./pages/Homepage";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import ForcePasswordChangeModal from "./components/ForcePasswordChangeModal";
import { useAuth } from "./context/AuthContext";
import logo from "./logo.png";
import "./styles/styles.css";

export default function App() {
  const [menuAberto, setMenuAberto] = useState(false);
  const [loadingInicial, setLoadingInicial] = useState(true);
  const [forcarTrocaPassword, setForcarTrocaPassword] = useState(false);

  const { user, loadingAuth } = useAuth();

  const rotaInicial = useMemo(() => {
    return user ? "/Homepage" : "/login";
  }, [user]);

  useEffect(() => {
    setForcarTrocaPassword(
      !!user && sessionStorage.getItem("force_password_change") === "true"
    );
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingInicial(false);
    }, 1200);

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
        <Route path="/" element={<Navigate to={rotaInicial} replace />} />

        <Route
          path="/login"
          element={user ? <Navigate to="/Homepage" replace /> : <Login />}
        />

        <Route
          path="/Homepage"
          element={
            <ProtectedRoute>
              <Homepage />
            </ProtectedRoute>
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

        <Route path="*" element={<Navigate to={rotaInicial} replace />} />
      </Routes>

      {user && (
        <ForcePasswordChangeModal
          open={forcarTrocaPassword}
          onSuccess={() => setForcarTrocaPassword(false)}
        />
      )}
    </div>
  );
}
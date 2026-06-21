import React, { Suspense, lazy, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import ProtectedRoute from "./components/ProtectedRoute";
import PromoPilotMark from "./components/brand/PromoPilotMark";
import { useAuth } from "./context/AuthContext";
import { PROMOPILOT_BRAND } from "./brand/promopilot";
import { resolveInitialRoute } from "./utils/accessControl";
import "./styles/styles.css";

const EtiquetasPage = lazy(() => import("./pages/EtiquetasCampanha"));
const EtiquetasExcelPage = lazy(() => import("./pages/EtiquetasCampanhaExcel"));
const Etiquetas = lazy(() => import("./pages/Etiquetas"));
const Homepage = lazy(() => import("./pages/Homepage"));
const Login = lazy(() => import("./pages/Login"));
const OrcamentosDossiersPage = lazy(() => import("./pages/OrcamentosDossiers"));

function PageFallback() {
  return (
    <div className="pp-splash-screen">
      <div className="pp-splash-card">
        <PromoPilotMark tone="light" />
        <div className="pp-splash-loader" aria-hidden="true">
          <span />
        </div>
        <p>A carregar...</p>
      </div>
    </div>
  );
}

export default function App() {
  const [menuAberto, setMenuAberto] = useState(false);
  const { user, loadingAuth, loadingProfile, onboardingRequired } = useAuth();
  const rotaInicial = useMemo(
    () => resolveInitialRoute({ user, onboardingRequired }),
    [user, onboardingRequired],
  );

  if (loadingAuth || (user && loadingProfile)) return <PageFallback />;

  return (
    <div className={user ? "app pp-app-shell" : "app app-login pp-login-shell"}>
      {user && !onboardingRequired && (
        <Sidebar
          menuAberto={menuAberto}
          setMenuAberto={setMenuAberto}
          titulo={PROMOPILOT_BRAND.appName}
        />
      )}

      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to={rotaInicial} replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/Homepage" element={<ProtectedRoute><Homepage /></ProtectedRoute>} />
          <Route path="/EtiquetasCampanha" element={<ProtectedRoute><EtiquetasPage /></ProtectedRoute>} />
          <Route path="/Etiquetas" element={<ProtectedRoute><Etiquetas /></ProtectedRoute>} />
          <Route path="/EtiquetasCampanhaExcel" element={<ProtectedRoute><EtiquetasExcelPage /></ProtectedRoute>} />
          <Route path="/OrcamentosDossiers" element={<ProtectedRoute><OrcamentosDossiersPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to={rotaInicial} replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

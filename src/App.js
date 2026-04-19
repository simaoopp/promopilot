import React, { Suspense, lazy, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { resolveInitialRoute } from "./utils/accessControl";
import logo from "./logo.png";
import "./styles/styles.css";

const EtiquetasPage = lazy(() => import("./pages/EtiquetasCampanha"));
const EtiquetasExcelPage = lazy(() => import("./pages/EtiquetasCampanhaExcel"));
const Etiquetas = lazy(() => import("./pages/Etiquetas"));
const Homepage = lazy(() => import("./pages/Homepage"));
const Login = lazy(() => import("./pages/Login"));

function PageFallback() {
  return <div className="splash-screen"><img src={logo} alt="Expert" className="splash-logo" /><div className="splash-loader"></div></div>;
}

export default function App() {
  const [menuAberto, setMenuAberto] = useState(false);
  const { user, loadingAuth, loadingProfile, onboardingRequired } = useAuth();
  const rotaInicial = useMemo(() => resolveInitialRoute({ user, onboardingRequired }), [user, onboardingRequired]);
  if (loadingAuth || (user && loadingProfile)) return <PageFallback />;
  return <div className={user ? "app" : "app app-login"}>
    {user && !onboardingRequired && <Sidebar menuAberto={menuAberto} setMenuAberto={setMenuAberto} titulo="Expert Administração" />}
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to={rotaInicial} replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/Homepage" element={<ProtectedRoute><Homepage /></ProtectedRoute>} />
        <Route path="/EtiquetasCampanha" element={<ProtectedRoute><EtiquetasPage /></ProtectedRoute>} />
        <Route path="/Etiquetas" element={<ProtectedRoute><Etiquetas /></ProtectedRoute>} />
        <Route path="/EtiquetasCampanhaExcel" element={<ProtectedRoute><EtiquetasExcelPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={rotaInicial} replace />} />
      </Routes>
    </Suspense>
  </div>;
}

import React, { Suspense, lazy, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PermissionProvider, usePermissions } from "./context/PermissionContext";
import FeatureRoute from "./components/FeatureRoute";
import Sidebar from "./components/Sidebar";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLoading from "./components/AppLoading";
import GlobalSellerAssistant from "./components/GlobalSellerAssistant";
import { useAuth } from "./context/AuthContext";
import { PROMOPILOT_BRAND } from "./brand/promopilot";
import { resolveInitialRoute } from "./utils/accessControl";
import "./styles/styles.css";
import "./styles/app-polish.css";

const CeoAdmin = lazy(() => import("./features/platform/CeoAdmin"));
const Presentation = lazy(() => import("./pages/Presentation"));
const EtiquetasPage = lazy(() => import("./pages/EtiquetasCampanha"));
const EtiquetasExcelPage = lazy(() => import("./pages/EtiquetasCampanhaExcel"));
const Etiquetas = lazy(() => import("./pages/Etiquetas"));
const Homepage = lazy(() => import("./pages/Homepage"));
const Login = lazy(() => import("./pages/Login"));
const OrcamentosDossiersPage = lazy(() => import("./pages/OrcamentosDossiers"));
const EndedCampaignDetails = lazy(() => import("./pages/EndedCampaignDetails"));

function PageFallback() {
  return <AppLoading />;
}

export default function App() {
  return <PermissionProvider><AppContent /></PermissionProvider>;
}

function AppContent() {
  const { can } = usePermissions();
  const { pathname, search, hash } = useLocation();
  const normalizedPath = pathname.replace(/\/$/, "").toLowerCase();
  const isPresentation = normalizedPath === "";
  const isLegacyPresentation = normalizedPath === "/apresentacao";
  const [menuAberto, setMenuAberto] = useState(false);
  const { user, loadingAuth, loadingProfile, onboardingRequired, passwordRecovery } = useAuth();
  const rotaInicial = useMemo(
    () => resolveInitialRoute({ user, onboardingRequired }),
    [user, onboardingRequired],
  );

  if (isLegacyPresentation) return <Navigate to={`/${search}${hash}`} replace />;
  if (isPresentation && (passwordRecovery || /(?:^|[?#&])type=recovery(?:&|$)/i.test(`${search}${hash}`))) return <Navigate to={`/login${search}${hash}`} replace />;
  if (isPresentation) return <Suspense fallback={<PageFallback />}><Presentation /></Suspense>;

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

      {user && !onboardingRequired && can("ai.read") && <GlobalSellerAssistant />}

      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to={rotaInicial} replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/Homepage" element={<ProtectedRoute><FeatureRoute page="home"><Homepage /></FeatureRoute></ProtectedRoute>} />
          <Route path="/EtiquetasCampanha" element={<ProtectedRoute><FeatureRoute page="manual"><EtiquetasPage /></FeatureRoute></ProtectedRoute>} />
          <Route path="/Etiquetas" element={<ProtectedRoute><FeatureRoute page="catalog"><Etiquetas /></FeatureRoute></ProtectedRoute>} />
          <Route path="/EtiquetasCampanhaExcel" element={<ProtectedRoute><FeatureRoute page="excel"><EtiquetasExcelPage /></FeatureRoute></ProtectedRoute>} />
          <Route path="/OrcamentosDossiers" element={<ProtectedRoute><FeatureRoute page="dossiers"><OrcamentosDossiersPage /></FeatureRoute></ProtectedRoute>} />
          <Route path="/Campanhas/terminadas/:id" element={<ProtectedRoute><FeatureRoute page="ended" permission="reports.read"><EndedCampaignDetails /></FeatureRoute></ProtectedRoute>} />
          <Route path="/ceo/*" element={<ProtectedRoute><FeatureRoute ceo><CeoAdmin /></FeatureRoute></ProtectedRoute>} />
          <Route path="/POS/*" element={<ProtectedRoute><FeatureRoute page="pos"><p role="status">O POS ainda não está disponível nesta versão.</p></FeatureRoute></ProtectedRoute>} />
          <Route path="*" element={<Navigate to={rotaInicial} replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

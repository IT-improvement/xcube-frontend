import './styles/tokens.css';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { RouteFallback } from './components/ui';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { LanguageProvider, useT } from './i18n';
import LandingPage from './pages/LandingPage';
import { LoginPage, SignupPage } from './pages/AuthPage';
import NotFoundPage from './pages/NotFoundPage';

// Only the public pages (home, login, signup, 404) are in the main bundle. The Viewer (OpenLayers)
// and the signed-in app (shell + pages, see app/AppSection) download when their route opens.
const Viewer = lazy(() => import('./views/Viewer'));
const AppSection = lazy(() => import('./app/AppSection'));

function ViewerPage() {
  const { user, signOut } = useAuth();
  const [params] = useSearchParams();
  useDocumentTitle(useT()('titles.viewer'));
  return user ? <Viewer user={user} onLogout={signOut} onboarding initialDatasetId={params.get('dataset') ?? undefined} /> : null;
}

export function AppRoutes() {
  return (
    // Full-screen fallback for the shell and the Viewer; pages inside the shell use the shell's own
    // fallback (AppShell wraps its Outlet), so the top bar stays while a page loads.
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/app/*" element={<RequireAuth><AppSection /></RequireAuth>} />
        {/* The Viewer keeps its own full-screen layout and opens in a new tab. */}
        <Route path="/app/viewer" element={<RequireAuth><ViewerPage /></RequireAuth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

// component: Application 컴포넌트 //
function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;

import './styles/tokens.css';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { ButtonLink, StatusScreen } from './components/ui';
import LandingPage from './pages/LandingPage';
import { LoginPage, SignupPage } from './pages/AuthPage';
import Viewer from './views/Viewer';
const TestViewer = lazy(() => import('./views/TestViewer'));

function ViewerPage() {
  const { user, signOut } = useAuth();
  return user ? <Viewer user={user} onLogout={signOut} onboarding /> : null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      {/* The dashboard arrives in M4; until then /app opens the Viewer. */}
      <Route path="/app" element={<Navigate to="/app/viewer" replace />} />
      <Route path="/app/viewer" element={<RequireAuth><ViewerPage /></RequireAuth>} />
      <Route path="/test" element={<Suspense fallback={<StatusScreen busy title="테스트 지도를 불러오는 중…" />}><TestViewer /></Suspense>} />
      <Route
        path="*"
        element={<StatusScreen title="페이지를 찾을 수 없습니다" text="주소를 확인하거나 홈으로 이동해 주세요." action={<ButtonLink to="/">홈으로</ButtonLink>} />}
      />
    </Routes>
  );
}

// component: Application 컴포넌트 //
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

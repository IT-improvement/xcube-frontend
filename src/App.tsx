import './styles/tokens.css';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { ButtonLink, StatusScreen } from './components/ui';
import LandingPage from './pages/LandingPage';
import { LoginPage, SignupPage } from './pages/AuthPage';
import Viewer from './views/Viewer';
import AppShell from './app/AppShell';
import DashboardPage from './app/pages/DashboardPage';
import DataLibraryPage from './app/pages/DataLibraryPage';
import DatasetDetailPage from './app/pages/DatasetDetailPage';
import { ProjectDetailPage, ProjectsPage } from './app/pages/ProjectsPage';
import AddDataPage from './app/wizard/AddDataPage';
import JobsPage from './app/pages/JobsPage';
import FusionPage from './app/pages/FusionPage';
const TestViewer = lazy(() => import('./views/TestViewer'));

function ViewerPage() {
  const { user, signOut } = useAuth();
  const [params] = useSearchParams();
  return user ? <Viewer user={user} onLogout={signOut} onboarding initialDatasetId={params.get('dataset') ?? undefined} /> : null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="data" element={<DataLibraryPage />} />
        <Route path="data/new" element={<AddDataPage />} />
        <Route path="data/:datasetId" element={<DatasetDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="analysis/fusion" element={<FusionPage />} />
      </Route>
      {/* The Viewer keeps its own full-screen layout and opens in a new tab. */}
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

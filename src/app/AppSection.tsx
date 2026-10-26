import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';

// Each page downloads on first visit. The lazy imports live here, inside the app chunk, so code the
// shell already loaded (shared UI kit, API client, job helpers) is not copied into every page chunk.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DataLibraryPage = lazy(() => import('./pages/DataLibraryPage'));
const DatasetDetailPage = lazy(() => import('./pages/DatasetDetailPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((module) => ({ default: module.ProjectsPage })));
const ProjectDetailPage = lazy(() => import('./pages/ProjectsPage').then((module) => ({ default: module.ProjectDetailPage })));
const AddDataPage = lazy(() => import('./wizard/AddDataPage'));
const JobsPage = lazy(() => import('./pages/JobsPage'));
const FusionPage = lazy(() => import('./pages/FusionPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminRedirectPage = lazy(() => import('./pages/AdminRedirectPage'));
const AppNotFoundPage = lazy(() => import('./pages/AppNotFoundPage'));

/** Routes under /app (except the full-screen Viewer), drawn inside the app shell (S2–S6, S10–S12). */
export default function AppSection() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="data" element={<DataLibraryPage />} />
        <Route path="data/new" element={<AddDataPage />} />
        <Route path="data/:datasetId" element={<DatasetDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="analysis/fusion" element={<FusionPage />} />
        <Route path="analysis/compare" element={<ComparePage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* The old S13 address: admins go on to the admin console (UR-62, /admin); others get the 404 below. */}
        <Route path="admin/*" element={<AdminRedirectPage />} />
        {/* Unknown /app/* paths stay inside the shell (top bar visible). */}
        <Route path="*" element={<AppNotFoundPage />} />
      </Route>
    </Routes>
  );
}

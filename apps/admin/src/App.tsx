import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAdmin } from './hooks/useAdmin';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import AuditLogPage from './pages/AuditLogPage';
import FeatureFlagsPage from './pages/FeatureFlagsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';

export default function App() {
  const admin = useAdmin();

  if (admin.loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (admin.error || !admin.currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">📓 Notebook.md Admin</h1>
          <p className="text-red-600 mb-4">{admin.error || 'Unable to authenticate'}</p>
          <a
            href={import.meta.env.VITE_APP_URL || 'http://localhost:5173'}
            className="text-blue-600 hover:underline text-sm"
          >
            Go to Notebook.md →
          </a>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={admin.currentUser} onSignOut={admin.signOut} />}>
          <Route index element={<DashboardPage getHealth={admin.getHealth} getMetrics={admin.getMetrics} />} />
          <Route
            path="users"
            element={
              <UsersPage
                getUsers={admin.getUsers}
                getUser={admin.getUser}
                updateUser={admin.updateUser}
                deleteUser={admin.deleteUser}
              />
            }
          />
          <Route path="audit-log" element={<AuditLogPage getAuditLog={admin.getAuditLog} />} />
          <Route
            path="feature-flags"
            element={<FeatureFlagsPage getFeatureFlags={admin.getFeatureFlags} saveFeatureFlag={admin.saveFeatureFlag} />}
          />
          <Route
            path="announcements"
            element={
              <AnnouncementsPage
                getAnnouncements={admin.getAnnouncements}
                createAnnouncement={admin.createAnnouncement}
                updateAnnouncement={admin.updateAnnouncement}
                deleteAnnouncement={admin.deleteAnnouncement}
              />
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

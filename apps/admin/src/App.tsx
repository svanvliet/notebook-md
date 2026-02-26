import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAdmin } from './hooks/useAdmin';
import { ToastProvider } from './components/ui';
import { LoadingSpinner } from './components/ui';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import AuditLogPage from './pages/AuditLogPage';
import FeatureFlagsPage from './pages/FeatureFlagsPage';
import GroupsPage from './pages/GroupsPage';
import FlightsPage from './pages/FlightsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';

export default function App() {
  const admin = useAdmin();

  if (admin.loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (admin.error || !admin.currentUser) {
    const appUrl = import.meta.env.VITE_APP_URL || 'http://localhost:5173';
    const needs2FA = admin.error?.includes('two-factor');
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">📓 Notebook.md Admin</h1>
          <p className={`mb-4 ${needs2FA ? 'text-amber-600' : 'text-red-600'}`}>
            {admin.error || 'Unable to authenticate'}
          </p>
          {needs2FA ? (
            <p className="text-gray-600 text-sm mb-4">
              Open your account settings in Notebook.md to enable 2FA, then return here.
            </p>
          ) : null}
          <a
            href={appUrl}
            className="text-blue-600 hover:underline text-sm"
          >
            Go to Notebook.md →
          </a>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
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
                searchUsers={admin.searchUsers}
                forceLogout={admin.forceLogout}
              />
            }
          />
          <Route path="audit-log" element={<AuditLogPage getAuditLog={admin.getAuditLog} />} />
          <Route
            path="feature-flags"
            element={
              <FeatureFlagsPage
                getFeatureFlags={admin.getFeatureFlags}
                saveFeatureFlag={admin.saveFeatureFlag}
                getFlagOverrides={admin.getFlagOverrides}
                createFlagOverride={admin.createFlagOverride}
                deleteFlagOverride={admin.deleteFlagOverride}
                archiveFlag={admin.archiveFlag}
                searchUsers={admin.searchUsers}
              />
            }
          />
          <Route
            path="groups"
            element={
              <GroupsPage
                getGroups={admin.getGroups}
                createGroup={admin.createGroup}
                getGroup={admin.getGroup}
                updateGroup={admin.updateGroup}
                deleteGroup={admin.deleteGroup}
                addGroupMembers={admin.addGroupMembers}
                removeGroupMember={admin.removeGroupMember}
                searchUsers={admin.searchUsers}
              />
            }
          />
          <Route
            path="flights"
            element={
              <FlightsPage
                getFlights={admin.getFlights}
                createFlight={admin.createFlight}
                getFlight={admin.getFlight}
                updateFlight={admin.updateFlight}
                deleteFlight={admin.deleteFlight}
                addFlightFlags={admin.addFlightFlags}
                removeFlightFlag={admin.removeFlightFlag}
                assignToFlight={admin.assignToFlight}
                removeFlightAssignment={admin.removeFlightAssignment}
                getFeatureFlags={admin.getFeatureFlags}
                getGroups={admin.getGroups}
                searchUsers={admin.searchUsers}
              />
            }
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
    </ToastProvider>
  );
}

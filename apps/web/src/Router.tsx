import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';

const App = lazy(() => import('./App'));
const FeaturesPage = lazy(() => import('./components/marketing/FeaturesPage'));
const AboutPage = lazy(() => import('./components/marketing/AboutPage'));
const ContactPage = lazy(() => import('./components/marketing/ContactPage'));
const TermsPage = lazy(() => import('./components/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./components/legal/PrivacyPage'));
const PublicDocumentViewer = lazy(() => import('./components/public/PublicDocumentViewer'));

function AppRoutes() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation as Location | undefined;

  return (
    <>
      {/* When a background location exists, render main routes there (keeps App mounted) */}
      <Suspense fallback={null}>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<App />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        {/* Auth callback routes — App handles these via useEffect */}
        <Route path="/app/magic-link" element={<App />} />
        <Route path="/app/verify-email" element={<App />} />
        <Route path="/app/auth-error" element={<App />} />
        <Route path="/app/invite" element={<App />} />
        {/* Public share link viewer */}
        <Route path="/s/:token" element={<PublicDocumentViewer />} />
        {/* Main app with document deep links */}
        <Route path="/app" element={<App />} />
        <Route path="/app/:notebookName/*" element={<App />} />
        {/* Demo mode with document deep links */}
        <Route path="/demo" element={<App />} />
        <Route path="/demo/:notebookName/*" element={<App />} />
        {/* Catch-all: redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>

      {/* Overlay routes — render on top of the preserved App */}
      {backgroundLocation && (
        <Suspense fallback={null}>
        <Routes>
          <Route
            path="/terms"
            element={
              <div className="fixed inset-0 z-[90] overflow-y-auto bg-white dark:bg-gray-950">
                <TermsPage />
              </div>
            }
          />
          <Route
            path="/privacy"
            element={
              <div className="fixed inset-0 z-[90] overflow-y-auto bg-white dark:bg-gray-950">
                <PrivacyPage />
              </div>
            }
          />
        </Routes>
        </Suspense>
      )}
    </>
  );
}

export function Router() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

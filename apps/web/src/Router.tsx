import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import App from './App';
import { TermsPage } from './components/legal/TermsPage';
import { PrivacyPage } from './components/legal/PrivacyPage';
import { FeaturesPage } from './components/marketing/FeaturesPage';
import { AboutPage } from './components/marketing/AboutPage';
import { ContactPage } from './components/marketing/ContactPage';

function AppRoutes() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation as Location | undefined;

  return (
    <>
      {/* When a background location exists, render main routes there (keeps App mounted) */}
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<App />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        {/* Auth callback routes — App handles these via useEffect */}
        <Route path="/app/*" element={<App />} />
        {/* Catch-all: redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Overlay routes — render on top of the preserved App */}
      {backgroundLocation && (
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

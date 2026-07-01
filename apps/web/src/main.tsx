import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './hooks/useToast';
import { FlagProvider } from './hooks/useFlagProvider';
import './lib/sentry';
import './i18n';
import './index.css';
import { Router } from './Router';
import { reportWebVitals } from './lib/webVitals';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <FlagProvider>
        <Router />
      </FlagProvider>
    </ToastProvider>
  </StrictMode>,
);

reportWebVitals();

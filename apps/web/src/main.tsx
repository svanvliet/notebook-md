import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './hooks/useToast';
import './i18n';
import './index.css';
import { Router } from './Router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Router />
    </ToastProvider>
  </StrictMode>,
);

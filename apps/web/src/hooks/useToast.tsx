import { createContext, useContext, useCallback, useState, useRef, type ReactNode } from 'react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  dismissAt?: number; // timestamp when auto-dismiss fires
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, action?: { label: string; onClick: () => void }) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS: Record<ToastType, number | null> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: null, // persistent
};

const MAX_VISIBLE = 5;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', action?: { label: string; onClick: () => void }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const toast: Toast = { id, message, type, action };

      setToasts((prev) => {
        const next = [toast, ...prev];
        // Trim oldest if over max
        if (next.length > MAX_VISIBLE) {
          const removed = next.splice(MAX_VISIBLE);
          for (const r of removed) {
            const t = timers.current.get(r.id);
            if (t) { clearTimeout(t); timers.current.delete(r.id); }
          }
        }
        return next;
      });

      const ms = action ? null : AUTO_DISMISS_MS[type];
      if (ms) {
        const timer = setTimeout(() => {
          timers.current.delete(id);
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, ms);
        timers.current.set(id, timer);
      }
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

import { useToast, type Toast, type ToastType } from '../../hooks/useToast';
import { useEffect, useState } from 'react';

const typeStyles: Record<ToastType, { bg: string; border: string; icon: string; iconColor: string }> = {
  success: {
    bg: 'bg-white dark:bg-gray-900',
    border: 'border-green-400 dark:border-green-600',
    icon: '✓',
    iconColor: 'text-green-500 dark:text-green-400',
  },
  info: {
    bg: 'bg-white dark:bg-gray-900',
    border: 'border-blue-400 dark:border-blue-600',
    icon: 'ℹ',
    iconColor: 'text-blue-500 dark:text-blue-400',
  },
  warning: {
    bg: 'bg-white dark:bg-gray-900',
    border: 'border-amber-400 dark:border-amber-600',
    icon: '⚠',
    iconColor: 'text-amber-500 dark:text-amber-400',
  },
  error: {
    bg: 'bg-white dark:bg-gray-900',
    border: 'border-red-400 dark:border-red-600',
    icon: '✕',
    iconColor: 'text-red-500 dark:text-red-400',
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const style = typeStyles[toast.type];

  // Animate in
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg shadow-lg border-l-4 ${style.bg} ${style.border} transition-all duration-300 ease-out ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      }`}
      style={{ maxWidth: 360, minWidth: 240 }}
      role="alert"
    >
      <span className={`text-sm font-bold mt-px shrink-0 ${style.iconColor}`}>{style.icon}</span>
      <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 leading-snug">
        {toast.message}
        {toast.action && (
          <>
            {' '}
            <button
              onClick={toast.action.onClick}
              className="text-blue-500 dark:text-blue-400 hover:underline font-medium"
            >
              {toast.action.label}
            </button>
          </>
        )}
      </p>
      <button
        onClick={onDismiss}
        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 mt-px"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="3" x2="11" y2="11" />
          <line x1="11" y1="3" x2="3" y2="11" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-14 right-4 z-50 flex flex-col gap-2 pointer-events-none" data-print="hide">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onDismiss={() => dismissToast(toast.id)} />
        </div>
      ))}
    </div>
  );
}

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  retryCount: number;
}

/**
 * Error boundary for the Tiptap editor.
 * Catches the React 19 + Tiptap flushSync timing error (Safari-specific)
 * and retries rendering automatically.
 */
export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retryCount: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    const isTiptapError = error.message?.includes('editor view is not available');
    if (isTiptapError && this.state.retryCount < 3) {
      // Retry after a short delay to let the view mount
      setTimeout(() => {
        this.setState((s) => ({ hasError: false, retryCount: s.retryCount + 1 }));
      }, 50);
    }
  }

  render() {
    if (this.state.hasError && this.state.retryCount >= 3) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-600 p-8">
          <p className="text-sm">Editor failed to load. Try switching tabs or refreshing the page.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

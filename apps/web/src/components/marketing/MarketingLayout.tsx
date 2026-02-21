import { Link, useLocation, useNavigate } from 'react-router-dom';
import { NotebookIcon } from '../icons/Icons';

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export function MarketingNav({ onEnterDemo }: { onEnterDemo?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) => location.pathname === path;

  const linkClass = (path: string) =>
    `text-sm transition-colors ${
      isActive(path)
        ? 'text-gray-900 dark:text-white font-medium'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
    }`;

  const handleTryDemo = () => {
    if (onEnterDemo) {
      onEnterDemo();
    } else {
      navigate('/', { state: { enterDemo: true } });
    }
  };

  return (
    <nav className="w-full border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
            <NotebookIcon className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">Notebook.md</span>
        </Link>

        <div className="flex items-center gap-6">
          <Link to="/features" className={linkClass('/features')}>Features</Link>
          <Link to="/about" className={linkClass('/about')}>About</Link>
          <Link to="/contact" className={linkClass('/contact')}>Contact</Link>
          <button
            onClick={handleTryDemo}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            Try Demo
          </button>
          <button
            onClick={() => navigate('/', { state: { signIn: true } })}
            className="ml-2 px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    </nav>
  );
}

export function MarketingFooter() {
  const location = useLocation();

  return (
    <footer className="w-full border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <NotebookIcon className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-gray-900 dark:text-white">Notebook.md</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              A simple, beautiful Markdown editor that works with your existing cloud storage.
            </p>
          </div>

          <div className="flex gap-16">
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Product</h4>
              <div className="flex flex-col gap-2">
                <Link to="/features" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Features</Link>
                <Link to="/about" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">About</Link>
                <Link to="/contact" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Contact</Link>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Legal</h4>
              <div className="flex flex-col gap-2">
                <Link to="/terms" state={{ backgroundLocation: location }} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Terms of Service</Link>
                <Link to="/privacy" state={{ backgroundLocation: location }} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Privacy Policy</Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-400 dark:text-gray-500">
          © {new Date().getFullYear()} Van Vliet Ventures, LLC. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

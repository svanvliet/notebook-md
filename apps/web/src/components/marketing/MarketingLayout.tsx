import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { NotebookIcon } from '../icons/Icons';
import { DevBadge } from '../common/DevBadge';

interface MarketingLayoutProps {
  children: React.ReactNode;
}

function HamburgerIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}

function CloseIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}

export function MarketingNav({ onEnterDemo, onDevLogin }: { onEnterDemo?: () => void; onDevLogin?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isActive = (path: string) => location.pathname === path;

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

  // Close on Escape
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileMenuOpen]);

  const linkClass = (path: string) =>
    `text-sm py-2 px-3 rounded-md transition-colors ${
      isActive(path)
        ? 'text-gray-900 dark:text-white font-medium'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
    }`;

  const mobileLinkClass = (path: string) =>
    `block w-full text-left px-4 py-3 text-base transition-colors ${
      isActive(path)
        ? 'text-gray-900 dark:text-white font-medium bg-gray-50 dark:bg-gray-800'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
    }`;

  const handleTryDemo = () => {
    setMobileMenuOpen(false);
    if (onEnterDemo) {
      onEnterDemo();
    } else {
      navigate('/', { state: { enterDemo: true } });
    }
  };

  const handleSignIn = () => {
    setMobileMenuOpen(false);
    navigate('/', { state: { signIn: true } });
  };

  return (
    <nav className="w-full border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between relative">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
            <NotebookIcon className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">Notebook.md</span>
        </Link>

        {/* Centered DEV badge — matches TitleBar position */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <DevBadge onDevLogin={onDevLogin} />
        </div>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1">
          <Link to="/features" className={linkClass('/features')}>Features</Link>
          <Link to="/about" className={linkClass('/about')}>About</Link>
          <Link to="/contact" className={linkClass('/contact')}>Contact</Link>
          <button
            onClick={handleTryDemo}
            className="text-sm py-2 px-3 rounded-md text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            Try Demo
          </button>
          <button
            onClick={handleSignIn}
            className="ml-2 px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Sign In
          </button>
        </div>

        {/* Mobile hamburger button */}
        <button
          className="md:hidden p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <CloseIcon className="w-5 h-5" /> : <HamburgerIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 top-14 bg-black/20 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)} />
          <div ref={menuRef} className="absolute left-0 right-0 top-full bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 shadow-lg z-40 md:hidden">
            <div className="py-2">
              <Link to="/features" className={mobileLinkClass('/features')}>Features</Link>
              <Link to="/about" className={mobileLinkClass('/about')}>About</Link>
              <Link to="/contact" className={mobileLinkClass('/contact')}>Contact</Link>
              <button onClick={handleTryDemo} className="block w-full text-left px-4 py-3 text-base text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Try Demo
              </button>
              <div className="border-t border-gray-100 dark:border-gray-800 mt-2 pt-2 px-4 pb-2">
                <button
                  onClick={handleSignIn}
                  className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Sign In
                </button>
              </div>
            </div>
          </div>
        </>
      )}
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

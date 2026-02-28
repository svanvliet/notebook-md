import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type Platform = 'macos' | 'windows' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('win')) return 'windows';
  return 'other';
}

const VERSION = '0.1.0';

export default function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>('other');

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold">
            📓 Notebook.md
          </Link>
          <nav className="flex gap-6 text-sm">
            <Link to="/features" className="hover:text-blue-600 dark:hover:text-blue-400">Features</Link>
            <Link to="/about" className="hover:text-blue-600 dark:hover:text-blue-400">About</Link>
            <Link to="/app" className="text-blue-600 dark:text-blue-400 font-medium">Open App</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold mb-4">Download Notebook.md</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-12">
          A beautiful, fast Markdown notebook — now as a native desktop app.
          Local files, offline editing, native menus, and auto-save.
        </p>

        {/* Primary download */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <DownloadButton
            platform="macos"
            highlighted={platform === 'macos'}
            label="Download for macOS"
            sublabel="Apple Silicon & Intel · .dmg"
            href={`https://releases.notebookmd.io/desktop/v${VERSION}/Notebook.md_${VERSION}_universal.dmg`}
          />
          <DownloadButton
            platform="windows"
            highlighted={platform === 'windows'}
            label="Download for Windows"
            sublabel="64-bit · .exe installer"
            href={`https://releases.notebookmd.io/desktop/v${VERSION}/Notebook.md_${VERSION}_x64-setup.exe`}
          />
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-500">
          Version {VERSION} · Free &amp; open source ·{' '}
          <a
            href="https://github.com/svanvliet/notebook-md/releases"
            className="underline hover:text-blue-600 dark:hover:text-blue-400"
            target="_blank"
            rel="noopener noreferrer"
          >
            Release notes
          </a>
        </p>
      </section>

      {/* Features */}
      <section className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-2xl font-bold text-center mb-12">Why Desktop?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Feature icon="📁" title="Local Files" desc="Edit markdown files directly on your filesystem. Works with Git repos, Obsidian vaults, or any folder." />
            <Feature icon="✈️" title="Offline Ready" desc="No internet required for local notebooks. Cloud notebooks sync when you're back online." />
            <Feature icon="⚡" title="Native Performance" desc="Built with Tauri — lightweight, fast startup, low memory. Not another Electron app." />
            <Feature icon="💾" title="Auto-Save" desc="Changes save automatically with a 2-second debounce. Or hit ⌘S to save immediately." />
            <Feature icon="📂" title="File Watching" desc="Edit files in VS Code or any other editor — Notebook.md detects changes instantly." />
            <Feature icon="🔒" title="Your Files, Your Control" desc="Documents stay on your computer. No cloud account required for local notebooks." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Also available as a web app</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Don't want to install anything? Use Notebook.md right in your browser — same great editor, cloud sync included.
        </p>
        <Link
          to="/app"
          className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
        >
          Open Web App →
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 text-center py-6 text-sm text-gray-500">
        <p>© {new Date().getFullYear()} Notebook.md · <Link to="/terms" className="underline">Terms</Link> · <Link to="/privacy" className="underline">Privacy</Link></p>
      </footer>
    </div>
  );
}

function DownloadButton({
  platform,
  highlighted,
  label,
  sublabel,
  href,
}: {
  platform: 'macos' | 'windows';
  highlighted: boolean;
  label: string;
  sublabel: string;
  href: string;
}) {
  const icon = platform === 'macos' ? '🍎' : '🪟';
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-xl px-6 py-4 border-2 transition-all ${
        highlighted
          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950 shadow-lg scale-105'
          : 'border-gray-200 dark:border-gray-700 hover:border-blue-400'
      }`}
    >
      <span className="text-3xl">{icon}</span>
      <div className="text-left">
        <div className="font-semibold">{label}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{sublabel}</div>
      </div>
    </a>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">{desc}</p>
    </div>
  );
}

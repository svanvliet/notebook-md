import { Link } from 'react-router-dom';
import { MarketingLayout } from './MarketingLayout';
import { NotebookIcon } from '../icons/Icons';

export function AboutPage() {
  return (
    <MarketingLayout>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">About Notebook.md</h1>

        <div className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 space-y-6">
          <p className="text-lg leading-relaxed">
            Notebook.md is a Markdown editor built for people who want to write without friction. It combines the simplicity of plain text with the power of a modern WYSIWYG editor — and connects directly to the cloud storage you already use.
          </p>

          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-xl p-6 not-prose">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Our Philosophy</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Your documents are yours. We don't store your content — it lives in your GitHub repos, OneDrive folders, or Google Drive. Notebook.md is a window into your files, not a walled garden.
            </p>
          </div>

          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Why Markdown?</h2>
          <p>
            Markdown is the universal language of structured text. It's readable in any text editor, renders beautifully on GitHub and countless other platforms, and will never be locked behind a proprietary format. When you write in Markdown, your words belong to you — forever.
          </p>

          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Why Notebook.md?</h2>
          <p>
            Most Markdown editors are either too simple (plain text with a split preview) or too complex (requiring config files and CLI tools). Notebook.md sits in the sweet spot: a polished, modern writing experience that works the way you think, with the storage backends you already trust.
          </p>

          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Real WYSIWYG editing — no split-pane previews</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Direct integration with GitHub, OneDrive, and Google Drive</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Git-aware workflow with branch management for GitHub</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Works on any device with a modern browser</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-600 mt-1">✓</span>
              <span>Free to use — no subscription required</span>
            </li>
          </ul>

          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Built By</h2>
          <p>
            Notebook.md is built by <a href="https://vanvlietventures.com" className="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">Van Vliet Ventures, LLC</a>. We're a small team passionate about building tools that respect your data and get out of your way.
          </p>
        </div>

        <div className="mt-12 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-lg shadow-blue-600/25 transition-colors"
          >
            <NotebookIcon className="w-5 h-5" />
            Start Writing
          </Link>
        </div>
      </div>
    </MarketingLayout>
  );
}

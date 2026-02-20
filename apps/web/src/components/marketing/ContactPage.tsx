import { useState } from 'react';
import { MarketingLayout } from './MarketingLayout';

export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // For now, open mailto — can be replaced with a backend endpoint later
    const subject = encodeURIComponent(`Notebook.md Contact: ${name}`);
    const body = encodeURIComponent(`From: ${name} (${email})\n\n${message}`);
    window.location.href = `mailto:support@notebookmd.io?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  return (
    <MarketingLayout>
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Get in Touch</h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 mb-10">
          Have a question, feature request, or found a bug? We'd love to hear from you.
        </p>

        {submitted ? (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 rounded-xl p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Thanks!</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Your email client should have opened with your message. If not, email us directly at <a href="mailto:support@notebookmd.io" className="text-blue-600 dark:text-blue-400 hover:underline">support@notebookmd.io</a>.</p>
            <button onClick={() => setSubmitted(false)} className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline">Send another message</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="What's on your mind?"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
            >
              Send Message
            </button>
          </form>
        )}

        <div className="mt-16 grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Email</h3>
            <a href="mailto:support@notebookmd.io" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">support@notebookmd.io</a>
          </div>
          <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">GitHub</h3>
            <a href="https://github.com/svanvliet/notebook-md" className="text-sm text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">svanvliet/notebook-md</a>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">File issues and feature requests</p>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}

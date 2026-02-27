import { useNavigate } from 'react-router-dom';

export function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-6 block">
          ← Back to Notebook.md
        </button>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: February 2026</p>

        <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">1. Overview</h2>
            <p>Notebook.md is operated by Van Vliet Ventures, LLC. This Privacy Policy explains what data we collect, how we use it, and your rights regarding your personal information.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">2. Data We Collect</h2>
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Account Information</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Email address</li>
              <li>Display name</li>
              <li>Avatar URL (from connected providers)</li>
              <li>Hashed password (if using email authentication)</li>
              <li>Two-factor authentication settings</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mt-4">Connected Provider Data</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>OAuth tokens for connected services (encrypted at rest)</li>
              <li>Provider account identifiers</li>
              <li>Notebook/folder metadata (names, paths)</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mt-4">Usage Data</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Session information (IP address, user agent, timestamps)</li>
              <li>Audit log events (sign-in, sign-out, settings changes)</li>
              <li>Application preferences and settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">3. Data We Do NOT Collect</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Your document content</strong> — We never read, store, or process the content of your Markdown files. Documents are read from and saved directly to your connected storage providers.</li>
              <li><strong>File contents in transit</strong> — Document content passes through our server only as a proxy to your storage provider and is not logged or stored.</li>
              <li><strong>Browsing activity outside the app</strong></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">4. AI Content Generation</h2>
            <p>Notebook.md offers an optional AI content generation feature ("Create with AI") powered by Microsoft Azure OpenAI. When you use this feature:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Your prompt text</strong> and <strong>document content</strong> are sent to the Azure OpenAI API to generate a response. This is the only circumstance in which document content leaves your browser and is sent to a third-party service.</li>
              <li><strong>No storage</strong> — Neither your prompt nor the generated content is stored by us or by Azure OpenAI beyond the duration of the API request.</li>
              <li><strong>Opt-in only</strong> — This feature is never triggered automatically. You must explicitly choose to use it.</li>
              <li><strong>Audit logging</strong> — We log the fact that a generation request was made (user ID, timestamp, prompt summary) but do not log the generated content or the full document context.</li>
            </ul>
            <p>If you do not use the AI feature, no document content is ever sent to any third-party AI service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">5. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To authenticate you and maintain your session</li>
              <li>To connect to your storage providers on your behalf</li>
              <li>To remember your preferences and settings</li>
              <li>To detect and prevent security incidents</li>
              <li>To communicate important service updates</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">6. Third-Party Services</h2>
            <p>We integrate with the following third-party services:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>GitHub</strong> — Authentication, repository access</li>
              <li><strong>Microsoft (Azure AD / MSA)</strong> — Authentication, OneDrive access</li>
              <li><strong>Google</strong> — Authentication, Google Drive access</li>
              <li><strong>Microsoft Azure OpenAI</strong> — AI content generation (opt-in only, see Section 4)</li>
            </ul>
            <p>Each provider has its own privacy policy. We only request the minimum permissions needed to provide the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">7. Data Security</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Passwords are hashed using bcrypt</li>
              <li>OAuth tokens are encrypted at rest using AES-256-GCM</li>
              <li>All connections use HTTPS/TLS</li>
              <li>Session tokens are rotated on each use</li>
              <li>Two-factor authentication is available</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">8. Data Retention</h2>
            <p>Account data is retained as long as your account is active. Audit logs are retained for 90 days. You can delete your account at any time, which removes all associated data from our systems.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">9. Your Rights (GDPR)</h2>
            <p>If you are located in the European Economic Area, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Access</strong> — Request a copy of your personal data</li>
              <li><strong>Rectification</strong> — Correct inaccurate personal data</li>
              <li><strong>Erasure</strong> — Request deletion of your personal data</li>
              <li><strong>Portability</strong> — Receive your data in a machine-readable format</li>
              <li><strong>Objection</strong> — Object to processing of your personal data</li>
              <li><strong>Restriction</strong> — Request restricted processing</li>
            </ul>
            <p>To exercise any of these rights, contact us at <a href="mailto:privacy@notebookmd.io" className="text-blue-600 dark:text-blue-400 hover:underline">privacy@notebookmd.io</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">10. Cookies</h2>
            <p>We use the following cookies:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>refresh_token</strong> (essential) — Session authentication</li>
              <li><strong>nbmd_consent</strong> (essential) — Cookie consent preferences</li>
              <li><strong>notebookmd-settings</strong> (functional) — Local app preferences via localStorage</li>
            </ul>
            <p>We do not use third-party tracking cookies. Analytics cookies, if enabled in the future, will require your consent.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">11. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes via the Service or email.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">12. Contact</h2>
            <p>For privacy-related questions, contact us at <a href="mailto:privacy@notebookmd.io" className="text-blue-600 dark:text-blue-400 hover:underline">privacy@notebookmd.io</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPage;

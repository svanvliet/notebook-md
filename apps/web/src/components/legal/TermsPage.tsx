export function TermsPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-6 block">
          ← Back to Notebook.md
        </button>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: February 2026</p>

        <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">1. Acceptance of Terms</h2>
            <p>By accessing or using Notebook.md ("the Service"), operated by Van Vliet Ventures, LLC ("we", "us", "our"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">2. Description of Service</h2>
            <p>Notebook.md is a web-based Markdown editor that allows you to create, edit, and organize Markdown documents stored in your own cloud storage accounts (GitHub, OneDrive, Google Drive). We do not store your document content — it remains in your connected storage providers.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">3. User Accounts</h2>
            <p>You may create an account using email or third-party authentication providers. You are responsible for maintaining the security of your account credentials. You must be at least 13 years old to use the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">4. Acceptable Use</h2>
            <p>You agree not to use the Service to: (a) violate any laws or regulations; (b) infringe on intellectual property rights; (c) transmit malicious code; (d) attempt to gain unauthorized access to our systems; (e) interfere with or disrupt the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">5. Your Content</h2>
            <p>You retain all rights to your content. We do not claim ownership of any documents you create or edit using the Service. Your content is stored in your connected third-party storage providers, not on our servers.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">6. Disclaimer of Warranties</h2>
            <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">7. Limitation of Liability</h2>
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, VAN VLIET VENTURES, LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, PROFITS, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">8. Indemnification</h2>
            <p>You agree to indemnify and hold harmless Van Vliet Ventures, LLC, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorneys' fees) arising out of your use of the Service or your violation of these Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">9. Termination</h2>
            <p>We may suspend or terminate your access to the Service at any time, with or without cause. Upon termination, your right to use the Service ceases immediately. Your content remains in your connected storage providers.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">10. Changes to Terms</h2>
            <p>We may update these Terms from time to time. We will notify you of material changes via the Service or email. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">11. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Washington, United States, without regard to conflict of law principles.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">12. Contact</h2>
            <p>For questions about these Terms, contact us at <a href="mailto:legal@notebookmd.io" className="text-blue-600 dark:text-blue-400 hover:underline">legal@notebookmd.io</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

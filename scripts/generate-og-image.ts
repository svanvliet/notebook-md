/**
 * Generate Open Graph image for Notebook.md
 * Run: npx tsx scripts/generate-og-image.ts
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '../apps/web/public/og-image.png');

const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1200px; height: 630px;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e1b4b 100%);
      font-family: 'Inter', sans-serif;
      display: flex; align-items: center; justify-content: center;
      color: white;
    }
    .container {
      display: flex; flex-direction: column; align-items: center;
      text-align: center; gap: 24px;
    }
    .logo-row {
      display: flex; align-items: center; gap: 20px;
    }
    .icon-wrapper {
      width: 80px; height: 80px; border-radius: 20px;
      background: #2563eb; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 32px rgba(37, 99, 235, 0.4);
    }
    .icon-wrapper svg { width: 48px; height: 48px; stroke: white; }
    .app-name { font-size: 56px; font-weight: 700; letter-spacing: -1px; }
    .tagline {
      font-size: 26px; font-weight: 400; color: #94a3b8;
      max-width: 700px; line-height: 1.4;
    }
    .features {
      display: flex; gap: 32px; margin-top: 12px;
    }
    .feature {
      display: flex; align-items: center; gap: 8px;
      font-size: 18px; color: #cbd5e1;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; }
    .url {
      font-size: 18px; color: #64748b; margin-top: 8px;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-row">
      <div class="icon-wrapper">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
          <path d="M8 7h6"/><path d="M8 11h8"/>
        </svg>
      </div>
      <span class="app-name">Notebook.md</span>
    </div>
    <div class="tagline">Your Markdown notebooks, everywhere.</div>
    <div class="features">
      <div class="feature"><div class="dot"></div>WYSIWYG Editor</div>
      <div class="feature"><div class="dot"></div>Cloud Storage</div>
      <div class="feature"><div class="dot"></div>GitHub Sync</div>
      <div class="feature"><div class="dot"></div>Dark Mode</div>
    </div>
    <div class="url">notebookmd.io</div>
  </div>
</body>
</html>`;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();
  console.log(`OG image saved to ${outputPath}`);
}

main().catch(console.error);

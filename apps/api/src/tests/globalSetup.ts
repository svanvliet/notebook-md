import { execSync } from 'child_process';

/**
 * Vitest global setup: runs migrations on the test database.
 * The test DB (notebookmd_test) is separate from the dev DB (notebookmd).
 */
export default function setup() {
  const testDbUrl = 'postgresql://notebookmd:localdev@localhost:5432/notebookmd_test';
  try {
    execSync(`DATABASE_URL=${testDbUrl} npx node-pg-migrate up --migrations-dir migrations --migration-file-language sql`, {
      cwd: new URL('..', import.meta.url).pathname,
      stdio: 'pipe',
    });
  } catch (err: any) {
    // If migrations are already up to date, that's fine
    if (!err.stderr?.toString().includes('already')) {
      console.error('Migration failed:', err.stderr?.toString());
      throw err;
    }
  }
}

#!/usr/bin/env node
/**
 * promote-admin.js — Set is_admin = true for a user by email.
 *
 * Usage:
 *   node cli/promote-admin.js user@example.com
 *
 * In production (via Docker):
 *   docker exec -it <api-container> node cli/promote-admin.js user@example.com
 */

import pg from 'pg';

const email = process.argv[2];

if (!email) {
  console.error('Usage: node cli/promote-admin.js <email>');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://notebookmd:localdev@localhost:5432/notebookmd',
});

try {
  const result = await pool.query(
    'UPDATE users SET is_admin = true WHERE email = $1 RETURNING id, email, display_name',
    [email.toLowerCase()],
  );

  if (result.rows.length === 0) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const user = result.rows[0];
  console.log(`✅ Promoted to admin: ${user.display_name} (${user.email}) [${user.id}]`);
} catch (err) {
  console.error('Database error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}

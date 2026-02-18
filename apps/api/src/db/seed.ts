import { query } from '../db/pool.js';
import bcryptjs from 'bcryptjs';
import { logger } from '../lib/logger.js';

export async function seed() {
  // Check if admin user already exists
  const existing = await query('SELECT id FROM users WHERE email = $1', ['admin@localhost']);
  if (existing.rows.length > 0) {
    logger.info('Seed: admin@localhost already exists, skipping');
    return;
  }

  const passwordHash = await bcryptjs.hash('admin123', 12);

  await query(
    `INSERT INTO users (display_name, email, email_verified, password_hash, is_admin)
     VALUES ($1, $2, $3, $4, $5)`,
    ['Admin', 'admin@localhost', true, passwordHash, true],
  );

  logger.info('Seed: Created admin@localhost (password: admin123)');
}

import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import Redis from 'ioredis';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const port = Number(process.env.COLLAB_PORT || 3002);

// Database pool — shared with API config
const pool = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'notebookmd',
  user: process.env.DB_USER ?? 'notebookmd',
  password: process.env.DB_PASSWORD ?? 'localdev',
  max: 10,
});

// Redis connection for collab token validation
const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

/**
 * Parse document name format: "notebook:{notebookId}:file:{encodedPath}"
 */
function parseDocumentName(name: string): { notebookId: string; filePath: string } {
  const parts = name.split(':');
  if (parts.length < 4 || parts[0] !== 'notebook' || parts[2] !== 'file') {
    throw new Error(`Invalid document name format: ${name}`);
  }
  return {
    notebookId: parts[1],
    filePath: decodeURIComponent(parts.slice(3).join(':')),
  };
}

// User color palette for collaboration cursors
const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

function assignColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

const server = Server.configure({
  port,
  debounce: 5000,
  maxDebounce: 30000,

  async onAuthenticate({ token, documentName }) {
    if (!token) throw new Error('Authentication required');

    let userId: string;
    let displayName: string;

    // Try Redis collab token first (short-lived, issued by GET /auth/collab-token)
    const collabData = await redis.get(`collab:${token}`);
    if (collabData) {
      const parsed = JSON.parse(collabData);
      userId = parsed.userId;
      displayName = parsed.displayName;

      // Verify user isn't suspended
      const userResult = await pool.query(
        'SELECT is_suspended FROM users WHERE id = $1',
        [userId],
      );
      if (userResult.rows.length === 0 || userResult.rows[0].is_suspended) {
        throw new Error('Account suspended');
      }
    } else {
      // Fallback: validate as session refresh token (legacy path)
      const { createHash } = await import('crypto');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const sessionResult = await pool.query(
        `SELECT s.user_id, u.display_name, u.is_suspended
         FROM sessions s JOIN users u ON s.user_id = u.id
         WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
        [tokenHash],
      );

      if (sessionResult.rows.length === 0) throw new Error('Invalid session');
      const user = sessionResult.rows[0];
      if (user.is_suspended) throw new Error('Account suspended');
      userId = user.user_id;
      displayName = user.display_name;
    }

    // Parse document name and check permissions
    const { notebookId } = parseDocumentName(documentName);

    // Check: is user the owner?
    const notebookResult = await pool.query(
      "SELECT user_id FROM notebooks WHERE id = $1 AND source_type = 'cloud'",
      [notebookId],
    );

    if (notebookResult.rows.length === 0) throw new Error('Notebook not found');

    let permission = 'viewer';
    if (notebookResult.rows[0].user_id === userId) {
      permission = 'owner';
    } else {
      // Check notebook_shares
      const shareResult = await pool.query(
        'SELECT permission FROM notebook_shares WHERE notebook_id = $1 AND shared_with_user_id = $2 AND revoked_at IS NULL',
        [notebookId, userId],
      );
      if (shareResult.rows.length === 0) throw new Error('Access denied');
      permission = shareResult.rows[0].permission;
    }

    return {
      user: {
        id: userId,
        name: displayName,
        color: assignColor(userId),
        permission,
      },
    };
  },

  async onConnect({ documentName, connection, context }) {
    // Track collab session
    try {
      const { notebookId, filePath } = parseDocumentName(documentName);
      const user = context as { id: string };
      const docResult = await pool.query(
        'SELECT id FROM cloud_documents WHERE notebook_id = $1 AND path = $2',
        [notebookId, filePath],
      );
      if (docResult.rows.length > 0) {
        await pool.query(
          'INSERT INTO collab_sessions (document_id, user_id) VALUES ($1, $2)',
          [docResult.rows[0].id, user.id],
        );
      }
    } catch {
      // Non-critical — don't block connection
    }
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        try {
          const { notebookId, filePath } = parseDocumentName(documentName);
          const result = await pool.query(
            'SELECT ydoc_state FROM cloud_documents WHERE notebook_id = $1 AND path = $2',
            [notebookId, filePath],
          );
          if (result.rows.length > 0 && result.rows[0].ydoc_state) {
            return new Uint8Array(result.rows[0].ydoc_state);
          }
        } catch (err) {
          console.error('[collab] fetch error:', err);
        }
        return null;
      },
      async store({ documentName, state }) {
        try {
          const { notebookId, filePath } = parseDocumentName(documentName);
          // Store Yjs state
          await pool.query(
            `UPDATE cloud_documents SET ydoc_state = $1, updated_at = now()
             WHERE notebook_id = $2 AND path = $3`,
            [Buffer.from(state), notebookId, filePath],
          );
        } catch (err) {
          console.error('[collab] store error:', err);
        }
      },
    }),
  ],
});

// Connect Redis and start listening
redis.connect().then(() => {
  console.log('[collab] Redis connected');
  server.listen().then(() => {
    console.log(`[collab] HocusPocus server listening on port ${port}`);
  });
}).catch((err) => {
  console.error('[collab] Redis connection failed, starting without collab-token support:', err.message);
  server.listen().then(() => {
    console.log(`[collab] HocusPocus server listening on port ${port}`);
  });
});

import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import Redis from 'ioredis';
import * as Y from 'yjs';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const port = Number(process.env.COLLAB_PORT || 3002);

const isProduction = process.env.NODE_ENV === 'production';

// Database pool — shared with API config
const pool = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'notebookmd',
  user: process.env.DB_USER ?? 'notebookmd',
  password: process.env.DB_PASSWORD ?? 'localdev',
  max: 10,
  ssl: isProduction ? { rejectUnauthorized: true } : undefined,
});

// Redis connection for collab token validation
const redisUrl = process.env.REDIS_URL;
const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
  : new Redis({
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

// ── Encrypt helper (mirrors apps/api/src/lib/encryption.ts) ───────────────
function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY not set');
  return Buffer.byteLength(raw, 'utf8') === 32
    ? Buffer.from(raw, 'utf8')
    : createHash('sha256').update(raw).digest();
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const [ivHex, authTagHex, ciphertext] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Seed a Yjs document from plain text/HTML content.
 * Creates a minimal Yjs XML fragment that TipTap can render.
 */
function htmlToYdocState(html: string): Uint8Array {
  const doc = new Y.Doc();
  const frag = doc.getXmlFragment('default');
  // Insert content as a paragraph per line
  const lines = html.split('\n').filter(l => l.trim());
  if (lines.length === 0) {
    const p = new Y.XmlElement('paragraph');
    frag.push([p]);
  } else {
    for (const line of lines) {
      const p = new Y.XmlElement('paragraph');
      p.insert(0, [new Y.XmlText(line)]);
      frag.push([p]);
    }
  }
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}

// ── Yjs XML fragment → HTML converter ─────────────────────────────────────
function yTextToHtml(ytext: Y.XmlText): string {
  return ytext.toDelta().map((op: { insert: string; attributes?: Record<string, unknown> }) => {
    let s = typeof op.insert === 'string' ? op.insert.replace(/&/g, '&amp;').replace(/</g, '&lt;') : '';
    if (op.attributes?.bold) s = `<strong>${s}</strong>`;
    if (op.attributes?.italic) s = `<em>${s}</em>`;
    if (op.attributes?.code) s = `<code>${s}</code>`;
    if (op.attributes?.link) s = `<a href="${(op.attributes.link as { href: string }).href}">${s}</a>`;
    return s;
  }).join('');
}

function yElementToHtml(el: Y.XmlElement): string {
  const inner = el.toArray().map((child) => {
    if (child instanceof Y.XmlText) return yTextToHtml(child);
    if (child instanceof Y.XmlElement) return yElementToHtml(child);
    return '';
  }).join('');
  const n = el.nodeName;
  if (n === 'paragraph') return `<p>${inner}</p>`;
  if (n === 'heading') return `<h${el.getAttribute('level') || 1}>${inner}</h${el.getAttribute('level') || 1}>`;
  if (n === 'bulletList') return `<ul>${inner}</ul>`;
  if (n === 'orderedList') return `<ol>${inner}</ol>`;
  if (n === 'listItem') return `<li>${inner}</li>`;
  if (n === 'taskList') return `<ul data-type="taskList">${inner}</ul>`;
  if (n === 'taskItem') return `<li data-type="taskItem">${inner}</li>`;
  if (n === 'codeBlock') return `<pre><code>${inner}</code></pre>`;
  if (n === 'blockquote') return `<blockquote>${inner}</blockquote>`;
  if (n === 'hardBreak') return '<br>';
  if (n === 'horizontalRule') return '<hr>';
  if (n === 'image') return `<img src="${el.getAttribute('src') || ''}" alt="${el.getAttribute('alt') || ''}">`;
  return inner; // fallback: render children without wrapper
}

function ydocStateToHtml(state: Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  const frag = doc.getXmlFragment('default');
  const html = frag.toArray().map((child) => {
    if (child instanceof Y.XmlElement) return yElementToHtml(child);
    if (child instanceof Y.XmlText) return yTextToHtml(child);
    return '';
  }).join('');
  doc.destroy();
  return html;
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

    const isOwner = notebookResult.rows[0].user_id === userId;

    // Check cloud_collab kill switch — if disabled, block non-owner connections
    if (!isOwner) {
      const flagResult = await pool.query(
        "SELECT enabled FROM feature_flags WHERE key = 'cloud_collab'",
      );
      if (flagResult.rows.length > 0 && !flagResult.rows[0].enabled) {
        throw new Error('Real-time collaboration is currently disabled');
      }
    }

    let permission = 'viewer';
    if (isOwner) {
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
        // Return null — client will seed from REST content if ydoc is empty
        return null;
      },
      async store({ documentName, state }) {
        try {
          const { notebookId, filePath } = parseDocumentName(documentName);
          // Sync content_enc so REST reads always have current content
          const html = ydocStateToHtml(state);
          const contentEnc = encrypt(html);
          const sizeBytes = Buffer.byteLength(html, 'utf-8');
          await pool.query(
            `UPDATE cloud_documents
             SET ydoc_state = $1, content_enc = $2, size_bytes = $3, updated_at = now()
             WHERE notebook_id = $4 AND path = $5`,
            [Buffer.from(state), contentEnc, sizeBytes, notebookId, filePath],
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

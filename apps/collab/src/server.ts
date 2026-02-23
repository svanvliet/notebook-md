import { Server } from '@hocuspocus/server';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const port = Number(process.env.COLLAB_PORT || 3002);

const server = Server.configure({
  port,
  // Stub — Phase 2 will add authentication, database persistence, and Redis pub/sub
  async onAuthenticate({ token, documentName }) {
    // TODO Phase 2: validate session token + check notebook permissions
    return { user: { id: 'stub', name: 'Stub User', color: '#3B82F6' } };
  },
});

server.listen().then(() => {
  console.log(`[collab] HocusPocus server listening on port ${port}`);
});

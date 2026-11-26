// Standalone HTTP server: run this on any Node host (Railway, Render, a VPS, Docker).
// Serves the same URLs as the Vercel deployment, reusing the handlers in /api:
//   POST /api/mcp/<MCP_SHARED_SECRET>[--key]   the Claude connector endpoint
//   GET  /api/health                           liveness check
//   GET  /api/connect, /api/oauth-callback     browser sign-in for extra inboxes
//
// Kept out of the project root on purpose: Vercel auto-detects a root server.js /
// index.js / app.js that imports express and would deploy it instead of /api.

import './env.js';
import express from 'express';
import mcp from '../api/mcp/[secret].js';
import health from '../api/health.js';
import connect from '../api/connect.js';
import oauthCallback from '../api/oauth-callback.js';

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', health);
app.get('/api/connect', connect);
app.get('/api/oauth-callback', oauthCallback);
app.all('/api/mcp/:secret', (req, res) => {
  req.query.secret = req.params.secret;
  return mcp(req, res);
});
app.use((_req, res) => res.status(404).end());

app.listen(PORT, () => {
  console.log(`gmail-mcp listening on :${PORT}  (connector URL: <your-host>/api/mcp/<MCP_SHARED_SECRET>)`);
});

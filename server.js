// OPTIONAL: run this for local testing only (`npm start`).
// The actual deployment target is Vercel — see api/mcp/[secret].js and api/health.js,
// which reuse the same tool definitions from lib/gmail-mcp.js.

import 'dotenv/config';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer, checkAuth } from './lib/gmail-mcp.js';

const { PORT = 3000 } = process.env;

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  if (!checkAuth(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});

app.post('/mcp', async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error' });
    }
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`gmail-mcp (local dev) listening on :${PORT}`);
});

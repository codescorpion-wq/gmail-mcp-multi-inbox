// Vercel serverless function: POST /api/mcp/<MCP_SHARED_SECRET>
//
// The secret lives in the URL path instead of an Authorization header.
// Why: Claude's custom-connector setup, when a server answers with 401,
// assumes that means "this needs an OAuth sign-in" and tries to auto-register
// an OAuth client against it — which fails for a server that doesn't run a
// real OAuth provider. Putting the secret in the path means a correct URL
// never gets a 401 at all, so no OAuth handshake is ever attempted.
//
// Wrong secret -> 404 (looks like "no such route", not "auth required" —
// deliberately avoids anything that looks like an auth challenge).
//
// Extra inboxes: append "--<key>" to the secret, e.g. /api/mcp/<secret>--info
// uses GMAIL_REFRESH_TOKEN_INFO. See lib/accounts.js.

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer, safeEqual } from '../../lib/gmail-mcp.js';
import { getAccount, parseSecretSegment } from '../../lib/accounts.js';

export default async function handler(req, res) {
  const { secret, key } = parseSecretSegment(req.query.secret);
  const expected = process.env.MCP_SHARED_SECRET;

  if (!expected || !safeEqual(secret, expected)) {
    res.status(404).end();
    return;
  }
  const account = getAccount(key);
  if (!account) {
    res.status(404).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const server = buildServer(account);
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
}

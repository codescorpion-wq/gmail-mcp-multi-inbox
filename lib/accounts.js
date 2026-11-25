// Multiple Gmail inboxes in one deployment.
//
// The original inbox uses the original env vars:
//   GMAIL_REFRESH_TOKEN, GMAIL_ACCOUNT_EMAIL
// Every extra inbox gets its own pair, named with a short key:
//   GMAIL_REFRESH_TOKEN_INFO, GMAIL_ACCOUNT_EMAIL_INFO          -> key "info"
//   GMAIL_REFRESH_TOKEN_PARTNERSHIPS, GMAIL_ACCOUNT_EMAIL_PARTNERSHIPS -> key "partnerships"
//
// Connector URLs:
//   /api/mcp/<MCP_SHARED_SECRET>                 -> original inbox (unchanged)
//   /api/mcp/<MCP_SHARED_SECRET>--info           -> info inbox
//   /api/mcp/<MCP_SHARED_SECRET>--partnerships   -> partnerships inbox

const PREFIX = 'GMAIL_REFRESH_TOKEN_';

export function keyFromEmail(email) {
  return String(email || '')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();
}

export function getAccount(key) {
  if (!key) {
    if (!process.env.GMAIL_REFRESH_TOKEN) return null;
    return {
      key: null,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      email: process.env.GMAIL_ACCOUNT_EMAIL || 'connected account',
    };
  }
  const upper = key.toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const refreshToken = process.env[PREFIX + upper];
  if (!upper || !refreshToken) return null;
  return {
    key: upper,
    refreshToken,
    email: process.env['GMAIL_ACCOUNT_EMAIL_' + upper] || `${upper.toLowerCase()} inbox`,
  };
}

export function listAccounts() {
  const out = [];
  const main = getAccount(null);
  if (main) out.push(main.email);
  for (const name of Object.keys(process.env)) {
    if (name.startsWith(PREFIX)) {
      const acc = getAccount(name.slice(PREFIX.length));
      if (acc) out.push(acc.email);
    }
  }
  return out;
}

// Split "<secret>--<key>" into its parts. The secret is hex, so "--" never appears in it.
export function parseSecretSegment(segment) {
  const s = String(segment || '');
  const i = s.indexOf('--');
  if (i === -1) return { secret: s, key: null };
  return { secret: s.slice(0, i), key: s.slice(i + 2) || null };
}

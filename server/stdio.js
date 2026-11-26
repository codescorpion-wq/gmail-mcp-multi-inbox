// Local mode for Claude Desktop (and other MCP clients that launch local servers).
// No hosting needed: Claude starts this process on your computer and talks to it over stdin/stdout.
//
// One process serves one inbox. Pick which with GMAIL_ACCOUNT_KEY:
//   unset          -> GMAIL_REFRESH_TOKEN / GMAIL_ACCOUNT_EMAIL
//   "WORK"         -> GMAIL_REFRESH_TOKEN_WORK / GMAIL_ACCOUNT_EMAIL_WORK
// Add one entry per inbox in claude_desktop_config.json (see README).
//
// Never write to stdout here: stdout carries the MCP protocol. Log with console.error.

import './env.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from '../lib/gmail-mcp.js';
import { getAccount } from '../lib/accounts.js';

const key = process.env.GMAIL_ACCOUNT_KEY || null;
const account = getAccount(key);
if (!account) {
  console.error(
    key
      ? `No inbox configured for GMAIL_ACCOUNT_KEY=${key}. Expected GMAIL_REFRESH_TOKEN_${key.toUpperCase()} in .env.`
      : 'No inbox configured. Run `npm run get-token` and put GMAIL_REFRESH_TOKEN in .env.'
  );
  process.exit(1);
}

const server = buildServer(account);
await server.connect(new StdioServerTransport());
console.error(`gmail-mcp (stdio) ready for ${account.email}`);

// Vercel serverless function: GET /api/health — confirms the deploy is live.
// Public endpoint, so it reports only how many inboxes are configured, never their addresses.

import { listAccounts } from '../lib/accounts.js';

export default function handler(req, res) {
  res.status(200).json({ ok: true, inboxes: listAccounts().length });
}

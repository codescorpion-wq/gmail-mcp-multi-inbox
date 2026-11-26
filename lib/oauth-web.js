// Browser-based sign-in for adding another inbox (replaces running `npm run get-token`).
// Flow: open /api/connect -> Google sign-in -> /api/oauth-callback shows the refresh token
// and the exact Vercel env var names to add.

import crypto from 'node:crypto';
import { google } from 'googleapis';

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
];

export function callbackUrl(req) {
  const fwd = req.headers['x-forwarded-proto'];
  const proto = fwd ? fwd.split(',')[0].trim() : req.socket?.encrypted ? 'https' : 'http';
  return `${proto}://${req.headers.host}/api/oauth-callback`;
}

export function webClient(req) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set');
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, callbackUrl(req));
}

// Only inboxes on the same domain as the original inbox may be connected.
// Set ALLOW_ANY_GMAIL=true to allow any address (e.g. several personal @gmail.com inboxes).
export function allowedDomain() {
  if (process.env.ALLOW_ANY_GMAIL === 'true') return null;
  const email = process.env.GMAIL_ACCOUNT_EMAIL || '';
  return email.includes('@') ? email.split('@')[1].toLowerCase() : null;
}

// Google's "hd" sign-in hint only works for Google Workspace domains, not consumer Gmail.
const CONSUMER_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
export function workspaceDomain() {
  const d = allowedDomain();
  return d && !CONSUMER_DOMAINS.has(d) ? d : null;
}

export function newState() {
  return crypto.randomBytes(16).toString('hex');
}

export function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function page(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#1a1a1a;background:#fafafa}
h1{font-size:22px}.box{background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px;margin:16px 0}
code,.val{font-family:ui-monospace,Consolas,monospace;background:#f1f1f1;padding:2px 6px;border-radius:4px;word-break:break-all}
.val{display:block;padding:10px;margin:6px 0}button{font:inherit;padding:6px 12px;cursor:pointer}
.err{color:#b00020}a.btn{display:inline-block;background:#1a73e8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none}
</style></head><body>${bodyHtml}
<script>document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);b.textContent='Copied';});</script>
</body></html>`;
}

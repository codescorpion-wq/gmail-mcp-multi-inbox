// GET /api/connect — start the Google sign-in for another inbox.
import { SCOPES, webClient, allowedDomain, newState, page, escapeHtml } from '../lib/oauth-web.js';

export default function handler(req, res) {
  try {
    const client = webClient(req);
    const state = newState();
    const domain = allowedDomain();
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      scope: SCOPES,
      state,
      ...(domain ? { hd: domain } : {}),
    });
    res.setHeader('Set-Cookie', `oauth_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(
      page(
        'Connect a Gmail inbox',
        `<h1>Connect another Gmail inbox</h1>
<p>Click the button and sign in with the inbox you want to add${domain ? ` (it must be an <b>@${escapeHtml(domain)}</b> address)` : ''}.</p>
<p><a class="btn" href="${escapeHtml(url)}">Sign in with Google</a></p>`
      )
    );
  } catch (err) {
    res.status(500).send(page('Error', `<p class="err">${escapeHtml(err.message)}</p>`));
  }
}

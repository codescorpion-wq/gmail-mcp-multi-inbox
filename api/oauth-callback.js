// GET /api/oauth-callback — Google sends the user back here after sign-in.
// Shows the refresh token and the exact env var names to add in Vercel.
import { google } from 'googleapis';
import { webClient, allowedDomain, readCookie, page, escapeHtml } from '../lib/oauth-web.js';
import { keyFromEmail } from '../lib/accounts.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const fail = (msg) => res.status(400).send(page('Error', `<h1>Something went wrong</h1><p class="err">${escapeHtml(msg)}</p><p><a href="/api/connect">Try again</a></p>`));

  const { code, state, error } = req.query;
  if (error) return fail(`Google said: ${error}`);
  if (!code || !state || state !== readCookie(req, 'oauth_state')) {
    return fail('This sign-in link expired or was opened in a different browser. Start again.');
  }

  try {
    const client = webClient(req);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: client });
    const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.emailAddress;

    const domain = allowedDomain();
    if (domain && !email.toLowerCase().endsWith('@' + domain)) {
      return fail(`${email} is not an @${domain} address.`);
    }
    if (!tokens.refresh_token) {
      return fail(
        `Google didn't return a key for ${email}. Go to https://myaccount.google.com/permissions while signed in as ${email}, remove this app, then start again.`
      );
    }

    const key = keyFromEmail(email);
    const lower = key.toLowerCase();
    res.setHeader('Set-Cookie', 'oauth_state=; Path=/api; Max-Age=0');
    res.status(200).send(
      page(
        'Inbox connected',
        `<h1>Signed in as ${escapeHtml(email)}</h1>
<p>Add these two variables in Vercel (<b>Settings → Environment Variables → Add Environment Variable</b>), then redeploy.</p>
<div class="box"><b>Variable 1</b><br>Key: <code id="k1">GMAIL_REFRESH_TOKEN_${escapeHtml(key)}</code> <button data-copy="k1">Copy</button>
<br>Value: <span class="val" id="v1">${escapeHtml(tokens.refresh_token)}</span><button data-copy="v1">Copy</button></div>
<div class="box"><b>Variable 2</b><br>Key: <code id="k2">GMAIL_ACCOUNT_EMAIL_${escapeHtml(key)}</code> <button data-copy="k2">Copy</button>
<br>Value: <span class="val" id="v2">${escapeHtml(email)}</span><button data-copy="v2">Copy</button></div>
<p>The Claude connector URL for this inbox is your existing connector URL with <code>--${escapeHtml(lower)}</code> added to the end.</p>
<p>Close this tab when done. Don't share the value above — it's a password for this inbox.</p>`
      )
    );
  } catch (err) {
    return fail(err.message);
  }
}

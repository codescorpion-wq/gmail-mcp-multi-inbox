// One-time script: run this LOCALLY (on your own laptop, not a server) to mint a
// refresh token for the Gmail account you want to connect. Run it once, copy the printed
// refresh token into your .env / hosting provider's env vars, then you never
// need to run it again unless the token is revoked.
//
// Usage:
//   1. cp .env.example .env   and fill in GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//   2. npm install
//   3. npm run get-token
//   4. A URL is printed — open it, sign in with the Gmail account you want to connect, approve access.
//   5. Google redirects to localhost; this script catches it and prints your refresh token.

import 'dotenv/config';
import http from 'node:http';
import { URL } from 'node:url';
import { google } from 'googleapis';

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI = 'http://localhost:53682/oauth2callback',
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Scopes: full read/write/send/modify on Gmail. Trim this list if you want the
// connector to be read-only, or read+send only, etc.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // required to get a refresh_token
  prompt: 'consent', // forces Google to re-issue a refresh_token every run
  scope: SCOPES,
});

const port = new URL(GOOGLE_REDIRECT_URI).port || 53682;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, GOOGLE_REDIRECT_URI);
    if (url.pathname !== new URL(GOOGLE_REDIRECT_URI).pathname) {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400).end('Missing ?code= in callback');
      return;
    }
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Done</h1>You can close this tab and return to the terminal.');
    console.log('\n=== Success ===');
    console.log('Add this to your .env / hosting env vars:\n');
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    if (!tokens.refresh_token) {
      console.log(
        '\nNo refresh_token was returned. This usually means this Google account already\n' +
          'granted this app access before. Go to https://myaccount.google.com/permissions ,\n' +
          'remove access for this app, and run `npm run get-token` again.'
      );
    }
    server.close(() => process.exit(0));
  } catch (err) {
    console.error(err);
    res.writeHead(500).end('Token exchange failed, check the terminal.');
    server.close(() => process.exit(1));
  }
});

server.listen(port, () => {
  console.log(`Local callback server listening on ${GOOGLE_REDIRECT_URI}`);
  console.log('\nOpen this URL, sign in with the Gmail account you want to connect, and approve access:\n');
  console.log(authUrl + '\n');
});

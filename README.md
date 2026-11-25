# Gmail MCP — multi-inbox connector for Claude

A small, self-hosted remote [MCP](https://modelcontextprotocol.io) server that lets
Claude work with **any Gmail inbox you choose**, including extra inboxes beyond the
one Claude's built-in Gmail connector is signed into.

Free to use, modify and share under the MIT license.

**Tools it gives Claude:** `gmail_search_messages`, `gmail_get_message`,
`gmail_get_thread`, `gmail_send_message`, `gmail_create_draft`,
`gmail_list_labels`, `gmail_modify_labels`.

**Why use it**

- Connect a second, third or tenth inbox (work, side business, shared support inbox).
- One deployment serves several inboxes, each with its own connector URL.
- Runs as Vercel serverless functions: no server to keep alive, free tier is enough.
- You host it, so your mail and tokens never pass through anyone else's service.

---

## What you need

- A Google account with access to [Google Cloud Console](https://console.cloud.google.com) (free)
- A [Vercel](https://vercel.com) account (free) and a GitHub account
- Node.js 18+ on your computer (only for the one-time token step)
- A Claude plan that supports custom connectors

Setup takes about 20 minutes.

---

## 1. Create a Google OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com), create a new project.
2. **APIs & Services → Library** → enable the **Gmail API**.
3. **Google Auth Platform → Get started** (OAuth consent screen):
   - Audience: **External**. Fill in an app name and your contact email.
   - **Audience → Test users → Add users**: add every Gmail address you plan to connect.
     (While the app is in "Testing", only these users can sign in.)
   - **Data Access → Add or remove scopes**: add `gmail.readonly`, `gmail.send`,
     `gmail.compose`, `gmail.modify`, `gmail.labels`.
4. **Clients → Create client** → type **Web application**.
   - Authorized redirect URI: `http://localhost:53682/oauth2callback`
   - Copy the **Client ID** and **Client secret**.

> **Testing-mode tokens expire after 7 days.** For a long-lived setup, either publish
> the app (Audience → Publish app; Google may ask for verification because Gmail scopes
> are sensitive), or plan to re-run step 2 weekly.

## 2. Get a refresh token for your inbox

```bash
git clone https://github.com/<you>/gmail-mcp-multi-inbox.git
cd gmail-mcp-multi-inbox
npm install
cp .env.example .env
```

Put your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, then:

```bash
npm run get-token
```

Open the printed URL, sign in with the inbox you want Claude to use, and approve.
The terminal prints `GMAIL_REFRESH_TOKEN=...`. Put it in `.env`, and also set:

```
GMAIL_ACCOUNT_EMAIL=you@example.com
MCP_SHARED_SECRET=<output of: openssl rand -hex 32>
```

`MCP_SHARED_SECRET` is the password for your connector. Keep it long and random.

## 3. Deploy to Vercel

1. Push your copy to **your own private GitHub repo** (or use Vercel's CLI).
2. Vercel → **Add New → Project** → import that repo. Leave **Framework Preset** as **Other**
   (the included `vercel.json` sets this) and leave build settings empty → **Deploy**.
3. **Settings → Environment Variables**: add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN`, `GMAIL_ACCOUNT_EMAIL`, `MCP_SHARED_SECRET`.
4. **Deployments → Redeploy** (env vars apply only to new deploys).
5. Open `https://<your-project>.vercel.app/api/health`. You should see `{"ok":true,"inboxes":1}`.

## 4. Add it to Claude

1. Claude → **Settings → Connectors → Add custom connector**.
2. URL: `https://<your-project>.vercel.app/api/mcp/<MCP_SHARED_SECRET>`
3. Leave authentication empty. The secret in the URL is the authentication.
4. Save. The seven Gmail tools should appear.

Treat that URL like a password: anyone who has it can read and send mail as that inbox.

---

## Adding more inboxes (no terminal needed)

1. Google Cloud → **Clients** → your client → add redirect URI
   `https://<your-project>.vercel.app/api/oauth-callback` → Save.
2. Open `https://<your-project>.vercel.app/api/connect` and sign in with the new inbox.
   The page shows two variables, for example `GMAIL_REFRESH_TOKEN_SUPPORT` and
   `GMAIL_ACCOUNT_EMAIL_SUPPORT`.
3. Add both in Vercel → Environment Variables → redeploy.
4. Add another custom connector in Claude using your URL plus `--<key>`:
   `https://<your-project>.vercel.app/api/mcp/<MCP_SHARED_SECRET>--support`

For safety, `/api/connect` only accepts addresses on the same domain as
`GMAIL_ACCOUNT_EMAIL`. If your first inbox is `@gmail.com`, any other `@gmail.com`
address is accepted. To allow mixed domains (say a personal Gmail plus a work
address), add the env var `ALLOW_ANY_GMAIL=true`.

Every inbox you add must also be listed as a **test user** in Google Cloud
(Audience → Test users) while your OAuth app is in Testing mode.

Each inbox shows up in Claude as its own connector with the same seven tools, and
the tool descriptions name the inbox, so Claude knows which one it's using.

---

## Local testing

```bash
npm start
```

Runs on `http://localhost:3000/mcp` and expects the header
`Authorization: Bearer <MCP_SHARED_SECRET>`. Uses the same tool code as the Vercel functions.

## How it works

| File | Purpose |
|---|---|
| `lib/gmail-mcp.js` | The MCP tools and Gmail API calls |
| `lib/accounts.js` | Maps `--key` suffixes to per-inbox env vars |
| `api/mcp/[secret].js` | The connector endpoint (secret checked in the path) |
| `api/connect.js`, `api/oauth-callback.js` | Browser sign-in for extra inboxes |
| `api/health.js` | Liveness check (shows inbox count only) |
| `dev/local-server.js` | Optional local test server (`npm start`) |
| `auth/get-refresh-token.js` | One-time local token script |

The secret sits in the URL path rather than a header because Claude treats a `401`
from a custom connector as "needs OAuth" and tries to register an OAuth client.
A wrong secret returns `404` instead, so no OAuth handshake is attempted.

Each request builds a fresh, stateless MCP session, which suits serverless functions.

## Security notes

- Never commit `.env`. It is already in `.gitignore`.
- Each refresh token grants full Gmail access for that inbox. Revoke access any time at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- Want read-only? Remove the `send`, `compose` and `modify` scopes in
  `auth/get-refresh-token.js` and `lib/oauth-web.js`, and delete the matching tools in
  `lib/gmail-mcp.js`.
- Rotate `MCP_SHARED_SECRET` if the connector URL is ever exposed.

## Troubleshooting

- **No refresh token returned:** the account already granted access. Remove the app at
  myaccount.google.com/permissions and run the sign-in again.
- **`invalid_grant` errors after a week:** your OAuth app is in Testing mode. See the note in step 1.
- **`/api/health` returns 404 after deploy:** Vercel detected the project as an Express or Node server.
  In Project → Settings → Build and Deployment, set Framework Preset to **Other**, then redeploy.
  Don't add a `server.js`, `index.js` or `app.js` at the repo root.
- **Connector shows no tools:** check `/api/health`, confirm every env var is set, and redeploy.

## Contributing

Issues and pull requests are welcome, whether that's new tools (attachments, filters,
batch actions), other hosts, or docs fixes.

## License

[MIT](LICENSE)

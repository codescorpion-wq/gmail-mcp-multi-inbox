# Gmail MCP — multi-inbox connector for Claude

A small, self-hosted [MCP](https://modelcontextprotocol.io) server that lets Claude
work with **any Gmail inbox you choose**, including extra inboxes beyond the one
Claude's built-in Gmail connector is signed into.

Free to use, modify and share under the MIT license.

**Tools it gives Claude:** `gmail_search_messages`, `gmail_get_message`,
`gmail_get_thread`, `gmail_send_message`, `gmail_create_draft`,
`gmail_list_labels`, `gmail_modify_labels`.

**Why use it**

- Connect a second, third or tenth inbox (work, side business, shared support inbox).
- Run it on your own computer, on any server, or on Vercel's free tier.
- You run it yourself, so your mail and tokens never pass through anyone else's service.

---

## Choose how to run it

| Option | Works in | Hosting needed | Best for |
|---|---|---|---|
| **A. Local (Claude Desktop / Claude Code)** | Claude Desktop app, Claude Code | None, runs on your computer | Quickest setup, personal use |
| **B. Any Node host or Docker** (Railway, Render, a VPS, your own server) | Claude web, desktop and mobile | Yes | You already have a server or prefer these hosts |
| **C. Vercel** | Claude web, desktop and mobile | Free Vercel account | Free hosting with no server to manage |

Option A only works while your computer is on, and only in the Claude apps that run
local servers. Choose B or C if you want the inbox available in Claude on the web or
your phone.

Every option starts with the same two steps.

---

## Step 1. Create a Google OAuth client (everyone)

1. In [Google Cloud Console](https://console.cloud.google.com), create a new project.
2. **APIs & Services → Library** → enable the **Gmail API**.
3. **Google Auth Platform → Get started** (OAuth consent screen):
   - Audience: **External**. Fill in an app name and your contact email.
   - **Audience → Test users → Add users**: add every Gmail address you plan to connect.
     While the app is in Testing mode, only these users can sign in.
   - **Data Access → Add or remove scopes**: add `gmail.readonly`, `gmail.send`,
     `gmail.compose`, `gmail.modify`, `gmail.labels`.
4. **Clients → Create client** → type **Web application**.
   - Authorized redirect URI: `http://localhost:53682/oauth2callback`
   - Copy the **Client ID** and **Client secret**.

> **Testing-mode sign-ins expire after 7 days.** For a long-lived setup, publish the app
> (Audience → Publish app; Google may ask for verification because Gmail scopes are
> sensitive), or re-run Step 2 weekly.

## Step 2. Download the code and sign in (everyone)

You need Node.js 18 or newer.

```bash
git clone https://github.com/codescorpion-wq/gmail-mcp-multi-inbox.git
cd gmail-mcp-multi-inbox
npm install
cp .env.example .env
```

Open `.env` and fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Then sign in
with your first inbox:

```bash
npm run get-token
```

Open the printed URL, sign in with the inbox you want Claude to use, and approve.
The terminal prints two lines (`GMAIL_REFRESH_TOKEN=...` and `GMAIL_ACCOUNT_EMAIL=...`).
Paste both into `.env`.

**More inboxes:** run it again with a short name for each one:

```bash
npm run get-token -- work
npm run get-token -- support
```

Each run prints `GMAIL_REFRESH_TOKEN_WORK=...` and `GMAIL_ACCOUNT_EMAIL_WORK=...`
(and so on). Paste those into `.env` too.

Now follow **one** of the options below.

---

## Option A. Local, for Claude Desktop or Claude Code

No hosting and no shared secret needed. Claude starts the server on your computer.

### Claude Desktop

1. Claude Desktop → **Settings → Developer → Edit Config**. This opens
   `claude_desktop_config.json`:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Add one entry per inbox. Use the **full path** to `server/stdio.js` on your computer:

```json
{
  "mcpServers": {
    "gmail-personal": {
      "command": "node",
      "args": ["/Users/you/gmail-mcp-multi-inbox/server/stdio.js"]
    },
    "gmail-work": {
      "command": "node",
      "args": ["/Users/you/gmail-mcp-multi-inbox/server/stdio.js"],
      "env": { "GMAIL_ACCOUNT_KEY": "WORK" }
    }
  }
}
```

   The entry without `GMAIL_ACCOUNT_KEY` uses your first inbox. `"WORK"` uses the
   inbox you added with `npm run get-token -- work`.
   On Windows, write the path as `"C:\\Users\\you\\gmail-mcp-multi-inbox\\server\\stdio.js"`.
3. Fully quit and reopen Claude Desktop. The Gmail tools appear under the tools (🔨) menu.

If `node` isn't found, use its full path in `"command"`, which you can get by running
`which node` on macOS or `where node` on Windows.

### Claude Code

```bash
claude mcp add gmail-personal -- node /full/path/to/gmail-mcp-multi-inbox/server/stdio.js
claude mcp add gmail-work -e GMAIL_ACCOUNT_KEY=WORK -- node /full/path/to/gmail-mcp-multi-inbox/server/stdio.js
```

---

## Option B. Any Node host or Docker

This runs one small web server that serves every inbox. First, generate a shared
secret and add it to `.env`:

```bash
openssl rand -hex 32
```

```
MCP_SHARED_SECRET=<the output>
```

`MCP_SHARED_SECRET` is the password for your connector. Keep it long and random.

Test it locally with `npm start`, then open `http://localhost:3000/api/health`.
You should see `{"ok":true,"inboxes":1}`.

Then pick a host. On any of them, set **every variable from your `.env`** as the host's
environment variables. Don't upload the `.env` file itself.

**Railway**
1. Push your copy to a private GitHub repo.
2. [railway.com](https://railway.com) → **New Project → Deploy from GitHub repo**.
   Railway finds the included `Dockerfile`.
3. **Variables** tab: add your `.env` values.
4. **Settings → Networking → Generate Domain**.

**Render**
1. Push your copy to a private GitHub repo.
2. [render.com](https://render.com) → **New → Web Service** → connect the repo →
   Runtime: **Docker**.
3. **Environment**: add your `.env` values. Deploy.

**Your own server or VPS (Docker)**
```bash
docker build -t gmail-mcp .
docker run -d --restart unless-stopped --env-file .env -p 3000:3000 --name gmail-mcp gmail-mcp
```
Put it behind HTTPS (Caddy, Nginx with Let's Encrypt, or a Cloudflare Tunnel).
Claude needs an `https://` URL.

**Your own server without Docker**
```bash
npm ci --omit=dev
npx pm2 start server/http.js --name gmail-mcp   # or a systemd service
```
Also behind HTTPS.

When it's running, continue to **Connect it to Claude** below.

---

## Option C. Vercel

1. Add `MCP_SHARED_SECRET` to `.env` (see Option B for how to generate it).
2. Push your copy to a private GitHub repo.
3. Vercel → **Add New → Project** → import the repo. Leave **Framework Preset** as
   **Other** (the included `vercel.json` sets this) and leave build settings empty.
4. **Settings → Environment Variables**: add every value from your `.env`
   (skip `PORT` and `GOOGLE_REDIRECT_URI`).
5. **Deployments → Redeploy** (environment variables only apply to new deploys).
6. Open `https://<your-project>.vercel.app/api/health`. You should see `{"ok":true,"inboxes":1}`.

---

## Connect it to Claude (Options B and C)

1. Claude → **Settings → Connectors → Add custom connector**.
2. URL: `https://<your-host>/api/mcp/<MCP_SHARED_SECRET>`
3. Leave authentication empty. The secret in the URL is the authentication.
4. Save. The seven Gmail tools should appear.

For each extra inbox, add another connector with `--<name>` on the end:

```
https://<your-host>/api/mcp/<MCP_SHARED_SECRET>--work
https://<your-host>/api/mcp/<MCP_SHARED_SECRET>--support
```

Treat these URLs like passwords: anyone who has one can read and send mail as that inbox.

### Adding inboxes from the browser (Options B and C)

Instead of running `npm run get-token -- <name>`, you can add inboxes to a running
server from your browser:

1. Google Cloud → **Clients** → your client → add the redirect URI
   `https://<your-host>/api/oauth-callback` → Save.
2. Open `https://<your-host>/api/connect` and sign in with the new inbox.
   The page shows two variables, e.g. `GMAIL_REFRESH_TOKEN_SUPPORT` and `GMAIL_ACCOUNT_EMAIL_SUPPORT`.
3. Add both to your host's environment variables and restart or redeploy.
4. Add the connector URL ending in `--support`.

For safety, `/api/connect` only accepts addresses on the same domain as
`GMAIL_ACCOUNT_EMAIL`. If your first inbox is `@gmail.com`, any other `@gmail.com`
address is accepted. To mix domains (a personal Gmail plus a work address), set
`ALLOW_ANY_GMAIL=true`.

---

## How it works

| File | Purpose |
|---|---|
| `lib/gmail-mcp.js` | The MCP tools and Gmail API calls (shared by every option) |
| `lib/accounts.js` | Maps inbox names (`WORK`, `SUPPORT`) to their env vars |
| `server/stdio.js` | Option A: local server Claude Desktop / Claude Code launch |
| `server/http.js` | Option B: standalone web server (also used by the `Dockerfile`) |
| `api/` | Option C: Vercel functions; also reused by `server/http.js` |
| `api/connect.js`, `api/oauth-callback.js` | Browser sign-in for extra inboxes |
| `auth/get-refresh-token.js` | `npm run get-token` sign-in script |

Each inbox appears in Claude as its own connector with the same seven tools. The tool
descriptions name the inbox, so Claude knows which one it is using.

In hosted mode, the secret sits in the URL path rather than a header because Claude
treats a `401` from a custom connector as "needs OAuth" and tries to register an OAuth
client. A wrong secret returns `404` instead, so no OAuth handshake is attempted.

## Security notes

- Never commit `.env`. It is already in `.gitignore` and `.dockerignore`.
- Each refresh token grants full Gmail access for that inbox. Revoke access any time at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- Want read-only? Remove the `send`, `compose` and `modify` scopes in
  `auth/get-refresh-token.js` and `lib/oauth-web.js`, and delete the matching tools in
  `lib/gmail-mcp.js`.
- Rotate `MCP_SHARED_SECRET` if a connector URL is ever exposed.
- `/api/health` is public and reports only how many inboxes are configured, never their addresses.

## Troubleshooting

- **No refresh token returned:** the account already granted access. Remove the app at
  myaccount.google.com/permissions and sign in again.
- **`invalid_grant` errors after a week:** your OAuth app is in Testing mode. See the note in Step 1.
- **Claude Desktop shows no Gmail tools:** check that the path in the config is the full
  path to `server/stdio.js`, that the JSON is valid, and that you fully quit and reopened
  the app. Logs are in Settings → Developer.
- **Vercel: `/api/health` returns 404:** Vercel detected the project as an Express or Node
  server. In Project → Settings → Build and Deployment, set Framework Preset to **Other**,
  then redeploy. Don't add a `server.js`, `index.js` or `app.js` at the repo root.
- **Connector shows no tools (B or C):** open `/api/health`, confirm every env var is set,
  and restart or redeploy.

## Contributing

Issues and pull requests are welcome, whether that's new tools (attachments, filters,
batch actions), other hosts, or docs fixes.

## License

[MIT](LICENSE)

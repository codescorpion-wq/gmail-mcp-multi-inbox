// Shared Gmail + MCP tool logic, used by the Vercel serverless functions in /api.

import crypto from 'node:crypto';
import { google } from 'googleapis';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getAccount } from './accounts.js';

function getOAuthClient(refreshToken) {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI = 'http://localhost:53682/oauth2callback',
  } = process.env;
  const GMAIL_REFRESH_TOKEN = refreshToken;

  for (const [name, val] of Object.entries({ GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN })) {
    if (!val) throw new Error(`Missing required env var: ${name}`);
  }

  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return oauth2Client;
}

function b64urlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plain) return decodeBody(plain);
    const html = payload.parts.find((p) => p.mimeType === 'text/html');
    if (html) return decodeBody(html);
    for (const part of payload.parts) {
      const nested = decodeBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

function headerValue(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Used by the local dev server only. Refuses everything if no secret is configured.
export function checkAuth(req) {
  const secret = process.env.MCP_SHARED_SECRET;
  if (!secret) return false;
  return safeEqual(req.headers.authorization || '', `Bearer ${secret}`);
}

// account: { refreshToken, email } from lib/accounts.js. Omit for the original inbox.
export function buildServer(account = getAccount(null)) {
  if (!account) throw new Error('Missing required env var: GMAIL_REFRESH_TOKEN');
  const oauth2Client = getOAuthClient(account.refreshToken);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const accountEmail = account.email;

  const server = new McpServer({ name: account.key ? `gmail-${account.key.toLowerCase()}` : 'gmail', version: '1.1.0' });

  server.registerTool(
    'gmail_search_messages',
    {
      title: 'Search Gmail messages',
      description: `Search the ${accountEmail} Gmail inbox using standard Gmail search syntax (e.g. "from:someone@x.com is:unread", "subject:invoice after:2026/01/01").`,
      inputSchema: {
        query: z.string().describe('Gmail search query, same syntax as the Gmail search box'),
        maxResults: z.number().int().min(1).max(50).default(10),
      },
    },
    async ({ query, maxResults }) => {
      const { data } = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
      const messages = data.messages || [];
      const details = await Promise.all(
        messages.map(async (m) => {
          const { data: msg } = await gmail.users.messages.get({
            userId: 'me',
            id: m.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          });
          return {
            id: msg.id,
            threadId: msg.threadId,
            snippet: msg.snippet,
            from: headerValue(msg.payload.headers, 'From'),
            to: headerValue(msg.payload.headers, 'To'),
            subject: headerValue(msg.payload.headers, 'Subject'),
            date: headerValue(msg.payload.headers, 'Date'),
            labelIds: msg.labelIds,
          };
        })
      );
      return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }] };
    }
  );

  server.registerTool(
    'gmail_get_message',
    {
      title: 'Get a Gmail message',
      description: 'Fetch the full content (headers + body) of one message by id.',
      inputSchema: { messageId: z.string() },
    },
    async ({ messageId }) => {
      const { data: msg } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
      const result = {
        id: msg.id,
        threadId: msg.threadId,
        from: headerValue(msg.payload.headers, 'From'),
        to: headerValue(msg.payload.headers, 'To'),
        subject: headerValue(msg.payload.headers, 'Subject'),
        date: headerValue(msg.payload.headers, 'Date'),
        labelIds: msg.labelIds,
        body: decodeBody(msg.payload),
      };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'gmail_get_thread',
    {
      title: 'Get a Gmail thread',
      description: 'Fetch every message in a thread, in order.',
      inputSchema: { threadId: z.string() },
    },
    async ({ threadId }) => {
      const { data } = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
      const messages = (data.messages || []).map((msg) => ({
        id: msg.id,
        from: headerValue(msg.payload.headers, 'From'),
        to: headerValue(msg.payload.headers, 'To'),
        subject: headerValue(msg.payload.headers, 'Subject'),
        date: headerValue(msg.payload.headers, 'Date'),
        body: decodeBody(msg.payload),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }] };
    }
  );

  server.registerTool(
    'gmail_send_message',
    {
      title: 'Send a Gmail message',
      description: `Send a new email from ${accountEmail}.`,
      inputSchema: {
        to: z.string().describe('Comma-separated recipient addresses'),
        subject: z.string(),
        body: z.string().describe('Plain-text body'),
        cc: z.string().optional(),
        bcc: z.string().optional(),
      },
    },
    async ({ to, subject, body, cc, bcc }) => {
      const lines = [
        `To: ${to}`,
        cc ? `Cc: ${cc}` : null,
        bcc ? `Bcc: ${bcc}` : null,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        body,
      ].filter(Boolean);
      const raw = b64urlEncode(lines.join('\r\n'));
      const { data } = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
      return { content: [{ type: 'text', text: `Sent. id=${data.id} threadId=${data.threadId}` }] };
    }
  );

  server.registerTool(
    'gmail_create_draft',
    {
      title: 'Create a Gmail draft',
      description: 'Create a draft without sending it.',
      inputSchema: {
        to: z.string(),
        subject: z.string(),
        body: z.string(),
        cc: z.string().optional(),
        bcc: z.string().optional(),
      },
    },
    async ({ to, subject, body, cc, bcc }) => {
      const lines = [
        `To: ${to}`,
        cc ? `Cc: ${cc}` : null,
        bcc ? `Bcc: ${bcc}` : null,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        body,
      ].filter(Boolean);
      const raw = b64urlEncode(lines.join('\r\n'));
      const { data } = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
      return { content: [{ type: 'text', text: `Draft created. id=${data.id}` }] };
    }
  );

  server.registerTool(
    'gmail_list_labels',
    {
      title: 'List Gmail labels',
      description: 'List all labels (folders/tags) in this inbox.',
      inputSchema: {},
    },
    async () => {
      const { data } = await gmail.users.labels.list({ userId: 'me' });
      return { content: [{ type: 'text', text: JSON.stringify(data.labels, null, 2) }] };
    }
  );

  server.registerTool(
    'gmail_modify_labels',
    {
      title: 'Modify labels on a message',
      description:
        'Add/remove labels on a message — e.g. archive (remove INBOX), mark read (remove UNREAD), star (add STARRED).',
      inputSchema: {
        messageId: z.string(),
        addLabelIds: z.array(z.string()).optional(),
        removeLabelIds: z.array(z.string()).optional(),
      },
    },
    async ({ messageId, addLabelIds, removeLabelIds }) => {
      const { data } = await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { addLabelIds, removeLabelIds },
      });
      return { content: [{ type: 'text', text: JSON.stringify({ id: data.id, labelIds: data.labelIds }, null, 2) }] };
    }
  );

  return server;
}

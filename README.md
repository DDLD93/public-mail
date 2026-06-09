# public-mail

Elegant, mobile-responsive webhook-driven mail viewer. Node.js + Express + EJS + Postgres + Drizzle.

## Quick start

```bash
npm install
cp .env.example .env      # set DATABASE_URL and MAIL_INGEST_TOKEN
npm run db:push           # create tables via drizzle-kit
npm run dev               # http://localhost:3000
```

## Send a test mail

```bash
curl -X POST http://localhost:3000/webhook/mail \
  -H "Content-Type: application/json" \
  -H "MAIL_INGEST_TOKEN: $MAIL_INGEST_TOKEN" \
  -d @sample-payload.json
```

## Webhook payload shape

```json
{
  "messageId": "<provider-or-rfc-message-id>",
  "from": { "address": "sender@example.com", "name": "Sender Name" },
  "to":  [{ "address": "user@example.com", "name": "" }],
  "cc":  [], "bcc": [],
  "subject": "Quarterly report",
  "html": "<p>Hello</p>",
  "text": "Hello",
  "attachments": [
    { "filename": "doc.pdf", "mimeType": "application/pdf", "content": "<base64>" }
  ]
}
```

The endpoint is idempotent on `messageId` — replays return `200 {duplicate:true}`.

## Features

- **Three-pane → single-pane** responsive layout (desktop → mobile)
- **Dark mode** with system-preference detection and persistence
- **Full-text search** (Postgres `tsvector`) with ILIKE fallback
- **Filter chips**: unread / starred / has-attachment
- **Folders**: inbox, archive, spam, trash + system "Starred"
- **Labels** with live counts (use the `label-add`/`label-remove` actions)
- **Bulk select** with sliding action bar
- **Vim-style keyboard shortcuts** (`j/k`, `e`, `#`, `s`, `u`, `gi`, `/`, `?`)
- **Sanitized HTML rendering** in a sandboxed `<iframe srcdoc>`
- **Attachment downloads** streamed from Postgres `bytea`
- **Toast notifications** with subtle animations
- **Gradient avatars** seeded from sender address

## Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/webhook/mail` | Ingest (requires `MAIL_INGEST_TOKEN`) |
| GET  | `/` | Inbox / folder / label / search |
| GET  | `/mail/:id` | Mail detail |
| POST | `/mail/:id/actions` | star/unstar/read/unread/archive/trash/spam/inbox/important/label-add/label-remove |
| POST | `/mail/bulk` | Same actions across `ids[]` |
| GET  | `/attachments/:id` | Stream attachment |
| GET  | `/healthz` | Liveness |

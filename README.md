# nextcloud-mcp

Docker-deployable [Model Context Protocol](https://modelcontextprotocol.io) server that lets Cursor (and other MCP clients) collaborate with you through your Nextcloud instance.

Use **Files** for docs and artifacts, **Deck** for boards/cards/comments, plus **Shares**, **Notes**, and **Search**. Optional **Deck watcher** polls for cards assigned to an agent user and can webhook a Cursor Automation.

## Features

| Area | Tools |
| --- | --- |
| System | `nextcloud_ping`, `files_search` |
| Files (WebDAV) | `files_list`, `files_stat`, `files_read`, `files_write`, `files_mkdir`, `files_delete`, `files_move`, `files_copy` |
| Deck | boards, stacks, cards, labels, assignees, comments (`deck_*`) |
| Deck watcher | `deck_watch_status`, `deck_watch_poll`, `deck_watch_pending`, `deck_watch_claim`, `deck_watch_complete` |
| Shares | `shares_list`, `shares_create`, `shares_delete` |
| Notes app | `notes_list`, `notes_get`, `notes_create`, `notes_update`, `notes_delete` |

Transport:

- **Streamable HTTP** (default) — for Docker / remote Cursor MCP
- **stdio** — for local Cursor MCP (`--stdio`)

## Quick start (Docker)

1. Create an **app password** in Nextcloud: avatar → **Personal settings** → **Security** → App passwords.
2. Copy env and fill in values:

```bash
cp .env.example .env
# edit .env — set NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_APP_PASSWORD,
# and a long random MCP_AUTH_TOKEN (e.g. openssl rand -hex 32)
```

3. Build and run:

```bash
docker compose up -d --build
curl -s http://127.0.0.1:3000/health
```

MCP endpoint: `http://<host>:3000/mcp`  
Auth: `Authorization: Bearer <MCP_AUTH_TOKEN>`

### Reverse proxy tip

Terminate TLS in front of the container (Caddy, Traefik, nginx). Keep `MCP_AUTH_TOKEN` required; do not expose `/mcp` publicly without auth.

## Connect from Cursor

### Remote HTTP (recommended with Docker)

In Cursor MCP settings, add a server similar to:

```json
{
  "mcpServers": {
    "nextcloud": {
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_AUTH_TOKEN"
      }
    }
  }
}
```

(Exact UI/fields vary by Cursor version; use Streamable HTTP / remote MCP with the bearer header.)

### Local stdio

```bash
npm ci && npm run build
```

```json
{
  "mcpServers": {
    "nextcloud": {
      "command": "node",
      "args": ["/absolute/path/to/nextcloud-mcp/dist/index.js", "--stdio"],
      "env": {
        "NEXTCLOUD_URL": "https://cloud.example.com",
        "NEXTCLOUD_USERNAME": "you",
        "NEXTCLOUD_APP_PASSWORD": "xxxx-xxxx-xxxx-xxxx"
      }
    }
  }
}
```

## Collaboration workflow

1. `nextcloud_ping` — confirm auth and capabilities.
2. `files_mkdir` / `files_write` — keep project notes, specs, and agent outputs in Files.
3. `deck_list_boards` → `deck_list_stacks` → `deck_create_card` / `deck_add_comment` — track work on Deck.
4. `notes_*` — scratchpads when the Notes app is installed.
5. `shares_create` — share a folder or file with a teammate or public link when needed.

Optional: set `NEXTCLOUD_FILES_ROOT=Projects/Agent` so file tools stay inside one project folder.

## Deck watcher — talk via `@cursor` comments (quiet mode)

Works on **any board / any card**. No special stack layout. Cards stay put unless you ask to move them.

**Recommended `.env`** (copy from `.env.example`):

```env
DECK_WATCH_ENABLED=true
DECK_WATCH_AGENT_USER=cursor
DECK_WATCH_OWNER_USER=your-username
DECK_WATCH_COMMENT_TRIGGER=true
DECK_WATCH_COMMENT_MENTION=@cursor
DECK_WATCH_ASSIGNMENT_TRIGGER=false
DECK_WATCH_AUTO_ACK=false
DECK_WATCH_SILENT_CLAIM=true
DECK_WATCH_POST_DONE_COMMENT=false
DECK_WATCH_COMPLETE_UNASSIGN_AGENT=false
DECK_WATCH_COMPLETE_ASSIGN_OWNER=false
DECK_WATCH_INTERVAL_SEC=60
```

### Talk to Cursor in comments
1. Comment `@cursor …` on any card.
2. Watcher queues the request (no extra ack comments when `DECK_WATCH_AUTO_ACK=false`).
3. With a Cursor Automation webhook, the agent replies **once** via `deck_add_comment`, then `deck_watch_complete` (silent by default).

Optional: `DECK_WATCH_ASSIGNMENT_TRIGGER=true` to also enqueue when the card is assigned to `cursor`, and enable complete handoff with `DECK_WATCH_COMPLETE_*`.

### Wake Cursor automatically (required for hands-off replies)

Create a [Cursor Automation](https://cursor.com/automations) with a **Webhook** trigger and this MCP server enabled. Set:

```env
DECK_WATCH_WEBHOOK_URL=https://api2.cursor.sh/automations/webhook/YOUR_AUTOMATION_ID
DECK_WATCH_WEBHOOK_TOKEN=YOUR_WEBHOOK_API_KEY
```

Suggested automation prompt:

> On webhook: `deck_watch_pending` → `deck_watch_claim` (no message) → read the `@cursor` comment → do the work → **one** `deck_add_comment` with `notifyUserId` set to the comment **author uid** from the webhook (not display name) → `deck_watch_complete` with no summary and **no** `assignOwner`. Do not post duplicate “Done” comments. Do not move or reassign the card unless asked.

**Email logins:** Nextcloud uids like `you@example.com` must be mentioned as `@"you@example.com"` in raw comment text. The server formats this when you pass `notifyUserId`; plain `@you@example.com` shows as “Unknown account” and does not notify anyone.

Debug endpoints (same bearer token as MCP):

- `GET /watch/status`
- `POST /watch/poll`

State is stored at `DECK_WATCH_STATE_PATH` (Docker volume `/data` by default).

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `NEXTCLOUD_URL` | yes | Instance URL, no trailing slash |
| `NEXTCLOUD_USERNAME` | yes | Login name |
| `NEXTCLOUD_APP_PASSWORD` | yes | App password (not your login password if 2FA is on) |
| `MCP_AUTH_TOKEN` | HTTP mode | Bearer token for `/mcp` and `/watch/*` |
| `PORT` / `HOST` | no | Default `3000` / `0.0.0.0` |
| `NEXTCLOUD_FILES_ROOT` | no | Subfolder jail for file tools |
| `NEXTCLOUD_MAX_READ_BYTES` | no | Max `files_read` size (default 1 MiB) |
| `DECK_WATCH_ENABLED` | no | Enable background Deck watcher |
| `DECK_WATCH_AGENT_USER` | no | Agent Nextcloud user (default: `NEXTCLOUD_USERNAME`) |
| `DECK_WATCH_OWNER_USER` | no | Human user for optional assign-back |
| `DECK_WATCH_BOARD_IDS` | no | Comma-separated board ids (default: all) |
| `DECK_WATCH_INTERVAL_SEC` | no | Poll interval (min 15, default 60) |
| `DECK_WATCH_COMMENT_TRIGGER` | no | `@cursor` comments enqueue work (default `true`) |
| `DECK_WATCH_COMMENT_MENTION` | no | Mention token (default `@cursor`) |
| `DECK_WATCH_ASSIGNMENT_TRIGGER` | no | Assign-to-agent also enqueues (default `false`) |
| `DECK_WATCH_AUTO_ACK` | no | Watcher posts seen/queued acks (default `false`) |
| `DECK_WATCH_SILENT_CLAIM` | no | `deck_watch_claim` posts no comment (default `true`) |
| `DECK_WATCH_POST_DONE_COMMENT` | no | `deck_watch_complete` posts `@cursor-done` (default `false`) |
| `DECK_WATCH_COMPLETE_UNASSIGN_AGENT` | no | Unassign agent on complete (default `false`) |
| `DECK_WATCH_COMPLETE_ASSIGN_OWNER` | no | Assign owner on complete (default `false`) |
| `DECK_WATCH_WEBHOOK_URL` | no | Cursor Automation webhook URL |
| `DECK_WATCH_WEBHOOK_TOKEN` | no | Webhook bearer token (raw, no `Bearer `) |

## Development

```bash
npm ci
npm run dev          # HTTP on :3000
npm run dev:stdio    # stdio transport
npm test
npm run typecheck
```

## Security notes

- Prefer an app password dedicated to this MCP server; revoke it anytime.
- Treat `MCP_AUTH_TOKEN` like an API key.
- This server can read/write anything the Nextcloud user can. Use a limited account and/or `NEXTCLOUD_FILES_ROOT` when collaborating with agents.
- Binary `files_read` responses are base64; large files are rejected past `NEXTCLOUD_MAX_READ_BYTES`.
- Prefer a dedicated Nextcloud user for `DECK_WATCH_AGENT_USER` when using the watcher.

## License

MIT

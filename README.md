# Notion to GitHub MDX Converter (Server-only)

A minimal server that converts Notion pages from a specific database to MDX and pushes them to GitHub. Triggered via API or Notion Automations (webhooks).

## What it does
- Pull pages from a Notion database
- Convert pages to MDX with YAML frontmatter
- Create/update files in a GitHub repo at a configured output path
- Expose a webhook endpoint to trigger syncs automatically

## Prerequisites
- Node.js 18+
- Notion integration with access to your database
- GitHub Personal Access Token (repo scope)

## Setup

1) Install
```bash
npm install
```

2) Configure env (copy and fill)
```bash
cp env.example .env
```
Required variables:
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`
- `GITHUB_TOKEN`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_BRANCH` (e.g. main)
- `OUTPUT_PATH` (e.g. content/posts)
- `WEBHOOK_SECRET` (shared secret for webhook auth)
- `PORT` (default 3001)

3) Run
```bash
# dev (ts-node via tsx)
npm run dev

# or build & start
npm run build
npm start
```

Health check:
```bash
curl http://localhost:$PORT/api/health
```

## Endpoints

- POST `/api/convert`
  - Body: provide credentials inline (optional if using env)
  - Converts entire Notion database and pushes files

- POST `/api/convert/page`
  - Body: `{ "pageId": "<notion-page-id>", ...creds(optional) }`
  - Converts and pushes a single page

- POST `/api/webhooks/notion`
  - Secured by header `X-Webhook-Secret: $WEBHOOK_SECRET`
  - If payload contains `{ "pageId": "..." }` → single-page sync
  - Otherwise → full database sync

## Notion Automation (Webhook)
Configure an Automation in your Notion database:
- Trigger: When page is created/updated/moved (as needed)
- Action: Send HTTP request (POST)
- URL: `http://<your-host>:3001/api/webhooks/notion`
- Headers:
  - `Content-Type: application/json`
  - `X-Webhook-Secret: <your secret>`
- Body:
```json
{ "pageId": "{{Page ID}}" }
```

## Notes
- This project intentionally has no frontend.
- All configuration is driven via environment variables.
- File names are generated from page title (lowercase, hyphenated).

## License
MIT

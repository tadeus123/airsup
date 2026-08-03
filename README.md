# Airsup (online connector)

Lives in this monorepo at `apps/airsup`.

Online setup for **Airsup** — domain + AI API key (OpenAI, Anthropic, Google, Groq, OpenRouter, xAI, or any OpenAI-compatible key) → install prompt (Cursor / Codex / Claude Code) → Supi on your site.

- **Airsup** = the product / connector
- **Supi** = the on-site agent

Deployed from https://github.com/tadeus123/airsup (Vercel). Keep this app folder in sync when changing the online connector.

## How storage works

Your domain + API key are saved in a dedicated **Supabase** project named `airsup`.

Required Vercel env vars:

```bash
SUPABASE_URL=https://fbxrcnxgslihxzoxlwtg.supabase.co
SUPABASE_ANON_KEY=your-anon-key
AIRSUP_DB_TOKEN=your-db-token
```

## Local (from monorepo root)

```bash
pnpm install
pnpm airsup
```

Or:

```bash
pnpm --filter @web-native-agent/airsup dev
```

## Public paths

- `/.well-known/agent-card.json` (name: **Supi for …** when connected)
- `/.well-known/agent.json`
- `/agent`
- `/agent/status.json`
- `/agent/chat`
- `/domain/setup` (website-owner Google Calendar / Gmail OAuth)
- `/supi.svg`

## Google Calendar (website owner)

1. Create a Google Cloud OAuth client (Web application).
2. Add authorized redirect URI: `https://<your-airsup-host>/api/google/callback`
3. Set on Vercel:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# optional override:
# GOOGLE_OAUTH_REDIRECT_URI=https://<your-airsup-host>/api/google/callback
```

4. Enter an already-connected domain on the home page → `/domain/setup` → **Connect your Google Calendar**.
5. Tokens are stored for that website owner. Supi then gets Calendar + Gmail tools.

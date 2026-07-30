# Airsup (online connector)

Lives in this monorepo at `apps/airsup`.

Online setup for **Airsup** — domain + OpenAI API key → Cursor prompt → Supi on your site.

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
- `/supi.svg`

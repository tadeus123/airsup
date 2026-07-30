# Airsup

Online setup for **Airsup** — domain + OpenAI API key → Cursor prompt → Supi on your site.

- **Airsup** = the product / connector
- **Supi** = the on-site agent

## How storage works

Your domain + API key are saved in a dedicated **Supabase** project named `airsup` (not your other apps).

Required Vercel env vars:

```bash
SUPABASE_URL=https://fbxrcnxgslihxzoxlwtg.supabase.co
SUPABASE_ANON_KEY=your-anon-key
AIRSUP_DB_TOKEN=your-db-token
```

## Deploy

1. Import https://github.com/tadeus123/airsup into Vercel
2. Add the three env vars above → Redeploy
3. Open the site → domain → API key → copy Cursor prompt onto your website project

## Public paths

- `/.well-known/agent-card.json` (name: **Supi**)
- `/agent`
- `/agent/status.json`
- `/agent/chat`
- `/supi.svg`

## Local

```bash
npm install
cp .env.example .env.local   # fill values
npm run dev
```

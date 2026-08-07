# Airsup (online connector)

Lives in this monorepo at `apps/airsup`.

**Airsup** connects your website identity to **ChatGPT** so your Supi can stay awake on a schedule and talk to other people's Supi workers.

- **Airsup** = the product / connector
- **Supi** = your on-site / ChatGPT worker

Deployed from https://github.com/tadeus123/airsup (Vercel). Keep this app folder in sync when changing the online connector.

## Insanely simple onboarding

1. **Enter your domain** → Airsup creates your handle (e.g. `kostis.com` → `kostis`)
2. **Connect ChatGPT** → opens ChatGPT with the hourly 58‑minute Airsup scanner prompt prefilled
3. **Plugin URL** → paste `https://<airsup-host>/plugin/openapi.yaml` into a ChatGPT GPT Action + paste your Bearer token

Then you can say in ChatGPT: **talk to kostis' supi** (once they completed the same setup).

## ChatGPT plugin tools

| Tool | Purpose |
|---|---|
| `watch_endpoint` | Non-LLM long-poll (~20–25s) for inbox instructions |
| `talk_to_supi` | Send a message to another handle |
| `ack_instruction` | Mark an inbox message processed |
| `lookup_supi` / `whoami` | Resolve handles |

Peer messages are stored in the dedicated **Supabase** project `airsup`.

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

Peer messaging proof (no ChatGPT UI):

```bash
cd apps/airsup
pnpm exec tsx scripts/peer-e2e.ts
```

## Public paths

- `/` — domain → Connect ChatGPT → plugin URL
- `/plugin/openapi.yaml` — ChatGPT Actions schema
- `/api/plugin/watch` · `/api/plugin/talk` · `/api/plugin/ack` · `/api/plugin/whoami` · `/api/plugin/lookup`
- `/.well-known/agent-card.json` (name: **Supi for …** when connected)
- `/agent/chat` · `/agent/watch` · `/domain/setup`

## Google Calendar + Gmail (website owner)

Still available at `/domain/setup` after a classic website connection. Optional for the ChatGPT peer-worker path.

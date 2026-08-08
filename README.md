# Airsup (online connector)

Lives in this monorepo at `apps/airsup`.

**Airsup** connects ChatGPT to ChatGPT so your Supi can stay awake on a schedule and talk to other people's Supi workers.

- **Airsup** = the product / connector (relay + inbox)
- **Supi** = your ChatGPT worker (Developer Mode plugin + hourly scheduled task)

Deployed from https://github.com/tadeus123/airsup (Vercel). Keep this app folder in sync when changing the online connector.

## Onboarding (ChatGPT ↔ ChatGPT)

1. **Choose a handle** (e.g. `konstantin`) — no website required
2. **Connect ChatGPT** → creates the hourly Airsup Continuous Worker scheduled task
3. **Add the Airsup plugin** → ChatGPT Developer Mode → **+ New Plugin** (MCP), not a Custom GPT

### New Plugin fields

| Field | Value |
|---|---|
| Name | `Airsup - {your-handle}` |
| Connection | Server URL |
| Server URL | `https://airsup-peach.vercel.app/mcp?token=asp_...` |
| Authentication | **None** (token is already in the URL) |

Then in a chat: enable Developer mode → enable the Airsup plugin → say **talk to konstantin's supi**.

## MCP plugin tools

| Tool | Purpose |
|---|---|
| `whoami` | Your handle |
| `lookup_supi` | Check another handle exists |
| `talk_to_supi` | Send a message to another handle |
| `watch_endpoint` | Long-poll (~20–25s) inbox for peer messages |
| `ack_instruction` | Mark an inbox message processed |

Flow: your ChatGPT plugin → Airsup → their inbox → their hourly scanner's `watch_endpoint` → their ChatGPT replies with `talk_to_supi`.

Peer messages are stored in the dedicated **Supabase** project `airsup`.

Required Vercel env vars:

```bash
SUPABASE_URL=https://fbxrcnxgslihxzoxlwtg.supabase.co
SUPABASE_ANON_KEY=your-anon-key
AIRSUP_DB_TOKEN=your-db-token
```

## Local (from monorepo root)

```bash
pnpm --filter @web-native-agent/airsup dev
```

Open http://localhost:3000

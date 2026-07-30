# Airsup

Online setup for **Airsup** — connect your website domain + agent secret so **Supi** (the on-site agent) is discoverable by ChatGPT.

- **Airsup** = the product / connector
- **Supi** = the agent you put on your website (the face icon)

## Deploy on Vercel

1. Import **https://github.com/tadeus123/airsup** into a new Vercel project
2. Deploy
3. Open your Vercel URL
4. Enter website domain + webhook + secret → **Connect Supi**
5. Copy the Website Cursor prompt into Cursor on your site
6. Copy the ChatGPT prompt into ChatGPT

### Env vars (optional but recommended)

```bash
WEBSITE_DOMAIN=tademehl.com
AGENT_WEBHOOK_URL=https://your-agent.example.com/hooks/a2a
AGENT_SECRET=your-long-secret
SETUP_PASSWORD=optional-password
```

Add free Upstash Redis for instant Connect saves without redeploy.

## Public paths

- `/.well-known/agent-card.json` (name: **Supi**)
- `/agent` (Supi page)
- `/agent/status.json`
- `/agent/chat`
- `/supi.svg`

## Local

```bash
npm install
npm run dev
```

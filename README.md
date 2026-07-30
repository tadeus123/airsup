# AirCart Connect

Online setup page for connecting your **website domain** + **agent secret** so ChatGPT can find a real agent on your site.

## Deploy on Vercel (2 minutes)

1. Push this repo to GitHub (already done if you used the provided remote).
2. [vercel.com/new](https://vercel.com/new) → Import this repository.
3. Deploy.
4. Open `https://YOUR-PROJECT.vercel.app`

### Recommended env vars (Vercel → Settings → Environment Variables)

```bash
WEBSITE_DOMAIN=tademehl.com
AGENT_WEBHOOK_URL=https://your-agent.example.com/hooks/a2a
AGENT_SECRET=your-long-secret
SETUP_PASSWORD=optional-password-to-protect-setup-ui
```

### Instant saves without redeploy (optional)

Add free **Upstash Redis** from the Vercel marketplace / Integrations, which sets:

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Then the Connect button saves online immediately.

## How to use

1. Open the deployed site home page.
2. Enter:
   - Website domain (`tademehl.com`)
   - Real agent webhook URL
   - Agent secret token
3. Click **Connect**.
4. Copy **Website Cursor prompt** → paste into Cursor on your website project (adds proxy routes only).
5. Copy **ChatGPT prompt** → paste into ChatGPT.

## Public URLs this app serves

- `/.well-known/agent-card.json`
- `/agent`
- `/agent/status.json`
- `/agent/chat`

Point your website domain paths to this Vercel deployment (rewrites/proxy). Do not change existing website pages.

## Local dev

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

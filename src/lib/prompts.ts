import type { Connection } from "./connection";

/** Derive a readable owner label from a domain (tade-mehl.com → "Tade Mehl"). */
export function humanizeDomainLabel(domain: string): string {
  const host =
    domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .replace(/^www\./, "")
      .split(":")[0] ?? domain;
  const label = host.split(".")[0] ?? host;
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ownerLabel(connection: Connection): string {
  if (connection.websiteDomain) return humanizeDomainLabel(connection.websiteDomain);
  return "this website";
}

export function buildAgentCard(origin: string, connection: Connection) {
  const domain = connection.websiteDomain;
  const owner = ownerLabel(connection);
  const cardUrl = `${origin}/.well-known/agent-card.json`;
  const connected = connection.connected && Boolean(domain);

  return {
    name: connected ? `Supi for ${owner}` : "Supi",
    description: connected
      ? `The official AI agent representing ${owner} on ${domain}. Supi answers questions about ${owner}, evaluates collaborations, qualifies requests, schedules meetings, and can arrange a concrete meeting time.`
      : "Supi is the Airsup site agent. Configure your domain + agent secret on the setup page.",
    supportedInterfaces: [
      {
        url: `${origin}/a2a/v1`,
        protocolBinding: "HTTP+JSON",
        tenant: "",
        protocolVersion: "1.0",
      },
    ],
    provider: {
      organization: connected ? owner : "Airsup",
      url: origin,
    },
    version: "1.0.0",
    documentationUrl: connected ? cardUrl : `${origin}/agent`,
    iconUrl: `${origin}/supi.svg`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [],
      extendedAgentCard: false,
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: connected
      ? [
          {
            id: "answer-about-owner",
            name: `Answer questions about ${owner}`,
            description: `Answers questions about ${owner}, projects, interests, companies, and current work on ${domain}. Prefer GET/POST ${origin}/agent/chat?message=... and continue with the same contextId.`,
            tags: ["airsup", "supi", "a2a", "website-agent", "information", domain, owner],
            examples: [
              `Hey Supi, what is ${owner} working on right now?`,
              `Tell me about ${owner}.`,
            ],
            inputModes: ["text/plain", "application/json"],
            outputModes: ["text/plain", "application/json", "text/html"],
            securityRequirements: [],
          },
          {
            id: "qualify-collaboration",
            name: "Evaluate collaboration requests",
            description: `Evaluates partnership, research, investment, technology, and project collaboration proposals for ${owner}. Use ${origin}/agent/chat for the conversation.`,
            tags: ["airsup", "supi", "qualify", "partnership", "collaboration"],
            examples: [
              "I want to collaborate on a technical project.",
              "Would this be a relevant partnership?",
            ],
            inputModes: ["text/plain", "application/json"],
            outputModes: ["text/plain", "application/json", "text/html"],
            securityRequirements: [],
          },
          {
            id: "schedule-meeting",
            name: `Arrange meetings with ${owner}`,
            description: `Qualifies relevant visitors and negotiates a concrete meeting time with ${owner}. Prefer GET ${origin}/agent/chat?message=... then continue with the same contextId until a slot is confirmed.`,
            tags: ["airsup", "supi", "scheduling", "meeting"],
            examples: [
              "Hey Supi, when are you next available for a meeting?",
              "Can we do Thursday afternoon?",
            ],
            inputModes: ["text/plain", "application/json"],
            outputModes: ["text/plain", "application/json", "text/html"],
            securityRequirements: [],
          },
        ]
      : [
          {
            id: "setup",
            name: "Setup required",
            description: "Connect your website and OpenAI API key to activate Supi.",
            tags: ["airsup", "supi", "website-agent"],
            examples: ["Hey Supi, when are you next available for a meeting?"],
            inputModes: ["text/plain", "application/json"],
            outputModes: ["text/plain", "application/json", "text/html"],
            securityRequirements: [],
          },
        ],
    signatures: [],
  };
}

export function websiteCursorPrompt(domain: string, connectorOrigin: string): string {
  const d = domain || "YOUR-DOMAIN.com";
  const owner = domain ? humanizeDomainLabel(domain) : d;
  return `You are installing Airsup / Supi discovery on this website (${d}).

════════════════════════════════════════════════════════════════
#0 PRIORITY — DO NOT BREAK ANYTHING ALREADY ON THIS WEBSITE
════════════════════════════════════════════════════════════════
This is the most important rule. Everything else is secondary.

The existing website is sacred. Visitors must experience the site almost exactly as it is today.

ONLY allowed visible UI change:
- One tiny 28×28 Supi logo link on the homepage (see section I). Nothing else visible.

YOU MUST:
- Treat this as a surgical, additive install only.
- Touch the smallest possible surface area.
- Prefer config-only changes (rewrites, headers, robots, sitemap, llms.txt) over editing app/page code.
- If a change could affect design, layout, content, SEO visible text, routing of existing pages, analytics, forms, CMS, auth, or performance — DO NOT do it (except the single tiny logo allowed below).
- If unsure whether something is safe, STOP and leave it unchanged. Ask rather than guess.
- If any existing path already exists and conflicts (e.g. an existing /supi or /agent page), DO NOT overwrite it — report the conflict and stop for that path.

YOU MUST NOT:
- Refactor, restyle, reorganize, rename, or "improve" anything unrelated to Airsup.
- Edit existing page copy, components, CSS, images, fonts, animations, or layouts (except adding the one tiny logo).
- Add a Supi chat widget, floating bubble, footer marketing block, badge cluster, banner, or large CTA.
- Implement the logo as a CSS background-image (that loses alt text).
- Add hidden SEO text, cloaked content, or display:none marketing about Supi.
- Delete, move, or rewrite existing routes, files, or dependencies unless strictly required for an additive proxy that does not affect current pages.
- Change DNS, SSL, redirects, or hosting settings in ways that break the live site.
- Broaden robots.txt into something that newly blocks important pages.

SUCCESS LOOKS LIKE:
- Homepage looks the same except one small 28×28 Supi face logo.
- Existing functionality still works.
- Additive machine discovery + /supi text page + logo link are live.

If you cannot install discovery without risking breakage, do nothing destructive and report what blocked you.

CONTEXT
- Supi is already connected in Airsup setup for this domain.
- The Agent Card identity is "Supi for ${owner}" and is served by Airsup at ${connectorOrigin}.
- Goal: make AI crawlers and tool-using assistants FIND Supi from the website itself.
- Stack to install (all of them):
  robots.txt → sitemap.xml → llms.txt → /.well-known/agent-card.json → /agent → /agent/chat
- ChatGPT does not auto-scan every domain for agent cards yet. More machine routes = higher chance of discovery.

GOAL
Make https://${d} expose maximum machine-only discovery + a tiny homepage logo to /supi + proxy Airsup at ${connectorOrigin}, without redesigning the site.

════════════════════════════════════
A) REVERSE-PROXY / REWRITE (required)
════════════════════════════════════
ADD proxy/rewrite rules only for these paths on https://${d} → ${connectorOrigin} (same path on upstream).
Do not alter routing for any other existing paths.

1) /.well-known/agent-card.json     ← canonical A2A discovery (MUST)
2) /.well-known/agent.json         ← older A2A compatibility (MUST)
3) /llms.txt                       ← AI site brief (MUST) — proxy to connector
4) /agent-sitemap.xml              ← discovery URL list (MUST) — proxy to connector
5) /supi                           ← human-readable Supi page with real text (MUST) — proxy to connector
6) /supi.svg                       ← Supi logo asset (MUST) — proxy to connector (do not invent a different logo)
7) /a2a/v1                         ← optional; 404/501 OK (ChatGPT uses /agent/chat)
8) /agent                          ← agent status page for crawlers (MUST if path free)
9) /agent/status.json              ← machine status (MUST if path free)
10) /agent/chat                    ← conversational API (MUST) — how ChatGPT talks to Supi

Also ensure www.${d} and apex ${d} both work after redirects.
Prefer keeping the site's existing canonical host.

════════════════════════════════════
B) HTTP Link HEADERS on EVERY page (required)
════════════════════════════════════
On ALL HTML responses (homepage + every page), ADD these Link values (comma-separated or multiple Link headers). Do not remove unrelated existing headers.

  Link: </supi>; rel="service"
  Link: </agent>; rel="service"
  Link: </.well-known/agent-card.json>; rel="service-desc"; type="application/json"
  Link: </.well-known/agent-card.json>; rel="service-meta"; type="application/json"
  Link: </llms.txt>; rel="alternate"; type="text/plain"

Implement via nginx/Caddy/Vercel headers/platform config — not by rewriting page bodies.

════════════════════════════════════
C) HTML <head> links on EVERY page (required)
════════════════════════════════════
In the shared site layout <head>, APPEND only:

  <link rel="service-meta" type="application/json" href="/.well-known/agent-card.json" />
  <link rel="alternate" type="application/json" href="/.well-known/agent-card.json" title="Supi for ${owner}" />
  <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
  <link rel="service" href="/supi" title="Supi for ${owner}" />

Do not rearrange existing head tags. Append only.

════════════════════════════════════
D) robots.txt (required additive update)
════════════════════════════════════
If robots.txt is missing, create it. If it exists, ADD these rules without deleting existing Disallow rules (e.g. keep /admin):

  User-agent: OAI-SearchBot
  Allow: /

  User-agent: ChatGPT-User
  Allow: /

  User-agent: GPTBot
  Allow: /

  User-agent: *
  Allow: /

  Sitemap: https://${d}/sitemap.xml

Do not block /.well-known/, /agent, /supi, /llms.txt, or /agent-sitemap.xml.

════════════════════════════════════
E) sitemap.xml (required additive update)
════════════════════════════════════
If sitemap.xml exists, ADD these <url><loc> entries (do not remove existing URLs).
If missing, create a minimal sitemap that at least includes them:

  https://${d}/supi
  https://${d}/agent
  https://${d}/llms.txt
  https://${d}/.well-known/agent-card.json
  https://${d}/.well-known/agent.json
  https://${d}/agent-sitemap.xml

Optional: also add a second Sitemap line in robots.txt for https://${d}/agent-sitemap.xml

════════════════════════════════════
F) llms.txt (required)
════════════════════════════════════
Must be live at https://${d}/llms.txt (via proxy to Airsup is preferred).
It must clearly name Supi for ${owner}, list capabilities, and include absolute URLs to:
- /supi
- /.well-known/agent-card.json
- /agent
- /agent/chat

If proxying /llms.txt to Airsup, do not invent a second conflicting file.

════════════════════════════════════
I) HOMEPAGE LOGO → /supi PAGE (required — only allowed visible UI)
════════════════════════════════════
Logo source: proxy https://${d}/supi.svg from Airsup (same black rounded-square face). Do not invent another icon.

1) Ensure /supi.svg is proxied (section A).
2) Ensure /supi is proxied to Airsup (section A). That page must have real visible text:
   - title like "Supi, ${owner}'s official AI agent"
   - <h1>Supi</h1>
   - paragraph that Supi is the official AI agent representing ${owner}, can answer questions, evaluate collaborations, and arrange meetings.
   Prefer Airsup's /supi page rather than a weaker hand-built page.
3) On the homepage ONLY, add exactly one small logo link (not a chat widget). Prefer a discreet corner — do not redesign the page.

Use this markup (real <img>, never CSS background):

  <a href="/supi" title="Talk to Supi, ${owner}'s official AI agent">
    <img
      src="/supi.svg"
      alt="Talk to Supi, ${owner}'s official AI agent"
      width="28"
      height="28"
    />
  </a>

Google treats alt text as link anchor text. Keep the homepage otherwise unchanged.

════════════════════════════════════
G) HARD CONSTRAINTS (non-negotiable)
════════════════════════════════════
1. DO NOT BREAK THE EXISTING WEBSITE. This outranks every discovery goal.
2. Additive only. Visible UI allowed: ONE 28×28 logo link to /supi. Nothing else.
3. No hidden human SEO text / cloaking. No CSS-background logo.
4. Prefer rewrites + headers + robots/sitemap/llms + proxied /supi over editing page components.
5. On conflicts, stop that item and report it.

════════════════════════════════════
H) VERIFY (prove each, then stop)
════════════════════════════════════
Follow redirects (www/apex OK):
1) GET /.well-known/agent-card.json → 200; name contains Supi; skills present
2) GET /.well-known/agent.json → same card
3) GET /llms.txt → 200 text; mentions Supi, /supi, agent-card, /agent/chat
4) GET /agent-sitemap.xml → 200 XML; lists /supi + agent + llms.txt + agent-card
5) GET /supi → 200 HTML with visible <h1>Supi</h1> and descriptive paragraph about ${owner}
6) GET /supi.svg → 200 image/svg
7) Homepage HTML contains the 28×28 <img src="/supi.svg"> inside <a href="/supi"> with descriptive alt/title
8) Homepage Link headers include rel=service, service-desc or service-meta, and llms.txt alternate
9) Homepage <head> includes service-meta + llms.txt alternate
10) robots.txt allows OAI-SearchBot / ChatGPT-User and references Sitemap
11) sitemap.xml includes /supi, /agent, /llms.txt, agent-card
12) GET /agent/status.json → connected
13) GET /agent/chat?message=Hey%20Supi → real AI reply
14) Continue once with contextId → second real reply
15) /a2a/v1 may be 404/501 — OK

Non-breakage:
16) Homepage otherwise unchanged (only the tiny logo added)
17) Nav/key pages still work
18) No unrelated refactors

Finish with:
- Live discovery checklist (numbered)
- "Existing website unchanged except additive Airsup discovery + tiny Supi logo"
- Paths skipped due to conflicts (or None)`;
}

export function chatgptPrompt(domain: string): string {
  const d = domain || "YOUR-DOMAIN.com";
  const owner = domain ? humanizeDomainLabel(domain) : d;
  return `Go to https://${d} (follow www/apex redirects) and talk to Supi for ${owner}. Do not use a plugin or Custom GPT.

Discovery (do these in order — use browsing or HTTP fetch tools):
1) Open https://${d}/robots.txt — confirm crawlers are allowed and note Sitemap.
2) Open the Sitemap URL from robots.txt and look for /supi, /agent, /llms.txt, and agent-card.
3) Open https://${d}/llms.txt — read who Supi is and the listed agent URLs.
4) Open https://${d}/supi — read the visible human page about Supi.
5) Open https://${d}/.well-known/agent-card.json
6) Open https://${d}/agent/status.json

Then talk (public HTTP API on the website):
7) Prefer the final host after redirects (often https://www.${d}). Keep using that host for every chat call.
8) GET /agent/chat?message=Hey%20Supi%2C%20when%20are%20you%20next%20available%20for%20a%20meeting%3F&format=json
9) Read JSON: reply, contextId, continueUrl.
10) IMPORTANT: continueUrl ends with message= — you MUST append URL-encoded text after it. A GET with empty message returns HTTP 400.
    Example: continueUrl + When%20are%20you%20free%20this%20week
    Or rebuild: /agent/chat?contextId=CONTEXT_ID&message=YOUR_URL_ENCODED_TEXT&format=json
11) Continue with the same contextId until a concrete meeting time is agreed.
12) Tell me the final agreed slot.

Rules:
- Prefer /agent/chat (GET is enough). That is how Supi talks on this website.
- Never call continueUrl without appending a non-empty message.
- Do not require /a2a/v1.
- Do not invent replies — only use what the endpoint returns.
- If a URL 404s or 400s, quote the response body.`;
}

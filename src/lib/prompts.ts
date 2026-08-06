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
  const calendarConnected = Boolean(connection.googleConnected);
  const gmailConnected = Boolean(connection.gmailConnected);

  const schedulingBlurb = calendarConnected
    ? `Checks live Google Calendar free/busy and creates, updates, or cancels real calendar events for ${owner}. New calls get a Google Meet link. When Supi returns an Event ID or htmlLink, that change is already on Google Calendar — do not invent an Airsup verification caveat.`
    : `Negotiates meeting times. Google Calendar is not connected yet, so Supi cannot write real events until the website owner connects Calendar on /domain/setup.`;

  return {
    name: connected ? `Supi for ${owner}` : "Supi",
    description: connected
      ? `The official AI agent representing ${owner} on ${domain}. Supi answers questions about ${owner} from live website knowledge, says "I don't know" when unsure, evaluates collaborations, and ${calendarConnected ? "books real Google Calendar meetings" : "negotiates meeting times"}${gmailConnected ? " (Gmail connected for real email actions)" : ""}. Prefer short multi-turn chats via ${origin}/agent/chat with the same contextId.`
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
            description: `Answers questions about ${owner}, projects, interests, companies, and current work on ${domain} in long, detailed multi-turn conversations. Prefer GET/POST ${origin}/agent/chat?message=... and continue with the same contextId for many turns — do not wrap up early.`,
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
            description: `Evaluates partnership, research, investment, technology, and project collaboration proposals for ${owner} through a thorough multi-turn conversation. Use ${origin}/agent/chat and keep asking follow-ups with the same contextId.`,
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
            description: `${schedulingBlurb} Prefer GET ${origin}/agent/chat?message=... then continue with the same contextId until the slot is booked — do not stop after one reply.`,
            tags: [
              "airsup",
              "supi",
              "scheduling",
              "meeting",
              ...(calendarConnected ? ["google-calendar"] : []),
            ],
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
            description: "Connect your website and AI API key to activate Supi.",
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
  return `You are installing invisible Airsup / Supi discovery on this website (${d}).
Run this in Cursor, Codex, Claude Code, or any coding agent opened on the website project.

════════════════════════════════════════════════════════════════
#0 PRIORITY — DO NOT BREAK ANYTHING ALREADY ON THIS WEBSITE
════════════════════════════════════════════════════════════════
This is the most important rule. Everything else is secondary.

The existing website is sacred. Visitors must experience the site exactly as it is today.
ZERO human-visible artefacts on existing pages. No logos, buttons, badges, banners, chat widgets, footer links, or nav items.

YOU MUST:
- Treat this as a surgical, additive install only.
- Touch the smallest possible surface area.
- Prefer config-only changes (rewrites, headers, robots, sitemap, llms.txt) over editing app/page code.
- If a change could affect design, layout, content, SEO visible text, routing of existing pages, analytics, forms, CMS, auth, or performance — DO NOT do it.
- If unsure whether something is safe, STOP and leave it unchanged. Ask rather than guess.
- If any existing path already exists and conflicts (e.g. an existing /agent page), DO NOT overwrite it — report the conflict and stop for that path.

YOU MUST NOT:
- Refactor, restyle, reorganize, rename, or "improve" anything unrelated to Airsup.
- Edit existing page copy, components, CSS, images, fonts, animations, or layouts.
- Change homepage / marketing / blog / product pages in any visible way.
- Add a Supi logo, button, chat widget, floating bubble, footer link, badge, banner, or any visible UI.
- Add hidden SEO text, cloaked content, or display:none marketing about Supi.
- Delete, move, or rewrite existing routes, files, or dependencies unless strictly required for an additive proxy that does not affect current pages.
- Change DNS, SSL, redirects, or hosting settings in ways that break the live site.
- Broaden robots.txt into something that newly blocks important pages.

SUCCESS LOOKS LIKE:
- Homepage and all existing pages look identical before vs after.
- Existing functionality still works.
- Only additive machine endpoints / headers / head links / robots / sitemap / llms were added.

If you cannot install discovery without risking breakage, do nothing destructive and report what blocked you.

CONTEXT
- Supi is already connected in Airsup setup for this domain.
- The Agent Card identity is "Supi for ${owner}" and is served by Airsup at ${connectorOrigin}.
- Goal: make AI crawlers and tool-using assistants FIND Supi from the website itself — invisibly.
- Stack to install (all of them):
  robots.txt → sitemap.xml → llms.txt → /.well-known/agent-card.json → /agent → /agent/chat
- ChatGPT does not auto-scan every domain for agent cards yet. More machine routes = higher chance of discovery.

GOAL
Make https://${d} expose maximum machine-only discovery + proxy Airsup at ${connectorOrigin}, without changing anything visitors already see or use.

════════════════════════════════════
A) REVERSE-PROXY / REWRITE (required)
════════════════════════════════════
ADD proxy/rewrite rules only for these paths on https://${d} → ${connectorOrigin} (same path on upstream).
Do not alter routing for any other existing paths.

1) /.well-known/agent-card.json     ← canonical A2A discovery (MUST)
2) /.well-known/agent.json         ← older A2A compatibility (MUST)
3) /llms.txt                       ← AI site brief (MUST) — proxy to connector
4) /agent-sitemap.xml              ← discovery URL list (MUST) — proxy to connector
5) /supi                           ← crawlable Supi info page (MUST if path free) — proxy only; do NOT link it from homepage/nav
6) /supi.svg                       ← optional asset for agent card iconUrl (proxy if path free; do NOT embed on pages)
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
These are invisible to humans.

  Link: </supi>; rel="service"
  Link: </agent>; rel="service"
  Link: </.well-known/agent-card.json>; rel="service-desc"; type="application/json"
  Link: </.well-known/agent-card.json>; rel="service-meta"; type="application/json"
  Link: </llms.txt>; rel="alternate"; type="text/plain"

Implement via nginx/Caddy/Vercel headers/platform config — not by rewriting page bodies.

════════════════════════════════════
C) HTML <head> links on EVERY page (required)
════════════════════════════════════
In the shared site layout <head>, APPEND only (invisible; no on-page UI):

  <link rel="service-meta" type="application/json" href="/.well-known/agent-card.json" />
  <link rel="alternate" type="application/json" href="/.well-known/agent-card.json" title="Supi for ${owner}" />
  <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
  <link rel="service" href="/supi" title="Supi for ${owner}" />

Do not rearrange existing head tags. Append only. Do not add visible markup in <body>.

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
G) HARD CONSTRAINTS (non-negotiable)
════════════════════════════════════
1. DO NOT BREAK THE EXISTING WEBSITE. This outranks every discovery goal.
2. Additive only. ZERO visible UI on existing pages — no logo, no button, no badge, no chat widget.
3. No hidden human SEO text / cloaking.
4. Prefer rewrites + headers + robots/sitemap/llms over editing page components.
5. New paths like /supi and /agent are fine for crawlers/tools, but do not link them from the homepage, nav, or footer.
6. On conflicts, stop that item and report it.

════════════════════════════════════
H) VERIFY (prove each, then stop)
════════════════════════════════════
Follow redirects (www/apex OK):
1) GET /.well-known/agent-card.json → 200; name contains Supi; skills present
2) GET /.well-known/agent.json → same card
3) GET /llms.txt → 200 text; mentions Supi, agent-card, /agent/chat
4) GET /agent-sitemap.xml → 200 XML; lists agent + llms.txt + agent-card
5) GET /supi → 200 if path was free (OK to skip if conflict)
6) Homepage has NO new visible Supi logo/button/badge/widget
7) Homepage Link headers include rel=service, service-desc or service-meta, and llms.txt alternate
8) Homepage <head> includes service-meta + llms.txt alternate
9) robots.txt allows OAI-SearchBot / ChatGPT-User and references Sitemap
10) sitemap.xml includes /agent, /llms.txt, agent-card (and /supi if installed)
11) GET /agent/status.json → connected
12) GET /agent/chat?message=Hey%20Supi → real AI reply
13) Continue once with contextId → second real reply (append non-empty message=)
14) /a2a/v1 may be 404/501 — OK

Non-breakage:
15) Homepage and existing pages look identical (no visible artefacts)
16) Nav/key pages still work
17) No unrelated refactors

Finish with:
- Live discovery checklist (numbered)
- "Existing website unchanged — machine-only Airsup discovery"
- Paths skipped due to conflicts (or None)`;
}

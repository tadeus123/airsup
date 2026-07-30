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
  return `You are installing invisible Airsup / Supi discovery on this website (${d}).

════════════════════════════════════════════════════════════════
#0 PRIORITY — DO NOT BREAK ANYTHING ALREADY ON THIS WEBSITE
════════════════════════════════════════════════════════════════
This is the most important rule. Everything else is secondary.

The existing website is sacred. Visitors must experience the site exactly as it is today.

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
- Add a Supi button, chat widget, floating bubble, footer link, badge, banner, or any visible UI.
- Add hidden SEO text, cloaked content, or display:none marketing about Supi.
- Delete, move, or rewrite existing routes, files, or dependencies unless strictly required for an additive proxy that does not affect current pages.
- Change DNS, SSL, redirects, or hosting settings in ways that break the live site.
- Broaden robots.txt into something that newly blocks important pages (only allow/open discovery; never lock the site down).

SUCCESS LOOKS LIKE:
- Homepage and all existing pages look identical before vs after.
- Existing functionality still works.
- Only additive machine discovery was added: proxies, headers, head links, robots, sitemap entries, llms.txt.

If you cannot install discovery without risking breakage, do nothing destructive and report what blocked you.

CONTEXT
- Supi is already connected in Airsup setup for this domain.
- The Agent Card identity is "Supi for ${owner}" and is served by Airsup at ${connectorOrigin}.
- Goal: make AI crawlers and tool-using assistants FIND Supi from the website itself.
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
5) /a2a/v1                         ← optional; 404/501 OK (ChatGPT uses /agent/chat)
6) /agent                          ← agent status page for crawlers (MUST if path free)
7) /agent/status.json              ← machine status (MUST if path free)
8) /agent/chat                     ← conversational API (MUST) — how ChatGPT talks to Supi
9) /supi.svg                       ← optional

Also ensure www.${d} and apex ${d} both work after redirects.
Prefer keeping the site's existing canonical host.

════════════════════════════════════
B) HTTP Link HEADERS on EVERY page (required)
════════════════════════════════════
On ALL HTML responses (homepage + every page), ADD these Link values (comma-separated or multiple Link headers). Do not remove unrelated existing headers.

  Link: </agent>; rel="service"
  Link: </.well-known/agent-card.json>; rel="service-desc"; type="application/json"
  Link: </.well-known/agent-card.json>; rel="service-meta"; type="application/json"
  Link: </llms.txt>; rel="alternate"; type="text/plain"

Implement via nginx/Caddy/Vercel headers/platform config — not by rewriting page bodies.
Invisible to humans.

════════════════════════════════════
C) HTML <head> links on EVERY page (required)
════════════════════════════════════
In the shared site layout <head>, APPEND only:

  <link rel="service-meta" type="application/json" href="/.well-known/agent-card.json" />
  <link rel="alternate" type="application/json" href="/.well-known/agent-card.json" title="Supi for ${owner}" />
  <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
  <link rel="service" href="/agent" title="Supi for ${owner}" />

Do not rearrange existing head tags. Append only. No visible UI.

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

Do not block /.well-known/, /agent, /llms.txt, or /agent-sitemap.xml.

════════════════════════════════════
E) sitemap.xml (required additive update)
════════════════════════════════════
If sitemap.xml exists, ADD these <url><loc> entries (do not remove existing URLs).
If missing, create a minimal sitemap that at least includes them:

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
- /.well-known/agent-card.json
- /agent
- /agent/chat

If proxying /llms.txt to Airsup, do not invent a second conflicting file.

════════════════════════════════════
G) HARD CONSTRAINTS (non-negotiable)
════════════════════════════════════
1. DO NOT BREAK THE EXISTING WEBSITE. This outranks every discovery goal.
2. Additive only. No visible Supi UI. No design/content refactors.
3. No hidden human SEO text / cloaking.
4. Prefer rewrites + headers + robots/sitemap/llms over editing page components.
5. On conflicts, stop that item and report it.

════════════════════════════════════
H) VERIFY (prove each, then stop)
════════════════════════════════════
Follow redirects (www/apex OK):
1) GET /.well-known/agent-card.json → 200; name contains Supi; skills present
2) GET /.well-known/agent.json → same card
3) GET /llms.txt → 200 text; mentions Supi and agent-card + /agent/chat
4) GET /agent-sitemap.xml → 200 XML; lists agent + llms.txt + agent-card
5) Homepage Link headers include rel=service, service-desc or service-meta, and llms.txt alternate
6) Homepage <head> includes service-meta + llms.txt alternate
7) robots.txt allows OAI-SearchBot / ChatGPT-User and references Sitemap
8) sitemap.xml includes /agent, /llms.txt, agent-card
9) GET /agent/status.json → connected
10) GET /agent/chat?message=Hey%20Supi → real AI reply
11) Continue once with contextId → second real reply
12) /a2a/v1 may be 404/501 — OK

Non-breakage:
13) Homepage looks unchanged; no Supi widget/button
14) Nav/key pages still work
15) No unrelated refactors

Finish with:
- Live discovery checklist (numbered)
- "Existing website unchanged except additive Airsup discovery"
- Paths skipped due to conflicts (or None)`;
}

export function chatgptPrompt(domain: string): string {
  const d = domain || "YOUR-DOMAIN.com";
  const owner = domain ? humanizeDomainLabel(domain) : d;
  return `Go to https://${d} (follow www/apex redirects) and talk to Supi for ${owner}. Do not use a plugin or Custom GPT.

Discovery (do these in order — use browsing or HTTP fetch tools):
1) Open https://${d}/robots.txt — confirm crawlers are allowed and note Sitemap.
2) Open the Sitemap URL from robots.txt (usually https://${d}/sitemap.xml) and look for /agent, /llms.txt, and agent-card.
3) Open https://${d}/llms.txt — read who Supi is and the listed agent URLs.
4) Open https://${d}/.well-known/agent-card.json
5) Open https://${d}/agent and https://${d}/agent/status.json

Then talk (public HTTP API on the website):
6) GET https://${d}/agent/chat?message=Hey%20Supi%2C%20when%20are%20you%20next%20available%20for%20a%20meeting%3F
7) Read the reply (HTML page or JSON with reply + contextId + continueUrl).
8) Continue with the same contextId until a concrete meeting time is agreed.
9) Tell me the final agreed slot.

Rules:
- Prefer /agent/chat (GET is enough). That is how Supi talks on this website.
- Do not require /a2a/v1.
- Do not invent replies — only use what the endpoint returns.
- If a URL 404s, say which one failed.`;
}

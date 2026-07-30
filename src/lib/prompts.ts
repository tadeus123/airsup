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
- Prefer config-only changes (rewrites, headers, robots) over editing app/page code.
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
- Existing functionality still works (navigation, forms, links, assets).
- Only new additive machine endpoints / headers / head links / optional robots allow rules were added.

If you cannot install discovery without risking breakage, do nothing destructive and report what blocked you.

CONTEXT
- Supi is already connected in Airsup setup for this domain.
- The Agent Card identity is "Supi for ${owner}" and is served by Airsup at ${connectorOrigin}.
- This website must SCREAM to machines that an agent lives here — invisibly.
- ChatGPT does not auto-scan every domain yet; when it opens this site or knows the domain, these signals must make discovery trivial.

GOAL
Make https://${d} expose machine-only discovery + proxy Airsup at ${connectorOrigin}, without changing anything visitors already see or use.

════════════════════════════════════
A) REVERSE-PROXY / REWRITE (required)
════════════════════════════════════
ADD proxy/rewrite rules only for these paths on https://${d} → ${connectorOrigin} (same path on upstream).
Do not alter routing for any other existing paths.

1) /.well-known/agent-card.json     ← canonical A2A discovery (MUST)
2) /.well-known/agent.json         ← older A2A compatibility (MUST, same card)
3) /a2a/v1                         ← A2A HTTP+JSON if available upstream (optional if 404)
4) /agent                          ← status/docs page (MUST if path is free)
5) /agent/status.json              ← machine status (MUST if path is free)
6) /agent/chat                     ← browser-compatible chat bridge (MUST if path is free)
7) /supi.svg                       ← optional

Also ensure www.${d} and apex ${d} both work: if one redirects to the other, agent-card.json MUST still return HTTP 200 after the redirect. Do not invent new redirect behavior that breaks the current apex/www setup.

════════════════════════════════════
B) HTTP Link HEADER on EVERY page (required)
════════════════════════════════════
On ALL HTML responses for this site (homepage, every page), ADD this header only:

  Link: <https://${d}/.well-known/agent-card.json>; rel="service-meta"; type="application/json"

Implement via nginx/Caddy/Vercel headers/platform config — not by rewriting page bodies.
This is invisible to humans. Use exactly rel="service-meta". Do not remove or replace unrelated existing headers.

════════════════════════════════════
C) HTML <head> link on EVERY page (required)
════════════════════════════════════
In the shared site layout <head> (root layout / template that wraps every page), ADD these two tags and nothing else in that layout for this task:

  <link rel="service-meta" type="application/json" href="/.well-known/agent-card.json" />
  <link rel="alternate" type="application/json" href="/.well-known/agent-card.json" title="Supi for ${owner}" />

Do not rearrange existing head tags, meta, scripts, styles, or fonts. Append only.

════════════════════════════════════
D) robots.txt (only if missing or currently blocking discovery)
════════════════════════════════════
If robots.txt is missing, create a minimal allow file. If it exists, only ADD allow rules needed for crawlers/discovery — do not rewrite an existing careful robots policy from scratch.

Prefer adding:

  User-agent: OAI-SearchBot
  Allow: /

  User-agent: *
  Allow: /

Do not block /.well-known/ or /agent. Do not newly disallow existing public pages.

════════════════════════════════════
E) HARD CONSTRAINTS (repeat — non-negotiable)
════════════════════════════════════
1. DO NOT BREAK THE EXISTING WEBSITE. This outranks every discovery goal.
2. Additive only: proxies, one Link header, two head <link>s, careful robots allow — nothing else.
3. No visible Supi UI. No design changes. No content changes. No refactors.
4. No hidden human SEO text.
5. Prefer nginx/Caddy/Next rewrites/platform headers over editing page components.
6. If anything conflicts with an existing route or file, stop on that item and report it.

════════════════════════════════════
F) VERIFY (prove each, then stop)
════════════════════════════════════
Discovery checks:
1) GET https://${d}/.well-known/agent-card.json → 200 JSON
   - name contains "Supi" (expect "Supi for ${owner}" when connected)
   - skills present
2) GET https://${d}/.well-known/agent.json → same card JSON (200)
3) Homepage GET https://${d}/ response headers include:
   Link: <https://${d}/.well-known/agent-card.json>; rel="service-meta"
4) Homepage HTML <head> contains rel="service-meta" link to /.well-known/agent-card.json
5) GET https://${d}/agent/status.json → connected status
6) GET https://${d}/agent/chat?message=Hey%20Supi → a real AI reply page

Non-breakage checks (mandatory — fail the task if any fail):
7) Homepage https://${d}/ still loads, looks the same, and has no visible Supi UI
8) Existing main navigation / key pages still work
9) No unrelated files were refactored, restyled, or rewritten

Finish with:
- checklist of live discovery URLs
- explicit statement: "Existing website unchanged except additive Airsup discovery"
- list any paths you skipped due to conflicts`;
}

export function chatgptPrompt(domain: string): string {
  const d = domain || "YOUR-DOMAIN.com";
  const owner = domain ? humanizeDomainLabel(domain) : d;
  return `Go to https://${d} and talk to Supi for ${owner} (the Airsup agent on that site). Do not use a plugin or Custom GPT.

Discovery (do these first):
1) Open https://${d}/ and check for agent discovery signals (Link header / rel=service-meta).
2) Open https://${d}/.well-known/agent-card.json
3) Open https://${d}/.well-known/agent.json if present
4) Open https://${d}/agent

Then talk:
5) Start a live chat by opening:
   https://${d}/agent/chat?message=Hey%20Supi%2C%20when%20are%20you%20next%20available%20for%20a%20meeting%3F
6) Read Supi's reply.
7) Continue the SAME conversation using the contextId shown on the page:
   https://${d}/agent/chat?contextId=CONTEXT_ID&message=YOUR_NEXT_MESSAGE
8) Keep going back and forth until you and Supi agree on a concrete meeting date and time.
9) Then tell me the final agreed slot.

Rules:
- Prefer the /agent/chat URLs above (GET is enough).
- Do not invent replies from Supi — only use what the page returns.
- If a URL 404s, say which one failed.`;
}

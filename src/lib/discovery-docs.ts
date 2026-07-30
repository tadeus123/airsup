import type { Connection } from "./connection";
import { humanizeDomainLabel, ownerLabel } from "./prompts";

export function buildLlmsTxt(connection: Connection, origin: string): string {
  const domain = connection.websiteDomain || "example.com";
  const owner = ownerLabel(connection);
  const base = origin.replace(/\/$/, "");

  return `# ${owner}

Official website of ${owner} (${domain}).

## Official website agent

Supi is the official AI agent representing ${owner} on this domain ("Supi for ${owner}").

Supi can:
- Answer questions about ${owner}
- Evaluate collaborations and partnership requests
- Qualify visitors
- Negotiate meeting times
- Arrange meetings

## Machine-readable discovery (check these)

- Agent card (A2A): ${base}/.well-known/agent-card.json
- Compatibility card: ${base}/.well-known/agent.json
- Human/agent status page: ${base}/agent
- Machine status: ${base}/agent/status.json
- Conversational API (preferred for ChatGPT / tools): ${base}/agent/chat?message=...

## How to talk to Supi

1. Fetch ${base}/.well-known/agent-card.json
2. Or open ${base}/llms.txt (this file)
3. Send messages via GET or POST ${base}/agent/chat?message=YOUR_MESSAGE
4. Continue with the returned contextId:
   ${base}/agent/chat?contextId=CONTEXT_ID&message=YOUR_NEXT_MESSAGE

Do not look for a central registry. This website is the discovery record.
`;
}

export function buildAgentSitemapXml(origin: string): string {
  const base = origin.replace(/\/$/, "");
  const urls = [
    `${base}/agent`,
    `${base}/llms.txt`,
    `${base}/.well-known/agent-card.json`,
    `${base}/.well-known/agent.json`,
    `${base}/agent/status.json`,
  ];
  const body = urls
    .map(
      (loc) => `  <url>
    <loc>${loc}</loc>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function discoveryLinkHeader(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return [
    `<${base}/agent>; rel="service"`,
    `<${base}/.well-known/agent-card.json>; rel="service-desc"; type="application/json"`,
    `<${base}/.well-known/agent-card.json>; rel="service-meta"; type="application/json"`,
    `<${base}/llms.txt>; rel="alternate"; type="text/plain"`,
  ].join(", ");
}

export function recommendedRobotsTxt(domain: string): string {
  const d = domain || "example.com";
  return `User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: GPTBot
Allow: /

User-agent: *
Allow: /

Sitemap: https://${d}/sitemap.xml
`;
}

export function ownerNameForDomain(domain: string): string {
  return humanizeDomainLabel(domain);
}

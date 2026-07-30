import type { Connection } from "./connection";

export function buildAgentCard(origin: string, connection: Connection) {
  return {
    name: "AirCart Agent",
    description: connection.connected
      ? `Live website agent for ${connection.websiteDomain}.`
      : "AirCart connector. Configure domain + agent secret on the setup page.",
    supportedInterfaces: [
      {
        url: `${origin}/a2a/v1`,
        protocolBinding: "HTTP+JSON",
        tenant: "",
        protocolVersion: "1.0",
      },
    ],
    provider: {
      organization: connection.websiteDomain || "AirCart",
      url: origin,
    },
    version: "1.0.0",
    documentationUrl: `${origin}/agent`,
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
    skills: [
      {
        id: connection.connected ? "company-agent" : "setup",
        name: connection.connected ? "Company agent" : "Setup required",
        description: connection.connected
          ? "Talks to the connected real agent webhook."
          : "Connect your website and agent secret on /setup.",
        tags: ["aircart", "website-agent"],
        examples: ["What are you doing right now?"],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["text/plain", "application/json"],
        securityRequirements: [],
      },
    ],
    signatures: [],
  };
}

export function websiteCursorPrompt(domain: string, connectorOrigin: string): string {
  const d = domain || "YOUR-DOMAIN.com";
  return `You are connecting this website (${d}) to AirCart Connect hosted at ${connectorOrigin}.

GOAL
Add ONLY reverse-proxy / rewrite rules so these paths on https://${d} reach ${connectorOrigin}:

1) /.well-known/agent-card.json
2) /agent
3) /agent/status.json
4) /agent/chat

WHY
AirCart Connect already holds the website domain + real agent webhook + secret.
This website only needs additive routing so ChatGPT finds the real agent on this domain.

HARD CONSTRAINTS
- Do NOT modify existing page content, components, styles, layouts, or business logic.
- Do NOT refactor the site.
- Only ADD proxy/rewrite rules for the paths above.
- Optional: one <link rel="alternate" type="application/json" href="/.well-known/agent-card.json"> in <head>.

VERIFY
- GET https://${d}/.well-known/agent-card.json returns AirCart Agent JSON
- GET https://${d}/agent/status.json shows connected=true
- POST https://${d}/agent/chat {"message":"hello"} returns a reply
- Homepage still works unchanged

Finish by confirming existing website structure/functionality was unchanged except additive AirCart routes.`;
}

export function chatgptPrompt(domain: string): string {
  const d = domain || "YOUR-DOMAIN.com";
  return `Use your browsing tools. Go to https://${d}

1. Open https://${d}/.well-known/agent-card.json
2. Open https://${d}/agent
3. Open https://${d}/agent/status.json

Find the AirCart agent and answer:
- What is AirCart?
- What is it doing right now?
- Is a real agent backend connected?

If Actions are available, POST https://${d}/agent/chat with {"message":"What can you help me with?"} and use that reply.
Do not invent a registry. If a URL 404s, say which one failed.`;
}

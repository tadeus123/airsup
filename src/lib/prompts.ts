import type { Connection } from "./connection";

export function buildAgentCard(origin: string, connection: Connection) {
  return {
    name: "Supi",
    description: connection.connected
      ? `Supi — the Airsup agent for ${connection.websiteDomain}.`
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
      organization: connection.websiteDomain || "Airsup",
      url: origin,
    },
    version: "1.0.0",
    documentationUrl: `${origin}/agent`,
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
    skills: [
      {
        id: connection.connected ? "supi" : "setup",
        name: connection.connected ? "Supi" : "Setup required",
        description: connection.connected
          ? "Talk with Supi, the Airsup agent connected to this website."
          : "Connect your website and agent secret to activate Supi.",
        tags: ["airsup", "supi", "website-agent"],
        examples: ["Hey Supi, what are you doing right now?"],
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
  return `Paste this into Cursor on the ${d} website project.

Connect this site to Airsup at ${connectorOrigin}.

Add ONLY reverse-proxy / rewrite rules so these paths on https://${d} reach ${connectorOrigin}:

1) /.well-known/agent-card.json
2) /agent
3) /agent/status.json
4) /agent/chat
5) /supi.svg

Do NOT change existing pages, design, routes, content, or business logic.
Only ADD proxy/rewrite rules for the paths above.
Optional: one <link rel="alternate" type="application/json" href="/.well-known/agent-card.json" title="Supi"> in <head>.

When done, verify:
- GET https://${d}/.well-known/agent-card.json returns name "Supi"
- GET https://${d}/agent/status.json works
- Homepage is unchanged

Reply with the live URLs and confirm nothing else on the site was changed.`;
}

export function chatgptPrompt(domain: string): string {
  const d = domain || "YOUR-DOMAIN.com";
  return `Use your browsing tools. Go to https://${d}

1. Open https://${d}/.well-known/agent-card.json
2. Open https://${d}/agent
3. Open https://${d}/agent/status.json

Find Supi (the Airsup agent) and answer:
- What is Airsup?
- Who is Supi?
- What is Supi doing right now?
- Is a real agent backend connected?

If Actions are available, POST https://${d}/agent/chat with {"message":"Hey Supi, what can you help me with?"} and use that reply.
Do not invent a registry. If a URL 404s, say which one failed.`;
}

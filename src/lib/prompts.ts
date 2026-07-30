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
        id: connection.connected ? "supi-chat" : "setup",
        name: connection.connected ? "Talk to Supi" : "Setup required",
        description: connection.connected
          ? "Live conversation with Supi. Prefer GET /agent/chat?message=... then continue with the same contextId until done. Can schedule meetings."
          : "Connect your website and OpenAI API key to activate Supi.",
        tags: ["airsup", "supi", "website-agent", "scheduling", "meeting"],
        examples: [
          "Hey Supi, when are you next available for a meeting?",
          "Can we do Thursday afternoon?",
        ],
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
- GET https://${d}/agent/status.json shows connected=true
- GET https://${d}/agent/chat?message=Hey%20Supi returns a real AI reply page
- Homepage is unchanged

Reply with the live URLs and confirm nothing else on the site was changed.`;
}

export function chatgptPrompt(domain: string): string {
  const d = domain || "YOUR-DOMAIN.com";
  return `Go to https://${d} and talk to Supi (the Airsup agent on that site). Do not use a plugin or Custom GPT.

1) Open https://${d}/.well-known/agent-card.json
2) Open https://${d}/agent
3) Start a live chat by opening:
   https://${d}/agent/chat?message=Hey%20Supi%2C%20when%20are%20you%20next%20available%20for%20a%20meeting%3F
4) Read Supi's reply.
5) Continue the SAME conversation using the contextId shown on the page:
   https://${d}/agent/chat?contextId=CONTEXT_ID&message=YOUR_NEXT_MESSAGE
6) Keep going back and forth until you and Supi agree on a concrete meeting date and time.
7) Then tell me the final agreed slot.

Rules:
- Prefer the /agent/chat URLs above (GET is enough).
- Do not invent replies from Supi — only use what the page returns.
- If a URL 404s, say which one failed.`;
}

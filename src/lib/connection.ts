import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type Connection = {
  websiteDomain: string;
  agentWebhookUrl: string;
  agentSecret: string;
  connected: boolean;
  updatedAt: string;
};

export type PublicConnection = {
  websiteDomain: string;
  agentWebhookUrl: string;
  agentSecretSet: boolean;
  connected: boolean;
  updatedAt: string;
  storage: "redis" | "env" | "none";
};

const empty = (): Connection => ({
  websiteDomain: "",
  agentWebhookUrl: "",
  agentSecret: "",
  connected: false,
  updatedAt: new Date().toISOString(),
});

function fromEnv(): Connection | null {
  const websiteDomain = (process.env.WEBSITE_DOMAIN ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
  const agentWebhookUrl = (process.env.AGENT_WEBHOOK_URL ?? "").trim();
  const agentSecret = (process.env.AGENT_SECRET ?? "").trim();
  if (!websiteDomain && !agentWebhookUrl && !agentSecret) return null;
  return {
    websiteDomain,
    agentWebhookUrl,
    agentSecret,
    connected: Boolean(websiteDomain && agentWebhookUrl && agentSecret),
    updatedAt: new Date().toISOString(),
  };
}

async function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url, token });
}

export async function getConnection(): Promise<{
  connection: Connection;
  storage: PublicConnection["storage"];
}> {
  const client = await redis();
  if (client) {
    const stored = await client.get<Connection>("airsup:connection");
    if (stored) {
      return {
        connection: { ...empty(), ...stored },
        storage: "redis",
      };
    }
  }
  const env = fromEnv();
  if (env) return { connection: env, storage: "env" };
  return { connection: empty(), storage: "none" };
}

export async function saveConnection(input: {
  websiteDomain: string;
  agentWebhookUrl: string;
  agentSecret: string;
}): Promise<{ connection: Connection; storage: PublicConnection["storage"] }> {
  const websiteDomain = input.websiteDomain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
  const agentWebhookUrl = input.agentWebhookUrl.trim();
  const agentSecret = input.agentSecret.trim();
  if (!websiteDomain) throw new Error("Website domain is required");
  if (!agentWebhookUrl) throw new Error("Agent webhook URL is required");
  if (!agentSecret) throw new Error("Agent secret is required");

  const connection: Connection = {
    websiteDomain,
    agentWebhookUrl,
    agentSecret,
    connected: true,
    updatedAt: new Date().toISOString(),
  };

  const client = await redis();
  if (client) {
    await client.set("airsup:connection", connection);
    return { connection, storage: "redis" };
  }

  // Without Redis, connection is accepted for this response / docs,
  // but durable online storage needs env vars or Upstash.
  return { connection, storage: "none" };
}

export function toPublic(
  connection: Connection,
  storage: PublicConnection["storage"]
): PublicConnection {
  return {
    websiteDomain: connection.websiteDomain,
    agentWebhookUrl: connection.agentWebhookUrl,
    agentSecretSet: Boolean(connection.agentSecret),
    connected: connection.connected,
    updatedAt: connection.updatedAt,
    storage,
  };
}

export function publicOrigin(connection: Connection, requestOrigin: string): string {
  if (connection.websiteDomain) return `https://${connection.websiteDomain}`;
  return requestOrigin.replace(/\/$/, "");
}

function sign(secret: string, timestamp: string, nonce: string, rawBody: string): string {
  const payload = `${timestamp}.${nonce}.${rawBody}`;
  const hex = createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${hex}`;
}

export async function callRealAgent(
  connection: Connection,
  message: string,
  ids: { taskId?: string; contextId?: string } = {}
): Promise<{ reply: string; kind: string; taskId?: string; contextId?: string; backend: string }> {
  if (!connection.connected || !connection.agentWebhookUrl || !connection.agentSecret) {
    return {
      reply: `Supi (Airsup) is online, but no real agent is connected yet for ${connection.websiteDomain || "your website"}. Open the setup page, enter your website domain, webhook URL, and agent secret, then Connect.`,
      kind: "completed",
      backend: "builtin",
    };
  }

  const taskId = ids.taskId || randomUUID();
  const contextId = ids.contextId || randomUUID();
  const body = {
    protocolVersion: "1.0",
    requestId: randomUUID(),
    message: {
      messageId: randomUUID(),
      taskId,
      contextId,
      text: message,
      data: null,
      files: [],
    },
    principal: null,
    requestedOutputModes: ["text/plain", "application/json"],
  };
  const rawBody = JSON.stringify(body);
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signature = sign(connection.agentSecret, timestamp, nonce, rawBody);

  const response = await fetch(connection.agentWebhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-timestamp": timestamp,
      "x-agent-nonce": nonce,
      "x-agent-signature": signature,
    },
    body: rawBody,
  });

  const json = (await response.json().catch(() => ({}))) as {
    message?: string;
    kind?: string;
    taskId?: string;
    contextId?: string;
  };

  if (!response.ok) {
    throw new Error(json.message || `Agent webhook HTTP ${response.status}`);
  }

  return {
    reply: json.message || "Agent responded with no message.",
    kind: json.kind || "completed",
    taskId: json.taskId || taskId,
    contextId: json.contextId || contextId,
    backend: "webhook",
  };
}

export function assertSetupPassword(headerPassword: string | null): void {
  const expected = process.env.SETUP_PASSWORD;
  if (!expected) return;
  const a = Buffer.from(headerPassword ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Unauthorized");
  }
}

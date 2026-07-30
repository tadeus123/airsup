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
  storage: "supabase" | "redis" | "env" | "none";
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
  const agentSecret = (
    process.env.AGENT_SECRET ??
    process.env.OPENAI_API_KEY ??
    ""
  ).trim();
  if (!websiteDomain && !agentWebhookUrl && !agentSecret) return null;
  return {
    websiteDomain,
    agentWebhookUrl,
    agentSecret,
    connected: Boolean(websiteDomain && agentSecret),
    updatedAt: new Date().toISOString(),
  };
}

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const token = process.env.AIRSUP_DB_TOKEN ?? "";
  if (!url || !anonKey || !token) return null;
  return { url, anonKey, token };
}

async function supabaseRpc<T>(
  fn: string,
  body: Record<string, unknown>
): Promise<T | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const response = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: cfg.anonKey,
      authorization: `Bearer ${cfg.anonKey}`,
    },
    body: JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (json && typeof json === "object" && "message" in json && String((json as { message: string }).message)) ||
      `Supabase RPC ${fn} failed (${response.status})`;
    throw new Error(message);
  }
  return json as T;
}

type StoredRow = {
  websiteDomain?: string;
  agentWebhookUrl?: string;
  agentSecret?: string;
  connected?: boolean;
  updatedAt?: string;
};

function fromStored(row: StoredRow | null | undefined): Connection | null {
  if (!row) return null;
  return {
    websiteDomain: row.websiteDomain ?? "",
    agentWebhookUrl: row.agentWebhookUrl ?? "",
    agentSecret: row.agentSecret ?? "",
    connected: Boolean(row.connected),
    updatedAt: row.updatedAt ?? new Date().toISOString(),
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
  if (supabaseConfig()) {
    const row = await supabaseRpc<StoredRow | null>("airsup_get_connection", {
      p_token: supabaseConfig()!.token,
    });
    const parsed = fromStored(row);
    if (parsed) return { connection: parsed, storage: "supabase" };
  }

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
  agentWebhookUrl?: string;
  agentSecret: string;
}): Promise<{ connection: Connection; storage: PublicConnection["storage"] }> {
  const websiteDomain = input.websiteDomain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
  const existing = await getConnection();
  const agentWebhookUrl = (
    input.agentWebhookUrl?.trim() ||
    existing.connection.agentWebhookUrl ||
    process.env.AGENT_WEBHOOK_URL ||
    ""
  ).trim();
  const agentSecret = input.agentSecret.trim();
  if (!websiteDomain) throw new Error("Website domain is required");
  if (!agentSecret) throw new Error("API key is required");

  const connection: Connection = {
    websiteDomain,
    agentWebhookUrl,
    agentSecret,
    connected: Boolean(websiteDomain && agentSecret),
    updatedAt: new Date().toISOString(),
  };

  if (supabaseConfig()) {
    const row = await supabaseRpc<StoredRow>("airsup_save_connection", {
      p_token: supabaseConfig()!.token,
      p_website_domain: connection.websiteDomain,
      p_agent_webhook_url: connection.agentWebhookUrl,
      p_agent_secret: connection.agentSecret,
    });
    return {
      connection: fromStored(row) ?? connection,
      storage: "supabase",
    };
  }

  const client = await redis();
  if (client) {
    await client.set("airsup:connection", connection);
    return { connection, storage: "redis" };
  }

  throw new Error(
    "Cannot save your API key yet. Add SUPABASE_URL, SUPABASE_ANON_KEY, and AIRSUP_DB_TOKEN to Vercel, then redeploy."
  );
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
  if (!connection.connected || !connection.agentSecret) {
    return {
      reply: `Supi is online for ${connection.websiteDomain || "your website"}, but no AI API key is connected yet. Finish setup on the Airsup home page.`,
      kind: "completed",
      backend: "builtin",
    };
  }

  const taskId = ids.taskId || randomUUID();
  const contextId = ids.contextId || randomUUID();

  if (connection.agentWebhookUrl) {
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

  const reply = await callOpenAI(
    connection.agentSecret,
    connection.websiteDomain,
    message,
    contextId
  );
  return {
    reply,
    kind: "completed",
    taskId,
    contextId,
    backend: "openai",
  };
}

async function callOpenAI(
  apiKey: string,
  domain: string,
  message: string,
  contextId: string
): Promise<string> {
  const history =
    (await supabaseRpc<Array<{ role: string; content: string }>>("airsup_list_messages", {
      p_token: supabaseConfig()?.token,
      p_context_id: contextId,
    })) || [];

  const system = {
    role: "system",
    content: `You are Supi, the live Airsup site agent for ${domain || "this website"}.
You schedule meetings and answer visitor questions for the website owner.
Availability defaults (CET/CEST): Monday–Friday 10:00–12:00 and 14:00–17:00.
Negotiate naturally until a concrete date and time are agreed. Then confirm clearly in one line like: "CONFIRMED: <date> <time> CET".
Keep replies short. Do not invent fake registries. You are a real conversational agent, not a FAQ page.`,
  };

  const messages = [
    system,
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
    }),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    throw new Error(json.error?.message || `OpenAI HTTP ${response.status}`);
  }

  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned an empty reply");

  if (supabaseConfig()) {
    await supabaseRpc("airsup_append_message", {
      p_token: supabaseConfig()!.token,
      p_context_id: contextId,
      p_role: "user",
      p_content: message,
    });
    await supabaseRpc("airsup_append_message", {
      p_token: supabaseConfig()!.token,
      p_context_id: contextId,
      p_role: "assistant",
      p_content: text,
    });
  }

  return text;
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

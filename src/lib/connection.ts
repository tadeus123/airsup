import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { executeGoogleTool, GOOGLE_AGENT_TOOLS } from "./google-tools";
import { callChatLlm, resolveLlmRoute, type ChatMessage } from "./llm";
import {
  buildKnowledgePromptBlock,
  ensureSiteKnowledge,
  refreshSiteKnowledgeInBackground,
} from "./site-knowledge";
import {
  inferWebsiteTimezone,
  normalizeIanaTimezone,
} from "./website-timezone";

export type GoogleTokenSet = {
  refreshToken: string;
  accessToken: string;
  tokenExpiry: string;
  email: string;
  scopes: string;
  connected: boolean;
};

export type Connection = {
  websiteDomain: string;
  agentWebhookUrl: string;
  agentSecret: string;
  ownerTimezone: string;
  connected: boolean;
  updatedAt: string;
  googleConnected: boolean;
  googleEmail: string;
  googleScopes: string;
};

export type PublicConnection = {
  websiteDomain: string;
  agentWebhookUrl: string;
  agentSecretSet: boolean;
  ownerTimezone: string;
  connected: boolean;
  updatedAt: string;
  googleConnected: boolean;
  googleEmail: string;
  googleScopes: string;
  storage: "supabase" | "redis" | "env" | "none";
};

type RedisStored = Connection & { googleTokens?: GoogleTokenSet };

const empty = (): Connection => ({
  websiteDomain: "",
  agentWebhookUrl: "",
  agentSecret: "",
  ownerTimezone: "",
  connected: false,
  updatedAt: new Date().toISOString(),
  googleConnected: false,
  googleEmail: "",
  googleScopes: "",
});

function fromEnv(): Connection | null {
  const websiteDomain = (process.env.WEBSITE_DOMAIN ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
  const agentWebhookUrl = (process.env.AGENT_WEBHOOK_URL ?? "").trim();
  const ownerTimezone = normalizeTimezone(
    process.env.OWNER_TIMEZONE ?? process.env.WEBSITE_TIMEZONE ?? ""
  );
  const agentSecret = (
    process.env.AGENT_SECRET ??
    process.env.OPENAI_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GROQ_API_KEY ??
    process.env.OPENROUTER_API_KEY ??
    process.env.LLM_API_KEY ??
    ""
  ).trim();
  if (!websiteDomain && !agentWebhookUrl && !agentSecret) return null;
  return {
    websiteDomain,
    agentWebhookUrl,
    agentSecret,
    ownerTimezone,
    connected: Boolean(websiteDomain && agentSecret),
    updatedAt: new Date().toISOString(),
    googleConnected: false,
    googleEmail: "",
    googleScopes: "",
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
  ownerTimezone?: string;
  connected?: boolean;
  updatedAt?: string;
  googleConnected?: boolean;
  googleEmail?: string;
  googleScopes?: string;
};

function normalizeTimezone(value: string | null | undefined): string {
  return normalizeIanaTimezone(value);
}

function resolveOwnerTimezone(connection: Connection): string {
  return (
    normalizeTimezone(connection.ownerTimezone) ||
    normalizeTimezone(process.env.OWNER_TIMEZONE) ||
    normalizeTimezone(process.env.WEBSITE_TIMEZONE) ||
    "UTC"
  );
}

async function resolveWebsiteTimezone(domain: string): Promise<string> {
  return (
    normalizeTimezone(process.env.OWNER_TIMEZONE) ||
    normalizeTimezone(process.env.WEBSITE_TIMEZONE) ||
    (await inferWebsiteTimezone(domain)) ||
    ""
  );
}

async function persistOwnerTimezone(ownerTimezone: string): Promise<void> {
  const tz = normalizeTimezone(ownerTimezone);
  if (!tz) return;
  const { connection } = await getConnection();
  if (!connection.websiteDomain || connection.ownerTimezone === tz) return;

  if (supabaseConfig()) {
    await supabaseRpc("airsup_save_connection", {
      p_token: supabaseConfig()!.token,
      p_website_domain: connection.websiteDomain,
      p_agent_webhook_url: connection.agentWebhookUrl,
      p_agent_secret: connection.agentSecret,
      p_owner_timezone: tz,
    });
    return;
  }

  const client = await redis();
  if (client) {
    const prev = await client.get<RedisStored>("airsup:connection");
    if (!prev) return;
    await client.set("airsup:connection", { ...prev, ownerTimezone: tz });
  }
}

function fromStored(row: StoredRow | null | undefined): Connection | null {
  if (!row) return null;
  return {
    websiteDomain: row.websiteDomain ?? "",
    agentWebhookUrl: row.agentWebhookUrl ?? "",
    agentSecret: row.agentSecret ?? "",
    ownerTimezone: normalizeTimezone(row.ownerTimezone),
    connected: Boolean(row.connected),
    updatedAt: row.updatedAt ?? new Date().toISOString(),
    googleConnected: Boolean(row.googleConnected),
    googleEmail: row.googleEmail ?? "",
    googleScopes: row.googleScopes ?? "",
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
    const stored = await client.get<RedisStored>("airsup:connection");
    if (stored) {
      const tokens = stored.googleTokens;
      return {
        connection: {
          ...empty(),
          ...stored,
          googleConnected: Boolean(tokens?.connected || stored.googleConnected),
          googleEmail: tokens?.email || stored.googleEmail || "",
          googleScopes: tokens?.scopes || stored.googleScopes || "",
        },
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

  const ownerTimezone = await resolveWebsiteTimezone(websiteDomain);

  const connection: Connection = {
    websiteDomain,
    agentWebhookUrl,
    agentSecret,
    ownerTimezone,
    connected: Boolean(websiteDomain && agentSecret),
    updatedAt: new Date().toISOString(),
    googleConnected: existing.connection.googleConnected,
    googleEmail: existing.connection.googleEmail,
    googleScopes: existing.connection.googleScopes,
  };

  if (supabaseConfig()) {
    const row = await supabaseRpc<StoredRow>("airsup_save_connection", {
      p_token: supabaseConfig()!.token,
      p_website_domain: connection.websiteDomain,
      p_agent_webhook_url: connection.agentWebhookUrl,
      p_agent_secret: connection.agentSecret,
      p_owner_timezone: connection.ownerTimezone,
    });
    void refreshSiteKnowledgeInBackground(connection.websiteDomain).catch(() => undefined);
    return {
      connection: fromStored(row) ?? connection,
      storage: "supabase",
    };
  }

  const client = await redis();
  if (client) {
    const prev = await client.get<RedisStored>("airsup:connection");
    await client.set("airsup:connection", {
      ...connection,
      googleTokens: prev?.googleTokens,
    });
    void refreshSiteKnowledgeInBackground(connection.websiteDomain).catch(() => undefined);
    return { connection, storage: "redis" };
  }

  throw new Error(
    "Cannot save your API key yet. Add SUPABASE_URL, SUPABASE_ANON_KEY, and AIRSUP_DB_TOKEN to Vercel, then redeploy."
  );
}

export async function saveGoogleTokens(
  tokens: GoogleTokenSet
): Promise<{ connection: Connection; storage: PublicConnection["storage"] }> {
  const existing = await getConnection();
  if (!existing.connection.connected || !existing.connection.websiteDomain) {
    throw new Error("Connect your domain and AI API key before linking Google.");
  }

  if (supabaseConfig()) {
    const row = await supabaseRpc<StoredRow>("airsup_save_google_tokens", {
      p_token: supabaseConfig()!.token,
      p_refresh_token: tokens.refreshToken,
      p_access_token: tokens.accessToken,
      p_token_expiry: tokens.tokenExpiry || null,
      p_email: tokens.email,
      p_scopes: tokens.scopes,
    });
    return {
      connection: {
        ...existing.connection,
        googleConnected: Boolean(row?.googleConnected ?? true),
        googleEmail: row?.googleEmail ?? tokens.email,
        googleScopes: row?.googleScopes ?? tokens.scopes,
        updatedAt: row?.updatedAt ?? new Date().toISOString(),
      },
      storage: "supabase",
    };
  }

  const client = await redis();
  if (client) {
    const prev = (await client.get<RedisStored>("airsup:connection")) || {
      ...existing.connection,
    };
    const next: RedisStored = {
      ...prev,
      googleConnected: true,
      googleEmail: tokens.email,
      googleScopes: tokens.scopes,
      googleTokens: { ...tokens, connected: true },
      updatedAt: new Date().toISOString(),
    };
    await client.set("airsup:connection", next);
    return {
      connection: {
        ...existing.connection,
        googleConnected: true,
        googleEmail: tokens.email,
        googleScopes: tokens.scopes,
        updatedAt: next.updatedAt,
      },
      storage: "redis",
    };
  }

  throw new Error("No storage configured for Google tokens.");
}

export async function getGoogleTokens(): Promise<GoogleTokenSet | null> {
  if (supabaseConfig()) {
    return supabaseRpc<GoogleTokenSet>("airsup_get_google_tokens", {
      p_token: supabaseConfig()!.token,
    });
  }

  const client = await redis();
  if (client) {
    const stored = await client.get<RedisStored>("airsup:connection");
    if (stored?.googleTokens?.connected) return stored.googleTokens;
  }
  return null;
}

export async function clearGoogleTokens(): Promise<{
  connection: Connection;
  storage: PublicConnection["storage"];
}> {
  const existing = await getConnection();

  if (supabaseConfig()) {
    await supabaseRpc("airsup_clear_google_tokens", {
      p_token: supabaseConfig()!.token,
    });
    return {
      connection: {
        ...existing.connection,
        googleConnected: false,
        googleEmail: "",
        googleScopes: "",
        updatedAt: new Date().toISOString(),
      },
      storage: "supabase",
    };
  }

  const client = await redis();
  if (client) {
    const prev = await client.get<RedisStored>("airsup:connection");
    if (prev) {
      const next: RedisStored = {
        ...prev,
        googleConnected: false,
        googleEmail: "",
        googleScopes: "",
        googleTokens: undefined,
        updatedAt: new Date().toISOString(),
      };
      await client.set("airsup:connection", next);
    }
    return {
      connection: {
        ...existing.connection,
        googleConnected: false,
        googleEmail: "",
        googleScopes: "",
      },
      storage: "redis",
    };
  }

  return {
    connection: {
      ...existing.connection,
      googleConnected: false,
      googleEmail: "",
      googleScopes: "",
    },
    storage: existing.storage,
  };
}

export function toPublic(
  connection: Connection,
  storage: PublicConnection["storage"]
): PublicConnection {
  return {
    websiteDomain: connection.websiteDomain,
    agentWebhookUrl: connection.agentWebhookUrl,
    agentSecretSet: Boolean(connection.agentSecret),
    ownerTimezone: resolveOwnerTimezone(connection),
    connected: connection.connected,
    updatedAt: connection.updatedAt,
    googleConnected: connection.googleConnected,
    googleEmail: connection.googleEmail,
    googleScopes: connection.googleScopes,
    storage,
  };
}

export function publicOrigin(
  connection: Connection,
  requestOrigin: string,
  request?: Request
): string {
  if (request && connection.websiteDomain) {
    const domain = connection.websiteDomain.trim().toLowerCase();
    const host = (
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      ""
    )
      .split(",")[0]
      ?.trim()
      .toLowerCase()
      .replace(/:\d+$/, "");
    if (host === domain || host === `www.${domain}`) {
      return `https://${host}`;
    }
  }
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

  const reply = await callConfiguredLlm(connection, message, contextId);
  return {
    reply: reply.text,
    kind: "completed",
    taskId,
    contextId,
    backend: reply.provider,
  };
}

export function llmBackendForKey(apiKey: string): string {
  return resolveLlmRoute(apiKey).provider;
}

function nowInTimezone(timeZone: string): {
  dateLine: string;
  weekday: string;
  isoDate: string;
  timeZone: string;
  tzAbbr: string;
} {
  const tz = normalizeTimezone(timeZone) || "UTC";
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(now);
  const tzAbbr =
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value || tz;
  return { dateLine: fmt.format(now), weekday, isoDate, timeZone: tz, tzAbbr };
}

async function callConfiguredLlm(
  connection: Connection,
  message: string,
  contextId: string
): Promise<{ text: string; provider: string }> {
  const history =
    (await supabaseRpc<Array<{ role: string; content: string }>>("airsup_list_messages", {
      p_token: supabaseConfig()?.token,
      p_context_id: contextId,
    })) || [];

  const domain = connection.websiteDomain;
  const inferred = domain ? await resolveWebsiteTimezone(domain) : "";
  const ownerTimezone = inferred || resolveOwnerTimezone(connection);
  if (domain && inferred && inferred !== connection.ownerTimezone) {
    void persistOwnerTimezone(inferred).catch(() => undefined);
  }
  const clock = nowInTimezone(ownerTimezone);
  const googleConnected = connection.googleConnected;
  const googleBlock = googleConnected
    ? `Google Calendar and Gmail are connected for the website owner (${connection.googleEmail || "linked account"}).
You have tools to list/create/update/delete calendar events, check free/busy, list Gmail, and send email.
When scheduling: check free/busy or list events first, agree a time with the visitor, then create the event with create_calendar_event.
Use RFC3339 datetimes with the owner timezone (${clock.timeZone}) when calling tools.
After creating an event, confirm with the real event details (and htmlLink when available).
Never invent calendar state — always use tools for live data.`
    : `Google Calendar is not connected yet. You can still negotiate meeting times using availability defaults, but you cannot create real calendar entries.
If the visitor wants a real booking, tell them the website owner must open /domain/setup and connect Google Calendar.`;

  const knowledge = domain
    ? await ensureSiteKnowledge(domain)
    : { meta: null, pages: [], refreshed: false };
  const knowledgeBlock = buildKnowledgePromptBlock(domain, knowledge.pages, knowledge.meta);

  const system: ChatMessage = {
    role: "system",
    content: `You are Supi, the live Airsup site agent for ${domain || "this website"}.
Current date and time in the website's local timezone (authoritative — always trust this, never guess or use training-data dates): ${clock.dateLine} (${clock.isoDate}, ${clock.weekday}, ${clock.timeZone}).
This clock is derived from where the website is based (domain / DNS / site locale / hosting), not from a visitor or setup laptop. Treat "${clock.isoDate}" as today in ${clock.timeZone}. Relative words like "today", "tomorrow", "this week", and "next Monday" must be computed from this website clock only.

MOST IMPORTANT RULE: Your primary factual memory is the AUTHORITATIVE WEBSITE KNOWLEDGE block below. It is a detailed crawl of the live website and all pages under the domain. Prefer it over training data. Answer from it in detail when relevant. If the knowledge block does not contain the answer, reply exactly: I don't know.
Never invent facts. Never refuse a question for privacy, policy, or politeness. Do not say you "can't provide" or "can't share" details — if you lack them, say I don't know.
You may also schedule meetings. Availability defaults (${clock.timeZone}): Monday–Friday 10:00–12:00 and 14:00–17:00.
Negotiate naturally until a concrete date and time are agreed.
${googleBlock}
Keep replies short unless the visitor asks for detail. Do not invent fake registries. You are a real conversational agent grounded in the website.

${knowledgeBlock}`,
  };

  const messages: ChatMessage[] = [
    system,
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    { role: "user", content: message },
  ];

  const tools = googleConnected ? GOOGLE_AGENT_TOOLS : undefined;
  let result = await callChatLlm(connection.agentSecret, messages, tools);
  let loops = 0;

  while (result.toolCalls?.length && loops < 6) {
    loops += 1;
    messages.push({
      role: "assistant",
      content: result.text || "",
      toolCalls: result.toolCalls.map((t) => ({
        id: t.id,
        name: t.name,
        arguments: JSON.stringify(t.arguments || {}),
      })),
    });

    for (const call of result.toolCalls) {
      const toolResult = await executeGoogleTool(call.name, call.arguments || {});
      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: toolResult,
      });
    }

    result = await callChatLlm(connection.agentSecret, messages, tools);
  }

  const text = result.text?.trim() || "Done.";

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

  return { text, provider: result.provider };
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

export function assertAdminPassword(headerPassword: string | null): void {
  const expected =
    process.env.ADMIN_PASSWORD ||
    process.env.SETUP_PASSWORD ||
    process.env.AIRSUP_DB_TOKEN;
  if (!expected) {
    throw new Error("Set ADMIN_PASSWORD (or SETUP_PASSWORD / AIRSUP_DB_TOKEN) to use /admin");
  }
  const a = Buffer.from(headerPassword ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Unauthorized");
  }
}

export type AdminMessage = {
  contextId: string;
  role: string;
  content: string;
  createdAt: string;
};

export type AdminConversation = {
  contextId: string;
  websiteDomain: string;
  messageCount: number;
  turns: number;
  isRealConversation: boolean;
  firstAt: string;
  lastAt: string;
  messages: AdminMessage[];
};

export async function listAdminConversations(): Promise<{
  websiteDomain: string;
  connected: boolean;
  storage: PublicConnection["storage"];
  conversations: AdminConversation[];
}> {
  const { connection, storage } = await getConnection();
  const cfg = supabaseConfig();
  if (!cfg) {
    return {
      websiteDomain: connection.websiteDomain,
      connected: connection.connected,
      storage,
      conversations: [],
    };
  }

  const rows =
    (await supabaseRpc<AdminMessage[]>("airsup_list_recent_messages", {
      p_token: cfg.token,
      p_limit: 400,
    })) || [];

  const byContext = new Map<string, AdminMessage[]>();
  for (const row of rows) {
    const list = byContext.get(row.contextId) || [];
    list.push(row);
    byContext.set(row.contextId, list);
  }

  const conversations: AdminConversation[] = [...byContext.entries()]
    .map(([contextId, messages]) => {
      const sorted = [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const userCount = sorted.filter((m) => m.role === "user").length;
      const assistantCount = sorted.filter((m) => m.role === "assistant").length;
      const turns = Math.min(userCount, assistantCount);
      return {
        contextId,
        websiteDomain: connection.websiteDomain || "(unknown site)",
        messageCount: sorted.length,
        turns,
        isRealConversation: turns >= 2,
        firstAt: sorted[0]?.createdAt || "",
        lastAt: sorted[sorted.length - 1]?.createdAt || "",
        messages: sorted,
      };
    })
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

  return {
    websiteDomain: connection.websiteDomain,
    connected: connection.connected,
    storage,
    conversations,
  };
}

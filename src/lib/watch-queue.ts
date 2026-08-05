/**
 * Long-poll event queue that powers the Airsup `watch_endpoint` primitive.
 *
 * A remote scheduled agent (e.g. a ChatGPT Scheduled Task) keeps a single tool
 * call "alive" by long-polling this queue: the HTTP request is held open until a
 * command/event arrives or a short timeout elapses, then the agent immediately
 * calls again. Chaining those calls turns one run into a quasi-live session for
 * the length of a monitoring window.
 *
 * Storage is chosen so the queue works in production on Vercel's serverless
 * functions, where separate invocations do NOT share memory:
 *   1. Supabase — reuses the app's already-deployed airsup_append_message /
 *      airsup_list_messages RPCs, so it works with the Supabase credentials the
 *      deployment already has (no new secrets, no schema migration).
 *   2. Upstash Redis — used when configured.
 *   3. In-process memory — fallback for a single long-lived server (dev).
 *
 * The monitoring window is NOT stored here: the watch route issues `watch_until`
 * and the client echoes it back, which stays correct across stateless
 * invocations while still keeping the server as the source of the clock.
 */

import { timingSafeEqual } from "node:crypto";

export type WatchEvent = {
  id: number;
  at: string;
  type: string;
  text: string;
  data?: unknown;
};

export type EventPage = {
  events: WatchEvent[];
  lastId: number;
};

const MAX_EVENTS = 500;
const EVENT_TTL_SECONDS = 3600;
export const DEFAULT_WINDOW_SECONDS = 900;
export const MAX_WINDOW_SECONDS = 3600;

/** Context-id prefix used when the queue is stored in the Supabase messages table. */
export const WATCH_CONTEXT_PREFIX = "__airsup_watch__:";

type MemoryChannel = { events: WatchEvent[]; seq: number };
const memory = new Map<string, MemoryChannel>();

/**
 * Optional shared secret gate. When `WATCH_SECRET` is set, both the watch and
 * push endpoints require a matching `token` (query param or `x-watch-token`
 * header). When it is unset, the endpoints are open (useful for local testing).
 */
export function assertWatchToken(request: Request): void {
  const expected = process.env.WATCH_SECRET;
  if (!expected) return;
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-watch-token") || url.searchParams.get("token") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Unauthorized");
  }
}

export function normalizeChannel(raw: string | null | undefined): string {
  const value = (raw ?? "").trim().toLowerCase();
  const cleaned = value.replace(/[^a-z0-9._:-]/g, "-").slice(0, 120);
  return cleaned || "default";
}

// --- Supabase backend (reuses existing, production-deployed RPCs) ----------

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
      (json &&
        typeof json === "object" &&
        "message" in json &&
        String((json as { message: string }).message)) ||
      `Supabase RPC ${fn} failed (${response.status})`;
    throw new Error(message);
  }
  return json as T;
}

function watchContext(channel: string): string {
  return `${WATCH_CONTEXT_PREFIX}${channel}`;
}

/** Is this context id an internal watch-queue channel (not a real conversation)? */
export function isWatchContext(contextId: string | null | undefined): boolean {
  return typeof contextId === "string" && contextId.startsWith(WATCH_CONTEXT_PREFIX);
}

function coerceStored(content: string, id: number): WatchEvent {
  try {
    const obj = JSON.parse(content) as Partial<WatchEvent>;
    return {
      id,
      at: typeof obj.at === "string" ? obj.at : new Date().toISOString(),
      type: typeof obj.type === "string" ? obj.type : "event",
      text: typeof obj.text === "string" ? obj.text : "",
      data: obj.data,
    };
  } catch {
    return { id, at: new Date().toISOString(), type: "event", text: content };
  }
}

async function supabaseList(channel: string): Promise<WatchEvent[]> {
  const cfg = supabaseConfig();
  if (!cfg) return [];
  const rows =
    (await supabaseRpc<Array<{ role: string; content: string }>>(
      "airsup_list_messages",
      { p_token: cfg.token, p_context_id: watchContext(channel) }
    )) || [];
  // Position in insertion order is the stable id (RPC returns chronological asc).
  return rows.map((row, index) => coerceStored(row.content, index + 1));
}

// --- Upstash Redis backend --------------------------------------------------

async function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url, token });
}

function redisKeys(channel: string) {
  const base = `airsup:watch:${channel}`;
  return { events: `${base}:events`, seq: `${base}:seq` };
}

function coerceRedis(raw: unknown): WatchEvent | null {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const e = obj as Partial<WatchEvent>;
  if (typeof e.id !== "number") return null;
  return {
    id: e.id,
    at: typeof e.at === "string" ? e.at : new Date().toISOString(),
    type: typeof e.type === "string" ? e.type : "event",
    text: typeof e.text === "string" ? e.text : "",
    data: e.data,
  };
}

// --- In-memory backend ------------------------------------------------------

function memChannel(channel: string): MemoryChannel {
  let entry = memory.get(channel);
  if (!entry) {
    entry = { events: [], seq: 0 };
    memory.set(channel, entry);
  }
  return entry;
}

// --- Public API -------------------------------------------------------------

export async function pushEvent(
  channel: string,
  input: { text: string; type?: string; data?: unknown }
): Promise<WatchEvent> {
  const ch = normalizeChannel(channel);
  const base = {
    at: new Date().toISOString(),
    type: (input.type || "command").slice(0, 60),
    text: input.text,
    data: input.data,
  };

  if (supabaseConfig()) {
    const cfg = supabaseConfig()!;
    await supabaseRpc("airsup_append_message", {
      p_token: cfg.token,
      p_context_id: watchContext(ch),
      p_role: "event",
      p_content: JSON.stringify(base),
    });
    const events = await supabaseList(ch);
    const id = events.length;
    return { id, ...base };
  }

  const client = await redis();
  if (client) {
    const k = redisKeys(ch);
    const id = await client.incr(k.seq);
    const event: WatchEvent = { id, ...base };
    await client.rpush(k.events, JSON.stringify(event));
    await client.ltrim(k.events, -MAX_EVENTS, -1);
    await Promise.all([
      client.expire(k.events, EVENT_TTL_SECONDS),
      client.expire(k.seq, EVENT_TTL_SECONDS),
    ]);
    return event;
  }

  const entry = memChannel(ch);
  entry.seq += 1;
  const event: WatchEvent = { id: entry.seq, ...base };
  entry.events.push(event);
  if (entry.events.length > MAX_EVENTS) entry.events = entry.events.slice(-MAX_EVENTS);
  return event;
}

export async function readEventsAfter(
  channel: string,
  afterCursor: number
): Promise<EventPage> {
  const ch = normalizeChannel(channel);

  if (supabaseConfig()) {
    const all = await supabaseList(ch);
    const lastId = all.length;
    return { events: all.filter((e) => e.id > afterCursor), lastId };
  }

  const client = await redis();
  if (client) {
    const k = redisKeys(ch);
    const raw = (await client.lrange(k.events, 0, -1)) as unknown[];
    const all = (raw || [])
      .map(coerceRedis)
      .filter((e): e is WatchEvent => e !== null);
    const lastId = all.reduce((max, e) => Math.max(max, e.id), 0);
    return { events: all.filter((e) => e.id > afterCursor), lastId };
  }

  const entry = memChannel(ch);
  return {
    events: entry.events.filter((e) => e.id > afterCursor),
    lastId: entry.seq,
  };
}

/** Which backend is active, for status/debugging. */
export function watchBackend(): "supabase" | "redis" | "memory" {
  if (supabaseConfig()) return "supabase";
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return "redis";
  }
  return "memory";
}

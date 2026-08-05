/**
 * Long-poll event queue that powers the Airsup `watch_endpoint` primitive.
 *
 * A remote scheduled agent (e.g. a ChatGPT Scheduled Task) keeps a single tool
 * call "alive" by long-polling this queue: the HTTP request is held open until a
 * command/event arrives or a short timeout elapses, then the agent immediately
 * calls again. Chaining those calls turns one run into a quasi-live session for
 * the length of a monitoring window that the server (not the model) controls.
 *
 * Storage is Redis-backed when Upstash is configured (durable and shared across
 * serverless invocations, which is required on Vercel), and falls back to an
 * in-process store otherwise (fine for a single long-lived dev server).
 */

import { timingSafeEqual } from "node:crypto";

export type WatchEvent = {
  id: number;
  at: string;
  type: string;
  text: string;
  data?: unknown;
};

export type ChannelSnapshot = {
  events: WatchEvent[];
  lastId: number;
  windowUntil: number | null;
};

const MAX_EVENTS = 500;
const EVENT_TTL_SECONDS = 3600;
export const DEFAULT_WINDOW_SECONDS = 900;
export const MAX_WINDOW_SECONDS = 3600;

type MemoryChannel = {
  events: WatchEvent[];
  seq: number;
  windowUntil: number | null;
};

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
    request.headers.get("x-watch-token") ||
    url.searchParams.get("token") ||
    "";
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

async function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url, token });
}

function memChannel(channel: string): MemoryChannel {
  let entry = memory.get(channel);
  if (!entry) {
    entry = { events: [], seq: 0, windowUntil: null };
    memory.set(channel, entry);
  }
  return entry;
}

function keys(channel: string) {
  const base = `airsup:watch:${channel}`;
  return {
    events: `${base}:events`,
    seq: `${base}:seq`,
    window: `${base}:window`,
  };
}

/** Redis may auto-deserialize JSON members; accept both strings and objects. */
function coerceEvent(raw: unknown): WatchEvent | null {
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

export async function pushEvent(
  channel: string,
  input: { text: string; type?: string; data?: unknown }
): Promise<WatchEvent> {
  const ch = normalizeChannel(channel);
  const client = await redis();
  const base: Omit<WatchEvent, "id"> = {
    at: new Date().toISOString(),
    type: (input.type || "command").slice(0, 60),
    text: input.text,
    data: input.data,
  };

  if (client) {
    const k = keys(ch);
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
  if (entry.events.length > MAX_EVENTS) {
    entry.events = entry.events.slice(-MAX_EVENTS);
  }
  return event;
}

export async function readSnapshot(
  channel: string,
  afterCursor: number
): Promise<ChannelSnapshot> {
  const ch = normalizeChannel(channel);
  const client = await redis();

  if (client) {
    const k = keys(ch);
    const [rawEvents, rawWindow] = await Promise.all([
      client.lrange(k.events, 0, -1) as Promise<unknown[]>,
      client.get(k.window) as Promise<unknown>,
    ]);
    const all = (rawEvents || [])
      .map(coerceEvent)
      .filter((e): e is WatchEvent => e !== null);
    const lastId = all.reduce((max, e) => Math.max(max, e.id), 0);
    const windowUntil = parseWindow(rawWindow);
    return {
      events: all.filter((e) => e.id > afterCursor),
      lastId,
      windowUntil,
    };
  }

  const entry = memChannel(ch);
  return {
    events: entry.events.filter((e) => e.id > afterCursor),
    lastId: entry.seq,
    windowUntil: entry.windowUntil,
  };
}

function parseWindow(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setWindowUntil(
  channel: string,
  untilMs: number
): Promise<void> {
  const ch = normalizeChannel(channel);
  const client = await redis();
  if (client) {
    const k = keys(ch);
    await client.set(k.window, String(untilMs), { ex: EVENT_TTL_SECONDS });
    return;
  }
  memChannel(ch).windowUntil = untilMs;
}

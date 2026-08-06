import { NextResponse } from "next/server";
import { getConnection } from "@/lib/connection";
import {
  DEFAULT_WINDOW_SECONDS,
  MAX_WINDOW_SECONDS,
  assertWatchToken,
  normalizeChannel,
  readEventsAfter,
  watchBackend,
  type WatchEvent,
} from "@/lib/watch-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow long-held requests. The effective hold is also bounded by the caller's
// wait_seconds and by the remaining monitoring window.
export const maxDuration = 300;

const POLL_INTERVAL_MS = 500;
const DEFAULT_WAIT_SECONDS = 25;
const MAX_WAIT_SECONDS = 290;

type WatchInput = {
  waitSeconds: number;
  cursor: number;
  channel: string;
  windowSeconds: number | null;
  watchUntil: number | null;
  reset: boolean;
};

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseWindowSeconds(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  return clamp(toInt(raw, DEFAULT_WINDOW_SECONDS), 1, MAX_WINDOW_SECONDS);
}

function parseWatchUntil(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 1e12) return asNum; // epoch ms
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : null;
}

function parseGet(url: URL): WatchInput {
  const q = url.searchParams;
  return {
    waitSeconds: clamp(toInt(q.get("wait_seconds"), DEFAULT_WAIT_SECONDS), 0, MAX_WAIT_SECONDS),
    cursor: Math.max(0, toInt(q.get("cursor"), 0)),
    channel: q.get("channel") || "",
    windowSeconds: parseWindowSeconds(q.get("window_seconds")),
    watchUntil: parseWatchUntil(q.get("watch_until")),
    reset: q.get("reset") === "1" || q.get("reset") === "true",
  };
}

function parseBody(body: Record<string, unknown>): WatchInput {
  return {
    waitSeconds: clamp(toInt(body.wait_seconds, DEFAULT_WAIT_SECONDS), 0, MAX_WAIT_SECONDS),
    cursor: Math.max(0, toInt(body.cursor, 0)),
    channel: typeof body.channel === "string" ? body.channel : "",
    windowSeconds: parseWindowSeconds(body.window_seconds),
    watchUntil: parseWatchUntil(body.watch_until),
    reset: body.reset === true || body.reset === "true" || body.reset === 1,
  };
}

async function resolveChannel(requested: string): Promise<string> {
  if (requested.trim()) return normalizeChannel(requested);
  const { connection } = await getConnection().catch(() => ({ connection: null }));
  return normalizeChannel(connection?.websiteDomain || "default");
}

async function runWatch(input: WatchInput) {
  const channel = await resolveChannel(input.channel);
  const now = Date.now();

  // The monitoring window is stateless: the server issues `watch_until` and the
  // client echoes it back. That is correct across serverless invocations (which
  // share no memory) while keeping the server as the source of the clock ÔÇö the
  // model never guesses elapsed time, it only echoes a server-issued timestamp.
  let windowUntil: number;
  if (!input.reset && input.watchUntil && input.watchUntil > now) {
    windowUntil = input.watchUntil;
  } else {
    const seconds = input.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
    windowUntil = now + seconds * 1000;
  }

  const startedAt = Date.now();
  const remainingAtStart = Math.max(0, windowUntil - startedAt);
  const holdMs = Math.min(input.waitSeconds * 1000, remainingAtStart);
  const deadline = startedAt + holdMs;

  let page = await readEventsAfter(channel, input.cursor);
  let events: WatchEvent[] = page.events;

  // Long-poll: return immediately when something is queued, otherwise hold the
  // request open until the (bounded) deadline and return "no_event".
  while (events.length === 0 && Date.now() < deadline) {
    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    page = await readEventsAfter(channel, input.cursor);
    events = page.events;
  }

  const end = Date.now();
  const nextCursor =
    events.length > 0 ? Math.max(...events.map((e) => e.id)) : input.cursor;
  const remainingMs = Math.max(0, windowUntil - end);
  const continueWatching = remainingMs > 0;

  return NextResponse.json({
    server_time: new Date(end).toISOString(),
    server_epoch_ms: end,
    channel,
    backend: watchBackend(),
    cursor: String(nextCursor),
    last_event_id: page.lastId,
    events,
    event_count: events.length,
    no_event: events.length === 0,
    continue: continueWatching,
    next_action: continueWatching ? "watch" : "finish",
    remaining_seconds: Math.round(remainingMs / 1000),
    watch_until: new Date(windowUntil).toISOString(),
    waited_seconds: Math.round((end - startedAt) / 1000),
    instructions: continueWatching
      ? "Immediately handle any events above, then call this watch tool again with the returned cursor AND watch_until. Do NOT stop just because no_event is true. Keep looping until next_action is 'finish'. Trust server_time / remaining_seconds ÔÇö never guess how much time has passed."
      : "The monitoring window is over. Handle any final events above, then finish the run.",
  });
}

export async function GET(request: Request) {
  try {
    assertWatchToken(request);
    return await runWatch(parseGet(new URL(request.url)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertWatchToken(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return await runWatch(parseBody(body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-watch-token",
    },
  });
}

function errorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "watch_failed";
  const status = message === "Unauthorized" ? 401 : 500;
  return NextResponse.json({ error: message }, { status });
}

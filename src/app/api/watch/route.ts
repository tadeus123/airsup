import { NextResponse } from "next/server";
import { getConnection } from "@/lib/connection";
import {
  DEFAULT_WINDOW_SECONDS,
  MAX_WINDOW_SECONDS,
  assertWatchToken,
  normalizeChannel,
  readSnapshot,
  setWindowUntil,
  type WatchEvent,
} from "@/lib/watch-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow long-held requests. The effective hold is also bounded by the caller's
// wait_seconds and by the remaining monitoring window.
export const maxDuration = 300;

const POLL_INTERVAL_MS = 400;
const DEFAULT_WAIT_SECONDS = 25;
const MAX_WAIT_SECONDS = 290;

type WatchInput = {
  waitSeconds: number;
  cursor: number;
  channel: string;
  windowSeconds: number | null;
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

function parseGet(url: URL): WatchInput {
  const q = url.searchParams;
  const windowRaw = q.get("window_seconds");
  return {
    waitSeconds: clamp(
      toInt(q.get("wait_seconds"), DEFAULT_WAIT_SECONDS),
      0,
      MAX_WAIT_SECONDS
    ),
    cursor: Math.max(0, toInt(q.get("cursor"), 0)),
    channel: q.get("channel") || "",
    windowSeconds:
      windowRaw == null
        ? null
        : clamp(toInt(windowRaw, DEFAULT_WINDOW_SECONDS), 1, MAX_WINDOW_SECONDS),
    reset: q.get("reset") === "1" || q.get("reset") === "true",
  };
}

function parseBody(body: Record<string, unknown>): WatchInput {
  const windowRaw = body.window_seconds;
  return {
    waitSeconds: clamp(
      toInt(body.wait_seconds, DEFAULT_WAIT_SECONDS),
      0,
      MAX_WAIT_SECONDS
    ),
    cursor: Math.max(0, toInt(body.cursor, 0)),
    channel: typeof body.channel === "string" ? body.channel : "",
    windowSeconds:
      windowRaw == null
        ? null
        : clamp(toInt(windowRaw, DEFAULT_WINDOW_SECONDS), 1, MAX_WINDOW_SECONDS),
    reset: body.reset === true || body.reset === "true" || body.reset === 1,
  };
}

async function resolveChannel(requested: string): Promise<string> {
  if (requested.trim()) return normalizeChannel(requested);
  const { connection } = await getConnection().catch(() => ({
    connection: null,
  }));
  return normalizeChannel(connection?.websiteDomain || "default");
}

async function runWatch(request: Request, input: WatchInput) {
  const channel = await resolveChannel(input.channel);
  const now = Date.now();

  // Establish or continue the monitoring window. The server owns the clock so
  // the model never has to guess how much time has elapsed.
  let snapshot = await readSnapshot(channel, input.cursor);
  let windowUntil = snapshot.windowUntil ?? 0;
  const needNewWindow =
    input.reset ||
    input.windowSeconds != null ||
    windowUntil <= now;
  if (needNewWindow) {
    const seconds = input.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
    windowUntil = now + seconds * 1000;
    await setWindowUntil(channel, windowUntil);
    snapshot = await readSnapshot(channel, input.cursor);
  }

  const startedAt = Date.now();
  const remainingAtStart = Math.max(0, windowUntil - startedAt);
  const requestedWaitMs = input.waitSeconds * 1000;
  const holdMs = Math.min(requestedWaitMs, remainingAtStart);
  const deadline = startedAt + holdMs;

  let events: WatchEvent[] = snapshot.events;
  let lastId = snapshot.lastId;

  // Long-poll: return immediately when something is queued, otherwise hold the
  // request open until the (bounded) deadline and return "no_event".
  while (events.length === 0 && Date.now() < deadline) {
    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    snapshot = await readSnapshot(channel, input.cursor);
    events = snapshot.events;
    lastId = snapshot.lastId;
  }

  const end = Date.now();
  const nextCursor = events.length > 0 ? Math.max(...events.map((e) => e.id)) : input.cursor;
  const remainingMs = Math.max(0, windowUntil - end);
  const continueWatching = remainingMs > 0;

  return NextResponse.json({
    server_time: new Date(end).toISOString(),
    server_epoch_ms: end,
    channel,
    cursor: String(nextCursor),
    last_event_id: lastId,
    events,
    event_count: events.length,
    no_event: events.length === 0,
    continue: continueWatching,
    next_action: continueWatching ? "watch" : "finish",
    remaining_seconds: Math.round(remainingMs / 1000),
    watch_until: new Date(windowUntil).toISOString(),
    waited_seconds: Math.round((end - startedAt) / 1000),
    instructions: continueWatching
      ? "Immediately handle any events above, then call this watch tool again with the returned cursor. Do NOT stop just because no_event is true. Keep looping until next_action is 'finish'. Trust server_time / remaining_seconds — never guess how much time has passed."
      : "The monitoring window is over. Handle any final events above, then finish the run.",
  });
}

export async function GET(request: Request) {
  try {
    assertWatchToken(request);
    return await runWatch(request, parseGet(new URL(request.url)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertWatchToken(request);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return await runWatch(request, parseBody(body));
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

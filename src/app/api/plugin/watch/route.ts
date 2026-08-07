import { NextResponse } from "next/server";
import {
  authPeerFromRequest,
  markDelivered,
  readInboxAfter,
  type PeerMessage,
} from "@/lib/peers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_INTERVAL_MS = 500;
const DEFAULT_WAIT_SECONDS = 25;
const MAX_WAIT_SECONDS = 28;
const DEFAULT_WINDOW_SECONDS = 3480; // ~58 minutes
const MAX_WINDOW_SECONDS = 3600;

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "content-type, authorization, x-airsup-token"
  );
  return res;
}

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

function parseWatchUntil(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 1e12) return asNum;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : null;
}

type WatchInput = {
  waitSeconds: number;
  cursor: number;
  windowSeconds: number | null;
  watchUntil: number | null;
  reset: boolean;
};

function parseBody(body: Record<string, unknown>): WatchInput {
  return {
    waitSeconds: clamp(
      toInt(body.wait_seconds ?? body.waitSeconds, DEFAULT_WAIT_SECONDS),
      0,
      MAX_WAIT_SECONDS
    ),
    cursor: Math.max(0, toInt(body.cursor, 0)),
    windowSeconds:
      body.window_seconds == null && body.windowSeconds == null
        ? null
        : clamp(
            toInt(body.window_seconds ?? body.windowSeconds, DEFAULT_WINDOW_SECONDS),
            1,
            MAX_WINDOW_SECONDS
          ),
    watchUntil: parseWatchUntil(body.watch_until ?? body.watchUntil),
    reset:
      body.reset === true ||
      body.reset === "true" ||
      body.reset === 1 ||
      body.reset === "1",
  };
}

function parseGet(url: URL): WatchInput {
  const q = url.searchParams;
  return parseBody({
    wait_seconds: q.get("wait_seconds"),
    cursor: q.get("cursor"),
    window_seconds: q.get("window_seconds"),
    watch_until: q.get("watch_until"),
    reset: q.get("reset"),
  });
}

function toEvents(messages: PeerMessage[]) {
  return messages.map((m) => ({
    id: m.id,
    type: "peer_message",
    at: m.createdAt,
    text: m.body,
    fromHandle: m.fromHandle,
    toHandle: m.toHandle,
    conversationId: m.conversationId,
    replyToId: m.replyToId,
    status: m.status,
    instruction: `Message from ${m.fromHandle}'s Supi. Reply with talk_to_supi to="${m.fromHandle}" conversation_id="${m.conversationId}" reply_to_id=${m.id}. Then ack_instruction id=${m.id}.`,
  }));
}

async function runWatch(request: Request, input: WatchInput) {
  const me = await authPeerFromRequest(request);
  const now = Date.now();

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

  let messages = await readInboxAfter(me.handle, input.cursor);
  while (messages.length === 0 && Date.now() < deadline) {
    await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    messages = await readInboxAfter(me.handle, input.cursor);
  }

  if (messages.length) {
    await markDelivered(
      me.handle,
      messages.map((m) => m.id)
    );
  }

  const end = Date.now();
  const nextCursor =
    messages.length > 0
      ? Math.max(...messages.map((m) => m.id))
      : input.cursor;
  const remainingMs = Math.max(0, windowUntil - end);
  const continueWatching = remainingMs > 0;
  const events = toEvents(messages);

  return cors(
    NextResponse.json({
      server_time: new Date(end).toISOString(),
      server_epoch_ms: end,
      handle: me.handle,
      cursor: String(nextCursor),
      events,
      event_count: events.length,
      no_event: events.length === 0,
      continue: continueWatching,
      next_action: continueWatching ? "watch" : "finish",
      remaining_seconds: Math.round(remainingMs / 1000),
      watch_until: new Date(windowUntil).toISOString(),
      waited_seconds: Math.round((end - startedAt) / 1000),
      instructions: continueWatching
        ? "Handle any events above, then call watch_endpoint again with the returned cursor AND watch_until. Do NOT stop because no_event is true. Loop until next_action is finish."
        : "Monitoring window over. Handle any final events, then finish the scheduled run.",
    })
  );
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  try {
    return await runWatch(request, parseGet(new URL(request.url)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "watch_failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return cors(NextResponse.json({ error: message }, { status }));
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return await runWatch(request, parseBody(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "watch_failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return cors(NextResponse.json({ error: message }, { status }));
  }
}

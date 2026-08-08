import {
  markDelivered,
  readInboxAfter,
  type Peer,
  type PeerMessage,
} from "./peers";
import { logActivitySafe, newRequestId } from "./activity";

export type WatchArgs = {
  waitSeconds?: number;
  cursor?: string | number;
  watchUntil?: string;
  windowSeconds?: number;
  reset?: boolean;
  /** watch_batch: how many internal poll slices */
  polls?: number;
  /** watch_batch: hard cap across all slices */
  maxSeconds?: number;
};

export type PeerWatchEvent = {
  id: number;
  type: "peer_message";
  at: string;
  text: string;
  fromHandle: string;
  toHandle: string;
  conversationId: string;
  replyToId: number | null;
  status: string;
  instruction: string;
};

export type PeerWatchResult = {
  server_time: string;
  handle: string;
  cursor: string;
  last_acked_hint: string;
  events: PeerWatchEvent[];
  event_count: number;
  no_event: boolean;
  continue: boolean;
  next_action: "watch" | "finish";
  remaining_seconds: number;
  watch_until: string;
  waited_seconds: number;
  polls_completed: number;
  unacked_replay: boolean;
  instructions: string;
};

const DEFAULT_WAIT = 20;
const MAX_WAIT_SLICE = 28;
const DEFAULT_WINDOW = 780; // ~13m
const MAX_WINDOW = 3600;
const DEFAULT_BATCH_POLLS = 5;
const MAX_BATCH_POLLS = 8;
/** ChatGPT connectors often die ~30s; allow up to 100s for batch testing / longer platforms. */
const DEFAULT_BATCH_MAX = 100;
const ABSOLUTE_BATCH_MAX = 110;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toEvents(messages: PeerMessage[]): PeerWatchEvent[] {
  return messages.map((m) => ({
    id: m.id,
    type: "peer_message" as const,
    at: m.createdAt,
    text: m.body,
    fromHandle: m.fromHandle,
    toHandle: m.toHandle,
    conversationId: m.conversationId,
    replyToId: m.replyToId,
    status: m.status,
    instruction: `UNACKED inbox event from ${m.fromHandle}. Print a short visible Inbox line. Then call reply_and_ack (to="${m.fromHandle}", conversation_id="${m.conversationId}", reply_to_id=${m.id}). Do NOT ack unless the reply succeeded. Do NOT call talk_to_supi + ack_instruction separately.`,
  }));
}

/**
 * Long-poll inbox. Server is source of truth for unacked events:
 * readInboxAfter returns pending+delivered until ack, so crashes/replays are safe.
 */
export async function runPeerWatch(
  me: Peer,
  args: WatchArgs,
  opts?: { batch?: boolean }
): Promise<PeerWatchResult> {
  const started = Date.now();
  const requestId = newRequestId();
  const batch = Boolean(opts?.batch);
  const waitSeconds = clamp(
    Number(args.waitSeconds ?? DEFAULT_WAIT),
    0,
    MAX_WAIT_SLICE
  );
  const cursorIn = Math.max(0, Number(args.cursor ?? 0) || 0);
  const windowSeconds = clamp(
    Number(args.windowSeconds ?? DEFAULT_WINDOW),
    1,
    MAX_WINDOW
  );
  const polls = batch
    ? clamp(Number(args.polls ?? DEFAULT_BATCH_POLLS), 1, MAX_BATCH_POLLS)
    : 1;
  const maxSeconds = batch
    ? clamp(
        Number(args.maxSeconds ?? DEFAULT_BATCH_MAX),
        1,
        ABSOLUTE_BATCH_MAX
      )
    : waitSeconds;

  const now = Date.now();
  let windowUntil: number;
  if (!args.reset && args.watchUntil) {
    const parsed = Date.parse(args.watchUntil);
    windowUntil =
      Number.isFinite(parsed) && parsed > now
        ? parsed
        : now + windowSeconds * 1000;
  } else {
    windowUntil = now + windowSeconds * 1000;
  }

  const hardDeadline = Math.min(
    windowUntil,
    started + maxSeconds * 1000
  );

  let messages: PeerMessage[] = [];
  let pollsCompleted = 0;

  for (let i = 0; i < polls; i++) {
    pollsCompleted = i + 1;
    if (Date.now() >= hardDeadline || Date.now() >= windowUntil) break;

    // Unacked inbox is server-owned; cursor is only a client hint.
    messages = await readInboxAfter(me.handle, 0);
    if (messages.length > 0) break;

    const sliceMs = Math.min(
      waitSeconds * 1000,
      Math.max(0, hardDeadline - Date.now()),
      Math.max(0, windowUntil - Date.now())
    );
    if (sliceMs <= 0) break;

    const sliceDeadline = Date.now() + sliceMs;
    while (Date.now() < sliceDeadline) {
      await sleep(Math.min(500, Math.max(0, sliceDeadline - Date.now())));
      messages = await readInboxAfter(me.handle, 0);
      if (messages.length > 0) break;
    }
    if (messages.length > 0) break;
  }

  if (messages.length) {
    await markDelivered(
      me.handle,
      messages.map((m) => m.id)
    );
  }

  const end = Date.now();
  const events = toEvents(messages);
  const nextCursor =
    messages.length > 0
      ? Math.max(...messages.map((m) => m.id))
      : cursorIn;
  const remainingMs = Math.max(0, windowUntil - end);
  const continueWatching = remainingMs > 0;
  const unackedReplay = messages.some(
    (m) => m.id <= cursorIn || m.status === "delivered"
  );

  logActivitySafe({
    kind: "watch",
    ok: true,
    handle: me.handle,
    peerHandle: messages[0]?.fromHandle || "",
    httpStatus: 200,
    durationMs: end - started,
    summary:
      messages.length > 0
        ? `${me.handle} ${batch ? "watch_batch" : "watch"} delivered ${messages.length} event(s)`
        : `${me.handle} ${batch ? "watch_batch" : "watch"} no_event`,
    detail: {
      batch,
      cursorIn,
      cursorOut: nextCursor,
      eventCount: messages.length,
      pollsCompleted,
      maxSeconds,
      nextAction: continueWatching ? "watch" : "finish",
      unackedReplay,
    },
    requestId,
  });

  return {
    server_time: new Date(end).toISOString(),
    handle: me.handle,
    cursor: String(nextCursor),
    last_acked_hint:
      "Server returns only unacked events. Advance client cursor after reply_and_ack succeeds.",
    events,
    event_count: events.length,
    no_event: events.length === 0,
    continue: continueWatching,
    next_action: continueWatching ? "watch" : "finish",
    remaining_seconds: Math.round(remainingMs / 1000),
    watch_until: new Date(windowUntil).toISOString(),
    waited_seconds: Math.round((end - started) / 1000),
    polls_completed: pollsCompleted,
    unacked_replay: unackedReplay,
    instructions: continueWatching
      ? events.length
        ? "Handle each event with reply_and_ack only after a successful reply intent. Never ack a failed reply. Then call watch_batch/watch_endpoint again with cursor AND watch_until."
        : "no_event is normal. Immediately call watch_batch (or watch_endpoint) again with cursor AND watch_until."
      : "Monitoring window over. Finish this run; leave the schedule enabled.",
  };
}

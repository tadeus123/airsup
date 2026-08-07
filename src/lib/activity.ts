import { randomUUID } from "node:crypto";

export type ActivityKind =
  | "onboard"
  | "whoami"
  | "lookup"
  | "talk"
  | "watch"
  | "ack"
  | "openapi"
  | "error";

export type ActivityEvent = {
  id: number;
  createdAt: string;
  kind: string;
  ok: boolean;
  handle: string;
  peerHandle: string;
  httpStatus: number;
  durationMs: number;
  summary: string;
  detail: Record<string, unknown>;
  requestId: string;
};

type MemoryStore = { events: ActivityEvent[]; seq: number };
const memory: MemoryStore = { events: [], seq: 0 };

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

function redactDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    const k = key.toLowerCase();
    if (
      k.includes("token") ||
      k.includes("secret") ||
      k.includes("password") ||
      k.includes("authorization") ||
      k.includes("apikey") ||
      k.includes("api_key")
    ) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.length > 600) {
      out[key] = `${value.slice(0, 600)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function newRequestId(): string {
  return randomUUID().slice(0, 8);
}

export async function logActivity(input: {
  kind: ActivityKind | string;
  ok?: boolean;
  handle?: string;
  peerHandle?: string;
  httpStatus?: number;
  durationMs?: number;
  summary: string;
  detail?: Record<string, unknown>;
  requestId?: string;
}): Promise<void> {
  const event = {
    kind: input.kind,
    ok: input.ok !== false,
    handle: (input.handle || "").slice(0, 80),
    peerHandle: (input.peerHandle || "").slice(0, 80),
    httpStatus: input.httpStatus || 0,
    durationMs: input.durationMs || 0,
    summary: input.summary.slice(0, 500),
    detail: redactDetail(input.detail || {}),
    requestId: input.requestId || newRequestId(),
  };

  try {
    const cfg = supabaseConfig();
    if (cfg) {
      await supabaseRpc("airsup_activity_append", {
        p_token: cfg.token,
        p_kind: event.kind,
        p_ok: event.ok,
        p_handle: event.handle,
        p_peer_handle: event.peerHandle,
        p_http_status: event.httpStatus,
        p_duration_ms: event.durationMs,
        p_summary: event.summary,
        p_detail: event.detail,
        p_request_id: event.requestId,
      });
      return;
    }

    memory.seq += 1;
    memory.events.unshift({
      id: memory.seq,
      createdAt: new Date().toISOString(),
      ...event,
    });
    if (memory.events.length > 500) memory.events.length = 500;
  } catch {
    // Never break product paths because telemetry failed.
  }
}

/** Fire-and-forget wrapper so route handlers stay fast. */
export function logActivitySafe(
  input: Parameters<typeof logActivity>[0]
): void {
  void logActivity(input).catch(() => undefined);
}

export async function listActivity(input?: {
  limit?: number;
  afterId?: number;
}): Promise<ActivityEvent[]> {
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500);
  const afterId = input?.afterId ?? 0;
  const cfg = supabaseConfig();
  if (cfg) {
    const rows =
      (await supabaseRpc<ActivityEvent[]>("airsup_activity_list", {
        p_token: cfg.token,
        p_limit: limit,
        p_after_id: afterId,
      })) || [];
    return rows.map((row) => ({
      id: Number(row.id),
      createdAt: row.createdAt,
      kind: row.kind,
      ok: Boolean(row.ok),
      handle: row.handle || "",
      peerHandle: row.peerHandle || "",
      httpStatus: Number(row.httpStatus || 0),
      durationMs: Number(row.durationMs || 0),
      summary: row.summary || "",
      detail:
        row.detail && typeof row.detail === "object"
          ? (row.detail as Record<string, unknown>)
          : {},
      requestId: row.requestId || "",
    }));
  }
  return memory.events
    .filter((e) => e.id > afterId)
    .slice(0, limit);
}

import { NextResponse } from "next/server";
import { logActivitySafe, newRequestId } from "@/lib/activity";
import { authPeerFromRequest } from "@/lib/peers";
import { runPeerWatch } from "@/lib/peer-watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

async function run(request: Request, body: Record<string, unknown>) {
  const requestId = newRequestId();
  const started = Date.now();
  let handle = "";
  try {
    const me = await authPeerFromRequest(request);
    handle = me.handle;
    const batch =
      body.batch === true ||
      body.mode === "batch" ||
      body.polls != null ||
      body.max_seconds != null;
    const result = await runPeerWatch(
      me,
      {
        waitSeconds: toInt(body.wait_seconds ?? body.waitSeconds, batch ? 20 : 24),
        cursor: body.cursor as string | number | undefined,
        watchUntil: (body.watch_until ?? body.watchUntil) as string | undefined,
        windowSeconds:
          body.window_seconds == null && body.windowSeconds == null
            ? undefined
            : toInt(body.window_seconds ?? body.windowSeconds, 780),
        reset: body.reset === true || body.reset === "true",
        polls: body.polls == null ? undefined : toInt(body.polls, 5),
        maxSeconds:
          body.max_seconds == null && body.maxSeconds == null
            ? undefined
            : toInt(body.max_seconds ?? body.maxSeconds, 100),
      },
      { batch }
    );
    return cors(NextResponse.json(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "watch_failed";
    const status = message === "Unauthorized" ? 401 : 500;
    logActivitySafe({
      kind: "watch",
      ok: false,
      handle,
      httpStatus: status,
      durationMs: Date.now() - started,
      summary: `watch failed: ${message}`,
      detail: { error: message },
      requestId,
    });
    return cors(NextResponse.json({ error: message }, { status }));
  }
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return run(request, body);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams;
  return run(request, {
    wait_seconds: q.get("wait_seconds"),
    cursor: q.get("cursor"),
    window_seconds: q.get("window_seconds"),
    watch_until: q.get("watch_until"),
    reset: q.get("reset"),
    polls: q.get("polls"),
    max_seconds: q.get("max_seconds"),
    batch: q.get("batch"),
  });
}

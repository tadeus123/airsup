import { NextResponse } from "next/server";
import { logActivitySafe, newRequestId } from "@/lib/activity";
import { ackMessage, authPeerFromRequest } from "@/lib/peers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "content-type, authorization, x-airsup-token"
  );
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
  const started = Date.now();
  const requestId = newRequestId();
  let handle = "";
  try {
    const me = await authPeerFromRequest(request);
    handle = me.handle;
    const body = (await request.json().catch(() => ({}))) as {
      id?: number;
      message_id?: number;
      messageId?: number;
    };
    const id = Number(body.id ?? body.message_id ?? body.messageId);
    if (!Number.isFinite(id) || id <= 0) {
      logActivitySafe({
        kind: "ack",
        ok: false,
        handle,
        httpStatus: 400,
        durationMs: Date.now() - started,
        summary: `${handle} ack missing id`,
        requestId,
      });
      return cors(
        NextResponse.json({ error: "id is required" }, { status: 400 })
      );
    }
    const result = await ackMessage(me.handle, id);
    if (!result) {
      logActivitySafe({
        kind: "ack",
        ok: false,
        handle,
        httpStatus: 404,
        durationMs: Date.now() - started,
        summary: `${handle} ack #${id} not found`,
        detail: { messageId: id },
        requestId,
      });
      return cors(
        NextResponse.json({ error: "message not found" }, { status: 404 })
      );
    }
    logActivitySafe({
      kind: "ack",
      ok: true,
      handle,
      httpStatus: 200,
      durationMs: Date.now() - started,
      summary: `${handle} acked #${id}`,
      detail: { messageId: id },
      requestId,
    });
    return cors(NextResponse.json({ ok: true, ...result }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ack_failed";
    const status = message === "Unauthorized" ? 401 : 500;
    logActivitySafe({
      kind: "ack",
      ok: false,
      handle,
      httpStatus: status,
      durationMs: Date.now() - started,
      summary: `ack failed: ${message}`,
      detail: { error: message },
      requestId,
    });
    return cors(NextResponse.json({ error: message }, { status }));
  }
}

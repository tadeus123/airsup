import { NextResponse } from "next/server";
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
  try {
    const me = await authPeerFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as {
      id?: number;
      message_id?: number;
      messageId?: number;
    };
    const id = Number(body.id ?? body.message_id ?? body.messageId);
    if (!Number.isFinite(id) || id <= 0) {
      return cors(
        NextResponse.json({ error: "id is required" }, { status: 400 })
      );
    }
    const result = await ackMessage(me.handle, id);
    if (!result) {
      return cors(
        NextResponse.json({ error: "message not found" }, { status: 404 })
      );
    }
    return cors(NextResponse.json({ ok: true, ...result }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ack_failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return cors(NextResponse.json({ error: message }, { status }));
  }
}

import { NextResponse } from "next/server";
import { logActivitySafe, newRequestId } from "@/lib/activity";
import {
  authPeerFromRequest,
  getPeerByHandle,
  normalizeHandle,
  sendPeerMessage,
} from "@/lib/peers";

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

/**
 * talk_to_supi — send a message to another registered ChatGPT worker.
 * Example: talk to kostis → to="kostis", message="Hey, free Thursday?"
 */
export async function POST(request: Request) {
  const started = Date.now();
  const requestId = newRequestId();
  let handle = "";
  try {
    const me = await authPeerFromRequest(request);
    handle = me.handle;
    const body = (await request.json().catch(() => ({}))) as {
      to?: string;
      handle?: string;
      name?: string;
      message?: string;
      text?: string;
      body?: string;
      conversation_id?: string;
      conversationId?: string;
      reply_to_id?: number;
      replyToId?: number;
    };

    const rawTo = body.to || body.handle || body.name || "";
    const to = normalizeHandle(
      rawTo.replace(/'s\s+supi$/i, "").replace(/\s+supi$/i, "")
    );
    const text = (body.message || body.text || body.body || "").trim();
    if (!to) {
      logActivitySafe({
        kind: "talk",
        ok: false,
        handle,
        httpStatus: 400,
        durationMs: Date.now() - started,
        summary: `${handle} talk missing target`,
        requestId,
      });
      return cors(
        NextResponse.json(
          { error: "to is required (e.g. kostis)" },
          { status: 400 }
        )
      );
    }
    if (!text) {
      logActivitySafe({
        kind: "talk",
        ok: false,
        handle,
        peerHandle: to,
        httpStatus: 400,
        durationMs: Date.now() - started,
        summary: `${handle} → ${to} empty message`,
        requestId,
      });
      return cors(
        NextResponse.json({ error: "message is required" }, { status: 400 })
      );
    }

    const peer = await getPeerByHandle(to);
    if (!peer) {
      logActivitySafe({
        kind: "talk",
        ok: false,
        handle,
        peerHandle: to,
        httpStatus: 404,
        durationMs: Date.now() - started,
        summary: `${handle} → ${to} not registered`,
        detail: { preview: text.slice(0, 160) },
        requestId,
      });
      return cors(
        NextResponse.json(
          {
            error: `No Supi registered for "${to}". They need to complete Airsup onboarding first.`,
            found: false,
          },
          { status: 404 }
        )
      );
    }

    const msg = await sendPeerMessage({
      fromHandle: me.handle,
      toHandle: peer.handle,
      body: text,
      conversationId: body.conversation_id || body.conversationId,
      replyToId: body.reply_to_id ?? body.replyToId ?? null,
    });

    logActivitySafe({
      kind: "talk",
      ok: true,
      handle,
      peerHandle: peer.handle,
      httpStatus: 200,
      durationMs: Date.now() - started,
      summary: `${handle} → ${peer.handle} (#${msg.id})`,
      detail: {
        messageId: msg.id,
        conversationId: msg.conversationId,
        replyToId: msg.replyToId,
        preview: text.slice(0, 200),
      },
      requestId,
    });

    return cors(
      NextResponse.json({
        ok: true,
        message: msg,
        hint:
          "Their scheduled Airsup worker will pick this up on the next watch long-poll (usually within ~25s while their hourly run is active). Keep watching your own inbox for a reply.",
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "talk_failed";
    const status =
      message === "Unauthorized"
        ? 401
        : message.includes("unknown")
          ? 404
          : 400;
    logActivitySafe({
      kind: "talk",
      ok: false,
      handle,
      httpStatus: status,
      durationMs: Date.now() - started,
      summary: `talk failed: ${message}`,
      detail: { error: message },
      requestId,
    });
    return cors(NextResponse.json({ error: message }, { status }));
  }
}

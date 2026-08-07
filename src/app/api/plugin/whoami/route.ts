import { NextResponse } from "next/server";
import { logActivitySafe, newRequestId } from "@/lib/activity";
import { authPeerFromRequest } from "@/lib/peers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "content-type, authorization, x-airsup-token"
  );
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  const started = Date.now();
  const requestId = newRequestId();
  try {
    const peer = await authPeerFromRequest(request);
    logActivitySafe({
      kind: "whoami",
      ok: true,
      handle: peer.handle,
      httpStatus: 200,
      durationMs: Date.now() - started,
      summary: `whoami ${peer.handle}`,
      detail: { domain: peer.domain },
      requestId,
    });
    return cors(
      NextResponse.json({
        handle: peer.handle,
        domain: peer.domain,
        displayName: peer.displayName,
        howToTalk: `Other people can say: talk to ${peer.handle}'s supi`,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "whoami_failed";
    const status = message === "Unauthorized" ? 401 : 500;
    logActivitySafe({
      kind: "whoami",
      ok: false,
      httpStatus: status,
      durationMs: Date.now() - started,
      summary: `whoami failed: ${message}`,
      detail: { error: message },
      requestId,
    });
    return cors(NextResponse.json({ error: message }, { status }));
  }
}

export async function POST(request: Request) {
  return GET(request);
}

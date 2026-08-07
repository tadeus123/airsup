import { NextResponse } from "next/server";
import { getPeerByHandle, normalizeHandle } from "@/lib/peers";

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

async function lookup(raw: string) {
  const handle = normalizeHandle(raw.replace(/'s\s+supi$/i, "").replace(/\s+supi$/i, ""));
  if (!handle) {
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  }
  const peer = await getPeerByHandle(handle);
  if (!peer) {
    return NextResponse.json(
      { found: false, handle, error: `No Supi registered for "${handle}"` },
      { status: 404 }
    );
  }
  return NextResponse.json({
    found: true,
    handle: peer.handle,
    domain: peer.domain,
    displayName: peer.displayName,
    talkPhrase: `talk to ${peer.handle}'s supi`,
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return cors(await lookup(url.searchParams.get("handle") || url.searchParams.get("name") || ""));
  } catch (error) {
    return cors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "lookup_failed" },
        { status: 500 }
      )
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      handle?: string;
      name?: string;
    };
    return cors(await lookup(body.handle || body.name || ""));
  } catch (error) {
    return cors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "lookup_failed" },
        { status: 500 }
      )
    );
  }
}

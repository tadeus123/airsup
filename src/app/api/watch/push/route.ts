import { NextResponse } from "next/server";
import { getConnection } from "@/lib/connection";
import {
  assertWatchToken,
  normalizeChannel,
  pushEvent,
} from "@/lib/watch-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveChannel(requested: string | null | undefined): Promise<string> {
  if (requested && requested.trim()) return normalizeChannel(requested);
  const { connection } = await getConnection().catch(() => ({
    connection: null,
  }));
  return normalizeChannel(connection?.websiteDomain || "default");
}

async function enqueue(
  channel: string,
  input: { text: string; type?: string; data?: unknown }
) {
  const event = await pushEvent(channel, input);
  return NextResponse.json({
    ok: true,
    channel,
    cursor: String(event.id),
    event,
  });
}

/** Convenience enqueue for browsers / quick manual pushes. */
export async function GET(request: Request) {
  try {
    assertWatchToken(request);
    const url = new URL(request.url);
    const text = (url.searchParams.get("text") || url.searchParams.get("message") || "").trim();
    if (!text) {
      return NextResponse.json(
        { error: "text is required", example: "/agent/watch/push?text=Check%20email" },
        { status: 400 }
      );
    }
    const channel = await resolveChannel(url.searchParams.get("channel"));
    return await enqueue(channel, {
      text,
      type: url.searchParams.get("type") || undefined,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertWatchToken(request);
    const body = (await request.json().catch(() => ({}))) as {
      text?: string;
      message?: string;
      type?: string;
      data?: unknown;
      channel?: string;
    };
    const text = (body.text ?? body.message ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    const channel = await resolveChannel(body.channel);
    return await enqueue(channel, { text, type: body.type, data: body.data });
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
  const message = error instanceof Error ? error.message : "push_failed";
  const status = message === "Unauthorized" ? 401 : 500;
  return NextResponse.json({ error: message }, { status });
}

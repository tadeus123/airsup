import { NextResponse } from "next/server";
import { getConnection, publicOrigin } from "@/lib/connection";

export const runtime = "nodejs";

/**
 * Full A2A REST is not mounted on this connector yet.
 * ChatGPT and browsers should use /agent/chat on the customer website.
 */
export async function GET(request: Request) {
  const { connection } = await getConnection();
  const origin = publicOrigin(connection, new URL(request.url).origin);
  return NextResponse.json(
    {
      error: "a2a_rest_not_mounted",
      message:
        "Use the website chat bridge instead of A2A REST on this connector.",
      chatUrl: `${origin}/agent/chat`,
      agentCardUrl: `${origin}/.well-known/agent-card.json`,
    },
    { status: 501 }
  );
}

export async function POST(request: Request) {
  return GET(request);
}

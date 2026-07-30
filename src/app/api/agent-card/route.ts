import { NextResponse } from "next/server";
import { getConnection, publicOrigin } from "@/lib/connection";
import { buildAgentCard } from "@/lib/prompts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { connection } = await getConnection();
  const origin = publicOrigin(connection, new URL(request.url).origin);
  return NextResponse.json(buildAgentCard(origin, connection), {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
      Link: `<${origin}/.well-known/agent-card.json>; rel="service-meta"; type="application/json"`,
    },
  });
}

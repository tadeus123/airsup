import { NextResponse } from "next/server";
import { getConnection, publicOrigin } from "@/lib/connection";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { connection, storage } = await getConnection();
  const origin = publicOrigin(connection, new URL(request.url).origin);
  return NextResponse.json({
    product: "AirCart",
    website: connection.websiteDomain ? `https://${connection.websiteDomain}` : origin,
    summary:
      "AirCart Connect hosts your website agent setup and forwards chat to your real agent webhook.",
    nowDoing: connection.connected
      ? `Connected real agent for ${connection.websiteDomain} and ready for conversations.`
      : "Waiting for setup: enter website domain + agent secret on the home page.",
    connected: connection.connected,
    websiteDomain: connection.websiteDomain,
    backend: connection.connected ? "webhook" : "builtin",
    storage,
    chatUrl: `${origin}/agent/chat`,
    setupUrl: `${origin}/`,
    updatedAt: connection.updatedAt || new Date().toISOString(),
  });
}

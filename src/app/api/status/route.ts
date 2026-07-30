import { NextResponse } from "next/server";
import { getConnection, publicOrigin } from "@/lib/connection";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { connection, storage } = await getConnection();
  const origin = publicOrigin(connection, new URL(request.url).origin);
  return NextResponse.json({
    product: "Airsup",
    agent: "Supi",
    website: connection.websiteDomain ? `https://${connection.websiteDomain}` : origin,
    summary:
      "Airsup connects your website to a real agent. Supi is the on-site agent ChatGPT and visitors discover.",
    nowDoing: connection.connected
      ? `Supi is connected for ${connection.websiteDomain} and ready for conversations.`
      : "Waiting for setup: enter website domain + AI API key on the home page to activate Supi.",
    connected: connection.connected,
    websiteDomain: connection.websiteDomain,
    backend: connection.connected
      ? connection.agentWebhookUrl
        ? "webhook"
        : "openai"
      : "builtin",
    storage,
    chatUrl: `${origin}/agent/chat`,
    setupUrl: `${origin}/`,
    updatedAt: connection.updatedAt || new Date().toISOString(),
  });
}

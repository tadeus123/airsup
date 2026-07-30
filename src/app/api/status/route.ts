import { NextResponse } from "next/server";
import { getConnection, publicOrigin } from "@/lib/connection";
import { customerSiteUrl, shouldHideSupiOnSetupHost } from "@/lib/host";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { connection, storage } = await getConnection();
  const origin = publicOrigin(connection, new URL(request.url).origin);

  if (shouldHideSupiOnSetupHost(request, connection)) {
    return NextResponse.json(
      {
        error: "supi_not_on_connector",
        message:
          "Status for Supi is on the connected website, not the Airsup setup host.",
        websiteStatus: customerSiteUrl(connection, "/agent/status.json", request),
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    product: "Airsup",
    agent: "Supi",
    website: connection.websiteDomain ? `https://${connection.websiteDomain}` : origin,
    summary:
      "Airsup is setup-only. Supi lives on the connected website domain for discovery and chat.",
    nowDoing: connection.connected
      ? `Supi is connected for ${connection.websiteDomain}. Use that website for discovery and chat.`
      : "Waiting for setup: enter website domain + AI API key on the home page.",
    connected: connection.connected,
    websiteDomain: connection.websiteDomain,
    backend: connection.connected
      ? connection.agentWebhookUrl
        ? "webhook"
        : "openai"
      : "builtin",
    storage,
    chatUrl: `${origin}/agent/chat`,
    setupUrl: "/",
    updatedAt: connection.updatedAt || new Date().toISOString(),
  });
}

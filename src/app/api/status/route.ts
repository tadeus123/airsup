import { NextResponse } from "next/server";
import { getConnection, llmBackendForKey, publicOrigin } from "@/lib/connection";
import { customerSiteUrl, shouldHideSupiOnSetupHost } from "@/lib/host";
import { getKnowledgeMeta } from "@/lib/site-knowledge";
import { watchBackend } from "@/lib/watch-queue";

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

  const knowledge = connection.websiteDomain
    ? await getKnowledgeMeta(connection.websiteDomain).catch(() => null)
    : null;

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
    calendarConnected: Boolean(connection.googleConnected),
    gmailConnected: Boolean(connection.gmailConnected),
    scheduling:
      connection.googleConnected
        ? "Supi writes real Google Calendar events. Event IDs from Supi are authoritative — there is no separate verification layer."
        : "Google Calendar is not connected; Supi cannot create real events yet.",
    backend: connection.connected
      ? connection.agentWebhookUrl
        ? "webhook"
        : llmBackendForKey(connection.agentSecret)
      : "builtin",
    storage,
    knowledge: knowledge
      ? {
          pageCount: knowledge.pageCount,
          totalChars: knowledge.totalChars,
          crawlStatus: knowledge.crawlStatus,
          lastCrawlFinishedAt: knowledge.lastCrawlFinishedAt,
          lastChangeAt: knowledge.lastChangeAt,
        }
      : null,
    chatUrl: `${origin}/agent/chat`,
    watchUrl: `${origin}/agent/watch`,
    watch: {
      longPoll: true,
      pushUrl: `${origin}/agent/watch/push`,
      secured: Boolean(process.env.WATCH_SECRET),
      backend: watchBackend(),
      defaultWindowSeconds: 900,
    },
    setupUrl: "/",
    updatedAt: connection.updatedAt || new Date().toISOString(),
  });
}

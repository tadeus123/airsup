import { NextResponse } from "next/server";
import { getConnection, publicOrigin } from "@/lib/connection";
import { customerSiteUrl, shouldHideSupiOnSetupHost } from "@/lib/host";
import { discoveryLinkHeader } from "@/lib/discovery-docs";
import { buildAgentCard } from "@/lib/prompts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { connection } = await getConnection();
  const origin = publicOrigin(connection, new URL(request.url).origin);

  // Direct visits to the Airsup *setup* host must not discover Supi here.
  // Customer-domain traffic (including custom domains on this deployment) stays live.
  if (shouldHideSupiOnSetupHost(request, connection)) {
    const siteCard = customerSiteUrl(
      connection,
      "/.well-known/agent-card.json",
      request
    );
    return NextResponse.json(
      {
        error: "supi_not_on_connector",
        message:
          "Supi is not on the Airsup setup site. Open the agent card on the connected website.",
        websiteCard: siteCard,
      },
      { status: 404 }
    );
  }

  return NextResponse.json(buildAgentCard(origin, connection), {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
      Link: discoveryLinkHeader(origin),
    },
  });
}

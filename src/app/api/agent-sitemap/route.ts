import { NextResponse } from "next/server";
import { getConnection, publicOrigin } from "@/lib/connection";
import { buildAgentSitemapXml } from "@/lib/discovery-docs";
import { shouldHideSupiOnSetupHost } from "@/lib/host";

export const runtime = "nodejs";

/** Machine sitemap fragment listing Supi discovery URLs. Merge into the site sitemap or proxy as /agent-sitemap.xml */
export async function GET(request: Request) {
  const { connection } = await getConnection();
  const origin = publicOrigin(connection, new URL(request.url).origin);

  if (shouldHideSupiOnSetupHost(request, connection)) {
    return new NextResponse("Not available on setup host", { status: 404 });
  }

  return new NextResponse(buildAgentSitemapXml(origin), {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": "*",
    },
  });
}

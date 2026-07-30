import { NextResponse } from "next/server";
import { getConnection, publicOrigin } from "@/lib/connection";
import { buildLlmsTxt } from "@/lib/discovery-docs";
import { shouldHideSupiOnSetupHost } from "@/lib/host";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { connection } = await getConnection();
  const origin = publicOrigin(connection, new URL(request.url).origin);

  if (shouldHideSupiOnSetupHost(request, connection)) {
    return new NextResponse(
      "# Airsup setup\n\nSupi lives on the connected customer website, not on this setup host.\n",
      {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }
    );
  }

  return new NextResponse(buildLlmsTxt(connection, origin), {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": "*",
    },
  });
}

import { NextResponse } from "next/server";
import { getConnection, toPublic } from "@/lib/connection";
import {
  googleAuthUrl,
  isGoogleOAuthConfigured,
  type GoogleOAuthService,
} from "@/lib/google-oauth";

export const runtime = "nodejs";

function parseService(raw: unknown): GoogleOAuthService {
  return raw === "gmail" ? "gmail" : "calendar";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      service?: string;
    };
    const service = parseService(body.service);
    const { connection, storage } = await getConnection();
    if (!connection.connected || !connection.websiteDomain) {
      return NextResponse.json(
        { error: "Connect your domain and AI API key first." },
        { status: 400 }
      );
    }
    if (!isGoogleOAuthConfigured()) {
      return NextResponse.json(
        {
          error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then redeploy.",
          ...toPublic(connection, storage),
          oauthConfigured: false,
        },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;
    const url = googleAuthUrl({
      requestOrigin: origin,
      websiteDomain: connection.websiteDomain,
      service,
    });
    return NextResponse.json({ url, service });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "oauth_start_failed" },
      { status: 500 }
    );
  }
}

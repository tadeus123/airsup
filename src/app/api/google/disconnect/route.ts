import { NextResponse } from "next/server";
import { getConnection, toPublic } from "@/lib/connection";
import {
  disconnectGoogle,
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
    await disconnectGoogle(service);
    const { connection, storage } = await getConnection();
    return NextResponse.json({
      ...toPublic(connection, storage),
      oauthConfigured: isGoogleOAuthConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "disconnect_failed" },
      { status: 500 }
    );
  }
}
